// Owner-authorized independent revision edit release. Frozen code, manifests and original checkers are unchanged.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const parent="8ef8439898550aadb1777b67cdc400b387ac43fb";
// Exact tree produced by the successfully deployed parent release's --prepare-pages.
const publishedTree="ce219f3e95d924dbd3caed426874399901434f41";
const liveBase='7e089379d187af99271d0d7de8ae50c2b128dc2f';
const expected={
  "forge/revision-gallery.mjs": "8d001795209e4a39d4a7ee0067d830fa2661478d5b1e8d3423b886f32e1e1148",
  "forge/test-svg-revision.cjs": "f5c912260f1558829d35a5173f67ef1785ca672eca1d8c007d23d5b05cdb794e",
  ".github/workflows/deploy.yml": "eca330cb78a060f44a92dcc92ac3c85a9810f4669c01d2e7c579745ffcba802f",
  ".github/workflows/forge-workflow-lock.yml": "2b43d9e4ed83955058fba1c0dbf993a92173f314b78fe4461bac99897f233635"
};
const check='scripts/check-revision-hint-release-20261112.mjs';
const module='forge/revision-gallery.mjs';
const artifactChanges=[module];
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
const published=['README.md','forge/assets/nonelinear-wechat.png','forge/index.html','assets/i18n_gallery.js','index.html',module,'forge/svg-revision.mjs'].sort();
for(const path of published.filter(p=>!artifactChanges.includes(p)))assert.equal(git('rev-parse',revision+path),git('rev-parse',parent+':'+path),'Changed published content: '+path);
// Derive the previous artifact from the approved parent without consulting dirty files.
// An isolated temporary index also proves the new artifact changes just one file.
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const temp=mkdtempSync(join(tmpdir(),'revision-release-'));
let artifactTree;
try{
 const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
 const indexGit=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',env}).trim();
 indexGit('read-tree',liveBase);
 const setBlob=(path,rev)=>{
  const entry=git('ls-tree',rev,'--',path);
  const match=entry.match(/^(\d+) blob ([0-9a-f]+)\t(.+)$/);assert.ok(match,'Missing artifact file: '+path);
  indexGit('update-index','--add','--cacheinfo',match[1],match[2],path);
 };
 for(const path of published)setBlob(path,parent);
 assert.equal(indexGit('write-tree'),publishedTree,'Previous deployment tree changed');
 // For staged validation the source blob is already in the real index.
 for(const path of artifactChanges)indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse',revision+path),path);
 artifactTree=indexGit('write-tree');
 assert.deepEqual(changed(publishedTree,artifactTree),artifactChanges,'Only approved revision hint files may change online');
}finally{rmSync(temp,{recursive:true,force:true});}
if(process.argv.includes('--prepare-pages')){
 assert.equal(process.env.GITHUB_ACTIONS,'true');
 assert.equal(process.env.GITHUB_REF,'refs/heads/main');
 assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
 const restore=changed(liveBase,'HEAD').filter(path=>![...published,'forge/svg-revision.mjs'].includes(path));
 git('restore','--source='+liveBase,'--staged','--worktree','--ignore-skip-worktree-bits','--',...restore);
 assert.equal(git('write-tree'),artifactTree,'Unexpected published artifact');
 assert.deepEqual(changed('--cached',publishedTree),artifactChanges,'Unexpected online changes');
 git('diff','--exit-code');
}
console.log('Verified isolated revision hint release: only '+artifactChanges.join(', ')+' changes online; Step 4 code, original baseline and all other published files unchanged. Artifact tree: '+artifactTree);
