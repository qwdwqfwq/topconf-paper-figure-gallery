// Owner-authorized independent revision edit release. Frozen code, manifests and original checkers are unchanged.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const parent="095ddc5a20c85756d57eabbabd2d7054ce664437";
// Exact tree produced by the successfully deployed parent release's --prepare-pages.
const publishedTree="41e81ef4789a7c7ffde9441b0f5824de00ec55d3";
const liveBase='7e089379d187af99271d0d7de8ae50c2b128dc2f';
const expected={
  "forge/revision-gallery.mjs": "9c4bf028e50d3bf9b1568dc688624eb09b8a6848fdbdadfb351ab47dd2808785",
  "forge/test-revision-gallery.cjs": "9ca42b5a601708090b60e6b9faae0595eaee629f2fd39983599f7e65b13546f4",
  "forge/test-revision-request.cjs": "9e5524351fedde3cec91c9130ef80925d457aa02103aaed8c4dc2fb9861d7056",
  ".github/workflows/deploy.yml": "075a494b296c0aae3651305982474140fcf21af588460cebc0379bfc181b3332",
  ".github/workflows/forge-workflow-lock.yml": "18ecd9e9863b265c0f656d5ef498d03a05f8392a3c6b4ae6da7b480f9eb7e593"
};
const check='scripts/check-revision-edit-release-20261112.mjs';
const module='forge/revision-gallery.mjs';
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
const published=['README.md','forge/assets/nonelinear-wechat.png','forge/index.html','assets/i18n_gallery.js','index.html',module].sort();
for(const path of published.filter(p=>p!==module))assert.equal(git('rev-parse',revision+path),git('rev-parse',parent+':'+path),'Changed published content: '+path);
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
 indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse',revision+module),module);
 artifactTree=indexGit('write-tree');
 assert.deepEqual(changed(publishedTree,artifactTree),[module],'Only the independent revision module may change online');
}finally{rmSync(temp,{recursive:true,force:true});}
if(process.argv.includes('--prepare-pages')){
 assert.equal(process.env.GITHUB_ACTIONS,'true');
 assert.equal(process.env.GITHUB_REF,'refs/heads/main');
 assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
 const restore=changed(liveBase,'HEAD').filter(path=>!published.includes(path));
 git('restore','--source='+liveBase,'--staged','--worktree','--ignore-skip-worktree-bits','--',...restore);
 assert.equal(git('write-tree'),artifactTree,'Unexpected published artifact');
 assert.deepEqual(changed('--cached',publishedTree),[module],'Unexpected online changes');
 git('diff','--exit-code');
}
console.log('Verified isolated revision edit release: only '+module+' changes online; all other published files, Step 4 and shared modules are byte-identical. Artifact tree: '+artifactTree);
