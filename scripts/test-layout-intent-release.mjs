import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {allowed,payload,assertAllowedPaths,assertArtifactDiff,assertEntryIsolation,verifyBlob} from './check-layout-intent-release.mjs';
test('layout release rejects changes to frozen paths or missing reviewed files',()=>{
 assertAllowedPaths(allowed);
 for(const p of ['forge/image-api.mjs','forge/revision-pixels.mjs','forge/infistar-reconstruction-stream.mjs','forge/vendor/pptxgen.min.js','forge/sw.js','package.json','scripts/check-error-recovery-release.mjs','.github/forge-workflow-lock.json'])assert.throws(()=>assertAllowedPaths([...allowed,p]));
 assert.throws(()=>assertAllowedPaths(allowed.slice(1)));
});
test('online artifact contains exactly five revision runtime changes',()=>{
 assertArtifactDiff(payload);
 assert.throws(()=>assertArtifactDiff([...payload,'forge/image-api.mjs']));
 assert.throws(()=>assertArtifactDiff(payload.slice(1)));
});
test('shared entry files allow only the precise revision cache query',()=>{
 for(const p of ['forge/index.html','forge/revision-gallery.mjs']){
  const text=readFileSync(new URL('../'+p,import.meta.url),'utf8');
  const before=execFileSync('git',['show','6239f015089099ba187020e8d4173d6a20db093c:'+p],{encoding:'utf8',maxBuffer:4*1024*1024});
  assertEntryIsolation(text,before,p);
  for(const changed of [text+'\n// unrelated',text.replace('20261114-layout','unexpected')])assert.throws(()=>assertEntryIsolation(changed,before,p));
 }
});
test('all reviewed contents are pinned and reject modified bytes',()=>{
 for(const p of allowed.filter(p=>p!=='scripts/check-layout-intent-release.mjs')){
  const bytes=readFileSync(new URL('../'+p,import.meta.url));verifyBlob(p,bytes);
  assert.throws(()=>verifyBlob(p,Buffer.concat([bytes,Buffer.from('changed')])));
 }
 assert.throws(()=>verifyBlob('forge/image-api.mjs',Buffer.from('unreviewed')));
});
