// Isolated connected-panel reflow release. Preserve every other live byte and every existing checker.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const parent="dccaf8602d658858ddcbfc367e4f81956ae460d8";
const online=["forge/revision-gallery.mjs","forge/revision-layout.mjs","forge/revision-scope.mjs"];
const check="scripts/check-revision-fetch-followup-release-20261113.mjs";
const expected={
  "forge/revision-gallery.mjs": "545d0b5b9e8a4f8cf0d155ee8c145a46d8478a950ed3dcd688c6aa4091db9239",
  "forge/revision-layout.mjs": "f0efc8ef5c4fb643a2e32a2ba7815123017ada2415d432d643c16619abac27b6",
  "forge/revision-scope.mjs": "2db5a6626f8b970c64ba1c8bf8496fbc43f3b98934c45106251c4849c8a39037",
  ".github/workflows/deploy.yml": "09d2cd09889136f340e06caad3875b5254dea5894da76ea133b4e077129c46d2",
  ".github/workflows/forge-workflow-lock.yml": "4b4ed39ce4ef13ea1f343c635ab0f59e34cca321f59eb36d6478294164465d4e"
};
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
// No existing checker, baseline, shared code or Step 4 file is changed.
const temp=mkdtempSync(join(tmpdir(),'revision-auto-artifact-'));
let artifactTree,publishedTree;
try{
 const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
 const indexGit=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',env}).trim();
 publishedTree="0a8ac822ebe084c2bcc40d0738f1968bcc3285c3";
 indexGit("read-tree",publishedTree);
 for(const path of online)assert.equal(git('rev-parse',publishedTree+':'+path),git('rev-parse',parent+':'+path),'Patch must apply to the exact live file: '+path);
 for(const path of online)indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse',revision+path),path);
 artifactTree=indexGit('write-tree');
 assert.deepEqual(changed(publishedTree,artifactTree),[...online].sort(),'Only the three isolated revision modules may change online');
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
