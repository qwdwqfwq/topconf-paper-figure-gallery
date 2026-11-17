import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestReferenceAnalysis} from './step3-analysis-job.mjs';
import {collectAnalysisStream,requestDirectAnalysis} from './step3-analysis-direct.mjs';
import {requestStep3Analysis} from './step3-analysis-request.mjs';
const url='https://infistar.cc/v1/chat/completions';
let serial=0;
const sse=(text)=>new Response(text,{headers:{'Content-Type':'text/event-stream'}});
const events=(content='complete')=>'data: '+JSON.stringify({id:'provider-id',choices:[{index:0,delta:{content},finish_reason:null}]})+'\r\n\r\ndata: '+JSON.stringify({choices:[{index:0,delta:{},finish_reason:'stop'}]})+'\r\n\r\ndata: [DONE]\r\n\r\n';
function config(fetchImpl){
 const map=new Map();
 const body={model:'gpt-6.1-sol',temperature:.2,max_completion_tokens:16000,messages:[{role:'user',content:[{type:'image_url',image_url:{url:'data:image/png;base64,fixture-'+(++serial)}}]}]};
 return {provider:'infistar',url,init:{method:'POST',headers:{Authorization:'Bearer private-fixture','Content-Type':'application/json'},body:JSON.stringify(body)},fetchImpl,now:()=>100,uuid:()=>crypto.randomUUID(),storage:{getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)},map};
}
test('new default cc analysis bypasses every gateway and preserves the exact original request',async()=>{
 let calls=0;const c=config(async(target,init)=>{
  calls++;assert.equal(target,url);assert.equal(init.method,'POST');assert.deepEqual(init.headers,c.init.headers);
  assert.equal(init.body,c.init.body);return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'complete'}}]}),{headers:{'Content-Type':'application/json'}});
 });
 const [a,b]=await Promise.all([requestReferenceAnalysis(c),requestReferenceAnalysis(c)]);
 assert.equal((await a.json()).choices[0].message.content,'complete');assert.deepEqual(await b.json(),await (await requestReferenceAnalysis(c)).json());assert.equal(calls,1);
 const record=JSON.parse([...c.map.values()][0]);assert.equal(record.state,'complete');
 assert.ok(!JSON.stringify(record).includes('private-fixture'));assert.ok(!JSON.stringify(record).includes('data:image'));
 // A refreshed module can return the persisted response without any provider or backend request.
 const refreshed=await import('./step3-analysis-direct.mjs?refresh='+serial);
 const result=await refreshed.requestDirectAnalysis({...c,slot:[...c.map.keys()][0],id:'unused'});
 assert.equal((await result.json()).choices[0].message.content,'complete');assert.equal(calls,1);
});
test('unknown direct submission is never retried or switched to a backend, including reload',async()=>{
 let calls=0;const c=config(async()=>{calls++;throw TypeError('Failed to fetch private-fixture');});
 for(let i=0;i<2;i++)await assert.rejects(requestReferenceAnalysis(c),/不会自动再次调用模型/);
 const fresh=await import('./step3-analysis-direct.mjs?unknown='+serial);
 await assert.rejects(fresh.requestDirectAnalysis({...c,slot:[...c.map.keys()][0],id:'unused'}),/不会自动再次调用模型/);
 assert.equal(calls,1);assert.equal(JSON.parse([...c.map.values()][0]).state,'pending');
});
test('SSE parser handles UTF-8 and CRLF split at every byte without returning partial completion',async()=>{
 const bytes=new TextEncoder().encode(events('中文完整响应'));
 const response=new Response(new ReadableStream({start(c){for(const byte of bytes)c.enqueue(Uint8Array.of(byte));c.close();}}),{headers:{'Content-Type':'text/event-stream'}});
 assert.equal(JSON.parse(await collectAnalysisStream(response)).choices[0].message.content,'中文完整响应');
 for(const text of ['data: {"choices":[{"delta":{"content":"partial"}}]}\n\n','data: [DONE]\n\n'])await assert.rejects(collectAnalysisStream(sse(text)),/提前结束/);
});
test('HTTP and streamed provider errors retain their status, code and provider request id',async()=>{
 const c=config(async()=>new Response(JSON.stringify({error:{code:'quota',message:'quota exceeded'}}),{status:429,headers:{'x-request-id':'provider-quota'}}));
 const r=await requestReferenceAnalysis(c);assert.equal(r.status,429);assert.equal(r.headers.get('x-request-id'),'provider-quota');assert.equal((await r.json()).error.code,'quota');
 assert.equal(JSON.parse(await collectAnalysisStream(sse('data: {"error":{"code":"upstream_error","request_id":"provider-error"}}\n\n'))).error.request_id,'provider-error');
});
test('a whole-request deadline aborts the original POST once and leaves a pending guard',async()=>{
 let calls=0,aborted=false;const c=config(async(target,init)=>{calls++;return new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>{aborted=true;reject(init.signal.reason);},{once:true}));});
 await assert.rejects(requestReferenceAnalysis({...c,deadlineMs:10}),/不会自动再次调用模型/);
 assert.equal(calls,1);assert.equal(aborted,true);assert.equal(JSON.parse([...c.map.values()][0]).state,'pending');
});
test('storage failure prevents a paid request before an idempotency marker can be saved',async()=>{
 let calls=0;const c=config(async()=>{calls++;return sse(events());});c.storage.setItem=()=>{throw Error('storage unavailable');};
 await assert.rejects(requestReferenceAnalysis(c),/storage unavailable/);assert.equal(calls,0);
});
test('truncated direct streams retain HTTP evidence without falsely claiming no HTTP response',async()=>{
 const c=config(async()=>new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n',{headers:{'Content-Type':'text/event-stream','x-request-id':'provider-partial'}}));
 await assert.rejects(requestStep3Analysis({model:'gpt-6.1-sol',url,key:'private-fixture',request:()=>requestReferenceAnalysis(c)}),error=>{
  assert.equal(error.analysisDiagnostic.kind,'response-read');assert.equal(error.analysisDiagnostic.httpStatus,200);assert.equal(error.analysisDiagnostic.requestId,'provider-partial');assert.match(error.message,/HTTP 200/);assert.doesNotMatch(error.message,/未取得 HTTP|private-fixture/);return true;
 });
});
