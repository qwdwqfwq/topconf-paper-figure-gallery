import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {allowed,payload,anchor,assertAllowedPaths,assertArtifactDiff,verifyBlob} from './check-step3-nonelinear-official-release.mjs';
test('official catalog release rejects shared entry, generation, exports, service worker and all previous protections',()=>{
 assertAllowedPaths(allowed);assertArtifactDiff(payload);
 for(const path of ['forge/index.html','forge/parser-model-catalog.mjs','forge/parser-nonelinear-catalog.mjs','forge/sw.js','forge/image-api.mjs','forge/reconstruction-core.mjs','forge/editable-native.mjs','forge/vendor/pptxgen.bundle.js','package.json','.github/forge-workflow-lock.json','.github/workflows/deploy.yml','scripts/check-step4-bitmap-freeze.mjs','scripts/check-step3-catalog-release.mjs','scripts/test-step3-catalog-release.mjs','.github/workflows/step3-catalog-release.yml','scripts/check-step3-image-jobs-release.mjs','scripts/test-step3-image-jobs-release.mjs','.github/workflows/step3-image-jobs-release.yml','scripts/check-step3-revision-stream-release.mjs','scripts/test-step3-revision-stream-release.mjs','.github/workflows/step3-revision-stream-release.yml','scripts/check-step3-official-catalog-release.mjs','scripts/test-step3-official-catalog-release.mjs','.github/workflows/step3-official-catalog-release.yml','forge/test-step3-official-catalog.mjs','forge/test-step3-official-catalog-browser.cjs','forge/test-step3-official-catalog-compat.cjs','forge/test-step3-model-catalog-browser.cjs','forge/revision-gallery.mjs','forge/step3-image-protocol.mjs','forge/step3-infistar-job.mjs','forge/step3-image-capabilities.mjs']){
  assert.throws(()=>assertAllowedPaths([...allowed,path]));assert.throws(()=>assertArtifactDiff([...payload,path]));
 }
 assert.throws(()=>assertAllowedPaths(allowed.slice(1)));assert.throws(()=>assertArtifactDiff(payload.slice(1)));
 for(const path of allowed.filter(p=>!payload.includes(p)))assert.throws(()=>assertArtifactDiff([...payload,path]));
});
test('all reviewed discovery, tests and deployment content is pinned independently of historical baselines',()=>{
 for(const path of allowed.filter(p=>p!=='scripts/check-step3-nonelinear-official-release.mjs')){
  const bytes=readFileSync(new URL('../'+path,import.meta.url));verifyBlob(path,bytes);assert.throws(()=>verifyBlob(path,Buffer.concat([bytes,Buffer.from('mutation')])));
 }
 assert.throws(()=>verifyBlob('unreviewed',Buffer.from('mutation')));
});
test('entire shared entry and previous deployment protections retain their exact bytes',()=>{
 for(const path of ['forge/index.html','forge/sw.js','scripts/check-step3-catalog-release.mjs','scripts/test-step3-catalog-release.mjs','.github/workflows/step3-catalog-release.yml','scripts/check-step3-image-jobs-release.mjs','scripts/test-step3-image-jobs-release.mjs','.github/workflows/step3-image-jobs-release.yml','scripts/check-step3-revision-stream-release.mjs','scripts/test-step3-revision-stream-release.mjs','.github/workflows/step3-revision-stream-release.yml','scripts/check-step3-official-catalog-release.mjs','scripts/test-step3-official-catalog-release.mjs','.github/workflows/step3-official-catalog-release.yml','forge/test-step3-official-catalog.mjs','forge/test-step3-official-catalog-browser.cjs','forge/test-step3-official-catalog-compat.cjs','forge/test-step3-model-catalog-browser.cjs','forge/revision-gallery.mjs','forge/step3-image-protocol.mjs','forge/step3-infistar-job.mjs','forge/step3-image-capabilities.mjs']){
  const original=execFileSync('git',['show',anchor+':'+path]).toString().replace(/\r\n/g,'\n');
  assert.equal(readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n'),original,path);
 }
});
