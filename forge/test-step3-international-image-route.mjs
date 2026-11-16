import {test} from 'node:test';
import assert from 'node:assert/strict';
import {internationalGalleryBase,internationalInitialImageUrl} from './step3-international-image-route.mjs';
import {createInternationalInitialImageJobClient} from './step3-initial-image-job.mjs';

test('authorized stages use international entrance for GPT, Claude, Gemini and Banana',()=>{
 for(const model of ['gpt-6.1-sol','gpt-image-2.5-sunburst','claude-opus-4','gemini-3.1-flash-image','gemini-nano-banana-2.1','banana-2.1','nano-banana-2.1']){
  for(const stage of ['parse','visual','generate','revision'])assert.equal(internationalGalleryBase('https://infistar.cc/v1',{provider:'infistar',model,stage}),'https://infistar.ai/v1');
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
 for(const suffix of [':generateContent',':streamGenerateContent?alt=sse'])assert.equal(internationalInitialImageUrl('https://infistar.cc/v1beta/models/gemini-nano-banana-2.1'+suffix,{}),'https://infistar.ai/v1beta/models/gemini-nano-banana-2.1'+suffix);
 const body={model:'gpt-image-2.5-sunburst',size:'2048x1152'};
 assert.equal(internationalInitialImageUrl('https://infistar.cc/v1/images/generations',body),'https://infistar.ai/v1/images/generations');
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
 assert.equal(puts,1);assert.equal(submitted.url,'https://infistar.ai/v1beta/models/gemini-nano-banana-2.1:generateContent');
 assert.deepEqual(submitted.body,original);assert.deepEqual(body,original);
});
