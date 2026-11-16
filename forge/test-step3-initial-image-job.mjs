import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createInitialImageJobClient} from './step3-initial-image-job.mjs';
import {createInfistarJobClient} from './step3-infistar-job.mjs';
const input={url:'https://infistar.cc/v1/images/generations',body:{model:'gpt-image-2.5-sunburst',prompt:'fixture'},key:'fixture-key'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status});
const options={pollMs:1,retryMs:1,deadlineMs:1000,requestMs:50,resultMs:200,wait:async()=>{}};
for(const [provider,url,model] of [
 ['Infistar','https://infistar.cc/v1/images/generations','gpt-image-2.5-sunburst'],
 ['Infistar','https://infistar.cc/v1beta/models/gemini-3.1-flash-image:generateContent','gemini-3.1-flash-image'],
 ['Infistar','https://infistar.cc/v1beta/models/gemini-nano-banana-2.1:generateContent','gemini-nano-banana-2.1'],
 ['NoneLinear','https://api.nonelinear.com.cn/v1/images/generations','gpt-image-fixture'],
 ['OpenAI','https://api.openai.com/v1/images/generations','gpt-image-fixture']
])test(provider+' '+model+' uses the same recovery and preserves the submitted URL/body',async()=>{
 const value={...input,url,body:{model,prompt:'unchanged prompt',size:'unchanged size'}};
 let submission,puts=0,reads=0;
 const client=createInitialImageJobClient({...options,fetchImpl:async(path,init)=>{
  if(init.method==='PUT'){puts++;submission=JSON.parse(init.body);return reply({state:'running'});}
  if(reads++===0)throw Error('lost status response');
  return reply(path.endsWith('/result')?{ok:true}:{state:'succeeded'});
 }});
 assert.equal((await client.request(value)).ok,true);
 assert.equal(puts,1);assert.equal(submission.url,url);assert.deepEqual(submission.body,value.body);
});
for(const phase of ['submission','status','result'])test('lost '+phase+' response recovers through GET on the same ID without resubmission',async()=>{
 const calls=[];let failed=false;
 const client=createInitialImageJobClient({...options,fetchImpl:async(url,init)=>{
  const current=init.method==='PUT'?'submission':url.endsWith('/result')?'result':'status';
  calls.push({url,method:init.method||'GET'});
  if(current===phase&&!failed){failed=true;throw Error('lost response');}
  return reply(current==='submission'?{state:'running'}:current==='status'?{state:'succeeded'}:{ok:true,text:'image'});
 }});
 const result=await client.request(input);
 assert.equal(result.ok,true);assert.equal(result.job.recovered,true);
 assert.equal(calls.filter(x=>x.method==='PUT').length,1);
 assert.equal(new Set(calls.map(x=>x.url.match(/jobs\/([^/]+)/)[1])).size,1);
});
test('result body has a separate longer budget than status and submission',async()=>{
 const client=createInitialImageJobClient({...options,requestMs:5,resultMs:100,fetchImpl:async(url)=>url.endsWith('/result')?{status:200,json:()=>new Promise(resolve=>setTimeout(()=>resolve({ok:true}),35))}:reply({state:'succeeded'})});
 assert.equal((await client.request(input)).ok,true);
});
for(const status of [408,429,502,503,504])test('transient GET HTTP '+status+' is retried without a second PUT',async()=>{
 let puts=0,reads=0;
 const client=createInitialImageJobClient({...options,fetchImpl:async(url,init)=>{
  if(init.method==='PUT'){puts++;return reply({state:'running'});}
  if(!url.endsWith('/result')&&reads++===0)return reply({error:'temporary'},status);
  return reply(url.endsWith('/result')?{ok:true}:{state:'succeeded'});
 }});
 assert.equal((await client.request(input)).ok,true);assert.equal(puts,1);
});
test('uncertain PUT HTTP 502 leads to GET, never another PUT',async()=>{
 const methods=[];
 const client=createInitialImageJobClient({...options,fetchImpl:async(url,init)=>{
  methods.push(init.method||'GET');
  return init.method==='PUT'?reply({error:'gateway'},502):reply(url.endsWith('/result')?{ok:true}:{state:'succeeded'});
 }});
 assert.equal((await client.request(input)).ok,true);assert.deepEqual(methods,['PUT','GET','GET']);
});
test('malformed result JSON can be fetched again without re-generating',async()=>{
 let reads=0;
 const client=createInitialImageJobClient({...options,fetchImpl:async(url)=>url.endsWith('/result')?(reads++===0?new Response('truncated'):reply({ok:true})):reply({state:'succeeded'})});
 assert.equal((await client.request(input)).ok,true);assert.equal(reads,2);
});
for(const status of [401,403,404,410])test('terminal status '+status+' is not retried',async()=>{
 let calls=0;
 const client=createInitialImageJobClient({...options,fetchImpl:async()=>{calls++;return reply({error:'terminal'},status);}});
 await assert.rejects(client.request(input),{code:status===410?'JOB_EXPIRED':'JOB_HTTP_'+status});assert.equal(calls,1);
});
test('upstream rejection and diagnostic failure remain visible, never replayed',async()=>{
 let calls=0;
 const client=createInitialImageJobClient({...options,fetchImpl:async()=>{calls++;return reply({state:'unknown',diagnostic:{upstreamStatus:422,upstreamMessage:'model rejected'}});}});
 await assert.rejects(client.request(input),e=>e.code==='JOB_RESULT_UNKNOWN'&&/422.*model rejected|model rejected.*422/.test(e.message));assert.equal(calls,1);
});
test('overall deadline stops hung body and forbids any later network request',async()=>{
 let calls=0,signal;
 const client=createInitialImageJobClient({...options,deadlineMs:15,fetchImpl:async(_url,init)=>{calls++;signal=init.signal;return {status:200,json:()=>new Promise(()=>{})};}});
 await assert.rejects(client.request(input),e=>e.code==='JOB_CONNECTION'&&/stage: submission/.test(e.message));
 await new Promise(resolve=>setTimeout(resolve,35));assert.equal(calls,1);assert.equal(signal.aborted,true);
});
test('per-request timeout aborts only that request; the subsequent GET remains usable',async()=>{
 const signals=[];
 const client=createInitialImageJobClient({...options,requestMs:5,fetchImpl:async(url,init)=>{
  signals.push(init.signal);
  if(init.method==='PUT')return {status:200,json:()=>new Promise(()=>{})};
  assert.equal(init.signal.aborted,false);
  return reply(url.endsWith('/result')?{ok:true}:{state:'succeeded'});
 }});
 assert.equal((await client.request(input)).ok,true);assert.equal(signals[0].aborted,true);
 assert.notEqual(signals[0],signals[1]);
});
test('new explicit requests have independent IDs, keys and bodies',async()=>{
 const submitted=[];
 const client=createInitialImageJobClient({...options,fetchImpl:async(url,init)=>{if(init.method==='PUT')submitted.push({url,key:init.headers.Authorization,body:JSON.parse(init.body)});return reply(url.endsWith('/result')?{ok:true}:{state:'succeeded'});}});
 await client.request(input);await client.request({...input,key:'second-key',body:{...input.body,prompt:'second prompt'}});
 assert.notEqual(submitted[0].url,submitted[1].url);assert.equal(submitted[1].key,'Bearer second-key');assert.equal(submitted[1].body.body.prompt,'second prompt');
});
test('unrecoverable connection is bounded, redacted and never submits again',async()=>{
 const methods=[];
 const client=createInitialImageJobClient({...options,maxReadFailures:2,fetchImpl:async(_url,init)=>{methods.push(init.method||'GET');throw Error('offline fixture-key');}});
 await assert.rejects(client.request(input),e=>e.code==='JOB_CONNECTION'&&!e.message.includes('fixture-key'));
 assert.deepEqual(methods,['PUT','GET','GET','GET']);
});
test('legacy client reproduces the 15-second false failure on a successful slow result',async()=>{
 let id,puts=0;
 const legacy=createInfistarJobClient({deadlineMs:25000,fetchImpl:async(url,init)=>{
  if(init.method==='PUT'){puts++;id=url.split('/').pop();}
  return url.endsWith('/result')?{status:200,json:()=>new Promise(resolve=>setTimeout(()=>resolve({ok:true}),16000))}:reply({state:'succeeded'});
 }});
 const started=Date.now();
 await assert.rejects(legacy.request(input),e=>e.code==='JOB_CONNECTION'&&e.jobId===id);
 assert.ok(Date.now()-started>=14900);assert.ok(Date.now()-started<15900);assert.equal(puts,1);
});
