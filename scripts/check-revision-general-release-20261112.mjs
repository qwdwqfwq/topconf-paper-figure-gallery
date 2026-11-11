// Owner-authorized isolated general Gemini revision release. Existing freeze checks remain intact.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const parent='62aefb47c18cda52c888d104824dbe31692d4bd1';
const publishedTree='7ef7838ad7811848ebce633849571e7f01639ff1';
const module='forge/revision-gallery.mjs';
const check='scripts/check-revision-general-release-20261112.mjs';
const expected={
  "forge/revision-gallery.mjs": "4f48ddc9fc2ca9e56129e2b312f2ef53d53b69947831e3c1571dad00e88de64e",
  ".github/workflows/deploy.yml": "02d6caed576b1d345f718b293ade183b04782d02b8e705e268e3f0f52906651d",
  ".github/workflows/forge-workflow-lock.yml": "e5e187052ba34d2d56307581480c722cccfd5ff883a0123eff976d1836093931"
};
const changed=(...args)=>git('diff','--name-only','--no-renames',...args,'--').split('\n').filter(Boolean).sort();
const staged=process.argv.includes('--staged');
const revision=staged?':':'HEAD:';
assert.equal(staged?git('rev-parse','HEAD'):git('show','-s','--format=%P','HEAD'),parent,'Unexpected release parent');
assert.deepEqual(changed(...(staged?['--cached',parent]:[parent,'HEAD'])),[...Object.keys(expected),check].sort(),'Unexpected release scope');
assert.equal(git('status','--porcelain','--untracked-files=all').split('\n').filter(Boolean).length,staged?4:0,'Unexpected working tree changes');
for(const [path,hash] of Object.entries(expected)){
 const committed=execFileSync('git',['show',revision+path],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
 assert.equal(createHash('sha256').update(committed).digest('hex'),hash,'Unreviewed patch: '+path);
 assert.equal(readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n'),committed,'Unstaged change: '+path);
}
const temp=mkdtempSync(join(tmpdir(),'revision-general-release-'));
let artifactTree;
try{
 const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
 const indexGit=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',env}).trim();
 // Rebuild the live artifact from reachable commits, excluding unrelated pending source changes.
 indexGit('read-tree','7e089379d187af99271d0d7de8ae50c2b128dc2f');
 for(const path of ['README.md','forge/assets/nonelinear-wechat.png','forge/index.html','assets/i18n_gallery.js','index.html',module,'forge/svg-revision.mjs']){
  const entry=git('ls-tree','13a7f2ced47384045ac825c9314d42b83c93b2bf','--',path).match(/^(\d+) blob ([0-9a-f]+)\t(.+)$/);
  assert.ok(entry,'Missing live artifact file: '+path);
  indexGit('update-index','--add','--cacheinfo',entry[1],entry[2],path);
 }
 indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse',parent+':'+module),module);
 assert.equal(indexGit('write-tree'),publishedTree,'Previous deployment tree changed');
 indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse',revision+module),module);
 artifactTree=indexGit('write-tree');
 assert.deepEqual(changed(publishedTree,artifactTree),[module],'Only the independent revision module may change online');
}finally{rmSync(temp,{recursive:true,force:true});}
if(process.argv.includes('--prepare-pages')){
 assert.equal(process.env.GITHUB_ACTIONS,'true');
 assert.equal(process.env.GITHUB_REF,'refs/heads/main');
 assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
 git('restore','--source='+publishedTree,'--staged','--worktree','--','.');
 git('restore','--source=HEAD','--staged','--worktree','--',module);
 assert.equal(git('write-tree'),artifactTree,'Unexpected published artifact');
 assert.deepEqual(changed('--cached',publishedTree),[module],'Unexpected online changes');
 git('diff','--exit-code');
}
console.log('Verified isolated general Gemini revision release: only '+module+' changes online; all other published files and Step 4 unchanged. Artifact tree: '+artifactTree);
