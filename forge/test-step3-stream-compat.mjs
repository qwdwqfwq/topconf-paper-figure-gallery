import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestStep3ImageStream,step3OrdinaryRequest} from './step3-image-stream.mjs';
import {explicitlyRejectsImageStreaming,imageCompatibilityIdentity} from './step3-image-compat.mjs';
const url='https://gateway.example/v1/images/generations',body={model:'brand-new-model',prompt:'fixture'},key='offline-key';
const store=()=>{const map=new Map();return {get:async id=>map.get(id),set:async(id,value)=>map.set(id,{...value})};};
const image=()=>new Response(JSON.stringify({data:[{b64_json:'fixture'}]}),{headers:{'Content-Type':'application/json'}});
const rejected=()=>new Response(JSON.stringify({error:{message:'stream is not supported'}}),{status:400});
test('new model starts streamed; only explicit rejection opens one ordinary attempt; cache survives next request',async()=>{
 const compatibilityStore=store(),calls=[];const fetchImpl=async(u,init)=>{calls.push(JSON.parse(init.body));return calls.length===1?rejected():image();};
 const options={url,body,key,compatibilityStore,fetchImpl};
 const first=await requestStep3ImageStream(options);assert.deepEqual(calls.map(x=>x.stream),[true,undefined]);assert.equal(first.compatibility.attempts,2);
 const second=await requestStep3ImageStream(options);assert.equal(calls.length,3);assert.equal(calls[2].stream,undefined);assert.equal(second.compatibility.cached,true);
});
test('supply 404, generic 405, malformed errors and accepted task markers never permit fallback',async()=>{
 for(const [status,text]of [[404,JSON.stringify({error:{message:'暂时供应不足，请稍后重试'}})],[405,'Method not allowed'],[422,JSON.stringify({id:'accepted',error:{message:'stream unsupported'}})],[400,JSON.stringify({error:{message:'parameter invalid'}})]]){
  let calls=0;await requestStep3ImageStream({url,body,key,compatibilityStore:store(),fetchImpl:async()=>{calls++;return new Response(text,{status});}});assert.equal(calls,1);
 }
 assert.equal(explicitlyRejectsImageStreaming({ok:false,status:422,text:JSON.stringify({error:{message:'当前分组暂不支持此接口（/v1beta/models/{model}:streamGenerateContent）'}})}),true);
});
test('disconnect, timeout, incomplete stream and 5xx stop; later explicit requests are fresh',async()=>{
 const failures=[async()=>{throw Error('disconnected');},async()=>new Promise(()=>{}),async()=>new Response('data: {"type":"image_generation.partial_image","b64_json":"partial"}\n\n',{headers:{'Content-Type':'text/event-stream'}}),async()=>new Response('gateway',{status:502})];
 for(const failure of failures){let calls=0;const options={url,body,key,compatibilityStore:store(),timeoutMs:30,fetchImpl:async()=>{calls++;return failure();}};
  try{await requestStep3ImageStream(options);}catch{}
  assert.equal(calls,1);
  const result=await requestStep3ImageStream({...options,fetchImpl:async()=>{calls++;return image();}});assert.equal(result.ok,true);assert.equal(calls,2);
 }
});
test('compatibility scope isolates endpoint, credential and future model',async()=>{
 const ids=await Promise.all([[url,body,key],[url,{...body,model:'newer'},key],[url,body,'other-key'],['https://other.example/v1/images/generations',body,key]].map(args=>imageCompatibilityIdentity(...args)));assert.equal(new Set(ids).size,4);
 const native='https://gateway.example/v1beta/models/banana:streamGenerateContent?alt=sse';const ordinary=step3OrdinaryRequest(native,{contents:[],stream:true});assert.equal(ordinary.url,'https://gateway.example/v1beta/models/banana:generateContent');assert.equal(ordinary.body.stream,undefined);
 assert.equal(await imageCompatibilityIdentity(native,{},key),await imageCompatibilityIdentity(ordinary.url,{},key));
});
test('fallback disconnect stops immediately while retaining ordinary compatibility',async()=>{
 let calls=0;const options={url,body,key,compatibilityStore:store(),fetchImpl:async()=>{if(++calls===1)return rejected();throw Error('lost ordinary reply');}};
 await assert.rejects(requestStep3ImageStream(options));assert.equal(calls,2);
 const result=await requestStep3ImageStream({...options,fetchImpl:async(u,i)=>{calls++;assert.equal(Object.hasOwn(JSON.parse(i.body),'stream'),false);return image();}});assert.equal(result.ok,true);assert.equal(calls,3);
});
