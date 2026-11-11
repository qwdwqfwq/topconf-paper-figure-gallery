// Owner-authorized independent revision edit release. Frozen code, manifests and original checkers are unchanged.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const parent="13a7f2ced47384045ac825c9314d42b83c93b2bf";
// Exact live artifact tree from the successfully published 13a7f2ce revision guidance release.
const publishedTree="989d5588975fd544342d5007cb389ccec051aca0";

const expected={
  "forge/revision-gallery.mjs": "1bbe6e65430c8c574a0d15f38163f5fe0c3393a91b386a3d18ababf81f85332f",
  ".github/workflows/deploy.yml": "2d9b8d633e4958dfde9c49edf97c77b67ed2e77ea052e1cdadbae0f8cd774f6f",
  ".github/workflows/forge-workflow-lock.yml": "d1e766b66246b5353071fb06591da9aaa2adcd9880c15030c0e0fa5dc0afd406"
};
const check='scripts/check-revision-gemini-release-20261112.mjs';
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
// Use the verified live tree directly: pending unrelated releases are excluded.
const temp=mkdtempSync(join(tmpdir(),'revision-release-'));
let artifactTree;
try{
 const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
 const indexGit=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',env}).trim();
 indexGit('read-tree',publishedTree);
 assert.equal(indexGit('write-tree'),publishedTree,'Previous deployment tree changed');
 // For staged validation the source blob is already in the real index.
 for(const path of artifactChanges)indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse',revision+path),path);
 artifactTree=indexGit('write-tree');
 assert.deepEqual(changed(publishedTree,artifactTree),artifactChanges,'Only approved Gemini revision module may change online');
}finally{rmSync(temp,{recursive:true,force:true});}
if(process.argv.includes('--prepare-pages')){
 assert.equal(process.env.GITHUB_ACTIONS,'true');
 assert.equal(process.env.GITHUB_REF,'refs/heads/main');
 assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
 git('restore','--source='+publishedTree,'--staged','--worktree','--','.');
 git('restore','--source=HEAD','--staged','--worktree','--',module);
 assert.equal(git('write-tree'),artifactTree,'Unexpected published artifact');
 assert.deepEqual(changed('--cached',publishedTree),artifactChanges,'Unexpected online changes');
 git('diff','--exit-code');
}
console.log('Verified isolated Gemini revision release: only '+artifactChanges.join(', ')+' changes online; Step 4 code, original baseline and all other published files unchanged. Artifact tree: '+artifactTree);
