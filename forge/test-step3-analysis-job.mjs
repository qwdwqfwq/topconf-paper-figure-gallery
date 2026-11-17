import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestReferenceAnalysis,usesAnalysisJob,ANALYSIS_JOB_BASE} from './step3-analysis-job.mjs';
const id='12345678-1234-1234-1234-123456789abc',key='offline-private-key';
const init={method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify({model:'gpt-6.1-sol',temperature:.2,max_completion_tokens:16000,messages:[{role:'user',content:'same prompt and images'}]})};
const url='https://gallery-nonelinear-relay.lixiao-gallery.workers.dev/v1/chat/completions';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
function config(fetchImpl){const map=new Map();let clock=1;return {provider:'nonelinear',url,init,fetchImpl,uuid:()=>id,now:()=>clock,sleep:async()=>{clock+=10;},pollMs:10,deadlineMs:200,networkMs:1000,storage:{getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)},map};}
test('lost acknowledgement, poll interruption and broken result read repeat only idempotent job operations',async()=>{
 const requests=[];let puts=0,gets=0;
 const c=config(async(target,options)=>{requests.push([target,options]);if(options.method==='PUT'){puts++;assert.equal(options.body,init.body);if(puts===1)throw Error('lost ack');return json({state:'running'},202);}gets++;if(gets===1)throw Error('offline');if(gets===2)return json({state:'running'},202);if(gets===3)return new Response(new ReadableStream({start(ctrl){ctrl.error(Error('truncated'));}}));return json({choices:[{message:{content:'complete'}}]});});
 assert.equal((await (await requestReferenceAnalysis(c)).json()).choices[0].message.content,'complete');
 assert.equal(puts,2);assert.ok(requests.every(([target])=>target.startsWith(ANALYSIS_JOB_BASE+'/jobs/'+id)));assert.equal(c.map.size,0);
});
test('retry after browser timeout resumes the same persisted task without another submission',async()=>{
 let puts=0;const c=config(async(target,options)=>{if(options.method==='PUT'){puts++;return json({state:'queued'},202);}return json({state:'running'},202);});c.deadlineMs=20;
 await assert.rejects(requestReferenceAnalysis(c),/同一任务/);assert.equal(puts,1);assert.ok(!JSON.stringify([...c.map]).includes(key));assert.ok(!JSON.stringify([...c.map]).includes('same prompt'));
 c.fetchImpl=async(target,options)=>{assert.notEqual(options.method,'PUT');return json({choices:[{message:{content:'saved'}}]});};
 assert.equal((await (await requestReferenceAnalysis(c)).json()).choices[0].message.content,'saved');assert.equal(puts,1);
});
test('custom endpoints, Infistar and other stages retain their original native request',async()=>{
 assert.equal(usesAnalysisJob('nonelinear',url),true);
 for(const [provider,target]of [['infistar','https://infistar.cc/v1/chat/completions'],['nonelinear','https://custom.invalid/v1/chat/completions'],['nonelinear','https://api.nonelinear.com.cn/v1/images/generations']]){
  assert.equal(usesAnalysisJob(provider,target),false);let calls=0;const response=new Response('same native response');const c=config((u,options)=>{calls++;assert.equal(u,target);assert.equal(options,init);return response;});assert.equal(await requestReferenceAnalysis({...c,provider,url:target}),response);assert.equal(calls,1);
 }
});
