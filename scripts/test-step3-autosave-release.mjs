import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {allowed,payload,assertAllowedPaths,assertArtifactDiff,assertFrozenEntry,verifyBlob} from './check-step3-autosave-release.mjs';
test('release scope rejects frozen entry, shared code, prior checks and baseline edits',()=>{
 assertAllowedPaths(allowed);
 for(const p of ['forge/index.html','forge/sw.js','forge/image-api.mjs','forge/revision-scope.mjs','forge/revision-layout.mjs','forge/revision-pixels.mjs','forge/revision-routing.mjs','forge/editable-native.mjs','forge/vendor/pptxgen.bundle.js','package.json','.github/forge-workflow-lock.json','.github/workflows/deploy.yml','.github/workflows/step3-flexible-release.yml','scripts/check-step4-bitmap-freeze.mjs','scripts/check-step3-flexible-release.mjs','forge/test-revision-context.cjs','forge/test-revision-auto-ui.cjs'])assert.throws(()=>assertAllowedPaths([...allowed,p]));
 assert.throws(()=>assertAllowedPaths(allowed.slice(1)));
});
test('online artifact changes exactly one private Step 3 runtime module',()=>{
 assertArtifactDiff(payload);assert.throws(()=>assertArtifactDiff([]));
 for(const p of allowed.filter(p=>!payload.includes(p)).concat(['forge/index.html','forge/sw.js','forge/reconstruction-core.mjs']))assert.throws(()=>assertArtifactDiff([...payload,p]));
 assertFrozenEntry('same-blob','same-blob');assert.throws(()=>assertFrozenEntry('same-blob','changed-blob'));
});
test('reviewed module, replacement behavior tests and release workflow are pinned',()=>{
 for(const p of allowed.filter(p=>p!=='scripts/check-step3-autosave-release.mjs')){
  const bytes=readFileSync(new URL('../'+p,import.meta.url));verifyBlob(p,bytes);
  assert.throws(()=>verifyBlob(p,Buffer.concat([bytes,Buffer.from('changed')])));
 }
 assert.throws(()=>verifyBlob('unreviewed',Buffer.from('changed')));
});
