import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {baseCommit,allowed,payload,assertScope,assertArtifact,assertEntry,verifyReviewed,verifyPrevious} from './check-step3-initial-read-release.mjs';
test('scope rejects protected code, dependencies, old acceptance and missing files',()=>{
 assertScope(allowed);
 for(const p of ['forge/editable-native.mjs','forge/sw.js','forge/image-api.mjs','forge/vendor/pptxgen.min.js','package.json','.github/forge-workflow-lock.json','scripts/check-nonelinear-source-release.mjs','scripts/check-step4-bitmap-freeze.mjs','infistar-image-relay/worker.mjs'])assert.throws(()=>assertScope([...allowed,p]));
 assert.throws(()=>assertScope(allowed.slice(1)));
});
test('published payload must be exactly the entry and new private client',()=>{
 assertArtifact(payload);assert.throws(()=>assertArtifact(payload.slice(1)));assert.throws(()=>assertArtifact([...payload,'forge/revision-gallery.mjs']));
});
test('entry rejects any third edit, unchanged import or Step 4 parameter change',()=>{
 const before=execFileSync('git',['show',baseCommit+':forge/index.html'],{maxBuffer:4*1024*1024});
 const actual=readFileSync(new URL('../forge/index.html',import.meta.url));assertEntry(actual,before);
 assert.throws(()=>assertEntry(before,before));assert.throws(()=>assertEntry(actual+'extra',before));assert.throws(()=>assertEntry(actual.toString().replace('128000','128001'),before));
});
test('reviewed frontend, tests and workflow bytes cannot drift',()=>{
 for(const p of allowed.filter(p=>p!=='scripts/check-step3-initial-read-release.mjs')){
  const bytes=readFileSync(new URL('../'+p,import.meta.url));verifyReviewed(p,bytes);assert.throws(()=>verifyReviewed(p,Buffer.concat([bytes,Buffer.from('changed')])));
 }
 assert.throws(()=>verifyReviewed('unknown',Buffer.from('changed')));
});
test('untrusted previous artifact proof is rejected before construction',()=>{
 assert.throws(()=>verifyPrevious(Buffer.from('{}')));assert.throws(()=>verifyPrevious(Buffer.from('{"artifactTree":"d23603856cf20b21f3b8bcb6d84bf961fd102046","allOtherPublishedBytesIdentical":true}')));
});
