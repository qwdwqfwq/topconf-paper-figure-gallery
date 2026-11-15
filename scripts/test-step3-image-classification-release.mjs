import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertAllowedPaths,assertArtifactDiff,verifyBlob,verifyIndex,allowed,payload} from './check-step3-image-classification-release.mjs';
test('release scope rejects unrelated code, shared functions and freeze manifests',()=>{
 assertAllowedPaths(allowed);assertArtifactDiff(payload);
 for(const path of ['forge/sw.js','forge/image-api.mjs','.github/forge-workflow-lock.json','forge/revision-gallery.mjs']){
  assert.throws(()=>assertAllowedPaths([...allowed,path]));
  assert.throws(()=>assertArtifactDiff([...payload,path]));
 }
 assert.throws(()=>assertArtifactDiff(payload.slice(1)));
});
test('reviewed contents cannot silently change or delete checks',()=>{
 for(const path of allowed.filter(p=>!p.endsWith('/check-step3-image-classification-release.mjs'))){
  const data=readFileSync(new URL('../'+path,import.meta.url));verifyBlob(path,data);
  assert.throws(()=>verifyBlob(path,Buffer.concat([data,Buffer.from('\n// unrelated change')])));
 }
});
test('HTML contains exactly the two authorized validation replacements',()=>{
 const html=readFileSync(new URL('../forge/index.html',import.meta.url),'utf8');verifyIndex(html);
 for(const [old,next] of [["const SKIP =",'const UNRELATED_SKIP ='],['async function runReconstruction','async function changedReconstruction']]){
  if(html.includes(old))assert.throws(()=>verifyIndex(html.replace(old,next)));
 }
 assert.throws(()=>verifyIndex(html+'unexpected'));
});
