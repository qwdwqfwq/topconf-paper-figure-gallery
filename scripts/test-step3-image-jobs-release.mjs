import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {allowed,payload,anchor,assertAllowedPaths,assertArtifactDiff,assertEntryIsolation,assertManifestScope,verifyBlob} from './check-step3-image-jobs-release.mjs';
const root=new URL('..',import.meta.url);
const previous=execFileSync('git',['show',anchor+':forge/index.html'],{cwd:root,encoding:'utf8',maxBuffer:40*1024*1024});
const current=readFileSync(new URL('../forge/index.html',import.meta.url),'utf8');
test('release scope rejects shared code, old guards and any missing approved file',()=>{
 assertAllowedPaths(allowed);
 for(const p of ['forge/sw.js','forge/image-api.mjs','forge/aspect-ratio.mjs','forge/editable-native.mjs','forge/reconstruction-core.mjs','forge/vendor/pptxgen.bundle.js','package.json','.github/workflows/deploy.yml','scripts/check-step4-bitmap-freeze.mjs','scripts/check-step3-request-release.mjs','forge/test-step3-image-stream-browser.cjs'])assert.throws(()=>assertAllowedPaths([...allowed,p]));
 assert.throws(()=>assertAllowedPaths(allowed.slice(1)));
});
test('online artifact changes exactly the entry plus three private Step 3 modules',()=>{
 assertArtifactDiff(payload);assert.throws(()=>assertArtifactDiff([]));
 for(const p of allowed.filter(p=>!payload.includes(p)).concat(['forge/sw.js','forge/reconstruction-core.mjs']))assert.throws(()=>assertArtifactDiff([...payload,p]));
});
test('Step 4 and every unapproved entry region stay identical to production',()=>{
 assertEntryIsolation(previous,current);
 for(const edited of [current+'\n// unauthorized',current.replace('  await revisionGallery.addInitial({image:exportImgSrc','  await revisionGallery.addInitial({image:changed'),current.replace("$('#model').onchange","$('#model').oninput"),current.replace("import {", "// removed import\nimport {")])assert.throws(()=>assertEntryIsolation(previous,edited));
 assert.throws(()=>assertEntryIsolation(previous,current.replace(/^import .*step3-image-capabilities.*$/m,'')));
});
test('only four explicitly approved manifest records may change',()=>{
 const before=JSON.parse(execFileSync('git',['show',anchor+':.github/forge-workflow-lock.json'],{cwd:root,encoding:'utf8'}));
 const after=JSON.parse(readFileSync(new URL('../.github/forge-workflow-lock.json',import.meta.url),'utf8'));
 assertManifestScope(before,after);
 for(const changed of [(()=>{const a=structuredClone(after);a.files['forge/image-api.mjs']='a'.repeat(64);return a;})(),(()=>{const a=structuredClone(after);a.description+=' changed';return a;})()])assert.throws(()=>assertManifestScope(before,changed));
});
test('all reviewed implementation, tests, backend and release files are pinned',()=>{
 for(const p of allowed.filter(p=>p!=='scripts/check-step3-image-jobs-release.mjs')){
  const bytes=readFileSync(new URL('../'+p,import.meta.url));verifyBlob(p,bytes);assert.throws(()=>verifyBlob(p,Buffer.concat([bytes,Buffer.from('changed')])));
 }
 assert.throws(()=>verifyBlob('unreviewed',Buffer.from('changed')));
});
