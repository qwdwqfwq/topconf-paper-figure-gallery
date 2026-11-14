import assert from 'node:assert/strict';
import {step3ImageResolutions,assertStep3ImageResolution} from './step3-image-capabilities.mjs';

for(const ratio of ['16:9','3:2','4:3','1:1']){
  for(const native of [true,false]){
    assert.deepEqual(step3ImageResolutions('infistar','gemini-3.1-flash-lite-image',ratio,native),['1K']);
    for(const resolution of ['2K','4K'])assert.throws(()=>assertStep3ImageResolution('infistar','gemini-3.1-flash-lite-image',ratio,resolution,native),/不支持/);
    assert.doesNotThrow(()=>assertStep3ImageResolution('infistar','gemini-3.1-flash-lite-image',ratio,'1K',native));
  }
  assert.deepEqual(step3ImageResolutions('infistar','gpt-image-2.5-sunburst',ratio),['1K','2K','4K']);
  assert.deepEqual(step3ImageResolutions('infistar','gemini-3.1-flash-image',ratio,true),['1K','2K','4K']);
}
assert.deepEqual(step3ImageResolutions('infistar','gemini-3.1-flash-lite-image-2026-11-01','16:9',true),['1K']);
assert.deepEqual(step3ImageResolutions('oai','gpt-image-1','16:9'),[]);
assert.deepEqual(step3ImageResolutions('oai','gpt-image-1','3:2'),['1K']);
assert.deepEqual(step3ImageResolutions('sf','Kwai-Kolors/Kolors','1:1'),['1K']);
assert.deepEqual(step3ImageResolutions('sf','Kwai-Kolors/Kolors','16:9'),[]);
assert.deepEqual(step3ImageResolutions('infistar','gemini-3.1-flash-lite-image','invalid',true),[]);
assert.throws(()=>assertStep3ImageResolution('infistar','gemini-3.1-flash-lite-image','16:9','2K',true,true),/Available resolutions: 1K/);
console.log('PASS model/ratio capabilities and stale-resolution guards');
