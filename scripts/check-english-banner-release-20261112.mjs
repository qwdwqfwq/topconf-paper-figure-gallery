// Owner-authorized English README and compact banner release. Existing freeze checks remain intact.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const parent='c7f0764b0b57deb87e4b1f3516fd5d357621e5a9';
const bannerCommit='bf91728925be8f1cbc950c7ce8f6340376fb8ed3';
const previousRelease='4fa06915b5de8f1c70d5a123126c5c5748e22d9a';
const docs=['README.en.md','docs/infistar-banner-en.png'];
const publishedTree='7ef7838ad7811848ebce633849571e7f01639ff1';
const module='forge/revision-gallery.mjs';
const check='scripts/check-english-banner-release-20261112.mjs';
const expected={
  ".github/workflows/deploy.yml": "c00174f07cf297000a49cc00371fe386537ae134a873e02b1d3a3cfdf0e121e8",
  ".github/workflows/forge-workflow-lock.yml": "1de07b838038f4343b4fd945bf40100facfe10ff5cac25af9b18e7a026880ef1",
  "README.en.md": "78b8686d8a96d3a1095cf79b9ca623bf1f70718f0ae291b96fc2f9b9b06dcd2c",
  "docs/infistar-banner-en.png": "45a98c4e6c8f4bd1632e7c9cea16422567574ca17c766c7f78e67dff5113340a"
};
const changed=(...args)=>git('diff','--name-only','--no-renames',...args,'--').split('\n').filter(Boolean).sort();
const staged=process.argv.includes('--staged');
const revision=staged?':':'HEAD:';
assert.equal(staged?git('rev-parse','HEAD'):git('show','-s','--format=%P','HEAD'),parent,'Unexpected release parent');
assert.deepEqual(changed(...(staged?['--cached',parent]:[parent,'HEAD'])),['.github/workflows/deploy.yml','.github/workflows/forge-workflow-lock.yml',check].sort(),'Unexpected release scope');
assert.equal(git('status','--porcelain','--untracked-files=all').split('\n').filter(Boolean).length,staged?3:0,'Unexpected working tree changes');
for(const [path,hash] of Object.entries(expected)){
 const raw=execFileSync('git',['show',revision+path],{cwd:root,maxBuffer:16*1024*1024});
 const committed=path.endsWith('.png')?raw:Buffer.from(raw.toString('utf8').replace(/\r\n/g,'\n'));
 assert.equal(createHash('sha256').update(committed).digest('hex'),hash,'Unreviewed patch: '+path);
 const disk=readFileSync(new URL('../'+path,import.meta.url));
 assert.deepEqual(path.endsWith('.png')?disk:Buffer.from(disk.toString('utf8').replace(/\r\n/g,'\n')),committed,'Unstaged change: '+path);
}
const temp=mkdtempSync(join(tmpdir(),'revision-general-release-'));
let artifactTree, previousArtifact;
assert.deepEqual(changed(previousRelease,bannerCommit),docs.slice().sort(),'Unexpected banner changes');
// Preserve the intervening README formatting commit; publish only the authorized English files.
assert.equal(git('show','-s','--format=%P',parent),bannerCommit);
assert.deepEqual(changed(bannerCommit,parent),['README.en.md','README.fr.md','README.ja.md','README.ko.md','README.md','README.ru.md'].sort(),'Unexpected intervening source changes');
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
 indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','62aefb47c18cda52c888d104824dbe31692d4bd1:'+module),module);
 assert.equal(indexGit('write-tree'),publishedTree,'Previous deployment tree changed');
 indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse',previousRelease+':'+module),module);
 previousArtifact=indexGit('write-tree');
 assert.deepEqual(changed(publishedTree,previousArtifact),[module],'Previous release reconstruction changed');
 for(const path of docs) indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse',revision+path),path);
 artifactTree=indexGit('write-tree');
 assert.deepEqual(changed(previousArtifact,artifactTree),docs.slice().sort(),'Only English documentation may change online');
}finally{rmSync(temp,{recursive:true,force:true});}
if(process.argv.includes('--prepare-pages')){
 assert.equal(process.env.GITHUB_ACTIONS,'true');
 assert.equal(process.env.GITHUB_REF,'refs/heads/main');
 assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
 git('restore','--source='+previousArtifact,'--staged','--worktree','--','.');
 git('restore','--source=HEAD','--staged','--worktree','--',...docs);
 assert.equal(git('write-tree'),artifactTree,'Unexpected published artifact');
 assert.deepEqual(changed('--cached',previousArtifact),docs.slice().sort(),'Unexpected online changes');
 git('diff','--exit-code');
}
console.log('Verified English README/banner release; all other published files including Step 4 unchanged. Previous artifact: '+previousArtifact+'; artifact: '+artifactTree);
