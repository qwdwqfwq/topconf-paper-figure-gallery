import {test} from 'node:test';
import assert from 'node:assert/strict';
import {internationalGalleryBase,internationalInitialImageUrl} from './step3-international-image-route.mjs';
import {createInternationalInitialImageJobClient,createInitialImageJobClient} from './step3-initial-image-job.mjs';

test('authorized stages use international entrance for GPT, Claude, Gemini and Banana',()=>{
 for(const model of ['gpt-6.1-sol','gpt-image-2.5-sunburst','claude-opus-4','gemini-3.1-flash-image','gemini-nano-banana-2.1','banana-2.1','nano-banana-2.1']){
  for(const stage of ['parse','visual','revision'])assert.equal(internationalGalleryBase('https://infistar.cc/v1',{provider:'infistar',model,stage}),'https://infistar.ai/v1');
  assert.equal(internationalGalleryBase('https://infistar.cc/v1',{provider:'infistar',model,stage:'generate'}),'https://infistar.cc/v1');
 }
 assert.equal(internationalGalleryBase('https://www.infistar.cc',{provider:'infistar',stage:'catalog'}),'https://infistar.ai');
});

test('Step 4, other providers, custom URLs and other model families retain their entrance',()=>{
 const base='https://infistar.cc/v1';
 for(const stage of ['step4','reconstruct','export',undefined])assert.equal(internationalGalleryBase(base,{provider:'infistar',model:'gpt-6.1-sol',stage}),base);
 for(const provider of ['nonelinear','custom','openai',undefined])assert.equal(internationalGalleryBase(base,{provider,model:'gpt-6.1-sol',stage:'generate'}),base);
 assert.equal(internationalGalleryBase(base,{provider:'infistar',model:'qwen3',stage:'generate'}),base);
 for(const custom of ['https://custom.example/v1','https://infistar.cc.evil.example/v1','http://infistar.cc/v1','https://infistar.cc/custom','https://infistar.cc/v1?x=1','https://user@infistar.cc/v1','https://infistar.cc/v1#fragment','invalid'])assert.equal(internationalGalleryBase(custom,{provider:'infistar',model:'gpt-6.1-sol',stage:'generate'}),custom);
});

test('image route changes only entrance and preserves native method and stream query',()=>{
 for(const host of ['infistar.cc','infistar.ai'])for(const suffix of [':generateContent',':streamGenerateContent?alt=sse']){const url='https://'+host+'/v1beta/models/gemini-nano-banana-2.1'+suffix;assert.equal(internationalInitialImageUrl(url,{}),url);}
 const body={model:'gpt-image-2.5-sunburst',size:'2048x1152'};
 assert.equal(internationalInitialImageUrl('https://infistar.cc/v1/images/generations',body),'https://infistar.cc/v1/images/generations');
 for(const address of ['https://infistar.cc/v1/chat/completions','https://infistar.cc/v1/responses','https://custom.example/v1/images/generations','https://infistar.cc/v1/images/generations?x=1'])assert.equal(internationalInitialImageUrl(address,body),address);
});

test('initial client sends one international 2K submission and retains original body',async()=>{
 const body={contents:[{role:'user',parts:[{text:'2K fixture'}]}],generationConfig:{responseModalities:['TEXT','IMAGE'],imageConfig:{aspectRatio:'16:9',imageSize:'2K'}}};
 const original=structuredClone(body);let submitted,puts=0;
 const client=createInternationalInitialImageJobClient({fetchImpl:async(url,init)=>{
  if(init.method==='PUT'){puts++;submitted=JSON.parse(init.body);}
  return new Response(JSON.stringify(url.endsWith('/result')?{ok:true}:{state:'succeeded'}));
 }});
 assert.equal((await client.request({url:'https://infistar.cc/v1beta/models/gemini-nano-banana-2.1:generateContent',body,key:'fixture'})).ok,true);
 assert.equal(puts,1);assert.equal(submitted.url,'https://infistar.cc/v1beta/models/gemini-nano-banana-2.1:generateContent');
 assert.equal(submitted.routePolicy,'preserve-initial-host');
 assert.deepEqual(submitted.body,original);assert.deepEqual(body,original);
});

test('unknown gateway failure after lost acknowledgement only reads the same ID',async()=>{
 let puts=0,reads=0,id;
 const client=createInternationalInitialImageJobClient({wait:async()=>{},fetchImpl:async(url,init)=>{
  if(init.method==='PUT'){puts++;id=url;throw Error('ack lost');}
  assert.equal(url,id);reads++;
  if(reads===1)return Response.json({},{status:503});
  return Response.json({state:'unknown',error:'UPSTREAM_HTTP_500_NO_RESUBMIT',diagnostic:{upstreamStatus:500,providerErrorType:'bad_response_body',providerErrorCode:'gateway_error'}});
 }});
 await assert.rejects(client.request({url:'https://infistar.cc/v1/images/generations',body:{model:'fixture',prompt:'fixture'},key:'fixture-key'}),e=>e.code==='JOB_RESULT_UNKNOWN'&&e.message.includes('bad_response_body')&&e.message.includes('gateway_error')&&e.message.includes('不会自动重新提交'));
 assert.equal(puts,1);assert.equal(reads,2);
});

test('revision and other providers do not acquire the initial-only route policy',async()=>{
 for(const [factory,url] of [[createInitialImageJobClient,'https://infistar.cc/v1/images/generations'],[createInternationalInitialImageJobClient,'https://api.openai.com/v1/images/generations']]){
  let submission;
  const client=factory({fetchImpl:async(url,init)=>{if(init.method==='PUT')submission=JSON.parse(init.body);return Response.json(url.endsWith('/result')?{ok:true}:{state:'succeeded'});}});
  await client.request({url,body:{model:'fixture',prompt:'fixture'},key:'fixture'});
  assert.equal(submission.routePolicy,undefined);assert.equal(submission.url,url);
 }
});
