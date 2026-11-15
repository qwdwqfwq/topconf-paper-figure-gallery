import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requiresOrdinaryStep3Image} from './step3-image-compat.mjs';
import {requestStep3ImageStream,step3StreamingRequest} from './step3-image-stream.mjs';
const hosts=['infistar.cc','www.infistar.cc','infistar.ai','www.infistar.ai'];
const endpoint=host=>'https://'+host+'/v1beta/models/gemini-nano-banana-2.1:generateContent';
const body={contents:[{role:'user',parts:[{text:'Preserve the submitted prompt exactly'},...Array.from({length:3},(_,i)=>({inlineData:{mimeType:'image/png',data:btoa('reference '+i)}}))]}],generationConfig:{responseModalities:['TEXT','IMAGE'],imageConfig:{aspectRatio:'16:9',imageSize:'4K'}}};
const store=mode=>({get:async()=>({version:1,mode}),set:async()=>{}});

test('Nano Banana 2.1 always starts ordinary across Infistar gateways, including stale streaming cache',async()=>{
 for(const host of hosts)for(const cached of ['stream','ordinary'])for(const streamUrl of [false,true]){
  const url=streamUrl?endpoint(host).replace(':generateContent',':streamGenerateContent')+'?alt=sse':endpoint(host);
  const direct=step3StreamingRequest(url,body);assert.equal(direct.url,endpoint(host));assert.deepEqual(direct.body,body);
  const calls=[],attempts=[];
  const result=await requestStep3ImageStream({url,body,key:'offline-key',compatibilityStore:store(cached),beforeAttempt:async a=>attempts.push(a),fetchImpl:async(u,init)=>{
   calls.push(u);assert.equal(init.method,'POST');assert.deepEqual(JSON.parse(init.body),body);
   return Response.json({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:'fixture'}}]},finishReason:'STOP'}]});
  }});
  assert.equal(result.ok,true);assert.deepEqual(calls,[endpoint(host)]);assert.deepEqual(attempts,[{mode:'ordinary',attempt:1}]);assert.equal(result.compatibility.mode,'ordinary');
 }
});

test('Nano Banana errors, incomplete responses and disconnects never trigger another generation',async()=>{
 for(const reply of [()=>Response.json({error:{message:'当前模型不支持 OpenAI 聊天调用，请使用 Gemini 原生出图接口'}},{status:422}),()=>Response.json({error:{message:'stream unsupported'}},{status:422}),()=>new Response('gateway',{status:502}),()=>Response.json({id:'accepted'}),()=>{throw Error('disconnected');}]){
  let calls=0;
  try{await requestStep3ImageStream({url:endpoint('infistar.cc'),body,key:'offline-key',compatibilityStore:store('stream'),fetchImpl:async()=>{calls++;return reply();}});}catch(error){assert.match(error.message,/disconnected|complete|Invalid/i);}
  assert.equal(calls,1);
 }
});

test('ordinary exception does not spread to other models, routes, protocols or lookalike hosts',()=>{
 for(const url of [endpoint('infistar.cc.evil.test'),endpoint('evil.test'),endpoint('infistar.cc').replace('https:','http:'),endpoint('infistar.cc').replace('infistar.cc','infistar.cc:444'),endpoint('infistar.cc').replace('infistar.cc','user:pass@infistar.cc'),endpoint('infistar.cc').replace('2.1:','2.2:'),endpoint('infistar.cc').replace('gemini-nano-banana-2.1','gemini-3.1-flash-image'),'https://infistar.cc/v1/chat/completions','https://infistar.cc/v1/images/generations'])assert.equal(requiresOrdinaryStep3Image(url),false,url);
 const other=step3StreamingRequest(endpoint('infistar.cc').replace('gemini-nano-banana-2.1','gemini-3.1-flash-image'),body);
 assert.match(other.url,/:streamGenerateContent\?alt=sse$/);assert.deepEqual(other.body,body);
});
