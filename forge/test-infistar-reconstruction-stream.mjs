import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchReconstructionStream,usesReconstructionStream,reconstructionStreamRetryDelay,waitForReconstructionStreamRetry} from './infistar-reconstruction-stream.mjs';
const enc=new TextEncoder();
const event=o=>'data: '+JSON.stringify(o)+'\r\n\r\n';
const chunk=(content,finish_reason=null)=>({id:'test',model:'same-model',choices:[{index:0,delta:{content},finish_reason}]});
const options={method:'POST',headers:{Authorization:'Bearer fake'},body:JSON.stringify({model:'same-model',max_completion_tokens:128000,temperature:.1,messages:[{role:'user',content:[{type:'image_url',image_url:{url:'data:image/jpeg;base64,UNCHANGED',detail:'original'}}]}]})};
function response(text,status=200,type='text/event-stream'){return new Response(text,{status,headers:{'content-type':type}});}
test('only Infistar and NoneLinear use stream transport',()=>{for(const p of ['infistar','nonelinear'])assert.ok(usesReconstructionStream(p));for(const p of ['openai','ark','anthropic','custom',''])assert.equal(usesReconstructionStream(p),false);});
test('changes only stream; reconstructs UTF8 split on every byte, usage and finish reason',async()=>{
 const bytes=enc.encode(event(chunk('中文'))+event({choices:[{index:0,delta:{reasoning_content:'reason'},finish_reason:'stop'}],usage:{completion_tokens:8}})+'data: [DONE]\r\n\r\n');
 let n=0;
 const r=await fetchReconstructionStream('https://example.test',options,Infinity,async(url,o)=>{assert.equal(url,'https://example.test');assert.deepEqual(JSON.parse(o.body),{...JSON.parse(options.body),stream:true});assert.deepEqual(o.headers,options.headers);return new Response(new ReadableStream({pull(c){if(n<bytes.length)c.enqueue(bytes.slice(n,n+++1));else c.close();}}),{headers:{'content-type':'text/event-stream'}});});
 const d=JSON.parse(r.text);assert.equal(d.choices[0].message.content,'中文');assert.equal(d.choices[0].message.reasoning_content,'reason');assert.equal(d.choices[0].finish_reason,'stop');assert.equal(d.usage.completion_tokens,8);
});
test('DONE completes and cancels even if server never closes',async()=>{let canceled=false;const r=await fetchReconstructionStream('x',options,1000,async()=>new Response(new ReadableStream({start(c){c.enqueue(enc.encode(event(chunk('{}','stop'))+'data: [DONE]\n\n'));},cancel(){canceled=true;}}),{headers:{'content-type':'text/event-stream'}}));assert.ok(canceled);assert.equal(JSON.parse(r.text).choices[0].message.content,'{}');});
test('EOF with explicit finish preserves length for existing truncation rejection',async()=>{const r=await fetchReconstructionStream('x',options,Infinity,async()=>response(event(chunk('partial','length'))));assert.equal(JSON.parse(r.text).choices[0].finish_reason,'length');});
test('truncated, malformed, empty and provider-error streams fail without partial result',async()=>{for(const s of [event(chunk('partial')),event(chunk('partial'))+'data: [DONE]\n\n','data: invalid\n\n',': heartbeat\n\n',event({error:{message:'upstream failed'}})])await assert.rejects(fetchReconstructionStream('x',options,Infinity,async()=>response(s)));});
test('HTTP errors and nonstream JSON fallback retain response',async()=>{for(const status of [200,524]){const text=status===200?' {"choices":[]}':'error code: 524';const r=await fetchReconstructionStream('x',options,Infinity,async()=>response(text,status,'application/json'));assert.equal(r.text,text);assert.equal(r.status,status);assert.equal(r.ok,status===200);}});
test('caller cancellation and explicit timeout abort fetch',async()=>{const fetcher=async(_u,o)=>new Promise((_r,reject)=>{if(o.signal.aborted)reject(new DOMException('aborted','AbortError'));o.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')));});const c=new AbortController();const pending=fetchReconstructionStream('x',{...options,signal:c.signal},Infinity,fetcher);c.abort();await assert.rejects(pending,{name:'AbortError'});await assert.rejects(fetchReconstructionStream('x',options,10,fetcher),e=>e.visionTimeout===true);});
test('explicit finish returns despite a never-settling or rejected cancel and no DONE',async()=>{
 for(const cancel of [()=>new Promise(()=>{}),()=>Promise.reject(Error('late cancel failure'))]){
  const r=await fetchReconstructionStream('x',options,1000,async()=>new Response(new ReadableStream({start(c){c.enqueue(enc.encode(event(chunk('{}','stop'))));},cancel}),{headers:{'content-type':'text/event-stream','x-oneapi-request-id':'test-completed'}}));
  assert.equal(JSON.parse(r.text).choices[0].finish_reason,'stop');assert.equal(r.transport.stage,'response_received');assert.equal(r.transport.requestId,'test-completed');
 }
});
test('broken body retains sanitized request ID and byte/stage diagnostics',async()=>{
 const key='private-test-credential';let reads=0;
 await assert.rejects(fetchReconstructionStream('x',{...options,headers:{Authorization:'Bearer '+key}},Infinity,async()=>new Response(new ReadableStream({pull(c){if(reads++)c.error(Error('connection reset '+key));else c.enqueue(enc.encode(event(chunk('partial'))));}}),{headers:{'content-type':'text/event-stream','x-oneapi-request-id':'id-'+key}})),e=>{
  assert.equal(e.reconstructionTransport.stage,'reading_response');assert.ok(e.reconstructionTransport.responseBytes>0);assert.ok(!JSON.stringify(e.reconstructionTransport).includes(key));assert.ok(!e.message.includes(key));return true;
 });
});
test('missing confirmation, truncated JSON, partial SSE and empty streams have distinct safe diagnostics',async()=>{
 for(const [body,code,complete,done] of [
  [event(chunk('{"scene":{}}')),'missing_terminal',true,false],
  [event(chunk('{"scene":{}}'))+'data: [DONE]\n\n','missing_terminal',true,true],
  [event(chunk('{"scene":')),'content_incomplete',false,false],
  [event(chunk('{"scene":'))+'data: {"choices":','content_incomplete',false,false],
  [': heartbeat\n\n','empty_stream',false,false],
  ['data: invalid\n\n','malformed_event',false,false],
 ])await assert.rejects(fetchReconstructionStream('x',options,Infinity,async()=>response(body)),error=>{
  assert.equal(error.reconstructionStreamFailure,code);
  assert.equal(error.reconstructionTransport.contentJsonComplete,complete);
  assert.equal(error.reconstructionTransport.doneReceived,done);
  assert.ok(!('content' in error.reconstructionTransport));return true;
 });
});
test('only recoverable interruptions opt into two retries; cancellation and timeout never retry',()=>{
 for(const code of ['missing_terminal','content_incomplete','empty_stream','connection_interrupted']){
  const error={reconstructionStreamFailure:code};
  assert.equal(reconstructionStreamRetryDelay(error,1),null);
  assert.equal(reconstructionStreamRetryDelay(error,1,true),1000);
  assert.equal(reconstructionStreamRetryDelay(error,2,true),2000);
  assert.equal(reconstructionStreamRetryDelay(error,3,true),null);
  assert.equal(reconstructionStreamRetryDelay({...error,name:'AbortError'},1,true),null);
  assert.equal(reconstructionStreamRetryDelay({...error,visionTimeout:true},1,true),null);
 }
 for(const error of [{},{httpStatus:429},{reconstructionStreamFailure:'malformed_event'},{outputTruncated:true}])assert.equal(reconstructionStreamRetryDelay(error,1,true),null);
});
test('backoff aborts immediately, including an already cancelled signal',async()=>{
 for(const already of [true,false]){
  const controller=new AbortController();if(already)controller.abort();
  const pending=waitForReconstructionStreamRetry(60000,controller.signal);
  if(!already)controller.abort();await assert.rejects(pending,{name:'AbortError'});
 }
 await waitForReconstructionStreamRetry(1);
});
