import {test} from 'node:test';
import assert from 'node:assert/strict';
import {packImageBody,unpackImageBody,prepareStep3ImageBody,protocolFetch,imageResultItem,imageJobRoute} from './step3-image-protocol.mjs';
import {compatibleImageRequest,geminiImageRequest} from './image-api.mjs';
import {step3ImageDimensions,step3ImageResolutions,step3NativePixelsMatch} from './step3-image-capabilities.mjs';
import {requestStep3ImageStream} from './step3-image-stream.mjs';
test('provider wire formats preserve references and only supported streaming flags',async()=>{
 const ref='data:image/png;base64,iVBORw0KGgo=';
 for(const [p,base]of [['oai','https://api.openai.com/v1'],['infistar','https://infistar.cc/v1'],['nonelinear','https://gallery-nonelinear-relay.lixiao-gallery.workers.dev/v1']]){
  const request=compatibleImageRequest({model:'gpt-image-2.5-sunburst',prompt:'fixture',image:[ref],size:'2048x1152'},base,p);
  const body=unpackImageBody(await packImageBody(request.body));let wire;
  await requestStep3ImageStream({url:base+request.endpoint,body,key:'fixture',usedReferences:true,fetchImpl:protocolFetch(async(url,init)=>{wire={url,...init};return new Response('{"data":[{"b64_json":"fixture"}]}',{headers:{'content-type':'application/json'}});})});
  if(p==='oai'){assert.ok(wire.body instanceof FormData);assert.match(wire.url,/images\/edits$/);assert.equal(wire.body.getAll('image[]').length,1);assert.equal(await wire.body.get('image[]').text(),'\x89PNG\r\n\x1a\n'.replace('\x89','�'));}
  else {const json=JSON.parse(wire.body);assert.deepEqual(json.image,[ref]);assert.match(wire.url,/images\/generations$/);assert.equal(json.stream,true);}
 }
});
test('Gemini native and compatibility formats, no generic stream flag, Imagen n=1',async()=>{
 for(const model of ['gemini-2.5-flash-image','gemini-3-pro-image-preview','gemini-3.1-flash-image','gemini-3.1-flash-lite-image']){
  const dimensions=step3ImageDimensions('infistar',model,'16:9','1K',true);
  const request=geminiImageRequest('https://infistar.cc/v1',model,'fixture',[],dimensions);
  prepareStep3ImageBody(request.body,model,true);let wire;
  await requestStep3ImageStream({url:request.base+request.endpoint,body:request.body,key:'fixture',fetchImpl:protocolFetch(async(url,init)=>{wire={url,body:JSON.parse(init.body)};return new Response('{"data":[{"url":"https://images.example.com/a.png"}]}',{headers:{'content-type':'application/json'}});})});
  assert.match(wire.url,/:streamGenerateContent\?alt=sse$/);assert.equal(wire.body.generationConfig.imageConfig.imageSize,model.includes('2.5')?undefined:'1K');
 }
 assert.deepEqual(step3ImageDimensions('nonelinear','gemini-2.5-flash-image','4:3','1K'),{field:'aspect_ratio',value:'4:3'});
 assert.deepEqual(prepareStep3ImageBody({model:'gpt-image-2',aspect_ratio:'16:9'},'gpt-image-2'),{model:'gpt-image-2'});
 assert.equal(prepareStep3ImageBody({model:'imagen-4.0-generate-001'},'imagen-4.0-generate-001').n,1);
 let body;await protocolFetch(async(_u,i)=>{body=JSON.parse(i.body);})('https://infistar.cc/v1/images/generations',{body:JSON.stringify({model:'doubao-seedream-4.0',stream:true})});assert.equal(body.stream,true);
});
test('capabilities preserve catalog policy, isolate provider pixel conventions and allow discrete Gemini native sizes',()=>{
 for(const p of ['oai','infistar','nonelinear'])for(const ratio of ['16:9','4:3','3:2','1:1']){
  assert.deepEqual(step3ImageResolutions(p,'gemini-2.5-flash-image',ratio),['1K']);
  assert.deepEqual(step3ImageResolutions(p,'gemini-3.1-flash-lite-image',ratio),['1K']);
  assert.deepEqual(step3ImageResolutions(p,'gpt-image-2.5-sunburst',ratio),['1K','2K','4K']);
  assert.deepEqual(step3ImageResolutions(p,'unverified-new-image-model',ratio),['1K','2K','4K']);
 }
 assert.equal(step3ImageDimensions('oai','gpt-image-2.5-sunburst','1:1','1K').value,'1024x1024');
 assert.equal(step3ImageDimensions('infistar','gpt-image-2.5-sunburst','1:1','1K').value,'1152x1152');
 assert.equal(step3NativePixelsMatch('gemini-2.5-flash-image','4:3',1184,864),true);
 assert.equal(step3NativePixelsMatch('gemini-3.1-flash-image','4:3',1184,864),false);
 assert.equal(imageResultItem({candidates:[{content:{parts:[{thought:true,inlineData:{data:'discard'}},{inline_data:{data:'keep',mime_type:'image/webp'}}]}}]}).mimeType,'image/webp');
 for(const url of ['https://api.openai.com.evil.test/v1/images/generations','https://api.openai.com:8443/v1/images/generations','https://infistar.cc/v1beta/models/x:generateContent?key=secret'])assert.equal(imageJobRoute(url),null);
});
