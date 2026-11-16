import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allowed,assertScope,assertArtifact,verifyPrevious,verifyReviewed} from './check-infistar-initial-route-release.mjs';
test('release rejects additions, omissions, frozen files and extra artifact changes',()=>{
 assertScope(allowed);assertArtifact(["forge/step3-initial-image-job.mjs","forge/step3-international-image-route.mjs"]);
 for(const bad of [[...allowed,'forge/index.html'],allowed.slice(1)])assert.throws(()=>assertScope(bad));
 for(const bad of [[],['forge/step3-initial-image-job.mjs','forge/index.html'],['forge/image-api.mjs']])assert.throws(()=>assertArtifact(bad));
});
test('release rejects altered proof and unreviewed implementation',()=>{
 assert.throws(()=>verifyPrevious(Buffer.from('{}')));
 assert.throws(()=>verifyReviewed('forge/step3-initial-image-job.mjs',Buffer.from('changed')));
 assert.throws(()=>verifyReviewed('forge/index.html',Buffer.from('changed')));
});
