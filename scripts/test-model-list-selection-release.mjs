import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {allowed,payload,anchor,assertAllowedPaths,assertArtifactDiff,verifyBlob} from './check-model-list-selection-release.mjs';
const protectedPaths=['forge/index.html','forge/sw.js','forge/parser-model-catalog.mjs','forge/model-list-display.mjs','forge/step3-image-capabilities.mjs','forge/step3-image-protocol.mjs','forge/reconstruction-core.mjs','forge/editable-native.mjs','forge/revision-gallery.mjs','forge/vendor/pptxgen.bundle.js','.github/forge-workflow-lock.json','scripts/check-step4-bitmap-freeze.mjs','scripts/check-forge-workflow-lock.mjs','scripts/check-model-list-fold-release.mjs','scripts/test-model-list-fold-release.mjs','.github/workflows/model-list-fold-release.yml'];
test('selection release rejects every file outside its exact scope',()=>{
 assertAllowedPaths(allowed);assertArtifactDiff(payload);
 for(const path of [...protectedPaths,'package.json','.github/workflows/deploy.yml']){
  assert.throws(()=>assertAllowedPaths([...allowed,path]));
  assert.throws(()=>assertArtifactDiff([...payload,path]));
 }
 assert.throws(()=>assertAllowedPaths(allowed.slice(1)));
 assert.throws(()=>assertArtifactDiff([]));
 for(const path of allowed.filter(p=>!payload.includes(p)))assert.throws(()=>assertArtifactDiff([...payload,path]));
});
test('selection code, browser tests and release configuration reject mutations',()=>{
 for(const path of allowed.filter(p=>p!=='scripts/check-model-list-selection-release.mjs')){
  const bytes=readFileSync(new URL('../'+path,import.meta.url));verifyBlob(path,bytes);
  assert.throws(()=>verifyBlob(path,Buffer.concat([bytes,Buffer.from('mutation')])));
 }
 assert.throws(()=>verifyBlob('unreviewed',Buffer.from('mutation')));
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
