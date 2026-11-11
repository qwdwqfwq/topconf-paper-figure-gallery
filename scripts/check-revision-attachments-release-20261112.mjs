// Owner-authorized screenshot attachments release and narrowly scoped CI exception. Original locks and Step 4 remain unchanged.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const parent='8df3871acab44141f975f21a9add440e45b5efa6';
const liveBase='7e089379d187af99271d0d7de8ae50c2b128dc2f';
const expected={
  "forge/revision-gallery.mjs": "6c7374cb4c7bfc230689d6e068d8bffa3ed1d83a6b76e387793e608abe2dd77b",
  "forge/test-revision-gallery.cjs": "1f543bef88dc6c451641699b0d652512eb8b84c4a429268688d3f1824a4af2ff",
  ".github/workflows/deploy.yml": "8b0cbb37a1765eaf1b72c371e3165534d1c19d93d95b0385440567627c8de3a9",
  ".github/workflows/forge-workflow-lock.yml": "88ddfb6f35673e744fa822a8e8f91e287e853be1bdc75d63ca9d147ceea4c4ff"
};
const check='scripts/check-revision-attachments-release-20261112.mjs';
const changed=(...args)=>git('diff','--name-only','--no-renames',...args,'--').split('\n').filter(Boolean).sort();
const staged=process.argv.includes('--staged');
const revision=staged?':':'HEAD:';
assert.equal(staged?git('rev-parse','HEAD'):git('show','-s','--format=%P','HEAD'),parent,'Unexpected release parent');
assert.deepEqual(changed(...(staged?['--cached',parent]:[parent,'HEAD'])),[...Object.keys(expected),check].sort(),'Unexpected release scope');
assert.equal(git('status','--porcelain','--untracked-files=all').split('\n').filter(Boolean).length,staged?Object.keys(expected).length+1:0,'Unexpected working tree changes');
for(const [path,hash] of Object.entries(expected)){
 const committed=execFileSync('git',['show',revision+path],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
 assert.equal(createHash('sha256').update(committed).digest('hex'),hash,'Unreviewed patch: '+path);
 assert.equal(readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n'),committed,'Unstaged change: '+path);
}
// Everything outside the five pinned release files is byte-identical to the previous main.
// Reproduce its published artifact rather than shipping unpublished code from main.
const published=['README.md','forge/assets/nonelinear-wechat.png','forge/index.html','assets/i18n_gallery.js','index.html','forge/revision-gallery.mjs'].sort();
const previous={
 'forge/index.html':'198b505632c06a29d0a07c725207a840fcb5e397',
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
console.log('Verified owner-authorized screenshot attachments release; existing Step 4 and published assets preserved.');
