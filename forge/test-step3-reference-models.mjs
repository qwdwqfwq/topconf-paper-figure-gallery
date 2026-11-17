import test from 'node:test';
import assert from 'node:assert/strict';
import {supportsStep3ReferenceImage as supports} from './step3-reference-models.mjs';
const infistar={provider:'infistar',base:'https://infistar.cc/v1'};
test('reference input requires documented capability on the selected provider',()=>{
  for(const id of ['gpt-image-2.5-flare','gemini-nano-banana-2.1','qwen-image-edit-plus'])assert.equal(supports(infistar,id),true,id);
  for(const id of ['gpt-image-2.6-flare','gpt-image-2.6-sunburst','gpt-image-2.6','gpt-image-2.6-future','future-image','dall-e-3','qwen-image'])assert.equal(supports(infistar,id),false,id);
  assert.equal(supports(infistar,'gpt-image-2'),false,'another provider’s capability does not establish Infistar support');
  assert.equal(supports({provider:'nonelinear',base:'https://api.nonelinear.com.cn/v1'},'gpt-image-2'),true);
  assert.equal(supports({provider:'nonelinear',base:'https://api.nonelinear.com.cn/v1'},'imagen-4.0-generate-001'),false);
  assert.equal(supports({provider:'oai',base:'https://api.openai.com/v1'},'gpt-image-1.5'),true);
  assert.equal(supports({provider:'ark',base:'https://ark.cn-beijing.volces.com/api/v3'},'doubao-seedream-4-5-251128'),true);
});
test('unknown providers, endpoint overrides and future aliases do not inherit reference capability',()=>{
  for(const config of [undefined,{...infistar,provider:'custom'},{...infistar,base:'https://example.com/v1'},{...infistar,base:'https://infistar.cc.example.com/v1'},{...infistar,base:'http://infistar.cc/v1'},{...infistar,base:'https://infistar.cc:8443/v1'},{...infistar,base:'https://user:secret@infistar.cc/v1'},{...infistar,base:'invalid'}])assert.equal(supports(config,'gpt-image-2.5-flare'),false);
  assert.equal(supports(infistar,'gpt-image-2.5-flare-new'),false);
});
