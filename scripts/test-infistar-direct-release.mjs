import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {allowed,assertScope,assertArtifact,verifyPrevious,verifyReviewed,verifyPatch,baseCommit} from './check-infistar-direct-release.mjs';
import {usesInfistarImageJob} from '../forge/step3-infistar-job.mjs';
test('only one online module and exact authorized release files',()=>{
 assertScope(allowed);assertArtifact(['forge/step3-infistar-job.mjs']);
 for(const bad of [[...allowed,'forge/index.html'],allowed.slice(1)])assert.throws(()=>assertScope(bad));
 for(const bad of [[],['forge/index.html'],['forge/step3-infistar-job.mjs','forge/revision-gallery.mjs']])assert.throws(()=>assertArtifact(bad));
});
test('proof, unreviewed content and extra patch edits are rejected',()=>{
 assert.throws(()=>verifyPrevious(Buffer.from('{}')));
 assert.throws(()=>verifyReviewed('forge/step3-infistar-job.mjs',Buffer.from('changed')));
 assert.throws(()=>verifyReviewed('forge/index.html',Buffer.from('changed')));
 const original=execFileSync('git',['show',baseCommit+':forge/step3-infistar-job.mjs']);
 const candidate=readFileSync(new URL('../forge/step3-infistar-job.mjs',import.meta.url));
 verifyPatch(original,candidate);assert.throws(()=>verifyPatch(original,Buffer.concat([candidate,Buffer.from(' // extra')])));
});
test('Infistar direct while Nonelinear and existing provider routing are retained',()=>{
 for(const host of ['infistar.cc','www.infistar.cc','infistar.ai','www.infistar.ai'])for(const path of ['/v1/images/generations','/v1beta/models/gemini-nano-banana-2.1:generateContent','/v1beta/models/gemini-nano-banana-2.1:streamGenerateContent?alt=sse'])assert.equal(usesInfistarImageJob('https://'+host+path),false);
 for(const host of ['api.nonelinear.com.cn','gallery-nonelinear-relay.lixiao-gallery.workers.dev'])assert.equal(usesInfistarImageJob('https://'+host+'/v1/images/generations'),true);
 for(const p of ['/v1/images/generations','/v1/images/edits'])assert.equal(usesInfistarImageJob('https://api.openai.com'+p),true);
 for(const u of ['https://other.invalid/v1/images/generations','http://infistar.ai/v1/images/generations','https://api.nonelinear.com.cn/v1/images/generations?unapproved=1'])assert.equal(usesInfistarImageJob(u),false);
});
