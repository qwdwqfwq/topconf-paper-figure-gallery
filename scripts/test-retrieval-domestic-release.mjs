import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {allowed,payload,assertScope,assertArtifact,verifyPrevious,verifyPatch} from './check-retrieval-domestic-release.mjs';
test('publication rejects any files outside retrieval startup scope',()=>{
 assertScope(allowed);assertArtifact(payload);
 for(const path of ['forge/image-api.mjs','forge/retrieval.mjs','forge/retrieval-worker.mjs','.github/forge-workflow-lock.json','scripts/check-forge-workflow-lock.mjs']){assert.throws(()=>assertScope([...allowed,path]));assert.throws(()=>assertArtifact([...payload,path]));}
 assert.throws(()=>assertScope(allowed.slice(1)));assert.throws(()=>verifyPrevious(Buffer.from('{}')));
});
test('all old index content outside the exact authorized retrieval regions remains frozen',()=>{
 for(const path of payload){
  const original=path==='forge/index.html'?execFileSync('git',['show','e4dad88d578559f4a56f5eab71a952eb8f8a7433:'+path]):Buffer.alloc(0);
  const candidate=readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n');
  verifyPatch(path,original,candidate);assert.throws(()=>verifyPatch(path,original,candidate+'\n// unexpected modification'));
 }
});
