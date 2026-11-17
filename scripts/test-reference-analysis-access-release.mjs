import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {allowed,payload,assertScope,assertArtifact,verifyPrevious,verifyPatch} from './check-reference-analysis-access-release.mjs';
test('publication excludes frozen entry, shared modules, backend, exports, dependencies and existing guards',()=>{
 assertScope(allowed);assertArtifact(payload);
 for(const p of ['forge/index.html','forge/image-api.mjs','forge/step3-model-catalog.mjs','forge/sw.js','reference-analysis-backend/worker.mjs','.github/forge-workflow-lock.json','scripts/check-forge-workflow-lock.mjs','scripts/check-reference-analysis-release.mjs','forge/vendor/pptxgen.bundle.js']){assert.throws(()=>assertScope([...allowed,p]));assert.throws(()=>assertArtifact([...payload,p]));}
 for(const p of allowed.filter(p=>!payload.includes(p)))assert.throws(()=>assertArtifact([...payload,p]));
 assert.throws(()=>assertScope(allowed.slice(1)));assert.throws(()=>assertArtifact(payload.slice(1)));assert.throws(()=>verifyPrevious(Buffer.from('{}')));
});
test('only the exact reviewed private analysis module bytes are publishable',()=>{
 for(const p of payload){
  const original=execFileSync('git',['show','76ce741d97558f1edc8b5a45e8d49f733ec61e51:'+p]);
  const candidate=readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
  verifyPatch(p,original,candidate);assert.throws(()=>verifyPatch(p,original,original));assert.throws(()=>verifyPatch(p,original,candidate+'\n// extra'));assert.throws(()=>verifyPatch('forge/index.html',original,candidate));
 }
});
