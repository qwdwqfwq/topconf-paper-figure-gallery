import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {allowed,payload,assertAllowedPaths,assertArtifactDiff,assertIndexIsolation,verifyBlob} from './check-error-recovery-release.mjs';
test('release scope rejects frozen/shared/unrelated changes and missing reviewed files',()=>{
 assertAllowedPaths(allowed);
 for(const p of ['forge/image-api.mjs','forge/vendor/pptxgen.min.js','forge/sw.js','package.json','scripts/check-step3-stream-release.mjs','.github/forge-workflow-lock.json'])assert.throws(()=>assertAllowedPaths([...allowed,p]));
 assert.throws(()=>assertAllowedPaths(allowed.slice(1)));
});
test('artifact scope permits exactly seven unlocked runtime files',()=>{
 assertArtifactDiff(payload);
 assert.throws(()=>assertArtifactDiff([...payload,'forge/image-api.mjs']));
 assert.throws(()=>assertArtifactDiff(payload.slice(1)));
});
test('whole-file inverse comparison rejects changes outside unlocked index hunks',()=>{
 const html=readFileSync(new URL('../forge/index.html',import.meta.url),'utf8');
 const before=execFileSync('git',['show','deac1d601fa36c42ea09bf5e33cab280db130a33:forge/index.html'],{encoding:'utf8',maxBuffer:4*1024*1024});
 assertIndexIsolation(html,before);
 for(const changed of [html+'\n<!-- unrelated -->',html.replace('requestEditableScene(', 'changedScene('),html.replace('20261114-errors','unexpected')])assert.throws(()=>assertIndexIsolation(changed,before));
});
test('reviewed payload hashes reject modified code and unreviewed paths',()=>{
 for(const p of allowed.filter(p=>p!=='scripts/check-error-recovery-release.mjs')){
  const data=readFileSync(new URL('../'+p,import.meta.url));verifyBlob(p,data);
  assert.throws(()=>verifyBlob(p,Buffer.concat([data,Buffer.from('changed')])));
 }
 assert.throws(()=>verifyBlob('forge/image-api.mjs',Buffer.from('unreviewed')));
});
