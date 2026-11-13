import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {assertAllowedPaths,assertArtifactDiff,verifyBlob,patchIndex} from './check-infistar-responses-release.mjs';
const payload=['forge/index.html','forge/infistar-reconstruction-responses.mjs'];
test('rejects unrelated online changes and missing transport payload',()=>{
 assertArtifactDiff(payload);
 for(const p of ['forge/image-api.mjs','forge/sw.js','forge/revision-layout.mjs','.github/forge-workflow-lock.json'])assert.throws(()=>assertArtifactDiff([...payload,p]));
 assert.throws(()=>assertArtifactDiff(payload.slice(1)));assert.throws(()=>assertAllowedPaths(payload));
});
test('rejects modified reviewed bytes',()=>{
 for(const p of payload){const b=readFileSync(new URL('../'+p,import.meta.url));verifyBlob(p,b);assert.throws(()=>verifyBlob(p,Buffer.concat([b,Buffer.from(' ')])));}
});
test('index patch changes exactly the reviewed import and request selection',()=>{
 const base=execFileSync('git',['show','2a0bfddbb797e7b1a6bb5ff4467aaac283418a58:forge/index.html'],{encoding:'utf8',maxBuffer:32*1024*1024}).replace(/\r\n/g,'\n');
 assert.equal(patchIndex(base),readFileSync(new URL('../forge/index.html',import.meta.url),'utf8').replace(/\r\n/g,'\n'));
 assert.throws(()=>patchIndex(base+base));assert.throws(()=>patchIndex(''));
});
