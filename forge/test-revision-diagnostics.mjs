import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createRevisionDiagnostics,revisionFailure,revisionDiagnosticText} from './revision-diagnostics.mjs';
import {createRevisionImageJobClient} from './revision-image-job.mjs';
import {REVISION_CHUNK} from './revision-upload.mjs';
import {receiveRevisionOutput} from './revision-result-recovery.mjs';

function fixture(){
 const task={id:crypto.randomUUID(),input:{route:{p:'infistar',model:'gemini-nano-banana-2.1'}}};
 let persisted;
 const diagnostics=createRevisionDiagnostics(task,{key:'fixture-key',persist:async()=>{persisted=structuredClone(task);}});
 return {task,diagnostics,snapshot:()=>persisted,url:'https://infistar.cc/v1/images/generations',body:{model:'fixture',image:['original']},key:'fixture-key',saveTask:async()=>{}};
}
const client=fetchImpl=>createRevisionImageJobClient({fetchImpl,wait:async()=>{},pollMs:0,retryMs:0});
test('one failed acknowledgement and later status rejection remain separate, persisted, and never resubmit',async()=>{
 const f=fixture();let puts=0;
 await assert.rejects(f.diagnostics.run('submission',()=>client(async(url,init)=>{
  if(init.method==='PUT'){puts++;throw TypeError('Failed to fetch fixture-key');}
  return Response.json({error:'Access denied fixture-key'},{status:403,headers:{'x-request-id':'status-request'}});
 }).request(f)),e=>e.diagnostic.stage==='status'&&e.diagnostic.httpStatus===403&&e.diagnostic.requestId==='status-request');
 const events=f.snapshot().diagnostics.events;
 assert.equal(puts,1);
 assert.ok(events.some(e=>e.stage==='submission'&&e.reason==='unreadable-response'));
 assert.ok(events.some(e=>e.stage==='status'&&e.outcome==='failed'&&e.httpStatus===403));
 const text=revisionDiagnosticText(f.snapshot());
 assert.match(text,/确认任务接收/);assert.match(text,/查询后台生成进度/);assert.match(text,/status-request/);assert.ok(!text.includes('fixture-key'));
});
test('a reference upload HTTP rejection identifies the exact chunk, not generation or result reading',async()=>{
 const f=fixture();f.body.image=[randomBytes(REVISION_CHUNK).toString('base64')];let commits=0;
 await assert.rejects(f.diagnostics.run('submission',()=>client(async(url,init)=>{
  if((init.method||'GET')==='GET')return Response.json({},{status:404});
  if(!url.includes('/upload/'))commits++;
  return Response.json({error:'Upload rejected'},{status:413,headers:{'x-request-id':'upload-request'}});
 }).request(f)),e=>e.diagnostic.stage==='upload'&&e.diagnostic.httpStatus===413);
 assert.equal(commits,0);
 const event=f.snapshot().diagnostics.events.find(e=>e.outcome==='request-error');
 assert.equal(event.chunk,1);assert.equal(event.total,2);assert.equal(event.requestId,'upload-request');
});
test('result reads and upstream failures identify different stages and preserve service diagnostics',async()=>{
 const f=fixture();f.task.submitted=true;
 await assert.rejects(client(async url=>url.endsWith('/result')?Response.json({error:'Denied'},{status:403}):Response.json({state:'succeeded'})).request(f),e=>e.diagnostic.stage==='result'&&e.diagnostic.httpStatus===403);
 const upstream=fixture();upstream.task.submitted=true;
 await assert.rejects(client(async()=>Response.json({state:'unknown',diagnostic:{upstreamStatus:502,upstreamMessage:'upstream Failed to fetch fixture-key',errorCode:'origin_closed',requestId:'provider-request',phase:'response-body'}})).request(upstream),e=>{
  assert.equal(e.diagnostic.stage,'upstream');assert.equal(e.diagnostic.httpStatus,502);
  assert.equal(e.diagnostic.providerErrorCode,'origin_closed');assert.equal(e.diagnostic.upstreamStage,'response-body');assert.equal(e.diagnostic.requestId,'provider-request');
  assert.match(e.message,/HTTP 502/);assert.ok(!e.message.includes('fixture-key'));return true;
 });
});
test('a recovered transient error remains recorded after a successful result, even when diagnostic persistence fails',async()=>{
 const f=fixture();let reads=0,puts=0;
 const response=await client(async(url,init)=>{
  if(init.method==='PUT'){puts++;return Response.json({state:'queued'});}
  if(url.endsWith('/result'))return Response.json({ok:true,status:200,text:'image'});
  if(reads++===0)return Response.json({error:'busy'},{status:503});
  return Response.json({state:'succeeded'});
 }).request(f);
 assert.equal(response.ok,true);assert.equal(puts,1);
 const events=f.snapshot().diagnostics.events;
 assert.ok(events.some(e=>e.stage==='status'&&e.httpStatus===503&&e.outcome==='request-error'));
 assert.ok(events.some(e=>e.stage==='status'&&e.outcome==='recovered'));
 const unavailable=createRevisionDiagnostics({id:'local'},{persist:async()=>{throw Error('quota');}});
 assert.equal(await unavailable.run('response',async()=>'ok'),'ok');
});
test('generic fetch errors report uncertainty; parse, timeout and storage errors keep distinct reasons',async()=>{
 const fetch=revisionFailure(TypeError('Failed to fetch https://private.example/image.png?key=fixture-key'),'submission',{},'fixture-key');
 assert.equal(fetch.diagnostic.reason,'unreadable-response');assert.match(fetch.message,/具体原因未确认/);
 assert.equal(fetch.diagnostic.observedError,'Failed to fetch');
 assert.equal(revisionFailure(new SyntaxError('Unexpected token'),'response').diagnostic.reason,'invalid-response');
 assert.equal(revisionFailure(Error('REQUEST_TIMEOUT'),'status').diagnostic.reason,'timeout');
 assert.equal(revisionFailure(Object.assign(Error('full'),{name:'QuotaExceededError'}),'history').diagnostic.reason,'storage-quota');
 const unknown=revisionFailure(Object.assign(Error('upstream Failed to fetch'),{code:'JOB_RESULT_UNKNOWN'}),'upstream');
 assert.equal(unknown.diagnostic.reason,'upstream-unconfirmed');
 const f=fixture();await assert.rejects(f.diagnostics.run('history',async()=>{throw Object.assign(Error('full fixture-key'),{name:'QuotaExceededError'});}));
 assert.equal(f.snapshot().diagnostics.lastFailure.stage,'history');assert.equal(f.snapshot().diagnostics.lastFailure.observedError,'full [redacted]');
});
test('diagnostic history is bounded, ordered and excludes images, URL tokens, credentials and extra fields',async()=>{
 const f=fixture();
 for(let i=0;i<90;i++)await f.diagnostics.record({stage:'status',outcome:'request-error',observedError:'Bearer token sk-testtoken data:image/png;base64,private https://private.example/?secret=key fixture-key',requestBody:'PRIVATE REQUEST',sequence:0});
 const log=f.snapshot().diagnostics;
 assert.equal(log.events.length,80);assert.equal(log.events[0].sequence,11);assert.equal(log.events.at(-1).sequence,90);
 const text=JSON.stringify(log);for(const secret of ['PRIVATE REQUEST','testtoken','base64,private','private.example','fixture-key'])assert.ok(!text.includes(secret));
});

test('image receipt keeps its own stage and removes the exact credential from loader errors',async()=>{
 await assert.rejects(receiveRevisionOutput('data:image/png;base64,fixture','infistar',async()=>{throw Error('decode failed private-fixture-key');},{key:'private-fixture-key'}),error=>{
  assert.equal(error.diagnostic.stage,'image-download');assert.match(error.message,/接收结果图片/);
  assert.ok(!error.message.includes('private-fixture-key'));return true;
 });
});
