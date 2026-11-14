import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {allowed,payload,anchor,publishedTree,assertAllowedPaths,assertArtifactDiff,assertFrozenEntry,verifyBlob} from './check-step3-revision-stream-release.mjs';
const root=new URL('..',import.meta.url);
test('scope rejects index, shared modules, original locks, guards and missing files',()=>{
 assertAllowedPaths(allowed);
 for(const p of ['forge/index.html','forge/sw.js','forge/image-api.mjs','forge/step3-image-stream.mjs','forge/reconstruction-core.mjs','forge/vendor/pptxgen.bundle.js','.github/forge-workflow-lock.json','.github/workflows/deploy.yml','scripts/check-step4-bitmap-freeze.mjs','scripts/check-step3-image-jobs-release.mjs','scripts/test-step3-image-jobs-release.mjs'])assert.throws(()=>assertAllowedPaths([...allowed,p]));
 assert.throws(()=>assertAllowedPaths(allowed.slice(1)));assert.throws(()=>assertAllowedPaths([...allowed,allowed[0]]));
});
test('online tree replaces exactly the single approved module',()=>{
 assertArtifactDiff(payload);assert.throws(()=>assertArtifactDiff([]));
 for(const p of allowed.filter(p=>!payload.includes(p)).concat(['forge/index.html','forge/sw.js','forge/reconstruction-core.mjs']))assert.throws(()=>assertArtifactDiff([...payload,p]));
});
test('frozen index remains byte identical to current production source',()=>{
 const before=execFileSync('git',['show',anchor+':forge/index.html'],{cwd:root,maxBuffer:40*1024*1024});
 const after=readFileSync(new URL('../forge/index.html',import.meta.url));
 // Git checks out CRLF on Windows; no source or artifact content may differ.
 assertFrozenEntry(before.toString().replace(/\r\n/g,'\n'),after.toString().replace(/\r\n/g,'\n'));
 assert.throws(()=>assertFrozenEntry(before.toString(),before.toString()+'\n'));
 assert.match(publishedTree,/^[a-f0-9]{40}$/);
});
test('reviewed code, fixture tests and new release files are content pinned',()=>{
 for(const p of allowed.filter(p=>p!=='scripts/check-step3-revision-stream-release.mjs')){
  const bytes=readFileSync(new URL('../'+p,import.meta.url));verifyBlob(p,bytes);assert.throws(()=>verifyBlob(p,Buffer.concat([bytes,Buffer.from('changed')])));
 }
 assert.throws(()=>verifyBlob('forge/index.html',Buffer.from('changed')));
});
