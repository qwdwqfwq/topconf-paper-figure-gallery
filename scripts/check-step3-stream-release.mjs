// Narrow Step 3 publication; original frozen checkers and manifests stay unchanged.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync,mkdirSync,existsSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const anchor='7c86e3ac1825a5cc38e066f5b69dbd89048987db';
const parent='dccaf8602d658858ddcbfc367e4f81956ae460d8';
const online=['forge/revision-gallery.mjs','forge/revision-layout.mjs','forge/revision-scope.mjs'];
const allowed=[".github/workflows/deploy.yml",".github/workflows/forge-workflow-lock.yml","forge/index.html","forge/step3-image-stream.mjs","forge/test-step3-image-stream-browser.cjs","forge/test-step3-image-stream.mjs","scripts/check-step3-stream-release.mjs","scripts/test-step3-stream-release.mjs"];
const payload=['forge/index.html','forge/step3-image-stream.mjs'];
const patches=[{"before":"import {usesInfistarGemini, geminiImageRequest, geminiImageResult, compatibleImageRequest, requestImageWithRecovery, imageFailureKind, fetchBufferedWithTimeout} from './image-api.mjs?v=20261026-nonelinear-resolution';","after":"import {usesInfistarGemini, geminiImageRequest, geminiImageResult, compatibleImageRequest, requestImageWithRecovery, imageFailureKind, fetchBufferedWithTimeout} from './image-api.mjs?v=20261026-nonelinear-resolution';\nimport {requestStep3ImageStream} from './step3-image-stream.mjs?v=20261113';"},{"before":"    r=await requestImageWithRecovery({url:base+endpoint,body,key,\n      usedReferences:usedRefs,allowReferenceFallback:false,\n      onRecovery:kind=>{ if(kind==='reference')recordImageRoute(route,'blocked'); $('#genBtn').textContent=tt('img.recovery.'+kind); }});","after":"    r=await requestStep3ImageStream({url:base+endpoint,body,key,usedReferences:usedRefs});"},{"before":"    if(e.name==='TimeoutError') throw new Error(tt('img.timeout')+apiContext());","after":"    if(/^IMAGE_STREAM_/.test(e.code||'')) throw new Error(tt('img.abnormal',{t:e.message})+apiContext());\n    if(e.name==='TimeoutError') throw new Error(tt('img.timeout')+apiContext());"}];
const expected={
  ".github/workflows/deploy.yml": "7f826b9492d5b35f3a88807aee313eff103dd2d13e888a143fb89095e0c43248",
  ".github/workflows/forge-workflow-lock.yml": "84a4cc18a07cc88e898cd21e38e9efedb01bfc8a99ef5d8f288ae0b265b5c184",
  "forge/index.html": "3f5a0c7ee5916c9207d5dc74b4c406466fdb1d82d39a49c43a7b9f1974b5f868",
  "forge/step3-image-stream.mjs": "759f7fffb249544b92ab07ffaf20ac9db560753ed0cad9cd7b4aced62ae2ee8c",
  "forge/test-step3-image-stream-browser.cjs": "b9be6ef893de886ef6df54cfc5c7c3594277406b0c98beac07196de0fd8c2b02",
  "forge/test-step3-image-stream.mjs": "b034e78e1376314608585c0b7672aae61e93359405564c3fb067374a698a3d1b",
  "scripts/test-step3-stream-release.mjs": "4064ca69cded24f9fbffbe9892cf8de4d92cb52ef5a6d0ad3f6949e1b93fd8bd"
};
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
const changed=(a,b)=>git('diff','--name-only','--no-renames',a,b,'--').split('\n').filter(Boolean).sort();
export function assertAllowedPaths(paths){assert.deepEqual([...paths].sort(),allowed,'Unexpected repository scope');}
export function assertArtifactDiff(paths){assert.deepEqual([...paths].sort(),payload,'Only Step 3 entry and module may change online');}
export function assertIndexIsolation(text,before){let restored=text.replace(/\r\n/g,'\n');for(const patch of [...patches].reverse()){assert.equal(restored.split(patch.after).length,2,'Each reviewed Step 3 patch must occur exactly once');restored=restored.replace(patch.after,patch.before);}assert.equal(restored,before.replace(/\r\n/g,'\n'),'Step 4 or other index code changed');}
export function verifyBlob(path,data){assert.ok(expected[path],'Unreviewed path');assert.equal(createHash('sha256').update(data.toString().replace(/\r\n/g,'\n')).digest('hex'),expected[path],'Unreviewed content: '+path);}
function main(){
 const working=process.argv.includes('--working');
 if(working)assert.equal(git('rev-parse','HEAD'),anchor,'Unexpected working base');
 else{assert.equal(git('show','-s','--format=%P','HEAD'),anchor,'Release must directly follow reviewed production');assert.equal(git('status','--porcelain','--untracked-files=all'),'','Dirty checkout');}
 const paths=working?[...new Set([...git('diff','--name-only','--no-renames',anchor,'--').split('\n').filter(Boolean),...git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean)])]:changed(anchor,'HEAD');
 assertAllowedPaths(paths);
 for(const p of Object.keys(expected))verifyBlob(p,working?readFileSync(join(root,p)):execFileSync('git',['show','HEAD:'+p],{cwd:root}));
 assertIndexIsolation(readFileSync(join(root,'forge/index.html'),'utf8'),execFileSync('git',['show',anchor+':forge/index.html'],{cwd:root,encoding:'utf8'}));
 const temp=mkdtempSync(join(tmpdir(),'step3-stream-'));let proof;
 try{
 const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
 const indexGit=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',env,maxBuffer:40*1024*1024}).trim();
 const module='forge/revision-gallery.mjs';let publishedTree;
 indexGit('read-tree','7e089379d187af99271d0d7de8ae50c2b128dc2f');
 for(const path of ['README.md','forge/assets/nonelinear-wechat.png','forge/index.html','assets/i18n_gallery.js','index.html',module,'forge/svg-revision.mjs']){
  const entry=git('ls-tree','13a7f2ced47384045ac825c9314d42b83c93b2bf','--',path).match(/^(\d+) blob ([0-9a-f]+)\t(.+)$/);
  assert.ok(entry,'Missing live artifact file: '+path);
  indexGit('update-index','--add','--cacheinfo',entry[1],entry[2],path);
 }
 indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','62aefb47c18cda52c888d104824dbe31692d4bd1:'+module),module);
 assert.equal(indexGit('write-tree'),'7ef7838ad7811848ebce633849571e7f01639ff1','Previous deployment tree changed');
 indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','4fa06915b5de8f1c70d5a123126c5c5748e22d9a:'+module),module);
 assert.equal(indexGit('write-tree'),'695949fe22fada46b76f51f13e334baeb8dca679','Previous SVG artifact changed');
 for(const path of ['README.en.md','docs/infistar-banner-en.png'])indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','191ba476717416167b6d89b33cdab4c1ea4d2d3d:'+path),path);
 assert.equal(indexGit('write-tree'),'4c748efe5fba4cc261dfc88392e16974013a85a6','Previous live artifact changed');

 for(const path of ['forge/index.html','forge/svg-chat-response.mjs'])indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','876958de6a353a7e52e895aba14207956ef86828:'+path),path);
 assert.equal(indexGit('write-tree'),'42eeda4c282e719ee146649f2aaefc9b030c7781','Previous SVG artifact changed');
 indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','14ae53dfc7aeb319c0e68b9040252d008189adf3:forge/i18n_forge.js'),'forge/i18n_forge.js');
 indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','5c301e8fffa124baf8b44281e3653d8c154e5bbe:forge/index.html'),'forge/index.html');
 publishedTree=indexGit('write-tree');
 assert.equal(publishedTree,'9c076e2c9bd2c849b4b4e4fa8601629f5b29534d','Previous published composition artifact changed');
 indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','bc9b14ed3d163be31fc92f4283d5927d0d6f6f1e:forge/index.html'),'forge/index.html');
 publishedTree=indexGit('write-tree');
 assert.equal(publishedTree,'df20b7cd7ab2c500a48db58a675217314c9e7028','Current production artifact changed');
 indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','57bd0e97ba9f6929fe8b8157ac9e2c40d7cc5d42:forge/index.html'),'forge/index.html');
 publishedTree=indexGit('write-tree');
 assert.equal(publishedTree,'c92ffebd0c09e70489d8544ce1f970908628d634','Latest production artifact changed');
 for(const path of ['forge/revision-gallery.mjs','forge/revision-layout.mjs','forge/revision-scope.mjs'])indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','0d4d55239511b8b9272b608dfec4b21f1c30b4b9:'+path),path);
 publishedTree=indexGit('write-tree');
 assert.equal(publishedTree,'bd64591aff3ffa9e51ea4f85ed5294c1ac319dd8','Prior production tree changed');

 for(const path of ['forge/index.html','forge/step3-svg-request.mjs'])indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','ced70cedd5c3677ffbf04ccc12a1b24bd57a54ae:'+path),path);
 publishedTree=indexGit('write-tree');
 assert.equal(publishedTree,'fc25cb60dba62cdd865d75d40f6f0d462f94a301','Current live artifact must remain the exact publication base');
 for(const path of ['forge/revision-gallery.mjs','forge/revision-scope.mjs'])indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','4eca06d07545ea58ed484348d594a105b0214e4a:'+path),path);
 publishedTree=indexGit('write-tree');
 assert.equal(publishedTree,'c714b99b7f86d24d6499166f5172202e95374e3e','Preserve latest automatic revision release');
 indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','c0952719a8260346911c9580f8820804a6d55bc7:forge/step3-svg-request.mjs'),'forge/step3-svg-request.mjs');
 publishedTree=indexGit('write-tree');
 assert.equal(publishedTree,'5ef5e16779ac83adb509426d3ec49050ac929fd5','Preserve latest deployed Step 3 module and all other published bytes');
 for(const path of ['forge/revision-layout.mjs','forge/revision-scope.mjs'])indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','aa2554d5603940bbb4cd0e18848a776114268138:'+path),path);
 publishedTree=indexGit('write-tree');
 assert.equal(publishedTree,'c54c45a4402bff2d59eacbcb5e787f68adf5b078','Preserve the deployed provider release');
 for(const path of ['forge/revision-layout.mjs','forge/revision-scope.mjs'])indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','c0952719a8260346911c9580f8820804a6d55bc7:'+path),path);
 publishedTree=indexGit('write-tree');
 assert.equal(publishedTree,'f1596ba52b884d2f42d8b5b7f4c725a9b973a2c5','Preserve the latest deployed artifact');
 for(const path of ['forge/index.html','forge/revision-gallery.mjs'])indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','807078851d9aaae46c12e080bfb8950a9bfaa65e:'+path),path);
 for(const path of ['forge/revision-gallery.mjs','forge/revision-layout.mjs','forge/revision-scope.mjs'])indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','d7e958b03326d731b1b7b9639a279a0ab145f4e6:'+path),path);
 publishedTree=indexGit('write-tree');
 assert.equal(publishedTree,'8e01759b561cb77480ee33f66654247b16748f0d','Preserve the exact latest deployed artifact');
 for(const path of ['forge/revision-gallery.mjs','forge/revision-layout.mjs','forge/revision-scope.mjs'])indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','7e639d6c1fb6140f9a117531eebfa7b81bbedb47:'+path),path);
 publishedTree=indexGit('write-tree');
 assert.equal(publishedTree,'460da76a57871d7a58cc33a21ca7ce7439f403fb','Preserve preceding deployed panel release');
 for(const path of online)indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','53044faba55f4d203d09c3aa445835508c854029:'+path),path);
 publishedTree=indexGit('write-tree');
 assert.equal(publishedTree,'43e89ba614e6b4676ad0aaec55444f647366f0ac','Preserve preceding deployed draft release');
 for(const path of online)indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse',parent+':'+path),path);
 publishedTree=indexGit('write-tree');
 assert.equal(publishedTree,'0a8ac822ebe084c2bcc40d0738f1968bcc3285c3','Preserve exact currently published bytes');

 // Reconstruct the exact artifact deployed by successful production run 43283126959.
 for(const path of online)indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','47d648d65f26b2f86ae7e05c041d4aad35025c8a:'+path),path);
 publishedTree=indexGit('write-tree');
 assert.equal(publishedTree,'0ce42f189f81de0c6c2575485233e99c8b4e7ffd','Exact successful production artifact required');

 for(const path of ['forge/revision-layout.mjs','forge/revision-pixels.mjs','forge/revision-scope.mjs'])indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','e25b969c8f631efcf14a7acbaa1cdca006b5e901:'+path),path);
 publishedTree=indexGit('write-tree');
 assert.equal(publishedTree,'2a0bfddbb797e7b1a6bb5ff4467aaac283418a58','Preserve successful production run 43317525556');

 for(const path of ['forge/index.html','forge/infistar-reconstruction-responses.mjs'])indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse',anchor+':'+path),path);
 publishedTree=indexGit('write-tree');
 assert.equal(publishedTree,'25621eca5f1c6a58508917b9d71669ec6c3a4dfe','Preserve successful production run 43417139595');

 for(const p of payload){const blob=working?git('hash-object','-w',p):git('rev-parse','HEAD:'+p);indexGit('update-index','--add','--cacheinfo','100644',blob,p);}
 const artifactTree=indexGit('write-tree');assertArtifactDiff(changed(publishedTree,artifactTree));
 const entries=git('ls-tree','-r',artifactTree).split('\n').filter(Boolean).map(line=>{const m=line.match(/^(\d+) blob ([0-9a-f]+)\t(.+)$/);assert.ok(m,'Unsupported entry');return {mode:m[1],blob:m[2],path:m[3]};});
 proof={independentAcceptance:true,originalFrozenCheck:'Unchanged; original failure remains separately visible',productionRun:43417139595,anchor,publishedTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,step4IndexIsolation:true,entries};
 if(process.argv.includes('--prepare-pages')){
  assert.equal(working,false);assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
  const output='/tmp/isolated-step3-stream-pages';assert.equal(existsSync(output),false,'Refuse overwrite');mkdirSync(output);indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
  for(const e of entries){assert.ok(['100644','100755'].includes(e.mode),'Symlinks forbidden');const b=readFileSync(join(output,e.path));assert.equal(createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex'),e.blob,'Artifact mismatch: '+e.path);}
  writeFileSync('/tmp/isolated-step3-stream-proof.json',JSON.stringify(proof,null,2));assert.equal(git('status','--porcelain','--untracked-files=all'),'','Export changed checkout');
 }
 }finally{rmSync(temp,{recursive:true,force:true});}
 console.log(JSON.stringify({...proof,entries:undefined}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
