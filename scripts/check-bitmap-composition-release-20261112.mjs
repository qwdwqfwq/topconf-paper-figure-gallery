// Owner-authorized Step 3 composition prompt fix; every other published byte is preserved.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const parent='14ae53dfc7aeb319c0e68b9040252d008189adf3';
const previousTree='42eeda4c282e719ee146649f2aaefc9b030c7781';
const module='forge/revision-gallery.mjs';
const online=['forge/index.html'];
const check="scripts/check-bitmap-composition-release-20261112.mjs";
const expected={
  "forge/index.html": "25db5780632fa0262a396f35b7ebfd901675f1dd38ea673f9b0ea63f9956ee11",
  "forge/test-bitmap-composition.mjs": "2ad1f5fe6ef5f762fd77cab42dc5c5f4df81418ae37511f05b57063b527165d1",
  ".github/workflows/deploy.yml": "df81ceeed34401f4e97f6aa8a6d2bfa640df0e55408b023ea64c4cf9dafcfad4",
  ".github/workflows/forge-workflow-lock.yml": "4acaa953868944eb53f529b441f7bcb0c844c106d2b0339a4210778e9a33860d"
};
const changed=(...args)=>git('diff','--name-only','--no-renames',...args,'--').split('\n').filter(Boolean).sort();
const staged=process.argv.includes('--staged');
const revision=staged?':':'HEAD:';
assert.equal(staged?git('rev-parse','HEAD'):git('show','-s','--format=%P','HEAD'),parent,'Unexpected release parent');
assert.deepEqual(changed(...(staged?['--cached',parent]:[parent,'HEAD'])),[...Object.keys(expected),check].sort(),'Unexpected release scope');
assert.equal(git('status','--porcelain','--untracked-files=all').split('\n').filter(Boolean).length,staged?5:0,'Unexpected working tree changes');
for(const [path,hash] of Object.entries(expected)){
 const committed=execFileSync('git',['show',revision+path],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
 assert.equal(createHash('sha256').update(committed).digest('hex'),hash,'Unreviewed patch: '+path);
 assert.equal(readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n'),committed,'Unstaged change: '+path);
}
const source=(ref,path)=>execFileSync('git',['show',ref+path],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
// These are the only two bitmap prompt-building regions allowed to change.
const stripBitmapPrompts=text=>text
 .replace(/function compactImageGuide\(j\)\{[\s\S]*?(?=function selectImageRoute\()/,'')
 .replace(/  const guide = layoutGuide[\s\S]*?(?=\n  let body;)/,'');
assert.equal(stripBitmapPrompts(source(revision,'forge/index.html')),stripBitmapPrompts(source(parent+':','forge/index.html')),'Code outside bitmap prompt construction changed');
assert.equal(source(revision,'.github/forge-workflow-lock.json'),source(parent+':','.github/forge-workflow-lock.json'),'Frozen workflow baseline must remain unchanged');
const temp=mkdtempSync(join(tmpdir(),'bitmap-composition-'));
let artifactTree,publishedTree;
try{
 const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
 const indexGit=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',env}).trim();
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
 assert.equal(indexGit('write-tree'),previousTree,'Previous SVG artifact changed');
 indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse',parent+':forge/i18n_forge.js'),'forge/i18n_forge.js');
 publishedTree=indexGit('write-tree');
 for(const path of online)indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse',revision+path),path);
 artifactTree=indexGit('write-tree');
 assert.deepEqual(changed(publishedTree,artifactTree),online,'Only the bitmap prompt file may change online');
}finally{rmSync(temp,{recursive:true,force:true});}
if(process.argv.includes('--prepare-pages')){
 assert.equal(process.env.GITHUB_ACTIONS,'true');
 assert.equal(process.env.GITHUB_REF,'refs/heads/main');
 assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
 git('restore','--ignore-skip-worktree-bits','--source='+publishedTree,'--staged','--worktree','--','.');
 git('restore','--ignore-skip-worktree-bits','--source=HEAD','--staged','--worktree','--',...online);
 assert.equal(git('write-tree'),artifactTree,'Unexpected published artifact');
 assert.deepEqual(changed('--cached',publishedTree),online,'Unexpected online changes');
 git('diff','--exit-code');
}
console.log('Verified isolated bitmap composition release. Step 4, model calls, dimensions, retries and every other published file unchanged. Artifact tree: '+artifactTree);
