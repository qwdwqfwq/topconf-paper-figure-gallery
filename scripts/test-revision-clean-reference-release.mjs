import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {allowed,payload,assertScope,assertArtifact,verifyPrevious,verifyPatch} from './check-revision-clean-reference-release.mjs';
test('only the isolated reference patch is publishable',()=>{assertScope(allowed);assertArtifact(payload);for(const p of ['forge/index.html','forge/image-api.mjs','forge/revision-gallery.mjs','forge/sw.js','.github/forge-workflow-lock.json']){assert.throws(()=>assertScope([...allowed,p]));assert.throws(()=>assertArtifact([...payload,p]));}assert.throws(()=>assertScope(allowed.slice(1)));assert.throws(()=>verifyPrevious(Buffer.from('{}')));});
test('exact reviewed patch, unchanged source and any extra edit are distinguished',()=>{const p=payload[0];const original=execFileSync('git',['show','878022a63a36d1ce11aad3a62e41f3fc3b4a3842:'+p]);const candidate=readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n');verifyPatch(p,original,candidate);assert.throws(()=>verifyPatch(p,original,original));assert.throws(()=>verifyPatch(p,original,candidate+'\n// extra'));assert.throws(()=>verifyPatch('forge/index.html',original,candidate));});
