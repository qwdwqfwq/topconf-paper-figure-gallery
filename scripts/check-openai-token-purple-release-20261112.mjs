// Owner-authorized OpenAI token parameter fix and Step 3 button style. Preserve all other published bytes and all existing locks/checkers.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const parent="c0952719a8260346911c9580f8820804a6d55bc7";
const online=["forge/index.html","forge/revision-gallery.mjs"];
const check="scripts/check-openai-token-purple-release-20261112.mjs";
const expected={
  "forge/index.html": "abff1dfe9e6cd072dcf6e6b340cb083ac12c3e040975ec4bb20e618dd143fbff",
  "forge/revision-gallery.mjs": "101332d8ae263c3b400891fb55ed0e6ec91e258cf98240f4c44b52dd7dbedd23",
  "forge/test-openai-token-limit.mjs": "6f83a78662d686b6f8c37153ccdf76c4813ac009fcda02df459dc0bb728a9040",
  "forge/test-reasoning-browser.cjs": "79401b895f126ff1460393eb9565c59e4928696a0b550e17923aeda21ea3143d",
  "forge/test-step3-svg-request.cjs": "9ee64fc955031dccd79a14577b9920742535fc9557601bdcaf795b922dd6a151",
  ".github/workflows/deploy.yml": "e975a4c57669d0655ef8754ce12ab9c90e7ae3d88c5b4cb6738bd986d2e1b655",
  ".github/workflows/forge-workflow-lock.yml": "896510647ee091649acfbd6afba63349579b5fa138603561201ddc4933e65032"
};
const changed=(...args)=>git('diff','--name-only','--no-renames',...args,'--').split('\n').filter(Boolean).sort();
const staged=process.argv.includes('--staged');
const revision=staged?':':'HEAD:';
assert.equal(staged?git('rev-parse','HEAD'):git('show','-s','--format=%P','HEAD'),parent,'Unexpected release parent');
assert.deepEqual(changed(...(staged?['--cached',parent]:[parent,'HEAD'])),[...Object.keys(expected),check].sort(),'Unexpected release scope');
assert.equal(git('status','--porcelain','--untracked-files=all').split('\n').filter(Boolean).length,staged?8:0,'Unexpected working tree changes');
for(const [path,hash] of Object.entries(expected)){
 const committed=execFileSync('git',['show',revision+path],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
 assert.equal(createHash('sha256').update(committed).digest('hex'),hash,'Unreviewed patch: '+path);
 assert.equal(readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n'),committed,'Unstaged change: '+path);
}
// No existing checker or lock baseline is changed. Only the explicitly authorized shared request normalization affects Step 4.
const temp=mkdtempSync(join(tmpdir(),'revision-auto-artifact-'));
let artifactTree,publishedTree;
try{
 const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
 const indexGit=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',env}).trim();
 const module='forge/revision-gallery.mjs';
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
 for(const path of ['README.en.md','docs/infistar-banner-en.png'])indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','191ba476717416167b6d89b33cdab4c1ea4d2d3d:'+path),path);
 assert.equal(indexGit('write-tree'),'4c748efe5fba4cc261dfc88392e16974013a85a6','Previous live artifact changed');

 for(const path of ['forge/index.html','forge/svg-chat-response.mjs'])indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','876958de6a353a7e52e895aba14207956ef86828:'+path),path);
 assert.equal(indexGit('write-tree'),'42eeda4c282e719ee146649f2aaefc9b030c7781','Previous SVG artifact changed');
 indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','14ae53dfc7aeb319c0e68b9040252d008189adf3:forge/i18n_forge.js'),'forge/i18n_forge.js');
 indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','5c301e8fffa124baf8b44281e3653d8c154e5bbe:forge/index.html'),'forge/index.html');
 publishedTree=indexGit('write-tree');
 assert.equal(publishedTree,'9c076e2c9bd2c849b4b4e4fa8601629f5b29534d','Previous published composition artifact changed');
 indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','bc9b14ed3d163be31fc92f4283d5927d0d6f6f1e:forge/index.html'),'forge/index.html');
 publishedTree=indexGit('write-tree');
 assert.equal(publishedTree,'df20b7cd7ab2c500a48db58a675217314c9e7028','Current production artifact changed');
 indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','57bd0e97ba9f6929fe8b8157ac9e2c40d7cc5d42:forge/index.html'),'forge/index.html');
 publishedTree=indexGit('write-tree');
 assert.equal(publishedTree,'c92ffebd0c09e70489d8544ce1f970908628d634','Latest production artifact changed');
 for(const path of ['forge/revision-gallery.mjs','forge/revision-layout.mjs','forge/revision-scope.mjs'])indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','0d4d55239511b8b9272b608dfec4b21f1c30b4b9:'+path),path);
 publishedTree=indexGit('write-tree');
 assert.equal(publishedTree,'bd64591aff3ffa9e51ea4f85ed5294c1ac319dd8','Prior production tree changed');

 for(const path of ['forge/index.html','forge/step3-svg-request.mjs'])indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','ced70cedd5c3677ffbf04ccc12a1b24bd57a54ae:'+path),path);
 publishedTree=indexGit('write-tree');
 assert.equal(publishedTree,'fc25cb60dba62cdd865d75d40f6f0d462f94a301','Current live artifact must remain the exact publication base');
 for(const path of ['forge/revision-gallery.mjs','forge/revision-scope.mjs'])indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','4eca06d07545ea58ed484348d594a105b0214e4a:'+path),path);
 publishedTree=indexGit('write-tree');
 assert.equal(publishedTree,'c714b99b7f86d24d6499166f5172202e95374e3e','Preserve latest automatic revision release');
 indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse',parent+':forge/step3-svg-request.mjs'),'forge/step3-svg-request.mjs');
 publishedTree=indexGit('write-tree');
 assert.equal(publishedTree,'5ef5e16779ac83adb509426d3ec49050ac929fd5','Preserve latest deployed Step 3 module and all other published bytes');
 for(const path of ['forge/revision-layout.mjs','forge/revision-scope.mjs'])indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse','aa2554d5603940bbb4cd0e18848a776114268138:'+path),path);
 publishedTree=indexGit('write-tree');
 assert.equal(publishedTree,'c54c45a4402bff2d59eacbcb5e787f68adf5b078','Preserve the deployed provider release');
 for(const path of ['forge/revision-layout.mjs','forge/revision-scope.mjs'])indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse',parent+':'+path),path);
 publishedTree=indexGit('write-tree');
 assert.equal(publishedTree,'f1596ba52b884d2f42d8b5b7f4c725a9b973a2c5','Preserve the latest deployed artifact');
 for(const path of online)assert.equal(git('rev-parse',publishedTree+':'+path),git('rev-parse',parent+':'+path),'Patch must apply to the exact live file: '+path);
 for(const path of online)indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse',revision+path),path);
 artifactTree=indexGit('write-tree');
 assert.deepEqual(changed(publishedTree,artifactTree),[...online].sort(),'Only the authorized parameter fix and button style files may change online');
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
