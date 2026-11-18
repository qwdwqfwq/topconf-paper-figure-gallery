import {test} from 'node:test';
import assert from 'node:assert/strict';

// Exercise the actual revision entry, including provider-specific reference upload.
test('Infistar revisions use direct calls while Nonelinear recovers backend reads without another submission',async()=>{
 const original=globalThis.fetch, calls=[], jobs=new Map();
 const source='data:image/png;base64,'+Buffer.from('source').toString('base64');
 const output=Buffer.from('changed-image').toString('base64');
 globalThis.fetch=async(url,init={})=>{
  calls.push({url:String(url),method:init.method||'GET'});
  if(String(url).includes('/api/upload-file'))return Response.json({url:'https://fixture.example/reference.png'});
  if(String(url).startsWith('https://infistar.ai/')){const body=JSON.parse(init.body);assert.equal(body.generationConfig.imageConfig.aspectRatio,'16:9');assert.equal(body.generationConfig.imageConfig.imageSize,'4K');return Response.json({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:output}}]}}]});}
  const id=String(url).match(/jobs\/([^/]+)/)?.[1];assert.ok(id,'durable job endpoint');
  if(init.method==='PUT'){
   assert.equal(jobs.has(id),false);jobs.set(id,{input:JSON.parse(init.body),status:0,result:0});
   return Response.json({state:'queued'});
  }
  const job=jobs.get(id);assert.ok(job);
  if(String(url).endsWith('/result')){
   if(job.result++===0)return new Response('temporary',{status:503});
   return Response.json({ok:true,status:200,text:JSON.stringify({data:[{b64_json:output}]}),requestId:'fixture-'+id});
  }
  if(job.status++===0)throw Error('lost polling response');
  return Response.json({state:'succeeded'});
 };
 try{
  const {generateRevision}=await import('./revision-gallery.mjs?recovery-integration-test');
  const results=await Promise.all([
   ['infistar','https://infistar.ai/v1'],['nonelinear','https://gallery-nonelinear-relay.lixiao-gallery.workers.dev/v1']
  ].map(([p,base])=>generateRevision({image:source,freeRevision:true,manualScope:false,route:{p,base,model:'gemini-nano-banana-2.1',ratio:'16:9',resolution:'4K'}},'Change label',{key:'fixture-key',revisionTaskStore:{write:async()=>{}},toDataURL:async x=>x,loadImage:async x=>({naturalWidth:x===source?100:200,naturalHeight:100})})));
  assert.equal(jobs.size,1);assert.equal(calls.filter(c=>c.method==='PUT').length,1);assert.equal(calls.filter(c=>c.url.startsWith('https://infistar.ai/')).length,1);
  assert.equal(calls.filter(c=>c.url.includes('/api/upload-file')).length,1);
  for(const result of results){assert.equal(result.revisionAudit.apiRequestCount,1);assert.equal(result.revisionAudit.pixelCheck,'changed');assert.match(result.image,/^data:image/);}
  assert.equal(results[1].revisionAudit.job.recovered,true);
  for(const job of jobs.values()){
   assert.equal(job.status,2);assert.equal(job.result,2);
   if(job.input.url.includes('infistar.ai'))assert.match(job.input.url,/models\/gemini-nano-banana-2\.1:/);
   else {assert.equal(job.input.body.model,'gemini-nano-banana-2.1');assert.equal(job.input.body.size,'4K');assert.equal(job.input.body.aspect_ratio,'16:9');assert.match(job.input.url,/gallery-nonelinear-relay/);}
  }
 }finally{globalThis.fetch=original;}
});
