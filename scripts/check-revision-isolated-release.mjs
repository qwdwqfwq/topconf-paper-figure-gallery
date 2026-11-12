// Independent revision-only publication acceptance. Original frozen checkers and manifests remain unchanged.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync,mkdirSync,existsSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const anchor='47d648d65f26b2f86ae7e05c041d4aad35025c8a';
const parent='dccaf8602d658858ddcbfc367e4f81956ae460d8';
const online=['forge/revision-gallery.mjs','forge/revision-layout.mjs','forge/revision-scope.mjs'];
const payload=['forge/revision-layout.mjs','forge/revision-pixels.mjs','forge/revision-scope.mjs'];
const allowed=[...payload,'.github/workflows/deploy.yml','.github/workflows/forge-workflow-lock.yml','forge/test-revision-compact.cjs','forge/fixtures/revision-connected-panel.json','forge/fixtures/revision-real-panel-inventory.json','scripts/check-revision-isolated-release.mjs','scripts/test-revision-isolated-release.mjs'].sort();
const expected={
  "forge/revision-layout.mjs": "44c2dc7ab8063ca9c0b3eb2896ef451c2083f79f6bc41849548fe7d98b92ca1e",
  "forge/revision-pixels.mjs": "6cd6ab383a9bcd4087f6ef5df98da305a5cf12da6fe221ba85ba064587932d2b",
  "forge/revision-scope.mjs": "408104e68cef944ae4c191ff523d9c3ce710819ee8823ba52ba88720d27d45b2",
  ".github/workflows/deploy.yml": "4579d4b271cce387e74602b749398365d6f63e777e93ed1154d10a4a34ee9cfc",
  ".github/workflows/forge-workflow-lock.yml": "6b1240faf390a355a8f7f0cb8f62978002b0d367abbdd3ae53db3c067a1b9adb",
  "forge/test-revision-compact.cjs": "665e0cbf3dfdad9f704b16a847616c926c1a7282be7eb229bbd994624bbef869",
  "forge/fixtures/revision-connected-panel.json": "dbf19bea4fd5231b305125ae62227d22edbd671b2ccbe9294a2359fe0a208412",
  "forge/fixtures/revision-real-panel-inventory.json": "2b53561f43ff13ed6e61114893377cfaae44c013e470facf5c8dff423e4e2fcb",
  "scripts/test-revision-isolated-release.mjs": "d7138f4b94e64c8ad5961278e1fb163381351c2e5eb01776e6e0eed576450231"
};
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024}).trim();
const changed=(a,b)=>git('diff','--name-only','--no-renames',a,b,'--').split('\n').filter(Boolean).sort();
export function assertAllowedPaths(paths){assert.deepEqual([...paths].sort(),allowed,'Unexpected repository release scope: frozen/shared changes are forbidden');}
export function assertArtifactDiff(paths){assert.deepEqual([...paths].sort(),payload,'Only three isolated revision modules may change online');}
export function verifyBlob(path,data){assert.ok(expected[path],'No reviewed content hash: '+path);assert.equal(createHash('sha256').update(data.toString().replace(/\r\n/g,'\n')).digest('hex'),expected[path],'Unreviewed release content: '+path);}
function main(){
 const working=process.argv.includes('--working');
 if(working)assert.equal(git('rev-parse','HEAD'),anchor,'Unexpected working base');
 else {assert.equal(git('show','-s','--format=%P','HEAD'),anchor,'Release must directly follow the reviewed production anchor');assert.equal(git('status','--porcelain','--untracked-files=all'),'','Dirty release checkout');}
 const paths=working?[...new Set([...git('diff','--name-only','--no-renames',anchor,'--').split('\n').filter(Boolean),...git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean)])]:changed(anchor,'HEAD');
 assertAllowedPaths(paths);
 for(const path of Object.keys(expected))verifyBlob(path,working?readFileSync(join(root,path)):execFileSync('git',['show','HEAD:'+path],{cwd:root}));
 // Unmodified original checker and baseline are included in the exhaustive repository diff above.
 for(const path of ['scripts/check-forge-workflow-lock.mjs','.github/forge-workflow-lock.json','forge/index.html','forge/sw.js','package.json','package-lock.json']){
  const entry=git('ls-tree',anchor,'--',path);if(!entry)continue;
  assert.equal(git('rev-parse',anchor+':'+path),git('rev-parse','HEAD:'+path),'Protected anchor blob changed: '+path);
 }
 const temp=mkdtempSync(join(tmpdir(),'revision-isolated-'));
 let artifactTree,publishedTree,proof;
 try{
 const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
 const indexGit=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',env,maxBuffer:32*1024*1024}).trim();
  const module='forge/revision-gallery.mjs';
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
 for(const path of online)indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse',anchor+':'+path),path);
 publishedTree=indexGit('write-tree');
 assert.equal(publishedTree,'0ce42f189f81de0c6c2575485233e99c8b4e7ffd','Exact successful production artifact required');
 for(const path of payload){const blob=working?git('hash-object','-w',path):git('rev-parse','HEAD:'+path);indexGit('update-index','--add','--cacheinfo','100644',blob,path);}
 artifactTree=indexGit('write-tree');
 assertArtifactDiff(changed(publishedTree,artifactTree));
 const entries=git('ls-tree','-r',artifactTree).split('\n').filter(Boolean).map(line=>{const m=line.match(/^(\d+) blob ([0-9a-f]+)\t(.+)$/);assert.ok(m,'Unsupported artifact entry');return {mode:m[1],blob:m[2],path:m[3]};});
 proof={independentAcceptance:true,originalFrozenCheck:'NOT reclassified; see separate original_lock step and local freeze report',productionRun:43283126959,anchor,publishedTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,entries};
 if(process.argv.includes('--prepare-pages')){
  assert.equal(working,false);assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
  const output='/tmp/isolated-revision-pages';assert.equal(existsSync(output),false,'Refuse to overwrite an artifact directory');mkdirSync(output);
  indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
  for(const entry of entries){assert.ok(['100644','100755'].includes(entry.mode),'Symlink forbidden');const b=readFileSync(join(output,entry.path));assert.equal(createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex'),entry.blob,'Artifact byte mismatch: '+entry.path);}
  writeFileSync('/tmp/isolated-revision-proof.json',JSON.stringify(proof,null,2));
  assert.equal(git('status','--porcelain','--untracked-files=all'),'','Artifact export changed source checkout');
 }
 }finally{rmSync(temp,{recursive:true,force:true});}
 console.log(JSON.stringify({...proof,entries:undefined}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
