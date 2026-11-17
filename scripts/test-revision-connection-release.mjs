import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {allowed,payload,assertScope,assertArtifact,verifyPrevious,verifyPatch} from './check-revision-connection-release.mjs';
test('publication excludes frozen entry, shared modules, model catalog, guards and unrelated changes',()=>{
 assertScope(allowed);assertArtifact(payload);
 for(const p of ['forge/index.html','forge/image-api.mjs','forge/step3-model-catalog.mjs','forge/sw.js','.github/forge-workflow-lock.json','scripts/check-forge-workflow-lock.mjs']){assert.throws(()=>assertScope([...allowed,p]));assert.throws(()=>assertArtifact([...payload,p]));}
 assert.throws(()=>assertScope(allowed.slice(1)));assert.throws(()=>assertArtifact(payload.slice(1)));assert.throws(()=>verifyPrevious(Buffer.from('{}')));
});
test('only the exact reviewed module bytes are publishable',()=>{
 for(const p of payload){
  const original=p.endsWith('revision-result-recovery.mjs')?null:execFileSync('git',['show','a957e48dfee630ef40bf514412b2f1798958aba3:'+p]);
  const candidate=readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
  verifyPatch(p,original,candidate);if(original)assert.throws(()=>verifyPatch(p,original,original));assert.throws(()=>verifyPatch(p,original,candidate+'\n// extra'));assert.throws(()=>verifyPatch('forge/index.html',original,candidate));
 }
});
