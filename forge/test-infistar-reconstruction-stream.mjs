import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchReconstructionStream,usesReconstructionStream} from './infistar-reconstruction-stream.mjs';
const enc=new TextEncoder();
const event=o=>'data: '+JSON.stringify(o)+'\r\n\r\n';
const chunk=(content,finish_reason=null)=>({id:'test',model:'same-model',choices:[{index:0,delta:{content},finish_reason}]});
const options={method:'POST',headers:{Authorization:'Bearer fake'},body:JSON.stringify({model:'same-model',max_completion_tokens:128000,temperature:.1,messages:[{role:'user',content:[{type:'image_url',image_url:{url:'data:image/jpeg;base64,UNCHANGED',detail:'original'}}]}]})};
function response(text,status=200,type='text/event-stream'){return new Response(text,{status,headers:{'content-type':type}});}
test('only Infistar use stream transport',()=>{for(const p of ['infistar'])assert.ok(usesReconstructionStream(p));for(const p of ['nonelinear','openai','ark','anthropic','custom',''])assert.equal(usesReconstructionStream(p),false);});
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
