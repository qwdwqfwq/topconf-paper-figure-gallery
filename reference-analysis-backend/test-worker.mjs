import {test} from 'node:test';
import assert from 'node:assert/strict';
import router,{ReferenceAnalysisJob} from './worker.mjs';
const id='12345678-1234-1234-1234-123456789abc',url='https://public.gallery-reference-analysis.pages.dev/jobs/'+id;
const headers={Origin:'https://qwdwqfwq.github.io',Authorization:'Bearer offline-private-key','Content-Type':'application/json'};
const body={model:'gpt-6.1-sol',temperature:.2,max_completion_tokens:16000,messages:[{role:'system',content:'exact prompt'},{role:'user',content:[{type:'image_url',image_url:{url:'data:image/png;base64,unchanged'}}]}]};
function fixture(upstream){
 const map=new Map();let alarm,calls=0,gate=Promise.resolve();
 const storage={get:async k=>structuredClone(map.get(k)),put:async(k,v)=>map.set(k,structuredClone(v)),delete:async k=>map.delete(k),setAlarm:async t=>alarm=t,deleteAlarm:async()=>alarm=null,transaction:async f=>f(storage)};
 const ctx={storage,blockConcurrencyWhile:f=>{const p=gate.then(f);gate=p.catch(()=>{});return p;}};
 const env={JOB_ENCRYPTION_KEY:btoa('12345678901234567890123456789012'),UPSTREAM_FETCH:async(...args)=>{calls++;return upstream(...args);}};
 const job=new ReferenceAnalysisJob(ctx,env);
 const request=(method,path='',data=body,auth=headers)=>job.fetch(new Request(url+path,{method,headers:auth,...(method==='PUT'?{body:JSON.stringify(data)}:{})}));
 return {map,storage,job,request,env,calls:()=>calls,alarm:()=>alarm};
}
test('duplicate and concurrent submissions execute one paid call; results survive lost reads',async()=>{
 let sent;
 const f=fixture(async(target,init)=>{assert.equal(target,'https://api.nonelinear.com.cn/v1/chat/completions');sent=JSON.parse(init.body);return new Response('data: '+JSON.stringify({choices:[{index:0,delta:{content:'complete analysis'},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});});
 const responses=await Promise.all([f.request('PUT'),f.request('PUT')]);assert.deepEqual(responses.map(r=>r.status),[202,202]);
 const before=JSON.stringify([...f.map]);assert.ok(!before.includes('offline-private-key'));assert.equal((await f.request('GET','/result')).status,202);
 await f.job.alarm();await f.job.alarm();assert.equal(f.calls(),1);assert.deepEqual(sent,{...body,stream:true});
 assert.equal((await f.request('PUT')).status,202);await f.job.alarm();assert.equal(f.calls(),1);
 const a=await (await f.request('GET','/result')).text(),b=await (await f.request('GET','/result')).text();assert.equal(a,b);assert.equal(JSON.parse(a).choices[0].message.content,'complete analysis');
 assert.equal([...f.map.keys()].some(k=>k.startsWith('input:')),false);assert.equal(f.map.get('meta').encrypted,undefined);
 assert.equal((await f.request('PUT','',{...body,temperature:.5})).status,409);
 assert.equal((await f.request('GET','/result',null,{...headers,Authorization:'Bearer wrong-key'})).status,404);
});
test('restart after durable claim cannot replay a paid model call',async()=>{
 const f=fixture(()=>{throw Error('must not call');});await f.request('PUT');f.map.set('meta',{...f.map.get('meta'),state:'running',upstreamAttempts:1});
 const restarted=new ReferenceAnalysisJob({storage:f.storage},f.env);await restarted.alarm();assert.equal(f.calls(),0);
 assert.equal((await (await f.request('GET','/result')).json()).error.code,'analysis_outcome_unknown');await restarted.alarm();assert.equal(f.calls(),0);
});
test('upstream transport and truncated SSE return stored errors without replay',async()=>{
 for(const upstream of [()=>{throw Error('connection lost');},()=>new Response('data: {"choices":[{"index":0,"delta":{"content":"partial"}}]}\n\n',{headers:{'Content-Type':'text/event-stream'}})]){
  const f=fixture(upstream);await f.request('PUT');await f.job.alarm();assert.ok((await (await f.request('GET','/result')).json()).error);await f.request('PUT');await f.job.alarm();assert.equal(f.calls(),1);
 }
});
test('expired tombstones and key-scoped public routes prevent replay or leakage',async()=>{
 const f=fixture(()=>new Response('{}'));await f.request('PUT');f.map.set('meta',{...f.map.get('meta'),expires:Date.now()-1});assert.equal((await f.request('GET','/result')).status,410);assert.equal((await f.request('PUT')).status,410);await f.job.alarm();assert.equal(f.calls(),0);assert.equal(f.map.size,1);
 let name;
 const env={ANALYSIS_JOBS:{idFromName:n=>(name=n),get:()=>({fetch:()=>new Response('{}')})}};
 const preflight=await router.fetch(new Request(url,{method:'OPTIONS',headers:{Origin:headers.Origin,'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'authorization,content-type'}}),env);assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Headers'),'Authorization, Content-Type');
 assert.equal((await router.fetch(new Request(url,{headers:{...headers,Origin:'https://other.invalid'}}),env)).status,403);
 assert.equal((await router.fetch(new Request(url,{headers:{Origin:headers.Origin}}),env)).status,401);
 assert.equal((await router.fetch(new Request(url,{headers}),env)).status,200);assert.ok(name.endsWith(':'+id));assert.ok(!name.includes('offline-private-key'));
});
