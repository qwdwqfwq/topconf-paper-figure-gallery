import {test} from 'node:test';
import assert from 'node:assert/strict';
import {protocolFetch} from './step3-image-protocol.mjs';
import {uploadStep3References} from './step3-reference-upload.mjs';
const endpoint='https://api.nonelinear.com.cn/v1/images/generations';
const reference='data:image/png;base64,aGVsbG8=';
const init={method:'POST',headers:{Authorization:'Bearer fixture-key','Content-Type':'application/json'}};

test('direct NoneLinear uploads local references before one synchronous 4K generation, preserving order and auth',async()=>{
 const calls=[],signal=new AbortController().signal;
 const body={model:'gemini-3.1-flash-image-preview',prompt:'fixture',size:'4K',aspect_ratio:'16:9',image:[reference,'https://images.example.com/public.png',reference],stream:true};
 await protocolFetch(async(url,options)=>{
  calls.push({url,...options,body:JSON.parse(options.body)});
  return Response.json(url===endpoint?{data:[{url:'https://images.example.com/result.png'}]}:{url:'https://images.example.com/upload-'+calls.length+'.png'});
 })(endpoint,{...init,signal,body:JSON.stringify(body)});
 assert.deepEqual(calls.map(c=>c.url),['https://nonelinear.com.cn/api/upload-file','https://nonelinear.com.cn/api/upload-file',endpoint]);
 assert.deepEqual(calls[0].body,{image:'aGVsbG8=',type:'.png'});
 for(const c of calls){assert.equal(new Headers(c.headers).get('Authorization'),'Bearer fixture-key');assert.equal(c.signal,signal);assert.equal(c.method,'POST');}
 assert.equal(calls[0].redirect,'manual');
 const parameters=body;
 assert.deepEqual(calls[2].body,{...parameters,image:['https://images.example.com/upload-1.png','https://images.example.com/public.png','https://images.example.com/upload-2.png']});
});

test('invalid references, failed uploads and cancellation never submit generation or leak upstream details',async()=>{
 for(const image of [[reference,'http://images.example.com/x.png'],['file:///private.png'],['data:image/png;base64,invalid'],['https://127.0.0.1/a.png']]){
  let calls=0;await assert.rejects(uploadStep3References({image},init,async()=>{calls++;}),/尚未提交生成请求/);assert.equal(calls,0);
 }
 for(const response of [()=>new Response('fixture-key',{status:401}),()=>Response.json({url:'http://images.example.com/private.png'}),()=>Response.json({})]){
  let calls=0;await assert.rejects(protocolFetch(async(url)=>{calls++;assert.notEqual(url,endpoint);return response();})(endpoint,{...init,body:JSON.stringify({image:[reference]})}),e=>/尚未提交生成请求/.test(e.message)&&!e.message.includes('fixture-key'));assert.equal(calls,1);
 }
 const controller=new AbortController();controller.abort();let calls=0;
 await assert.rejects(uploadStep3References({image:[reference]},{...init,signal:controller.signal},async()=>{calls++;}),{name:'AbortError'});assert.equal(calls,0);
});

test('public references and the existing relay are not uploaded again; generation failures are never retried',async()=>{
 for(const [url,image]of [[endpoint,['https://images.example.com/a.png']],['https://gallery-nonelinear-relay.lixiao-gallery.workers.dev/v1/images/generations',[reference]]]){
  let calls=0;const response=await protocolFetch(async(target,options)=>{calls++;assert.equal(target,url);assert.deepEqual(JSON.parse(options.body).image,image);return new Response('rejected',{status:422});})(url,{...init,body:JSON.stringify({model:'gemini-3.1-flash-image-preview',image})});
  assert.equal(response.status,422);assert.equal(calls,1);
 }
 let calls=0;await assert.rejects(protocolFetch(async()=>{calls++;throw Error('disconnected');})(endpoint,{...init,body:JSON.stringify({model:'gemini-3.1-flash-image-preview'})}),/disconnected/);assert.equal(calls,1);
});
