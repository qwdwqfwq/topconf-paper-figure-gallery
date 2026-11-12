// Isolated automatic revision scope release. Original checkers and frozen baselines are unchanged.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const base="47b19a8c8853cd31211600ca7c790a0920db7131";
const parent="9b8d19f358c140ff44b9bb2533e7a568497878ce";
const online=["forge/revision-gallery.mjs", "forge/revision-scope.mjs"];
const check="scripts/check-revision-auto-scope-release-20261112.mjs";
const expected={
  "forge/revision-gallery.mjs": "ca27668f732dc4243ec5c06bea039207857a18cb52effae222b4e66952ceb9eb",
  "forge/revision-scope.mjs": "683fcd2a905555c39b986cd5b47e3f90e81a549516f830156b502cad8bc88947",
  ".github/workflows/deploy.yml": "539975cf3f1ad110798d6ed14f77a270cd0d2fd7549ae156b19a669788e22c22",
  ".github/workflows/forge-workflow-lock.yml": "2cceecf5d7bf959841c418d0ba51b0f65ee81c36489218575c634349c3dad0db"
};
const changed=(...args)=>git('diff','--name-only','--no-renames',...args,'--').split('\n').filter(Boolean).sort();
const staged=process.argv.includes('--staged');
const revision=staged?':':'HEAD:';
assert.equal(staged?git('rev-parse','HEAD'):git('show','-s','--format=%P','HEAD'),parent,'Unexpected release parent');
assert.equal(git('show','-s','--format=%P',parent),base,'Unexpected initial release parent');
assert.deepEqual(changed(...(staged?['--cached',parent]:[parent,'HEAD'])),[check],'Only the new release checker may change in the correction');
assert.deepEqual(changed(...(staged?['--cached',base]:[base,'HEAD'])),[...Object.keys(expected),check].sort(),'Unexpected release scope');
assert.equal(git('status','--porcelain','--untracked-files=all').split('\n').filter(Boolean).length,staged?1:0,'Unexpected working tree changes');
for(const [path,hash] of Object.entries(expected)){
 const committed=execFileSync('git',['show',revision+path],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
 assert.equal(createHash('sha256').update(committed).digest('hex'),hash,'Unreviewed patch: '+path);
 assert.equal(readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n'),committed,'Unstaged change: '+path);
}
// The exact commit diff above excludes every existing checker, lock, baseline and Step 4 file.
const temp=mkdtempSync(join(tmpdir(),'revision-auto-artifact-'));
let artifactTree,publishedTree;
try{
 const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
 const indexGit=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',env}).trim();
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
 for(const path of online)indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse',revision+path),path);
 artifactTree=indexGit('write-tree');
 assert.deepEqual(changed(publishedTree,artifactTree),[...online].sort(),'Only two independent revision modules may change online');
}finally{rmSync(temp,{recursive:true,force:true});}
if(process.argv.includes('--prepare-pages')){
 assert.equal(process.env.GITHUB_ACTIONS,'true');
 assert.equal(process.env.GITHUB_REF,'refs/heads/main');
 assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
 git('restore','--ignore-skip-worktree-bits','--source='+publishedTree,'--staged','--worktree','--','.');
 git('restore','--ignore-skip-worktree-bits','--source=HEAD','--staged','--worktree','--',...online);
 assert.equal(git('write-tree'),artifactTree,'Unexpected published artifact');
 assert.deepEqual(changed('--cached',publishedTree),[...online].sort(),'Unexpected online changes');
 git('diff','--exit-code');
}
console.log(JSON.stringify({verified:true,publishedTree,artifactTree,online}));
