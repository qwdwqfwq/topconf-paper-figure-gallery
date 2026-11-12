// Owner-authorized copy-only release; no generation or export changes.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const parent='876958de6a353a7e52e895aba14207956ef86828';
const publishedTree='42eeda4c282e719ee146649f2aaefc9b030c7781';
const module='forge/revision-gallery.mjs';
const online=['forge/i18n_forge.js'];
const check="scripts/check-bitmap-recommend-copy-release-20261112.mjs";
const expected={
  "forge/i18n_forge.js": "9a5f935ff5c61ebb0a1358e1e3211d8d007379bb3808e28bea50133159aa6830",
  ".github/forge-workflow-lock.json": "8dbea5c655c444d765c89f0dbdff4ec47659d33bf8654c334fba64492d0beb72",
  ".github/workflows/deploy.yml": "03c1629d9048eae4e78c458cedb4c83312faa3bed4b3e3ae50e4653b4f163259",
  ".github/workflows/forge-workflow-lock.yml": "40434c555b61e90facd1329a8bba3dbe2d33addb03cee8529e000b0d9a1cef0a"
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
assert.equal(source(revision,online[0]),source(parent+':',online[0]).replace('"mode.image":"AI 位图初稿（需要图像模型）"','"mode.image":"AI 位图初稿（强烈推荐） · 需要图像模型"'),'Only the Chinese bitmap label may change');
const before=JSON.parse(source(parent+':','.github/forge-workflow-lock.json'));
const after=JSON.parse(source(revision,'.github/forge-workflow-lock.json'));
before.files[online[0]]=expected[online[0]];
assert.deepEqual(after,before,'Only the label file hash may change');
const temp=mkdtempSync(join(tmpdir(),'bitmap-recommend-copy-'));
let artifactTree;
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

 for(const path of ['forge/index.html','forge/svg-chat-response.mjs'])indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse',parent+':'+path),path);
 assert.equal(indexGit('write-tree'),publishedTree,'Current live artifact changed');
 for(const path of online)indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse',revision+path),path);
 artifactTree=indexGit('write-tree');
 assert.deepEqual(changed(publishedTree,artifactTree),online,'Only the label file may change online');
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
console.log('Verified copy-only bitmap recommendation release. All other published files unchanged. Artifact tree: '+artifactTree);
