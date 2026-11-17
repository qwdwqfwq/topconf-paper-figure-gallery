import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {allowed,payload,assertScope,assertArtifact,verifyPrevious,verifyReviewed,verifyPatch} from './check-step3-reference-release.mjs';
test('publisher rejects Step 4, shared request code, HTML and missing files',()=>{
 assertScope(allowed);assertArtifact(payload);
 for(const p of ['forge/index.html','forge/image-api.mjs','forge/bitmap-scene.mjs','.github/forge-workflow-lock.json']){
  assert.throws(()=>assertScope([...allowed,p]));assert.throws(()=>assertArtifact([...payload,p]));
 }
 assert.throws(()=>assertScope(allowed.slice(1)));assert.throws(()=>assertArtifact(payload.slice(1)));
});
test('proof tampering and extra source edits cannot be published',()=>{
 assert.throws(()=>verifyPrevious(Buffer.from('{}')));
 assert.throws(()=>verifyReviewed('forge/index.html',Buffer.from('changed')));
 for(const p of payload){const bytes=readFileSync(new URL('../'+p,import.meta.url));verifyPatch(p,Buffer.alloc(0),bytes);assert.throws(()=>verifyPatch(p,Buffer.alloc(0),Buffer.concat([bytes,Buffer.from('// extra')])));}
});
