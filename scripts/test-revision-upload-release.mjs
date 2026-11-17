import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {allowed,payload,assertScope,assertArtifact,verifyPrevious,verifyReviewed,verifyPatch,baseCommit} from './check-revision-upload-release.mjs';
test('publication rejects missing paths and any unrelated file',()=>{
 assertScope(allowed);assertArtifact(payload);
 for(const bad of [[...allowed,'forge/bitmap-scene.mjs'],allowed.slice(1)])assert.throws(()=>assertScope(bad));
 for(const bad of [[],payload.slice(1),[...payload,'forge/bitmap-composition.mjs']])assert.throws(()=>assertArtifact(bad));
});
test('modified proof, unreviewed files and any extra HTML edit are rejected',()=>{
 assert.throws(()=>verifyPrevious(Buffer.from('{}')));
 assert.throws(()=>verifyReviewed('forge/index.html',Buffer.from('changed')));
 assert.throws(()=>verifyReviewed('forge/bitmap-scene.mjs',Buffer.from('changed')));
 for(const p of payload){const original=p==='forge/revision-upload.mjs'?Buffer.alloc(0):execFileSync('git',['show',baseCommit+':'+p]);const candidate=readFileSync(new URL('../'+p,import.meta.url));verifyPatch(p,original,candidate);assert.throws(()=>verifyPatch(p,original,Buffer.concat([candidate,Buffer.from(' // extra')])));}
 const p='forge/index.html',original=execFileSync('git',['show',baseCommit+':'+p]),candidate=readFileSync(new URL('../'+p,import.meta.url),'utf8');
 for(const [a,b]of [['max_tokens:16000','max_tokens:8000'],['max_tokens:audit.wholeImage?128000','max_tokens:audit.wholeImage?64000'],['sourceWidth','sourceWidthChanged']]){assert.ok(candidate.includes(a));assert.throws(()=>verifyPatch(p,original,Buffer.from(candidate.replace(a,b))));}
});
