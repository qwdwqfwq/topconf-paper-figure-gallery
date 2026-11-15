import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {allowed,payload,workerPayload,anchor,publishedTree,assertAllowedPaths,assertArtifactDiff,verifyBlob} from './check-step3-nonelinear-ordinary-release.mjs';
const protectedPaths=["scripts/check-step3-no-recovery-release.mjs","scripts/test-step3-no-recovery-release.mjs",".github/workflows/step3-no-recovery-release.yml","forge/index.html", "forge/step3-reference-upload.mjs", "scripts/check-step3-image-endpoints-release.mjs", "scripts/test-step3-image-endpoints-release.mjs", ".github/workflows/step3-image-endpoints-release.yml", "scripts/check-step3-image-classification-release.mjs", "scripts/test-step3-image-classification-release.mjs", ".github/workflows/step3-image-classification-release.yml", "forge/test-step3-image-classification-browser.cjs", "forge/step3-model-catalog.mjs", "forge/test-model-list-fold-browser.cjs", "scripts/check-model-list-selection-release.mjs", "scripts/test-model-list-selection-release.mjs", ".github/workflows/model-list-selection-release.yml", "forge/sw.js", "forge/parser-model-catalog.mjs", "forge/step3-image-capabilities.mjs", "forge/reconstruction-core.mjs", "forge/editable-native.mjs", "forge/vendor/pptxgen.bundle.js", ".github/forge-workflow-lock.json", "scripts/check-step4-bitmap-freeze.mjs", "scripts/check-forge-workflow-lock.mjs", "scripts/check-model-list-fold-release.mjs", "scripts/test-model-list-fold-release.mjs", ".github/workflows/model-list-fold-release.yml", "scripts/check-model-list-mobile-release.mjs", "scripts/test-model-list-mobile-release.mjs", ".github/workflows/model-list-mobile-release.yml", "forge/test-model-list-mobile-browser.cjs", "forge/image-api.mjs", "forge/nonelinear-image.mjs", "forge/aspect-ratio.mjs", "forge/step3-reference-input.mjs", "infistar-image-relay/wrangler.jsonc", "nonelinear-relay/worker.mjs", "nonelinear-relay/source-image.mjs", "forge/revision-local.mjs", "forge/test-revision-local.cjs", "scripts/check-step3-local-release.mjs", "scripts/test-step3-local-release.mjs", ".github/workflows/step3-local-release.yml", "infistar-image-relay/image-result.mjs", "forge/revision-gallery.mjs", "forge/step3-image-protocol.mjs", "infistar-image-relay/browser-image-fetch.mjs", "scripts/check-step3-stream-compat-release.mjs", "scripts/test-step3-stream-compat-release.mjs", ".github/workflows/step3-stream-compat-release.yml"];
test('NoneLinear ordinary release rejects every file outside its exact scope',()=>{
 assertAllowedPaths(allowed);assertArtifactDiff(payload);
 for(const path of [...protectedPaths,'package.json','.github/workflows/deploy.yml']){
  assert.throws(()=>assertAllowedPaths([...allowed,path]));
  assert.throws(()=>assertArtifactDiff([...payload,path]));
 }
 assert.throws(()=>assertAllowedPaths(allowed.slice(1)));
 assert.throws(()=>assertArtifactDiff([]));
 for(const path of allowed.filter(p=>!payload.includes(p)))assert.throws(()=>assertArtifactDiff([...payload,path]));
});
test('NoneLinear ordinary code, browser tests and release configuration reject mutations',()=>{
 for(const path of allowed.filter(p=>p!=='scripts/check-step3-nonelinear-ordinary-release.mjs')){
  const bytes=readFileSync(new URL('../'+path,import.meta.url));verifyBlob(path,bytes);
  assert.throws(()=>verifyBlob(path,Buffer.concat([bytes,Buffer.from('mutation')])));
 }
 assert.throws(()=>verifyBlob('unreviewed',Buffer.from('mutation')));
});
test('Pages replaces only existing browser modules and excludes the separately deployed Worker',()=>{
 assert.equal(payload.length,3);
 for(const path of payload)assert.equal(spawnSync('git',['cat-file','-e',publishedTree+':'+path]).status,0,path);
 assert.deepEqual(workerPayload,['infistar-image-relay/worker.mjs']);
 for(const path of workerPayload){
  assert.ok(allowed.includes(path));
  assert.equal(execFileSync('git',['ls-tree',publishedTree,'--',path],{encoding:'utf8'}),'');
  assert.throws(()=>assertArtifactDiff([...payload,path]));
 }
});
test('frozen files and all prior release protections retain exact bytes',()=>{
 for(const path of protectedPaths){
  if(spawnSync('git',['cat-file','-e',anchor+':'+path]).status!==0){
   assert.equal(existsSync(new URL('../'+path,import.meta.url)),false,'Previously absent protection must remain absent: '+path);
   continue;
  }
  const original=execFileSync('git',['show',anchor+':'+path],{encoding:'utf8'}).replace(/\r\n/g,'\n');
  assert.equal(readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n'),original,path);
 }
});
