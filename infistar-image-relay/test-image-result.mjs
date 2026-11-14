import {test} from 'node:test';
import assert from 'node:assert/strict';
import {preserveImageResult} from './image-result.mjs';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=';
const raw=data=>({ok:true,status:200,text:JSON.stringify(data),requestId:'fixture-id'});
test('temporary URL is copied durably; failed download can be retried without generating',async()=>{
 const original=raw({data:[{url:'https://images.example.com/result'}]});let downloads=0;
 const failed=await preserveImageResult(original,async(url,init)=>{downloads++;assert.equal(init.headers,undefined);throw Error('disconnected');});
 assert.equal(failed.text,original.text);assert.equal(failed.downloadError,'disconnected');
 const saved=await preserveImageResult(failed,async()=>{downloads++;return new Response(Buffer.from(png,'base64'));});
 assert.equal(downloads,2);assert.equal(saved.downloadError,undefined);assert.equal(saved.requestId,'fixture-id');
 assert.deepEqual(JSON.parse(saved.text),{data:[{b64_json:png,mimeType:'image/png'}]});
});
test('invalid image and no-image responses retain provider evidence and report post-response errors',async()=>{
 for(const [data,error]of [[{data:[]},'NO_IMAGE'],[{data:[{b64_json:'broken'}]},'INVALID_IMAGE'],[{candidates:[{finishReason:'IMAGE_SAFETY'}]},'NO_IMAGE']]){
  const original=raw(data),result=await preserveImageResult(original);assert.equal(result.ok,false);assert.equal(result.resultError,error);assert.equal(result.text,original.text);
 }
 const invalid={ok:true,status:200,text:'not json'};assert.equal((await preserveImageResult(invalid)).resultError,'INVALID_JSON');
 const rejected={ok:false,status:402,text:'insufficient balance'};assert.deepEqual(await preserveImageResult(rejected),rejected);
});
test('actual JPEG/WebP MIME wins over advertised MIME; native Gemini ignores thought images',async()=>{
 for(const [b64,mime]of [[png,'image/png'],['/9j/AAAA','image/jpeg'],[Buffer.from('RIFF0000WEBP0000').toString('base64'),'image/webp']]){
  const result=await preserveImageResult(raw({candidates:[{content:{parts:[{thought:true,inlineData:{data:'broken'}},{inline_data:{data:b64,mime_type:'image/wrong'}}]}}]}));
  assert.equal(result.ok,true);assert.equal(JSON.parse(result.text).data[0].mimeType,mime);
 }
});
test('unsafe image URLs and unsafe redirects are never fetched',async()=>{
 for(const url of ['http://images.example.com/a','https://127.0.0.1/a','https://localhost/a','https://a.internal/a','https://user:pass@images.example.com/a']){
  const result=await preserveImageResult(raw({data:[{url}]}),()=>{throw Error('must not fetch');});assert.equal(result.downloadError,'UNSAFE_IMAGE_URL');
 }
 let calls=0;const result=await preserveImageResult(raw({data:[{url:'https://images.example.com/a'}]}),async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://127.0.0.1/private'}});});
 assert.equal(calls,1);assert.equal(result.downloadError,'UNSAFE_IMAGE_URL');
});
