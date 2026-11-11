// Owner-authorized independent revision edit release. Frozen code, manifests and original checkers are unchanged.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const parent="390d35ec52378289c2da903bc39dc9855030b623";
// Exact tree produced by the successfully deployed parent release's --prepare-pages.
const publishedTree="45672054eceae12614a507043386def33912d043";
const liveBase='7e089379d187af99271d0d7de8ae50c2b128dc2f';
const expected={
  "forge/revision-gallery.mjs": "da9e39eb67f95122d4f1b6c0af162856feef559f366481bfe9931ad63e6add0b",
  "forge/test-svg-revision.cjs": "3d68e28fe91af7c7160ab3fb0023158b1ba40c064d0f642ef0f78500125e7b06",
  ".github/workflows/deploy.yml": "23b81b1e4a3ac3d3b535b891832d04a555bae51f9acb6d0b8376b0a0662e75f8",
  ".github/workflows/forge-workflow-lock.yml": "d9c064c026151c8bb46141d159e6ce09f979f3177831a32d343d0e8bbc025b65"
};
const check='scripts/check-svg-history-release-20261112.mjs';
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
 assert.deepEqual(changed(publishedTree,artifactTree),artifactChanges,'Only approved SVG revision files may change online');
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
console.log('Verified isolated SVG revision release: only '+artifactChanges.join(', ')+' changes online; Step 4 code, original baseline and all other published files unchanged. Artifact tree: '+artifactTree);
