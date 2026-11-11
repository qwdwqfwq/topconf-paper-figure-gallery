// Owner-authorized revision UI release only. Original locks and Step 4 remain unchanged.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const parent='7a8d3a098f5c19545699cee254bac675abc454ce';
const liveBase='7e089379d187af99271d0d7de8ae50c2b128dc2f';
const expected={
  "forge/index.html": "8da543ffda895123fb8292f598b6acd494be950384f1c9083db9d74ea46e1d54",
  "forge/revision-gallery.mjs": "fda5aa8fe9b0a2cf8a280185be1918d1d759928239575afdd5212b7bbbe43ea0",
  "forge/test-revision-gallery.cjs": "0573a59e7aac14c3489b39347fadafbfcab9a28c1ff993d43379b19443aa287a",
  ".github/workflows/deploy.yml": "03c34f822b5a164d7292318bbf9637dbef985f924e3c6b757691ed5805b60c62",
  ".github/workflows/forge-workflow-lock.yml": "ac8b90b0b3e3f3628a8a9951fad6a9bc29ad1dc38815140592852a8098ed3a13"
};
const check='scripts/check-revision-release-20261112.mjs';
const changed=(...args)=>git('diff','--name-only','--no-renames',...args,'--').split('\n').filter(Boolean).sort();
const staged=process.argv.includes('--staged');
const revision=staged?':':'HEAD:';
assert.equal(staged?git('rev-parse','HEAD'):git('show','-s','--format=%P','HEAD'),parent,'Unexpected release parent');
assert.deepEqual(changed(...(staged?['--cached',parent]:[parent,'HEAD'])),[...Object.keys(expected),check].sort(),'Unexpected release scope');
assert.equal(git('status','--porcelain','--untracked-files=all').split('\n').filter(Boolean).length,staged?6:0,'Unexpected working tree changes');
for(const [path,hash] of Object.entries(expected)){
 const committed=execFileSync('git',['show',revision+path],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
 assert.equal(createHash('sha256').update(committed).digest('hex'),hash,'Unreviewed patch: '+path);
 assert.equal(readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n'),committed,'Unstaged change: '+path);
}
// Everything outside the six pinned release files is byte-identical to the previous main.
// Reproduce its published artifact rather than shipping unpublished code from main.
const published=['README.md','forge/assets/nonelinear-wechat.png','forge/index.html','assets/i18n_gallery.js','index.html','forge/revision-gallery.mjs'].sort();
const previous={
 'README.md':'564746dffd3e47d369e940736d38f846e565a163',
 'forge/assets/nonelinear-wechat.png':'24ece35233fea104c65298d2d530090d9403d118',
 'assets/i18n_gallery.js':'380c280fb901123af09fc3bef22cf309327df6b9',
 'index.html':'bf4213892c8adda0d737d8ad4f14fa67e415e0fd'
};
for(const [path,blob] of Object.entries(previous))assert.equal(git('rev-parse',revision+path),blob,'Changed published content: '+path);
if(process.argv.includes('--prepare-pages')){
 assert.equal(process.env.GITHUB_ACTIONS,'true');
 assert.equal(process.env.GITHUB_REF,'refs/heads/main');
 assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
 const restore=changed(liveBase,'HEAD').filter(path=>!published.includes(path));
 git('restore','--source='+liveBase,'--staged','--worktree','--ignore-skip-worktree-bits','--',...restore);
 assert.deepEqual(changed('--cached',liveBase),published,'Unexpected published artifact');
 git('diff','--exit-code');
}
console.log('Verified owner-authorized revision UI release; existing Step 4 and published assets preserved.');
