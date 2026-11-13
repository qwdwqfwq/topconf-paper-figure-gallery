import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {allowed,payload,assertAllowedPaths,assertArtifactDiff,assertFrozenEntry,verifyBlob} from './check-revision-auto-ui-release.mjs';
test('release scope rejects frozen, shared and old acceptance changes',()=>{
 assertAllowedPaths(allowed);
 for(const p of ['forge/index.html','forge/sw.js','forge/image-api.mjs','forge/vendor/pptxgen.min.js','package.json','.github/forge-workflow-lock.json','.github/workflows/forge-workflow-lock.yml','scripts/check-layout-intent-release.mjs','scripts/check-revision-context-release.mjs','scripts/test-revision-context-release.mjs','forge/test-revision-context-online.cjs','scripts/check-forge-workflow-lock.mjs'])assert.throws(()=>assertAllowedPaths([...allowed,p]));
 assert.throws(()=>assertAllowedPaths(allowed.slice(1)));
});
test('published artifact permits exactly the revision editor module',()=>{
 assertArtifactDiff(payload);assert.throws(()=>assertArtifactDiff(payload.slice(1)));assert.throws(()=>assertArtifactDiff([...payload,'forge/index.html']));
});
test('frozen entry must remain byte identical',()=>{
 const before=execFileSync('git',['show','ac4d5b6fcd88d110ae5f1453c9857bcb31438211:forge/index.html'],{maxBuffer:4*1024*1024}),html=execFileSync('git',['show','HEAD:forge/index.html'],{maxBuffer:4*1024*1024});
 assert.equal(execFileSync('git',['hash-object','forge/index.html'],{encoding:'utf8'}),execFileSync('git',['rev-parse','ac4d5b6fcd88d110ae5f1453c9857bcb31438211:forge/index.html'],{encoding:'utf8'}));
 assertFrozenEntry(html,before);assert.throws(()=>assertFrozenEntry(Buffer.concat([html,Buffer.from('changed')]),before));
});
test('all reviewed runtime, test and workflow bytes are pinned',()=>{
 for(const p of allowed.filter(p=>p!=='scripts/check-revision-auto-ui-release.mjs')){const bytes=readFileSync(new URL('../'+p,import.meta.url));verifyBlob(p,bytes);assert.throws(()=>verifyBlob(p,Buffer.concat([bytes,Buffer.from('changed')])));}
 assert.throws(()=>verifyBlob('forge/index.html',Buffer.from('unreviewed')));
});
