import assert from 'node:assert/strict';
import {usesInfistarGemini,geminiImageRequest,geminiImageResult} from './image-api.mjs';
import {figureCanvas,imageRequestDimensions,verifyImageRatio,verifyImageResolution} from './aspect-ratio.mjs';
import {infistarAuditStatus} from './infistar-audit.mjs';
for(const [ratio,height] of [['16:9',900],['3:2',1067],['4:3',1200],['1:1',1600]]){
  assert.equal(figureCanvas(ratio).height,height);
  assert.equal(verifyImageRatio(1600,height,ratio),true);
}
assert.deepEqual(imageRequestDimensions('ark','doubao-seedream-5-0','16:9','2K'),{field:'size',value:'2848x1600'});
assert.deepEqual(imageRequestDimensions('ark','doubao-seedream-5-0','3:2','2K'),{field:'size',value:'2496x1664'});
assert.deepEqual(imageRequestDimensions('ark','doubao-seedream-5-0','4:3','2K'),{field:'size',value:'2304x1728'});
assert.deepEqual(imageRequestDimensions('ark','doubao-seedream-5-0','1:1','2K'),{field:'size',value:'2048x2048'});
assert.deepEqual(imageRequestDimensions('ark','doubao-seedream-5-0-lite','16:9','4K'),{field:'size',value:'4096x2304'});
for(const [model,resolution,sizes] of [
  ['gpt-image-2.5-sunburst','1K',{'4:3':'1280x960','1:1':'1152x1152'}],
  ['gpt-image-2.5-flare','1K',{'4:3':'1280x960','1:1':'1152x1152'}],
  ['doubao-seedream-5-0-260128','2K',{'16:9':'2848x1600','3:2':'2496x1664','4:3':'2304x1728','1:1':'2048x2048'}],
  ['doubao-seedream-4-0-250828','1K',{'16:9':'1280x720','3:2':'1248x832','4:3':'1152x864','1:1':'1024x1024'}]
]){
  for(const [ratio,value] of Object.entries(sizes)){
    assert.deepEqual(imageRequestDimensions('infistar',model,ratio,resolution),{field:'size',value});
    assert.equal(infistarAuditStatus(model,ratio,resolution),'verified');
  }
}
assert.equal(infistarAuditStatus('doubao-seedream-5-0-260128','1:1','1K'),'rejected');
assert.deepEqual(imageRequestDimensions('infistar','gemini-3.1-flash-image','4:3','4K',true),{field:'gemini',aspectRatio:'4:3',imageSize:'4K'});
assert.throws(()=>imageRequestDimensions('ark','doubao-seedream-5-0','16:9','4K'),/no verified/);
assert.throws(()=>imageRequestDimensions('oai','gpt-image-1','1:1','2K'),/no verified/);
assert.throws(()=>imageRequestDimensions('oai','dall-e-3','3:2','1K'),/no verified/);
assert.deepEqual(imageRequestDimensions('oai','gpt-image-1','1:1','1K'),{field:'size',value:'1024x1024'});
for(const model of ['gpt-image-2.5-sunburst','gpt-image-2.5-flare','gpt-image-2']){
  for(const resolution of ['1K','2K','4K']){
    for(const ratio of ['16:9','3:2','4:3','1:1']){
      const request=imageRequestDimensions('oai',model,ratio,resolution);
      assert.deepEqual(imageRequestDimensions('infistar',model,ratio,resolution),request,
        `Infistar must offer ${model} ${resolution} ${ratio} through the image endpoint`);
      assert.equal(request.field,'size');
      const [width,height]=request.value.split('x').map(Number);
      assert.equal(verifyImageRatio(width,height,ratio),true,`${model} ${resolution} ${ratio}`);
      assert.equal(verifyImageResolution(width,height,resolution,request.value),true);
      assert.equal(verifyImageResolution(width/2,height/2,resolution,request.value),false);
      assert.equal(width%16,0); assert.equal(height%16,0);
      assert.ok(Math.max(width,height)<=3840);
      assert.ok(width*height>=655360 && width*height<=8294400);
    }
  }
}
// Other image IDs arrive from the account-specific /models list, so test the
// request grid for representative families. The response is checked at runtime.
for(const model of ['qwen-image-plus','doubao-seedream-5-0-lite','flux.1-kontext-pro','gpt-image-1.5']){
  for(const resolution of ['1K','2K','4K']){
    for(const ratio of ['16:9','3:2','4:3','1:1']){
      const request=imageRequestDimensions('infistar',model,ratio,resolution);
      assert.equal(request.field,'size');
      const [width,height]=request.value.split('x').map(Number);
      assert.equal(verifyImageRatio(width,height,ratio),true,`${model} ${resolution} ${ratio}`);
      assert.equal(verifyImageResolution(width,height,resolution,request.value),true);
    }
  }
}
assert.deepEqual(imageRequestDimensions('oai','gpt-image-2.5-sunburst','16:9','1K'),{field:'size',value:'1280x720'});
assert.equal(verifyImageRatio(1024,1024,'16:9'),false);
assert.equal(verifyImageResolution(2048,1152,'2K'),true);
assert.equal(verifyImageResolution(1024,576,'2K'),false);
assert.equal(verifyImageResolution(4096,2304,'4K'),true);
assert.ok(usesInfistarGemini('https://infistar.cc/v1','gemini-3.1-flash-image'));
assert.ok(usesInfistarGemini('https://infistar.ai/v1','gemini-3-pro-image-preview'));
assert.equal(usesInfistarGemini('https://infistar.cc/v1','gpt-image-1'),false);
assert.equal(usesInfistarGemini('https://example.com/v1','gemini-3.1-flash-image'),false);
const request=geminiImageRequest('https://infistar.cc/v1/','gemini-3.1-flash-image','Draw',['data:image/png;base64,YQ==','data:image/jpeg;base64,Yg==']);
assert.equal(request.base,'https://infistar.cc');
assert.equal(request.endpoint,'/v1beta/models/gemini-3.1-flash-image:generateContent');
assert.deepEqual(request.body.generationConfig,{
  responseModalities:['TEXT','IMAGE'],imageConfig:{aspectRatio:'16:9',imageSize:'2K'}
});
assert.deepEqual(geminiImageRequest('https://infistar.cc/v1','gemini-3.1-flash-image','Draw',[],{aspectRatio:'4:3',imageSize:'4K'}).body.generationConfig.imageConfig,{aspectRatio:'4:3',imageSize:'4K'});
assert.deepEqual(request.body.contents[0].parts,[{text:'Draw'},{inlineData:{mimeType:'image/png',data:'YQ=='}},{inlineData:{mimeType:'image/jpeg',data:'Yg=='}}]);
assert.throws(()=>geminiImageRequest('https://infistar.cc','x','Draw',['https://example.com/a.png']),/base64/);
assert.deepEqual(geminiImageResult({candidates:[{content:{parts:[{thought:true,inlineData:{data:'ignore'}},{text:'Image'},{inline_data:{mime_type:'image/jpeg',data:'Yg=='}}]}}]}),{b64_json:'Yg==',mimeType:'image/jpeg'});
assert.throws(()=>geminiImageResult({promptFeedback:{blockReason:'SAFETY'}}),/SAFETY/);
assert.throws(()=>geminiImageResult({candidates:[{finishReason:'STOP',content:{parts:[{text:'No image'}]}}]}),/no image/);
console.log('PASS Gemini image routing, references, response parsing and error handling');
