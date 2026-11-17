import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestReferenceAnalysis,usesAnalysisJob,ANALYSIS_JOB_BASE} from './step3-analysis-job.mjs';
const id='12345678-1234-1234-1234-123456789abc',key='offline-private-key';
const init={method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify({model:'gpt-6.1-sol',temperature:.2,max_completion_tokens:16000,messages:[{role:'user',content:'same prompt and images'}]})};
const url='https://gallery-nonelinear-relay.lixiao-gallery.workers.dev/v1/chat/completions';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
async function seedBackend(c,accepted=false){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(c.url+'\n'+new Headers(c.init.headers).get('Authorization')+'\n'+c.init.body));
 const slot='gallery.reference-analysis.v1.'+[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
 c.storage.setItem(slot,JSON.stringify({id,created:c.now(),accepted}));
}
function config(fetchImpl){const map=new Map();let clock=1;return {provider:'nonelinear',url,init,fetchImpl,uuid:()=>id,now:()=>clock,sleep:async()=>{clock+=10;},pollMs:10,deadlineMs:200,networkMs:1000,jobBases:[ANALYSIS_JOB_BASE],probe:false,storage:{getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)},map};}
test('lost acknowledgement, poll interruption and broken result read repeat only idempotent job operations',async()=>{
 const requests=[];let puts=0,gets=0;
 const c=config(async(target,options)=>{requests.push([target,options]);if(options.method==='PUT'){puts++;assert.equal(options.body,init.body);if(puts===1)throw Error('lost ack');return json({state:'running'},202);}gets++;if(gets===1)throw Error('offline');if(gets===2)return json({state:'running'},202);if(gets===3)return new Response(new ReadableStream({start(ctrl){ctrl.error(Error('truncated'));}}));return json({choices:[{message:{content:'complete'}}]});});
 assert.equal((await (await requestReferenceAnalysis(c)).json()).choices[0].message.content,'complete');
 assert.equal(puts,1,'A lost acknowledgement is recovered by GET, without re-uploading the images');assert.ok(requests.every(([target])=>target.startsWith(ANALYSIS_JOB_BASE+'/jobs/'+id)));assert.equal(c.map.size,1);
 const previousPuts=puts;
 assert.equal((await (await requestReferenceAnalysis(c)).json()).choices[0].message.content,'complete');
 assert.equal(puts,previousPuts,'Completed analysis survives another generation attempt');
});
test('retry after browser timeout resumes the same persisted task without another submission',async()=>{
 let puts=0;const c=config(async(target,options)=>{if(options.method==='PUT'){puts++;return json({state:'queued'},202);}return json({state:'running'},202);});c.deadlineMs=20;
 await assert.rejects(requestReferenceAnalysis(c),/同一任务/);assert.equal(puts,1);assert.ok(!JSON.stringify([...c.map]).includes(key));assert.ok(!JSON.stringify([...c.map]).includes('same prompt'));
 c.fetchImpl=async(target,options)=>{assert.notEqual(options.method,'PUT');return json({choices:[{message:{content:'saved'}}]});};
 assert.equal((await (await requestReferenceAnalysis(c)).json()).choices[0].message.content,'saved');assert.equal(puts,1);
});
test('custom endpoints and other stages retain their original native request',async()=>{
 assert.equal(usesAnalysisJob('nonelinear',url),true);
 for(const [provider,target]of [['infistar','https://custom.invalid/v1/chat/completions'],['nonelinear','https://custom.invalid/v1/chat/completions'],['nonelinear','https://api.nonelinear.com.cn/v1/images/generations'],['infistar','https://infistar.ai:8443/v1/chat/completions'],['infistar','https://infistar.ai/v1/chat/completions?custom=1']]){
  assert.equal(usesAnalysisJob(provider,target),false);let calls=0;const response=new Response('same native response');const c=config((u,options)=>{calls++;assert.equal(u,target);assert.equal(options,init);return response;});assert.equal(await requestReferenceAnalysis({...c,provider,url:target}),response);assert.equal(calls,1);
 }
});

test('existing jobs in both Infistar environments resume without another model submission',async()=>{
 for(const host of ['cc','ai']){
  let puts=0,gets=0;
  const c=config(async(target,options)=>{
   assert.ok(target.startsWith(ANALYSIS_JOB_BASE+'/jobs/'));
   const h=new Headers(options.headers);
   assert.equal(h.get('Authorization'),'Bearer '+key);
   assert.equal(h.get('X-Analysis-Upstream'),'infistar-'+host);
   if(options.method==='PUT'){puts++;assert.equal(options.body,init.body);return json({state:'running'},202);}
   gets++;if(gets===1)throw TypeError('Failed to fetch');
   return json({choices:[{message:{content:'saved '+host}}]});
  });
  c.provider='infistar';c.url='https://infistar.'+host+'/v1/chat/completions';
  await seedBackend(c);
  assert.equal((await (await requestReferenceAnalysis(c)).json()).choices[0].message.content,'saved '+host);
  assert.equal(puts,0);assert.equal(gets,2);
 }
});

test('unavailable job service never falls back to a second paid request',async()=>{
 const targets=[];const c=config(async target=>{targets.push(target);throw TypeError('Failed to fetch');});
 c.provider='infistar';c.url='https://infistar.ai/v1/chat/completions';c.deadlineMs=30;
 await assert.rejects(requestReferenceAnalysis(c),new RegExp(id));
 assert.ok(targets.every(t=>t.startsWith(ANALYSIS_JOB_BASE)));
 assert.equal(JSON.parse([...c.map.values()][0]).id,id);
});

test('a saved terminal error is returned immediately, while storage outages are retried',async()=>{
 let gets=0;const c=config(async(target,options)=>{
  if(options.method==='PUT')return json({state:'running'},202);
  gets++;
  if(gets===1)return json({error:{code:'job_storage_unavailable'}},503);
  return new Response(JSON.stringify({error:{code:'upstream_error'}}),{status:503,headers:{'X-Analysis-Job-Id':id}});
 });
 const result=await requestReferenceAnalysis(c);assert.equal(result.status,503);assert.equal(gets,2);
 assert.equal((await result.json()).error.request_id,id);
});

test('only a confirmed missing task permits another PUT with the identical id and body',async()=>{
 const methods=[];const c=config(async(target,options)=>{
  const method=options.method||'GET';methods.push(method);
  if(method==='PUT'){assert.ok(target.endsWith('/'+id));assert.equal(options.body,init.body);if(methods.length===1)throw new DOMException('lost ack','TimeoutError');return json({state:'queued'},202);}
  if(methods.length===2)return json({error:'NOT_FOUND'},404);
  return json({choices:[{message:{content:'complete'}}]});
 });
 assert.equal((await (await requestReferenceAnalysis(c)).json()).choices[0].message.content,'complete');
 assert.deepEqual(methods,['PUT','GET','PUT','GET']);
});

test('unacknowledged submissions stay unknown across reloads and never become accepted merely from a local UUID',async()=>{
 let puts=0;const c=config(async(target,options)=>{if(options.method==='PUT')puts++;throw new DOMException('signal timed out','TimeoutError');});c.deadlineMs=30;
 for(let attempt=0;attempt<2;attempt++)await assert.rejects(requestReferenceAnalysis(c),error=>{
  assert.equal(error.name,'AnalysisJobError');assert.equal(error.analysisJobDiagnostic.accepted,false);
  assert.equal(error.analysisJobDiagnostic.jobEndpoint,ANALYSIS_JOB_BASE);assert.equal(error.analysisJobDiagnostic.kind,'timeout');
  assert.match(error.message,/尚未取得后台接收确认/);assert.doesNotMatch(error.message,/signal timed out/);return true;
 });
 assert.equal(puts,1);assert.notEqual(JSON.parse([...c.map.values()][0]).accepted,true);
});

test('confirmed jobs distinguish pending execution from a broken HTTP response body',async()=>{
 const c=config(async(target,options)=>options.method==='PUT'?json({state:'queued'},202):json({state:'running'},202));c.deadlineMs=20;
 await assert.rejects(requestReferenceAnalysis(c),error=>error.analysisJobDiagnostic.accepted&&error.analysisJobDiagnostic.kind==='pending'&&error.analysisJobDiagnostic.httpStatus===202);
 c.fetchImpl=async()=>new Response(new ReadableStream({start(controller){controller.error(new Error('body disconnected '+key));}}),{status:502});
 await assert.rejects(requestReferenceAnalysis(c),error=>{
  assert.equal(error.analysisJobDiagnostic.kind,'response-read');assert.equal(error.analysisJobDiagnostic.httpStatus,502);
  assert.equal(error.analysisJobDiagnostic.accepted,true);assert.ok(!JSON.stringify(error.analysisJobDiagnostic).includes(key));return true;
 });
});

test('an unknown HTTP 404 route is a service error and never authorizes a new submission',async()=>{
 let puts=0;const c=config(async(target,options)=>{if(options.method==='PUT'){puts++;return json({state:'queued'},202);}return json({error:'UNKNOWN_ENDPOINT'},404);});
 const response=await requestReferenceAnalysis(c);assert.equal(response.status,404);assert.equal(response.headers.get('X-Analysis-Error-Layer'),'job-service');assert.equal(puts,1);
});

const alternate='https://gallery-reference-analysis-access.lixiao-gallery.workers.dev';
const hang=signal=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});
test('a stalled primary result switches ingress before its timeout, including a stalled response body',async()=>{
 for(const bodyStall of [false,true]){
  let puts=0,reads=0,aborted=0;const ids=new Set();
  const c=config(async(target,options)=>{
   ids.add(new URL(target).pathname.split('/')[2]);
   if(options.method==='PUT'){puts++;return json({state:'running'},202);}
   reads++;
   if(target.startsWith(ANALYSIS_JOB_BASE)){
    options.signal.addEventListener('abort',()=>aborted++,{once:true});
    if(bodyStall)return {status:200,headers:new Headers(),text:()=>hang(options.signal)};
    return hang(options.signal);
   }
   return json({choices:[{message:{content:'saved via alternate'}}]});
  });
  Object.assign(c,{jobBases:[ANALYSIS_JOB_BASE,alternate],hedgeMs:5,networkMs:5000});
  const start=Date.now(),response=await requestReferenceAnalysis(c);
  assert.equal((await response.json()).choices[0].message.content,'saved via alternate');
  assert.ok(Date.now()-start<1000,'Must not wait for the stalled read deadline');
  assert.equal(puts,1);assert.equal(reads,2);assert.equal(aborted,1);assert.deepEqual([...ids],[id]);
 }
});
test('a failed ingress immediately switches and retains authorization, environment and completed task across refresh',async()=>{
 let puts=0,alternateReads=0;
 const c=config(async(target,options)=>{
  const h=new Headers(options.headers);assert.equal(h.get('Authorization'),'Bearer '+key);assert.equal(h.get('X-Analysis-Upstream'),'infistar-cc');
  if(options.method==='PUT'){puts++;throw new DOMException('lost acknowledgement','TimeoutError');}
  if(target.startsWith(ANALYSIS_JOB_BASE))throw TypeError('route offline');
  alternateReads++;assert.ok(target.endsWith('/'+id+'/result'));
  return json({choices:[{message:{content:'already paid'}}]});
 });
 Object.assign(c,{provider:'infistar',url:'https://infistar.cc/v1/chat/completions',jobBases:[ANALYSIS_JOB_BASE,alternate],hedgeMs:60000});
 await seedBackend(c);
 for(let attempt=0;attempt<2;attempt++)assert.equal((await (await requestReferenceAnalysis(c)).json()).choices[0].message.content,'already paid');
 assert.equal(puts,0);assert.equal(alternateReads,2);
});
test('health races choose a reachable upload route without sending keys or images to health',async()=>{
 let puts=0,health=0,aborted=0;
 const c=config(async(target,options)=>{
  if(target.endsWith('/health')){
   health++;assert.equal(options.headers,undefined);assert.equal(options.body,undefined);
   if(target.startsWith(ANALYSIS_JOB_BASE)){options.signal.addEventListener('abort',()=>aborted++,{once:true});return hang(options.signal);}
   return json({ready:true});
  }
  assert.ok(target.startsWith(alternate));
  if(options.method==='PUT'){puts++;assert.equal(options.body,init.body);return json({state:'queued'},202);}
  return json({choices:[{message:{content:'done'}}]});
 });
 Object.assign(c,{jobBases:[ANALYSIS_JOB_BASE,alternate],probe:true});
 assert.equal((await (await requestReferenceAnalysis(c)).json()).choices[0].message.content,'done');
 assert.equal(health,2);assert.equal(puts,1);assert.equal(aborted,1);
});
test('a fast first route cancels delayed alternate reads rather than leaking work after completion',async()=>{
 const targets=[];const c=config(async(target,options)=>{targets.push(target);return options.method==='PUT'?json({state:'running'},202):json({choices:[]});});
 Object.assign(c,{jobBases:[ANALYSIS_JOB_BASE,alternate],hedgeMs:5});
 await requestReferenceAnalysis(c);await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(targets.length,2);assert.ok(targets.every(target=>target.startsWith(ANALYSIS_JOB_BASE)));
});
