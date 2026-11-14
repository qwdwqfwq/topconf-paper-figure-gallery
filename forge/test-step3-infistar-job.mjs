import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createInfistarJobClient,usesInfistarImageJob} from './step3-infistar-job.mjs';
const input={url:'https://infistar.cc/v1/images/generations',key:'test-key',body:{model:'gpt-image-2.5-sunburst',prompt:'fixture'},usedReferences:false};
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status});
const options={withLock:async(_n,fn)=>fn(),wait:async()=>{},pollMs:1,deadlineMs:1000};
test('lost PUT acknowledgement and interrupted polls recover one stable task; refresh never submits',async()=>{
 const storage=memory();let puts=0,gets=0;const ids=new Set();
 const fetchImpl=async(url,init)=>{
  ids.add(url.match(/jobs\/([^/]+)/)[1]);
  if(init.method==='PUT'){if(++puts===1)throw Error('ack lost');return reply({state:'running'},202);}
  if(url.endsWith('/result'))return reply({ok:true,text:'image',status:200});
  if(++gets===1)throw Error('query disconnected');return reply({state:'succeeded'});
 };
 const client=createInfistarJobClient({...options,storage,fetchImpl});
 const first=await client.request(input);assert.equal(puts,2);assert.equal(ids.size,1);
 const refreshed=createInfistarJobClient({...options,storage,fetchImpl});
 const recovered=await refreshed.recover({key:input.key});assert.equal(recovered.job.id,first.job.id);assert.equal(puts,2);
 assert.equal(recovered.job.recovered,true);await refreshed.acknowledge(input.key,first.job.id);assert.equal(await refreshed.pending(input.key),null);
});
test('unconfirmed upstream result, changed input and another key cannot trigger resubmission',async()=>{
 const storage=memory();let puts=0;const fetchImpl=async(_u,i)=>{if(i.method==='PUT')puts++;return reply({state:'unknown'},i.method==='PUT'?202:200);};
 const c=createInfistarJobClient({...options,storage,fetchImpl});
 await assert.rejects(c.request(input),{code:'JOB_RESULT_UNKNOWN'});assert.equal(puts,1);
 await assert.rejects(c.recover({key:input.key}),{code:'JOB_RESULT_UNKNOWN'});assert.equal(puts,1);
 await assert.rejects(c.request({...input,body:{...input.body,prompt:'changed'}}),{code:'JOB_PENDING_DIFFERENT_INPUT'});assert.equal(puts,1);
 await assert.rejects(c.recover({key:'another-key'}),/没有待取回/);assert.equal(puts,1);
});
test('storage failure blocks the chargeable request; expired IDs stay recorded',async()=>{
 let posts=0;const bad={getItem:()=>null,setItem:()=>{throw Error('quota');}};
 await assert.rejects(createInfistarJobClient({...options,storage:bad,fetchImpl:()=>{posts++;}}).request(input),{code:'JOB_STORAGE'});assert.equal(posts,0);
 const c=createInfistarJobClient({...options,storage:memory(),fetchImpl:async()=>reply({state:'expired'},410)});
 await assert.rejects(c.request(input),{code:'JOB_EXPIRED'});assert.ok(await c.pending(input.key));
});
test('all supported providers use durable jobs; arbitrary hosts remain excluded',()=>{
 assert.equal(usesInfistarImageJob(input.url,input.body.model),true);
 for(const url of ['https://evil.test/v1/images/generations','http://infistar.cc/v1/images/generations','https://infistar.cc/v1/images/edits'])assert.equal(usesInfistarImageJob(url,input.body.model),false);
 for(const url of ['https://infistar.cc/v1beta/models/gemini-3.1-flash-lite-image:generateContent','https://api.openai.com/v1/images/edits','https://api.nonelinear.com.cn/v1/images/generations'])assert.equal(usesInfistarImageJob(url),true);
});
test('editor acknowledgement keeps a recoverable result without blocking the next generation',async()=>{
 const c=createInfistarJobClient({...options,storage:memory(),fetchImpl:async(url)=>reply(url.endsWith('/result')?{ok:true,text:'saved',status:200}:{state:'succeeded'})});
 const first=await c.request(input);await c.acknowledge(input.key,first.job.id);
 assert.equal(await c.pending(input.key),null);assert.equal((await c.recover({key:input.key})).job.id,first.job.id);assert.equal(await c.pending(input.key),null);
 await c.forget(input.key,first.job.id);await assert.rejects(c.recover({key:input.key}),/没有待取回/);
});
test('a late query in another tab cannot overwrite or resurrect a pending task',async()=>{
 const storage=memory();let resumeQuery,queryStarted;
 const started=new Promise(resolve=>queryStarted=resolve),blocked=new Promise(resolve=>resumeQuery=resolve);
 const fetchImpl=async(url)=>reply(url.endsWith('/result')?{ok:true,text:'saved',status:200}:{state:'succeeded'});
 const firstTab=createInfistarJobClient({...options,storage,fetchImpl});
 const first=await firstTab.request(input);
 const secondTab=createInfistarJobClient({...options,storage,fetchImpl:async(url,init)=>{
  if(!url.endsWith('/result')){queryStarted();await blocked;}return fetchImpl(url,init);
 }});
 const oldRecovery=secondTab.recover({key:input.key});await started;
 await firstTab.acknowledge(input.key,first.job.id);
 const next=await firstTab.request({...input,body:{...input.body,prompt:'next image'}});
 resumeQuery();assert.equal((await oldRecovery).job.id,first.job.id);
 assert.equal((await firstTab.pending(input.key)).id,next.job.id);
 await secondTab.acknowledge(input.key,first.job.id);
 assert.equal((await firstTab.pending(input.key)).id,next.job.id);
 await firstTab.acknowledge(input.key,next.job.id);
 await secondTab.recover({key:input.key});assert.equal(await firstTab.pending(input.key),null);
});
