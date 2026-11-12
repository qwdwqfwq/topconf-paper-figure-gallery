// Owner-authorized Step 3 SVG completion release. Existing freeze baselines remain intact.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const parent='191ba476717416167b6d89b33cdab4c1ea4d2d3d';
const publishedTree='4c748efe5fba4cc261dfc88392e16974013a85a6';
const module='forge/revision-gallery.mjs';
const online=['forge/index.html','forge/svg-chat-response.mjs'];
const check='scripts/check-nonelinear-svg-completion-release-20261112.mjs';
const expected={
  "forge/index.html": "ab584a5cfdbc948305fdd62fc9cb9c85d966c33565a8cef52bb2853f7806dd24",
  "forge/svg-chat-response.mjs": "fa0e942679bd8d0326bea07f2c30fb4446731a6889640c848c71acd35bd4e015",
  "forge/test-svg-chat-response.mjs": "a1fdad8e0bd7f52f12eb66f4f38fdfea5c50019e371a124bed4bd392a9bd1546",
  "nonelinear-relay/chat-stream.mjs": "317d34f37249ef9ba299ff8e2c1d5380162c0f87d11f920fb4f78377c94c33ed",
  "nonelinear-relay/worker.mjs": "e28f1cd08b8e3954b336f9476e86b8f5996c10e2b05c36bde957e1d076e37769",
  "nonelinear-relay/test-chat-stream.mjs": "c04275c08dd0794c5d232b49a266670d0d5f304cfc070a21e2fdcc406b48e5e1",
  ".github/workflows/deploy.yml": "6c6339d60b6bfd7c7fba0878050c8f85c897caf15011b6d28849eeb754cf102c",
  ".github/workflows/forge-workflow-lock.yml": "d31ba8139879665b96f0d54fe4d306c71312c25883c243e03db7972217e1b129"
};
const changed=(...args)=>git('diff','--name-only','--no-renames',...args,'--').split('\n').filter(Boolean).sort();
const staged=process.argv.includes('--staged');
const revision=staged?':':'HEAD:';
assert.equal(staged?git('rev-parse','HEAD'):git('show','-s','--format=%P','HEAD'),parent,'Unexpected release parent');
assert.deepEqual(changed(...(staged?['--cached',parent]:[parent,'HEAD'])),[...Object.keys(expected),check].sort(),'Unexpected release scope');
assert.equal(git('status','--porcelain','--untracked-files=all').split('\n').filter(Boolean).length,staged?9:0,'Unexpected working tree changes');
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
 indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','62aefb47c18cda52c888d104824dbe31692d4bd1:'+module),module);
 assert.equal(indexGit('write-tree'),'7ef7838ad7811848ebce633849571e7f01639ff1','Previous deployment tree changed');
 indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','4fa06915b5de8f1c70d5a123126c5c5748e22d9a:'+module),module);
 assert.equal(indexGit('write-tree'),'695949fe22fada46b76f51f13e334baeb8dca679','Previous SVG artifact changed');
 for(const path of ['README.en.md','docs/infistar-banner-en.png'])indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse',parent+':'+path),path);
 assert.equal(indexGit('write-tree'),publishedTree,'Current live artifact changed');
 for(const path of online)indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse',revision+path),path);
 artifactTree=indexGit('write-tree');
 assert.deepEqual(changed(publishedTree,artifactTree),online,'Only the Step 3 SVG response path may change online');
}finally{rmSync(temp,{recursive:true,force:true});}
if(process.argv.includes('--prepare-pages')){
 assert.equal(process.env.GITHUB_ACTIONS,'true');
 assert.equal(process.env.GITHUB_REF,'refs/heads/main');
 assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
 git('restore','--ignore-skip-worktree-bits','--source='+publishedTree,'--staged','--worktree','--','.');
 git('restore','--ignore-skip-worktree-bits','--source=HEAD','--staged','--worktree','--',...online);
 assert.equal(git('write-tree'),artifactTree,'Unexpected published artifact');
 assert.deepEqual(changed('--cached',publishedTree),online,'Unexpected online changes');
 git('diff','--exit-code');
}
console.log('Verified isolated Step 3 SVG completion release: only '+online.join(', ')+' changes in Pages; all other published files and Step 4 unchanged. Artifact tree: '+artifactTree);
