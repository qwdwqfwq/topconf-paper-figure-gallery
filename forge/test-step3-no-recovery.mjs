import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createInfistarJobClient,acknowledgeInfistarImageJob,showInfistarJobProgress,usesInfistarImageJob} from './step3-infistar-job.mjs';
const input={url:'https://infistar.cc/v1/images/generations',key:'test-key',body:{model:'gpt-image-2.5-sunburst',prompt:'fixture'}};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status});
const options={wait:async()=>{},pollMs:1,deadlineMs:1000};
const success=async(url)=>reply(url.endsWith('/result')?{ok:true,status:200,text:'image'}:{state:'succeeded'});

test('stale pending and saved records never block new inputs, keys or refreshed clients',async()=>{
 const submissions=[];
 const storage=new Proxy({}, {get(){throw Error('Retired storage must not be accessed');}});
 const fetchImpl=async(url,init)=>{if(init.method==='PUT')submissions.push({id:url.split('/').pop(),body:JSON.parse(init.body),key:init.headers.Authorization});return success(url);};
 const client=createInfistarJobClient({...options,storage,fetchImpl,withLock(){throw Error('Retired key lock');}});
 const first=await client.request(input);
 await client.request({...input,body:{...input.body,prompt:'changed'}});
 await client.request(input);
 await createInfistarJobClient({...options,storage,fetchImpl}).request(input);
 await client.request({...input,key:'other-key'});
 assert.equal(submissions.length,5);assert.equal(new Set(submissions.map(x=>x.id)).size,5);
 assert.equal(submissions[1].body.body.prompt,'changed');assert.equal(first.job.recovered,false);
 await acknowledgeInfistarImageJob(input.key,first.job.id);showInfistarJobProgress({state:'running'});
});

test('lost acknowledgements and interrupted result queries reuse one task without direct POSTs',async()=>{
 let puts=0,gets=0,results=0;const ids=new Set(),progress=[];
 const c=createInfistarJobClient({...options,fetchImpl:async(url,init)=>{
  assert.notEqual(init.method,'POST');ids.add(url.match(/jobs\/([^/]+)/)[1]);
  if(init.method==='PUT'){if(++puts===1)throw Error('ack lost');return reply({state:'running'},202);}
  if(url.endsWith('/result')){if(++results===1)throw Error('result connection lost');return success(url);}
  if(++gets===1)throw Error('poll lost');return reply({state:'succeeded'});
 }});
 assert.equal((await c.request({...input,onProgress:p=>progress.push(p)})).ok,true);
 assert.equal(puts,2);assert.equal(results,2);assert.equal(ids.size,1);assert.ok(progress.some(p=>p.state==='reconnecting'));
});

test('unknown, rejected, expired and failed attempts do not occupy the next generation',async()=>{
 for(const scenario of ['unknown','expired','http','rejected','timeout']){
  const ids=new Set();let failing=true;
  const c=createInfistarJobClient({...options,deadlineMs:scenario==='timeout'?20:1000,fetchImpl:async(url,init)=>{
   ids.add(url.match(/jobs\/([^/]+)/)[1]);
   if(!failing)return success(url);
   if(scenario==='unknown')return reply({state:'unknown'});
   if(scenario==='expired')return reply({},410);
   if(scenario==='http')return reply({},401);
   if(scenario==='timeout')throw Error('offline');
   return reply(url.endsWith('/result')?{ok:false,status:400,text:'rejected'}:{state:'rejected'});
  }});
  if(scenario==='rejected')assert.equal((await c.request(input)).ok,false);
  else await assert.rejects(c.request(input),e=>e.code===({unknown:'JOB_RESULT_UNKNOWN',expired:'JOB_EXPIRED',http:'JOB_HTTP_401',timeout:'JOB_CONNECTION'}[scenario]));
  failing=false;assert.equal((await c.request({...input,body:{...input.body,prompt:'next'}})).ok,true);assert.equal(ids.size,2);
 }
});

test('provider allowlist and request packing remain in force',async()=>{
 for(const url of ['https://infistar.cc/v1beta/models/gemini-test:generateContent','https://api.openai.com/v1/images/edits','https://api.nonelinear.com.cn/v1/images/generations'])assert.equal(usesInfistarImageJob(url),true);
 let calls=0;const c=createInfistarJobClient({fetchImpl:()=>{calls++;}});
 for(const url of ['https://evil.test/v1/images/generations','http://infistar.cc/v1/images/generations'])await assert.rejects(c.request({...input,url}),/Unsupported/);
 assert.equal(calls,0);
});
