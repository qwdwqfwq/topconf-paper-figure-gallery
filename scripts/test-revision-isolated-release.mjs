import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertAllowedPaths,assertArtifactDiff,verifyBlob} from './check-revision-isolated-release.mjs';
const payload=['forge/revision-layout.mjs','forge/revision-pixels.mjs','forge/revision-scope.mjs'];
test('reject shared implementation, baseline, dependency, workflow or missing payload changes',()=>{
 for(const p of ['forge/index.html','forge/sw.js','.github/forge-workflow-lock.json','scripts/check-forge-workflow-lock.mjs','package-lock.json','forge/image-api.mjs'])assert.throws(()=>assertArtifactDiff([...payload,p]));
 assert.throws(()=>assertArtifactDiff(payload.slice(1)));assertArtifactDiff(payload);
 assert.throws(()=>assertAllowedPaths([...payload,'forge/index.html']));
});
test('reject even one-byte tampering with reviewed modules',()=>{
 for(const p of payload){const b=readFileSync(new URL('../'+p,import.meta.url));verifyBlob(p,b);assert.throws(()=>verifyBlob(p,Buffer.concat([b,Buffer.from(' ')])));}
 assert.throws(()=>verifyBlob('forge/index.html',Buffer.from('protected')));
});
