import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {allowed,payload,assertAllowedPaths,assertArtifactDiff,verifyBlob} from './check-step3-flexible-release.mjs';
test('repository scope rejects all frozen entry, export, vendor, cache and prior guard edits',()=>{
 assertAllowedPaths(allowed);
 for(const p of ['forge/index.html','forge/sw.js','forge/image-api.mjs','forge/revision-scope.mjs','forge/editable-native.mjs','forge/vendor/pptxgen.min.js','package.json','.github/forge-workflow-lock.json','.github/workflows/deploy.yml','scripts/check-step4-bitmap-freeze.mjs','scripts/check-nonelinear-source-release.mjs'])assert.throws(()=>assertAllowedPaths([...allowed,p]));
 assert.throws(()=>assertAllowedPaths(allowed.slice(1)));
});
test('publication changes exactly four Step 3 private runtime files',()=>{
 assertArtifactDiff(payload);assert.throws(()=>assertArtifactDiff(payload.slice(1)));
 for(const p of ['forge/index.html','forge/sw.js','forge/test-revision-flexible.cjs','.github/workflows/step3-flexible-release.yml'])assert.throws(()=>assertArtifactDiff([...payload,p]));
});
test('reviewed runtime, regressions and independent workflow cannot silently change',()=>{
 for(const p of allowed.filter(p=>p!=='scripts/check-step3-flexible-release.mjs')){
  const bytes=readFileSync(new URL('../'+p,import.meta.url));verifyBlob(p,bytes);
  assert.throws(()=>verifyBlob(p,Buffer.concat([bytes,Buffer.from('changed')])));
 }
 assert.throws(()=>verifyBlob('unreviewed',Buffer.from('changed')));
});
