import assert from 'node:assert/strict';
import {imageRequestDimensions,verifyImageRatio,verifyImageResolution} from './aspect-ratio.mjs';
import {compatibleImageRequest} from './image-api.mjs';

let cases=0;
for(const model of ['gemini-3-pro-image-preview','gemini-3.1-flash-image-preview','gemini-3.1-flash-image']){
  for(const ratio of ['16:9','3:2','4:3','1:1']) for(const resolution of ['1K','2K','4K']){
    const dimensions=imageRequestDimensions('nonelinear',model,ratio,resolution);
    assert.deepEqual(dimensions,{field:'size',value:resolution,aspectRatio:ratio});
    for(const references of [[],['data:image/png;base64,aGVsbG8=']]){
      const body={model,prompt:'test',size:dimensions.value,aspect_ratio:dimensions.aspectRatio,...(references.length?{image:references}:{})};
      const request=compatibleImageRequest(body,'http://127.0.0.1/api/nonelinear/v1','nonelinear');
      assert.equal(request.endpoint,'/images/generations');assert.deepEqual(request.body,body);cases++;
    }
    const width={ '1K':1280,'2K':2048,'4K':4096 }[resolution];
    const [a,b]=ratio.split(':').map(Number),height=Math.round(width*b/a);
    assert.equal(verifyImageRatio(width,height,ratio),true);
    assert.equal(verifyImageResolution(width,height,resolution,dimensions.value),true);
    assert.equal(verifyImageResolution(512,512,resolution,dimensions.value),false);
  }
}
for(const model of ['gpt-image-2','gpt-image-2-2026-04-21','gpt-image-2.5-sunburst','gpt-image-2.5-flare-2026-09-08']){
  for(const ratio of ['16:9','3:2','4:3','1:1']) for(const resolution of ['1K','2K','4K']){
    const dimensions=imageRequestDimensions('nonelinear',model,ratio,resolution);
    const [width,height]=dimensions.value.split('x').map(Number);
    assert.equal(verifyImageRatio(width,height,ratio),true);
    assert.equal(verifyImageResolution(width,height,resolution,dimensions.value),true);
    assert.equal(verifyImageResolution(width/2,height/2,resolution,dimensions.value),false);
    assert.ok(width*height<=8294400 && width*height>=655360 && Math.max(width,height)<=3840);
    assert.equal(width%16,0);assert.equal(height%16,0);cases++;
  }
}
const reference={model:'gpt-image-2',prompt:'test',size:'3840x2160',image:['data:image/png;base64,aGVsbG8=']};
for(const [base,provider] of [['http://127.0.0.1/api/nonelinear/v1','nonelinear'],['https://api.nonelinear.com.cn/v1','']]){
  const request=compatibleImageRequest(reference,base,provider);
  assert.equal(request.endpoint,'/images/generations');assert.equal(request.body,reference);
}
assert.equal(compatibleImageRequest(reference,'https://api.openai.com/v1','oai').endpoint,'/images/edits');
for(const model of ['gpt-image-1','gpt-image-1.5','gpt-image-1-mini','gemini-2.5-flash-image','Qwen-Image']){
  assert.ok(imageRequestDimensions('nonelinear',model,'1:1','1K'));
  for(const resolution of ['2K','4K']) assert.throws(()=>imageRequestDimensions('nonelinear',model,'1:1',resolution));
}
assert.throws(()=>imageRequestDimensions('nonelinear','unknown-image','16:9','4K'));
for(const model of ['kling-image-o1','viduq2','doubao-seedream-4-5'])
  assert.ok(imageRequestDimensions('nonelinear',model,'16:9','4K'));
assert.throws(()=>imageRequestDimensions('nonelinear','kling-v2','16:9','4K'));
assert.equal(verifyImageRatio(4096,4096,'16:9'),false);
console.log(`NoneLinear image capability/request/returned-pixel regressions passed (${cases} combinations; no live API calls).`);
