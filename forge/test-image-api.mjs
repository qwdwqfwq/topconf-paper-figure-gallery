import assert from 'node:assert/strict';
import {usesInfistarGemini,geminiImageRequest,geminiImageResult} from './image-api.mjs';
import {figureCanvas,imageRequestDimensions,verifyImageRatio,verifyImageResolution} from './aspect-ratio.mjs';
for(const [ratio,height] of [['16:9',900],['3:2',1067],['4:3',1200],['1:1',1600]]){
  assert.equal(figureCanvas(ratio).height,height);
  assert.equal(verifyImageRatio(1600,height,ratio),true);
}
assert.deepEqual(imageRequestDimensions('ark','doubao-seedream-5-0','16:9','2K'),{field:'size',value:'2848x1600'});
assert.deepEqual(imageRequestDimensions('ark','doubao-seedream-5-0','3:2','2K'),{field:'size',value:'2496x1664'});
assert.deepEqual(imageRequestDimensions('ark','doubao-seedream-5-0','4:3','2K'),{field:'size',value:'2304x1728'});
assert.deepEqual(imageRequestDimensions('ark','doubao-seedream-5-0','1:1','2K'),{field:'size',value:'2048x2048'});
assert.deepEqual(imageRequestDimensions('ark','doubao-seedream-5-0-lite','16:9','4K'),{field:'size',value:'4096x2304'});
assert.deepEqual(imageRequestDimensions('infistar','gemini-3.1-flash-image','4:3','4K',true),{field:'gemini',aspectRatio:'4:3',imageSize:'4K'});
assert.throws(()=>imageRequestDimensions('ark','doubao-seedream-5-0','16:9','4K'),/no verified/);
assert.throws(()=>imageRequestDimensions('oai','gpt-image-1','1:1','2K'),/no verified/);
assert.throws(()=>imageRequestDimensions('oai','dall-e-3','3:2','1K'),/no verified/);
assert.deepEqual(imageRequestDimensions('oai','gpt-image-1','1:1','1K'),{field:'size',value:'1024x1024'});
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
