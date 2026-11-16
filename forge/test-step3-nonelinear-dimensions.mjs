import assert from 'node:assert/strict';
import {step3ImageDimensions,step3ImageResolutions} from './step3-image-capabilities.mjs';
import {imageRequestDimensions} from './aspect-ratio.mjs';
// Exercise both the frozen page's preflight and the private Step 3 serializer.
// Use NoneLinear's documented canonical IDs, not Infistar's provider alias.
for(const ratio of ['16:9','3:2','4:3','1:1']){
  for(const size of ['1K','2K','4K']){
    const expected={field:'size',value:size,aspectRatio:ratio};
    assert.deepEqual(step3ImageDimensions('nonelinear','gemini-3.1-flash-image-preview',ratio,size),expected);
    assert.deepEqual(imageRequestDimensions('nonelinear','gemini-3.1-flash-image-preview',ratio,size),expected);
  }
  assert.deepEqual(step3ImageResolutions('nonelinear','gemini-2.5-flash-image',ratio),['1K']);
  for(const dimensions of [step3ImageDimensions,imageRequestDimensions]){
    assert.deepEqual(dimensions('nonelinear','gemini-2.5-flash-image',ratio,'1K'),{field:'aspect_ratio',value:ratio});
    assert.throws(()=>dimensions('nonelinear','gemini-2.5-flash-image',ratio,'4K'));
  }
}
console.log('NoneLinear Step 3 canonical model dimensions passed');

// Unknown catalog IDs must not be rejected for lacking local verification.
for(const model of ['gemini-nano-banana-2.1','future-catalog-image-model']){
 for(const ratio of ['16:9','3:2','4:3','1:1']){
  assert.deepEqual(step3ImageResolutions('nonelinear',model,ratio),['1K','2K','4K']);
  for(const size of ['1K','2K','4K'])assert.deepEqual(step3ImageDimensions('nonelinear',model,ratio,size),{field:'size',value:size,aspectRatio:ratio});
 }
}
assert.throws(()=>step3ImageDimensions('nonelinear','imagen-4.0-generate-001','16:9','4K'));
assert.deepEqual(step3ImageResolutions('nonelinear','imagen-4.0-fast-generate-001','16:9'),['1K']);
assert.throws(()=>step3ImageDimensions('nonelinear','gemini-nano-banana-2.1','16:9','8K'));
console.log('PASS catalog aliases/default presets and documented restrictions');
