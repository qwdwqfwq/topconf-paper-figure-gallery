import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allowed,assertScope,assertArtifact,verifyPrevious,verifyReviewed} from './check-chat-single-submit-release.mjs';
test('release rejects additions, omissions, frozen files and extra artifact changes',()=>{
 assertScope(allowed);assertArtifact(['forge/chat-api.mjs']);
 for(const bad of [[...allowed,'forge/index.html'],allowed.slice(1)])assert.throws(()=>assertScope(bad));
 for(const bad of [[],['forge/chat-api.mjs','forge/index.html'],['forge/image-api.mjs']])assert.throws(()=>assertArtifact(bad));
});
test('release rejects altered proof and unreviewed implementation',()=>{
 assert.throws(()=>verifyPrevious(Buffer.from('{}')));
 assert.throws(()=>verifyReviewed('forge/chat-api.mjs',Buffer.from('changed')));
 assert.throws(()=>verifyReviewed('forge/index.html',Buffer.from('changed')));
});
