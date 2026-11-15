import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {step3ImageResolutions} from './step3-image-capabilities.mjs';
import {parseOfficialCatalog,isOfficialGeminiImageModel} from './step3-official-catalog.mjs';

test('documented restrictions and unrestricted defaults do not depend on audit or serializer coverage',()=>{
 for(const provider of ['infistar','nonelinear'])for(const ratio of ['16:9','3:2','4:3','1:1']){
  for(const model of ['gpt-image-2.6-flare','gemini-3.1-flash-image','gemini-3-pro-image','gemini-nano-banana-2.1','future-image-2027'])
   assert.deepEqual(step3ImageResolutions(provider,model,ratio),['1K','2K','4K'],provider+'/'+model+'/'+ratio);
  for(const model of ['gemini-3.1-flash-lite-image','gemini-3.1-flash-lite-image-preview','gemini-2.5-flash-image'])
   assert.deepEqual(step3ImageResolutions(provider,model,ratio),['1K']);
  assert.deepEqual(step3ImageResolutions(provider,'doubao-seedream-4-5',ratio),['2K','4K']);
  assert.deepEqual(step3ImageResolutions(provider,'seedream-5-0-lite',ratio),['2K','4K']);
 }
 assert.deepEqual(step3ImageResolutions('oai','gpt-image-1','3:2'),['1K']);
 assert.deepEqual(step3ImageResolutions('oai','gpt-image-1','16:9'),[]);
 assert.deepEqual(step3ImageResolutions('infistar','','16:9'),[]);
 assert.deepEqual(step3ImageResolutions('infistar','future-image','invalid'),[]);
});

test('official token-billed Gemini image models remain image models, including future native variants',()=>{
 const images=['gemini-nano-banana-2.1','gemini-3.1-flash-image','gemini-3.1-flash-lite-image','gemini-3-pro-image','gemini-4-flash-image-preview'];
 const chats=['gemini-3.1-pro-preview','gemini-4-carbon','claude-opus-5.5'];
 const result=parseOfficialCatalog(`<script id="public-site-pricing-data" type="application/json">${JSON.stringify({success:true,data:[...images,...chats].map(model_name=>({model_name,supported_endpoint_types:['gemini','openai'],price_presentation:{kind:'text'}}))})}</script>`);
 for(const model of images){assert.equal(result.kinds[model],'image');assert.equal(isOfficialGeminiImageModel(model),true);}
 for(const model of chats){assert.equal(result.kinds[model],'chat');assert.equal(isOfficialGeminiImageModel(model),false);}
});

test('request dimension serialization and pixel acceptance functions retain their exact source',()=>{
 const file='forge/step3-image-capabilities.mjs';
 const original=execFileSync('git',['show','a395d4de477b4daebf0413096fb67d73f7c13c5d:'+file],{encoding:'utf8'}).replace(/\r\n/g,'\n');
 const current=readFileSync(new URL('./step3-image-capabilities.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n');
 const marker='export function step3ImageDimensions';
 assert.equal(current.slice(current.indexOf(marker)),original.slice(original.indexOf(marker)));
});
