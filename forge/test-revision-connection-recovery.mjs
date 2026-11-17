import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRevisionImageJobClient} from './revision-image-job.mjs';

const input=()=>({url:'https://infistar.cc/v1/images/generations',body:{model:'fixture',image:['original']},key:'fixture-key',task:{id:crypto.randomUUID()},saveTask:async()=>{}});
test('status and result reads recover outages longer than the former six-failure cutoff, with one paid submission',async()=>{
 const task=input();let puts=0,status=0,result=0;const progress=[];
 const client=createRevisionImageJobClient({wait:async()=>{},pollMs:0,retryMs:0,fetchImpl:async(url,init={})=>{
  if(init.method==='PUT'){puts++;throw new TypeError('Failed to fetch');}
  if(url.endsWith('/result')){
   if(result++<8)return new Response('temporary gateway page',{status:503});
   return Response.json({ok:true,status:200,text:'saved image'});
  }
  if(status++<8)throw new TypeError('Failed to fetch');
  return Response.json({state:'succeeded'});
 }});
 const raw=await client.request({...task,onProgress:p=>progress.push(p)});
 assert.equal(raw.text,'saved image');assert.equal(puts,1);assert.equal(status,9);assert.equal(result,9);
 assert.equal(raw.job.recovered,true);assert.ok(progress.some(p=>p.stage==='status'&&p.state==='reconnecting'));
 assert.ok(progress.some(p=>p.stage==='result'&&p.state==='reconnecting'));
 await client.request({...task,task:structuredClone(task.task)});assert.equal(puts,1);
});
test('permanent non-JSON authentication error stops immediately and is not treated as an outage',async()=>{
 const task=input();task.task.submitted=true;let calls=0;
 const client=createRevisionImageJobClient({wait:async()=>{},fetchImpl:async()=>{calls++;return new Response('<html>private fixture-key</html>',{status:403});}});
 await assert.rejects(client.request(task),error=>error.code==='JOB_HTTP_403'&&!error.message.includes('<html>')&&!error.message.includes('fixture-key'));
 assert.equal(calls,1);
});
test('deadline preserves accepted task and reports failed phase without leaking credentials or continuing requests',async()=>{
 const task=input();task.task.submitted=true;let calls=0;
 const client=createRevisionImageJobClient({deadlineMs:40,retryMs:1,fetchImpl:async()=>{calls++;throw new TypeError('Failed to fetch fixture-key');}});
 await assert.rejects(client.request(task),error=>error.code==='JOB_CONNECTION'&&error.diagnostic.stage==='status'&&!error.message.includes('fixture-key'));
 assert.equal(task.task.submitted,true);assert.equal(task.task.raw,undefined);
 const stopped=calls;await new Promise(r=>setTimeout(r,30));assert.equal(calls,stopped);
});

import {receiveRevisionOutput} from './revision-result-recovery.mjs';
const hosted='https://imagen-nonelinear-2025.tos-cn-beijing.volces.com/gemini/fixture.png';
test('stored result download recovers repeated outages and transient HTTP without any generation call',async()=>{
 const previous=globalThis.FileReader;let calls=0;const progress=[];
 globalThis.FileReader=class{async readAsDataURL(blob){this.result='data:image/png;base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');this.onload();}};
 try{
  const image=await receiveRevisionOutput(hosted,'nonelinear',()=>assert.fail('must use private receiver'),{wait:async()=>{},onProgress:p=>progress.push(p),fetchImpl:async(url,init)=>{
   assert.match(url,/gallery-revision-images.*\/revision-image$/);assert.equal(init.method,'POST');assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');assert.deepEqual(JSON.parse(init.body),{url:hosted});
   if(calls++<8)throw TypeError('Failed to fetch');
   if(calls===10)return new Response('temporary',{status:503});
   return new Response('pixels',{headers:{'Content-Type':'image/png'}});
  }});
  assert.equal(image,'data:image/png;base64,'+Buffer.from('pixels').toString('base64'));assert.equal(calls,9);assert.equal(progress.length,8);
  // An HTTP 503 also retries; a permanent HTTP 403 does not.
  calls=0;await receiveRevisionOutput(hosted,'nonelinear',()=>{}, {wait:async()=>{},fetchImpl:async()=>++calls===1?new Response('gateway',{status:503}):new Response('pixels')});assert.equal(calls,2);
  calls=0;await assert.rejects(receiveRevisionOutput(hosted,'nonelinear',()=>{}, {wait:async()=>{},fetchImpl:async()=>{calls++;return new Response('secret body',{status:403});}}),e=>e.code==='REVISION_RESULT_DOWNLOAD'&&e.message.includes('HTTP 403')&&!e.message.includes('secret'));assert.equal(calls,1);
 }finally{globalThis.FileReader=previous;}
});
test('download timeout preserves recoverable result and stops requests; other outputs keep the existing loader',async()=>{
 let calls=0;
 await assert.rejects(receiveRevisionOutput(hosted,'nonelinear',()=>{}, {deadlineMs:30,requestMs:10,wait:ms=>new Promise(r=>setTimeout(r,ms)),fetchImpl:async()=>{calls++;throw TypeError('Failed to fetch private-url');}}),e=>e.code==='REVISION_RESULT_DOWNLOAD'&&e.diagnostic.stage==='image-download'&&!e.message.includes('private-url'));
 const stopped=calls;await new Promise(r=>setTimeout(r,30));assert.equal(calls,stopped);
 const value=await receiveRevisionOutput('data:image/png;base64,fixture','infistar',async x=>x,{fetchImpl:()=>assert.fail('no receiver for inline image')});assert.equal(value,'data:image/png;base64,fixture');
});
