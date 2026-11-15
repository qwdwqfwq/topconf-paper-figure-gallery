import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestStep3ImageStream} from './step3-image-stream.mjs';
import {requiresOrdinaryStep3Image,imageCompatibilityIdentity} from './step3-image-compat.mjs';
const body={model:'future-nonelinear-image',prompt:'fixture',stream:true,size:'4K',image:['https://images.example/ref.png']},key='offline';
const store=()=>{const m=new Map();return {get:async id=>m.get(id),set:async(id,v)=>m.set(id,v)};};
const hosts=['api.nonelinear.com.cn','gallery-nonelinear-relay.lixiao-gallery.workers.dev','gallery-revision-images.lixiao-gallery.workers.dev'];
test('NoneLinear endpoint policy overrides stale streaming capability for existing and future models',async()=>{
 for(const host of hosts)for(const endpoint of ['generations','edits']){
  const url=`https://${host}/v1/images/${endpoint}`,compatibilityStore=store();
  await compatibilityStore.set(await imageCompatibilityIdentity(url,body,key),{mode:'stream',uncertain:false});
  const calls=[];const options={url,body,key,compatibilityStore,fetchImpl:async(u,i)=>{calls.push(JSON.parse(i.body));return Response.json({data:[{b64_json:'image'}]});}};
  for(let n=0;n<2;n++){const result=await requestStep3ImageStream(options);assert.equal(result.compatibility.mode,'ordinary');assert.equal(result.compatibility.attempts,1);}
  assert.equal(calls.length,2);for(const wire of calls){assert.equal(Object.hasOwn(wire,'stream'),false);assert.deepEqual(wire,{model:body.model,prompt:body.prompt,size:body.size,image:body.image});}
  assert.equal(body.stream,true);
 }
});
test('exception cannot spread to unknown gateways, lookalike hosts or other APIs',()=>{
 for(const url of ['https://api.nonelinear.com.cn.example/v1/images/generations','https://other.example/v1/images/generations','https://api.nonelinear.com.cn/v1/chat/completions','https://api.nonelinear.com.cn:444/v1/images/generations','https://user@api.nonelinear.com.cn/v1/images/generations','http://example.com/api/nonelinear/v1/images/generations','http://localhost:1234/v1/images/generations'])assert.equal(requiresOrdinaryStep3Image(url),false,url);
 for(const host of ['localhost','127.0.0.1','[::1]'])assert.equal(requiresOrdinaryStep3Image(`http://${host}:1234/api/nonelinear/v1/images/generations`),true);
});
test('ordinary NoneLinear disconnect/timeout stops immediately; a later explicit request is allowed',async()=>{
 for(const failure of [async()=>{throw Error('connection lost');},async()=>new Promise(()=>{}),async()=>new Response('gateway timeout',{status:504})]){
  let calls=0;const options={url:'https://api.nonelinear.com.cn/v1/images/generations',body,key,compatibilityStore:store(),timeoutMs:20,fetchImpl:async(u,i)=>{calls++;assert.equal(Object.hasOwn(JSON.parse(i.body),'stream'),false);return failure();}};
  try{await requestStep3ImageStream(options);}catch{}
  assert.equal(calls,1);
  assert.equal((await requestStep3ImageStream({...options,fetchImpl:async(u,i)=>{calls++;assert.equal(Object.hasOwn(JSON.parse(i.body),'stream'),false);return Response.json({data:[{b64_json:'image'}]});}})).ok,true);assert.equal(calls,2);
 }
});
test('legacy uncertain records no longer block NoneLinear requests',async()=>{
 const url='https://api.nonelinear.com.cn/v1/images/generations',compatibilityStore=store();
 await compatibilityStore.set(await imageCompatibilityIdentity(url,body,key),{mode:'stream',uncertain:true,requestId:'original'});
 let calls=0;await requestStep3ImageStream({url,body,key,compatibilityStore,fetchImpl:async(u,i)=>{calls++;assert.equal(Object.hasOwn(JSON.parse(i.body),'stream'),false);return Response.json({data:[{b64_json:'image'}]});}});assert.equal(calls,1);
});


test('real durable worker: lost acknowledgement reports an error after one ordinary POST',async()=>{
 const {createInfistarJobClient}=await import('./step3-infistar-job.mjs');
 const {ImageJob}=await import('../infistar-image-relay/worker.mjs');
 const objects=new Map(),ids=new Set();let puts=0,results=0,posts=0;
 const env={ALLOWED_ORIGINS:'https://qwdwqfwq.github.io',JOB_ENCRYPTION_KEY:btoa('01234567890123456789012345678901')};
 function object(id){
  if(!objects.has(id)){
   const map=new Map(),storage={async get(k){return structuredClone(map.get(k));},async put(k,v){map.set(k,structuredClone(v));},async delete(k){for(const x of Array.isArray(k)?k:[k])map.delete(x);},async list({prefix,limit}){return new Map([...map].filter(([k])=>k.startsWith(prefix)).slice(0,limit));},async setAlarm(){},async deleteAlarm(){},async transaction(fn){return fn(this);}};
   let lock=Promise.resolve();objects.set(id,new ImageJob({storage,blockConcurrencyWhile(fn){const p=lock.then(fn);lock=p.catch(()=>{});return p;}},env));
  }
  return objects.get(id);
 }
 env.IMAGE_JOBS={idFromName:id=>id,get:object};
 const original=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{
  posts++;assert.equal(url,'https://api.nonelinear.com.cn/v1/images/generations');
  assert.equal(Object.hasOwn(JSON.parse(init.body),'stream'),false);
  return Response.json({data:[{b64_json:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII='}]});
 };
 try{
  const client=createInfistarJobClient({wait:async()=>{},pollMs:1,deadlineMs:5000,fetchImpl:async(url,init)=>{
   assert.notEqual(init.method,'POST');const id=url.match(/jobs\/([^/]+)/)[1];ids.add(id);
   const job=object(id),request=new Request(url,{...init,headers:{...init.headers,Origin:env.ALLOWED_ORIGINS}});
   if(init.method==='PUT'){
    const response=await job.fetch(request);if(++puts===1){await job.alarm();throw Error('lost acknowledgement');}return response;
   }
   if(url.endsWith('/result')&&++results===1)throw Error('lost result connection');
   return job.fetch(request);
  }});
  await assert.rejects(client.request({url:'https://api.nonelinear.com.cn/v1/images/generations',body,key,usedReferences:true}),{code:'JOB_CONNECTION'});
  assert.equal(ids.size,1);assert.equal(puts,1);assert.equal(results,0);assert.equal(posts,1);
 }finally{globalThis.fetch=original;}
});
