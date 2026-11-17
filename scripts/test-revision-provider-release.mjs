import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {allowed,payload,assertScope,assertArtifact,verifyPrevious,verifyReviewed,verifyPatch} from './check-revision-provider-release.mjs';
test('revision publication rejects shared modules, Step 4 and missing files',()=>{
 assertScope(allowed);assertArtifact(payload);
 for(const p of ['forge/image-api.mjs','forge/bitmap-scene.mjs','.github/forge-workflow-lock.json','forge/step3-model-catalog.mjs']){
  assert.throws(()=>assertScope([...allowed,p]));assert.throws(()=>assertArtifact([...payload,p]));
 }
 assert.throws(()=>assertScope(allowed.slice(1)));assert.throws(()=>assertArtifact(payload.slice(1)));
});
test('reviewed revision bytes and previous proof cannot be changed',()=>{
 assert.throws(()=>verifyPrevious(Buffer.from('{}')));
 assert.throws(()=>verifyReviewed('forge/bitmap-scene.mjs',Buffer.from('changed')));
 for(const p of payload){const bytes=readFileSync(new URL('../'+p,import.meta.url));verifyPatch(p,Buffer.alloc(0),bytes);assert.throws(()=>verifyPatch(p,Buffer.alloc(0),Buffer.concat([bytes,Buffer.from('// extra')])));}
});
