import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {allowed,payload,anchor,assertAllowedPaths,assertArtifactDiff,assertEntryPatch,verifyBlob} from './check-parser-catalog-release.mjs';
test('release rejects shared transports, previous locks, baselines and unrelated online changes',()=>{
  assertAllowedPaths(allowed);assertArtifactDiff(payload);
  for(const path of ['forge/sw.js','forge/image-api.mjs','forge/revision-gallery.mjs','forge/reconstruction-core.mjs','forge/editable-native.mjs','forge/vendor/pptxgen.bundle.js','package.json','.github/forge-workflow-lock.json','.github/workflows/deploy.yml','.github/workflows/step3-request-release.yml','scripts/check-step4-bitmap-freeze.mjs','scripts/check-step3-request-release.mjs']){
    assert.throws(()=>assertAllowedPaths([...allowed,path]));assert.throws(()=>assertArtifactDiff([...payload,path]));
  }
  assert.throws(()=>assertAllowedPaths(allowed.slice(1)));assert.throws(()=>assertArtifactDiff(payload.slice(1)));
  for(const path of allowed.filter(path=>!payload.includes(path)))assert.throws(()=>assertArtifactDiff([...payload,path]));
});
test('shared entry allows only the six exact authorized parser edits',()=>{
  const before=execFileSync('git',['show',anchor+':forge/index.html']),after=readFileSync(new URL('../forge/index.html',import.meta.url));
  assertEntryPatch(before,after);
  assert.throws(()=>assertEntryPatch(before,before));
  for(const name of ['fetchOnlineModels','populateModels','populateAnalyzeModels','populateReconstructionModels','reconstructWithEvidence','buildNativePptx']){
    assert.throws(()=>assertEntryPatch(before,after.toString().replace(name,name+'_changed')));
  }
  assert.throws(()=>assertEntryPatch(before,Buffer.concat([after,Buffer.from('\n<!-- unrelated edit -->')])));
});
test('every reviewed payload, patch record, regression and workflow is content pinned',()=>{
  for(const path of allowed.filter(path=>path!=='scripts/check-parser-catalog-release.mjs')){
    const bytes=readFileSync(new URL('../'+path,import.meta.url));verifyBlob(path,bytes);
    assert.throws(()=>verifyBlob(path,Buffer.concat([bytes,Buffer.from('mutation')])));
  }
  assert.throws(()=>verifyBlob('unreviewed',Buffer.from('mutation')));
});
