// Owner-authorized three independent revision modules and release workflow wiring only.
// Existing Step 4 code, freeze baselines and original checkers remain byte-for-byte unchanged.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const parent='0d4d55239511b8b9272b608dfec4b21f1c30b4b9';
const previousTree='42eeda4c282e719ee146649f2aaefc9b030c7781';
const module='forge/revision-gallery.mjs';
const online=['forge/index.html','forge/step3-svg-request.mjs'];
const check="scripts/check-step3-svg-recovery-release-20261112.mjs";
const expected={
  "forge/index.html": "d4d205bd37f48bf6f865559cfa650275fb8d9717e370e8dff8939ed04cc84a9e",
  "forge/step3-svg-request.mjs": "28c352bdd8a4519db0ef0efe98d44655182ca2ba0544a7a36691c66a4455a166",
  "forge/test-step3-svg-request.cjs": "794e43986ad4b004ebeade7fb304f79fe5e4bb0f4a1e475540ae37ffd87a5642",
  ".github/workflows/deploy.yml": "7a38b9c1112e343d5464137ea4313edcdfd4c0c02b5063b284764b95ad95b156",
  ".github/workflows/forge-workflow-lock.yml": "e1092f79c15362272ad572efba54fbc07037940d49a37b9b9029166131b49764"
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
const source=(ref,path)=>execFileSync('git',['show',ref+path],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
assert.equal(source(revision,'.github/forge-workflow-lock.json'),source(parent+':','.github/forge-workflow-lock.json'),'Frozen workflow baseline must remain unchanged');

const beforeIndex=source(parent+':','forge/index.html');
const afterIndex=source(revision,'forge/index.html');
const gen=s=>s.slice(s.indexOf('async function genOaiSVG('),s.indexOf('async function genAnthropicSVG('));
assert.equal(afterIndex.replace("import {requestStep3Svg} from './step3-svg-request.mjs?v=20261112-svg-recovery';\n",'').replace(gen(afterIndex),gen(beforeIndex)),beforeIndex,'Outside genOaiSVG and the dedicated import must remain unchanged');
const oldRequest=gen(beforeIndex).slice(gen(beforeIndex).indexOf('  let r;'),gen(beforeIndex).indexOf('  const code = parsed.code;'));
const oldBranch=oldRequest.replace('const parsed = svgChatResponse','parsed = svgChatResponse').split('\n').map((line,i,lines)=>line?'  '+line:line).join('\n');
assert.ok(gen(afterIndex).includes(oldBranch),'Other provider request branch must remain unchanged');

const temp=mkdtempSync(join(tmpdir(),'bitmap-composition-'));
let artifactTree,publishedTree;
try{
 const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
 const indexGit=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',env}).trim();
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
 assert.equal(indexGit('write-tree'),previousTree,'Previous SVG artifact changed');
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
 for(const path of ['forge/revision-gallery.mjs','forge/revision-layout.mjs','forge/revision-scope.mjs'])indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse',parent+':'+path),path);
 publishedTree=indexGit('write-tree');
 assert.equal(publishedTree,'bd64591aff3ffa9e51ea4f85ed5294c1ac319dd8','Prior production tree changed');
 for(const path of online)indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse',revision+path),path);
 artifactTree=indexGit('write-tree');
 assert.deepEqual(changed(publishedTree,artifactTree),[...online].sort(),'Only SVG request module and its callsite may change online');
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
console.log('Verified isolated Step 3 SVG timeout recovery release. Step 4 and all other published files unchanged. Artifact tree: '+artifactTree);
