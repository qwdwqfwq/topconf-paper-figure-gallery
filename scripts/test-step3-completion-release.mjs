import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {allowed,assertAllowedPaths,assertArtifactDiff,verifyBlob} from './check-step3-completion-release.mjs';

test('release scope excludes the entire frozen index, shared code and historical protection files',()=>{
 assertAllowedPaths(allowed);
 for(const p of ['forge/index.html','forge/image-api.mjs','forge/infistar-reconstruction-stream.mjs','forge/revision-scope.mjs','forge/sw.js','package.json','scripts/check-step3-nonelinear-release.mjs','scripts/check-step3-stream-release.mjs','scripts/check-forge-workflow-lock.mjs','.github/forge-workflow-lock.json']){
  assert.throws(()=>assertAllowedPaths([...allowed,p]));
 }
 assert.throws(()=>assertAllowedPaths(allowed.slice(1)));
 assert.throws(()=>assertAllowedPaths([...allowed,allowed[0]]));
});

test('publication can change only the Step 3 stream receiver, with no index or dependency changes',()=>{
 assertArtifactDiff(['forge/step3-image-stream.mjs']);
 for(const p of ['forge/index.html','forge/image-api.mjs','forge/infistar-reconstruction-stream.mjs','forge/sw.js','package.json']){
  assert.throws(()=>assertArtifactDiff(['forge/step3-image-stream.mjs',p]));
 }
 assert.throws(()=>assertArtifactDiff([]));
});

test('all reviewed executable payload, tests and workflows are pinned against edits',()=>{
 for(const p of allowed.filter(p=>p!=='scripts/check-step3-completion-release.mjs')){
  const data=readFileSync(new URL('../'+p,import.meta.url));verifyBlob(p,data);
  assert.throws(()=>verifyBlob(p,Buffer.concat([data,Buffer.from('changed')])));
 }
 assert.throws(()=>verifyBlob('forge/index.html',Buffer.from('unreviewed')));
 assert.throws(()=>verifyBlob('forge/image-api.mjs',Buffer.from('unreviewed')));
});
