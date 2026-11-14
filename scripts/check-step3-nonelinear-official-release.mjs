// Independent Step 3 public discovery release; preserves every other deployed blob.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,existsSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
export const anchor='bd66271bf253a22f9d5352baffd901f1636c2ed8';
const reviewedParent=anchor;
export const publishedTree='0f72c41854936970114a6b67d4bf146d61c2ed47';
export const payload=['forge/step3-model-catalog.mjs','forge/step3-official-catalog.mjs'];
export const allowed=[...payload,'forge/test-step3-nonelinear-official.mjs','forge/test-step3-nonelinear-official-browser.cjs','.github/workflows/step3-nonelinear-official-release.yml','scripts/check-step3-nonelinear-official-release.mjs','scripts/test-step3-nonelinear-official-release.mjs'];
const expected={
  "forge/step3-model-catalog.mjs": "2ec3b45e9e26970a316b1712395c4f0ab502988c7496d3787abc6416abda3540",
  "forge/step3-official-catalog.mjs": "1e268c82e9aae709bbd984157e59fa08ea7c4813741c6c80aee0428e7dd8b92e",
  "forge/test-step3-nonelinear-official.mjs": "0fd9ca94e66feb02d3d537a655086239f6394e46cc62046e313ee59f650d068b",
  "forge/test-step3-nonelinear-official-browser.cjs": "7cbb5e21d0cb53adf2da17fbe16c529de61d4851451f68742f6e7efe60370c9a",
  ".github/workflows/step3-nonelinear-official-release.yml": "888a850e43032469f237c26ffb5e956e02d922a47f52052422828209ae3df234",
  "scripts/test-step3-nonelinear-official-release.mjs": "e5ee8eac20dc8918d0727c38927cfdc3f601353b3eb5a314e78212e63a90d4ed"
};
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
const changed=(a,b)=>git('diff','--name-only','--no-renames',a,b,'--').split('\n').filter(Boolean).sort();
export function assertAllowedPaths(paths){assert.deepEqual([...paths].sort(),[...allowed].sort(),'Unexpected repository scope');}
export function assertArtifactDiff(paths){assert.deepEqual([...paths].sort(),payload,'Only the private Step 3 catalog modules may change online');}
export function verifyBlob(path,data){assert.ok(expected[path],'Unreviewed path');assert.equal(createHash('sha256').update(data.toString().replace(/\r\n/g,'\n')).digest('hex'),expected[path],'Unreviewed content: '+path);}
function main(){
 const working=process.argv.includes('--working');
 if(working)assert.equal(git('rev-parse','HEAD'),reviewedParent,'Unexpected working base');
 else {assert.equal(git('show','-s','--format=%P','HEAD'),reviewedParent,'Release must directly follow reviewed production');assert.equal(git('status','--porcelain','--untracked-files=all'),'','Dirty checkout');}
 const paths=working?[...new Set([...git('diff','--name-only','--no-renames',anchor,'--').split('\n').filter(Boolean),...git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean)])]:changed(anchor,'HEAD');
 assertAllowedPaths(paths);assert.equal(Object.keys(expected).length,allowed.length-1);
 for(const p of Object.keys(expected))verifyBlob(p,readFileSync(join(root,p)));
 const temp=mkdtempSync(join(tmpdir(),'step3-nonelinear-official-release-')),prior=join(temp,'previous');let added=false,proof;
 try{
  git('worktree','add','--detach',prior,anchor);added=true;
  execFileSync('git',['sparse-checkout','disable'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024});
  const previous=JSON.parse(execFileSync(process.execPath,['scripts/check-step3-official-catalog-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024}));
  assert.equal(previous.artifactTree,publishedTree,'Previous production artifact changed');
  execFileSync(process.execPath,['--test','scripts/test-step3-official-catalog-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024});
  const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
  const indexGit=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
  indexGit('read-tree',publishedTree);
  for(const p of payload){const blob=working?git('hash-object','-w',p):git('rev-parse','HEAD:'+p);indexGit('update-index','--add','--cacheinfo','100644',blob,p);}
  const artifactTree=indexGit('write-tree');assertArtifactDiff(changed(publishedTree,artifactTree));
  const entries=git('ls-tree','-r',artifactTree).split('\n').filter(Boolean).map(line=>{const m=line.match(/^(\d+) blob ([0-9a-f]+)\t(.+)$/);assert.ok(m,'Unsupported entry');assert.ok(['100644','100755'].includes(m[1]),'Symlinks forbidden');return {mode:m[1],blob:m[2],path:m[3]};});
  proof={independentAcceptance:true,originalFrozenCheck:'Unchanged; historical failures remain failures',anchor,publishedTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,allOtherOnlineBlobsIdentical:true,previousAcceptanceAndTests:true,entries};
  if(process.argv.includes('--prepare-pages')){
   assert.equal(working,false);assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
   const output='/tmp/isolated-step3-nonelinear-official-pages';assert.equal(existsSync(output),false,'Refuse overwrite');mkdirSync(output);
   indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
   for(const e of entries){const bytes=readFileSync(join(output,e.path));assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),e.blob,'Artifact mismatch: '+e.path);}
   writeFileSync('/tmp/isolated-step3-nonelinear-official-proof.json',JSON.stringify(proof,null,2));assert.equal(git('status','--porcelain','--untracked-files=all'),'','Export changed checkout');
  }
 }finally{
  assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep),'Cleanup must remain in the temporary directory');
  assert.ok(resolve(prior).startsWith(resolve(temp)+sep),'Worktree cleanup must remain in the release directory');
  if(added)git('worktree','remove','--force',prior);rmSync(temp,{recursive:true,force:true});
 }
 console.log(JSON.stringify({...proof,entries:undefined}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
