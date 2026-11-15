import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {allowed,payload,anchor,assertAllowedPaths,assertArtifactDiff,verifyBlob} from './check-step3-model-display-release.mjs';
const protectedPaths=['forge/index.html','forge/sw.js','forge/parser-model-catalog.mjs','forge/parser-nonelinear-catalog.mjs','forge/aspect-ratio.mjs','forge/nonelinear-image.mjs','forge/step3-image-protocol.mjs','forge/step3-infistar-job.mjs','forge/revision-gallery.mjs','forge/reconstruction-core.mjs','forge/editable-native.mjs','forge/vendor/pptxgen.bundle.js','.github/forge-workflow-lock.json','scripts/check-step4-bitmap-freeze.mjs','scripts/check-forge-workflow-lock.mjs','scripts/check-step3-nonelinear-official-release.mjs','scripts/test-step3-nonelinear-official-release.mjs','.github/workflows/step3-nonelinear-official-release.yml','scripts/check-step3-official-catalog-release.mjs','scripts/test-step3-official-catalog-release.mjs','.github/workflows/step3-official-catalog-release.yml','forge/test-step3-image-capabilities.mjs','forge/test-step3-image-capabilities-browser.cjs','forge/test-step3-official-catalog.mjs','forge/test-step3-official-catalog-browser.cjs','forge/test-step3-official-catalog-compat.cjs','forge/test-step3-nonelinear-official.mjs','forge/test-step3-nonelinear-official-browser.cjs'];
test('release rejects shared HTML, Step 4, dependencies, old tests and all prior protections',()=>{
 assertAllowedPaths(allowed);assertArtifactDiff(payload);
 for(const path of [...protectedPaths,'package.json','.github/workflows/deploy.yml']){
  assert.throws(()=>assertAllowedPaths([...allowed,path]));assert.throws(()=>assertArtifactDiff([...payload,path]));
 }
 assert.throws(()=>assertAllowedPaths(allowed.slice(1)));assert.throws(()=>assertArtifactDiff(payload.slice(1)));
 for(const path of allowed.filter(p=>!payload.includes(p)))assert.throws(()=>assertArtifactDiff([...payload,path]));
});
test('all newly reviewed display, tests and deployment content is pinned',()=>{
 for(const path of allowed.filter(p=>p!=='scripts/check-step3-model-display-release.mjs')){
  const bytes=readFileSync(new URL('../'+path,import.meta.url));verifyBlob(path,bytes);
  assert.throws(()=>verifyBlob(path,Buffer.concat([bytes,Buffer.from('mutation')])));
 }
 assert.throws(()=>verifyBlob('unreviewed',Buffer.from('mutation')));
});
test('shared files, existing tests and previous acceptance protections keep exact bytes',()=>{
 for(const path of protectedPaths){
  if(spawnSync('git',['cat-file','-e',anchor+':'+path]).status!==0){
   assert.equal(existsSync(new URL('../'+path,import.meta.url)),false,'Previously absent protection must not be introduced or overridden: '+path);
   continue;
  }
  const original=execFileSync('git',['show',anchor+':'+path],{encoding:'utf8'}).replace(/\r\n/g,'\n');
  assert.equal(readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n'),original,path);
 }
});
