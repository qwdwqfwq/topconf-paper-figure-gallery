import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {allowed,assertAllowedPaths,assertArtifactDiff,assertIndexIsolation,verifyBlob} from './check-step3-nonelinear-release.mjs';
test('release scope rejects frozen/shared/unrelated changes and missing reviewed files',()=>{
 assertAllowedPaths(allowed);
 for(const p of ['forge/image-api.mjs','forge/infistar-reconstruction-stream.mjs','forge/sw.js','package.json','scripts/check-step3-stream-release.mjs','.github/forge-workflow-lock.json'])assert.throws(()=>assertAllowedPaths([...allowed,p]));
 assert.throws(()=>assertAllowedPaths(allowed.slice(1)));
});
test('artifact scope permits exactly the Step 3 version entry and transport',()=>{
 assertArtifactDiff(['forge/index.html','forge/step3-image-stream.mjs']);
 assert.throws(()=>assertArtifactDiff(['forge/index.html','forge/step3-image-stream.mjs','forge/revision-scope.mjs']));
 assert.throws(()=>assertArtifactDiff(['forge/step3-image-stream.mjs']));
});
test('whole-file inverse version comparison rejects changes to any Step 4 code',()=>{
 const html=readFileSync(new URL('../forge/index.html',import.meta.url),'utf8');
 const before=execFileSync('git',['show','26910dee446fe5b2dc607074e5e6a6dd6bbd0e36:forge/index.html'],{encoding:'utf8',maxBuffer:4*1024*1024});
 assertIndexIsolation(html,before);
 for(const changed of [html+'\n<!-- unrelated -->',html.replace('requestEditableScene(', 'changedScene('),html.replace('20261114-nonelinear','unexpected')])assert.throws(()=>assertIndexIsolation(changed,before));
});
test('reviewed payload hashes reject modified code and unreviewed paths',()=>{
 for(const p of ['forge/index.html','forge/step3-image-stream.mjs']){
  const data=readFileSync(new URL('../'+p,import.meta.url));verifyBlob(p,data);
  assert.throws(()=>verifyBlob(p,Buffer.concat([data,Buffer.from('changed')])));
 }
 assert.throws(()=>verifyBlob('forge/image-api.mjs',Buffer.from('unreviewed')));
});
