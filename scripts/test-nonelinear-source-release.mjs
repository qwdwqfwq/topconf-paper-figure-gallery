import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {allowed,payload,assertAllowedPaths,assertArtifactDiff,assertFrozenEntry,verifyBlob} from './check-nonelinear-source-release.mjs';
test('scope rejects unrelated runtime, dependencies, historical locks and acceptance edits',()=>{
 assertAllowedPaths(allowed);
 for(const p of ['forge/sw.js','forge/image-api.mjs','forge/editable-native.mjs','forge/vendor/pptxgen.min.js','package.json','.github/forge-workflow-lock.json','scripts/check-revision-context-release.mjs','scripts/check-step4-bitmap-freeze.mjs'])assert.throws(()=>assertAllowedPaths([...allowed,p]));
 assert.throws(()=>assertAllowedPaths(allowed.slice(1)));
});
test('artifact allows exactly the three explicitly unlocked files',()=>{
 assertArtifactDiff(payload);assert.throws(()=>assertArtifactDiff(payload.slice(1)));assert.throws(()=>assertArtifactDiff([...payload,'forge/revision-gallery.mjs']));
});
test('entry allows only five original-source handoff replacements',()=>{
 const before=execFileSync('git',['show','661d2648bdc4efc0b49772243340dcb4e2704789:forge/index.html'],{maxBuffer:4*1024*1024});
 const actual=readFileSync(new URL('../forge/index.html',import.meta.url));
 assertFrozenEntry(actual,before);
 assert.throws(()=>assertFrozenEntry(before,before));
 assert.throws(()=>assertFrozenEntry(Buffer.concat([actual,Buffer.from('extra')]),before));
 assert.throws(()=>assertFrozenEntry(actual.toString().replace('128000','128001'),before));
});
test('all reviewed runtime, tests, patch manifest and workflows are pinned',()=>{
 for(const p of allowed.filter(p=>p!=='scripts/check-nonelinear-source-release.mjs')){
  const bytes=readFileSync(new URL('../'+p,import.meta.url));verifyBlob(p,bytes);
  assert.throws(()=>verifyBlob(p,Buffer.concat([bytes,Buffer.from('changed')])));
 }
 assert.throws(()=>verifyBlob('unreviewed',Buffer.from('changed')));
});
