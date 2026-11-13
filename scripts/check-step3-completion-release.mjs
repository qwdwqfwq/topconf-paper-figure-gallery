// Authorized Step 3 final-image receiver release. Historical locks and all Step 4 bytes remain intact.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,existsSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const anchor='7158671d8f0bf99158cc6247bf0ea3aa6847673a';
const publishedTree='a962c63e00978b855cd6eaaa033e86ae56c3ea72';
export const allowed=['.github/workflows/deploy.yml','.github/workflows/forge-workflow-lock.yml','forge/step3-image-stream.mjs','forge/test-step3-image-stream.mjs','scripts/check-step3-completion-release.mjs','scripts/test-step3-completion-release.mjs'];
const payload=['forge/step3-image-stream.mjs'];
const expected={
  ".github/workflows/deploy.yml": "f30b3b185f39c2ba6c682c0f6fece7d520566ad8cf71fcb3a6f8075e0f4f56ee",
  ".github/workflows/forge-workflow-lock.yml": "67ec671788c66133bc35d917626c550f6220317884e588c5c03d5e7793d94a71",
  "forge/step3-image-stream.mjs": "8c6f24c511d83cb262d028f7bd0d7a57884df81aee4a15259cbfe466562792ee",
  "forge/test-step3-image-stream.mjs": "a5c382adb859a8de5061e364b9f477249a11c378b82bf4ab4d241c4c058c7866",
  "scripts/test-step3-completion-release.mjs": "70eeb3bf7c29f3b12451cd54c78d9b35dbd74bf0bee61fa450235c359f97b1dc"
};
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
const changed=(a,b)=>git('diff','--name-only','--no-renames',a,b,'--').split('\n').filter(Boolean).sort();
export function assertAllowedPaths(paths){assert.deepEqual([...paths].sort(),[...allowed].sort(),'Unexpected repository scope');}
export function assertArtifactDiff(paths){assert.deepEqual([...paths].sort(),payload,'Only the authorized Step 3 files may change online');}

export function verifyBlob(path,data){
 assert.ok(expected[path],'Unreviewed path');
 assert.equal(createHash('sha256').update(data.toString().replace(/\r\n/g,'\n')).digest('hex'),expected[path],'Unreviewed content: '+path);
}
function main(){
 const working=process.argv.includes('--working');
 if(working)assert.equal(git('rev-parse','HEAD'),anchor,'Unexpected working base');
 else{
  assert.equal(git('show','-s','--format=%P','HEAD'),anchor,'Release must directly follow reviewed production');
  assert.equal(git('status','--porcelain','--untracked-files=all'),'','Dirty checkout');
 }
 const paths=working?[...new Set([...git('diff','--name-only','--no-renames',anchor,'--').split('\n').filter(Boolean),...git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean)])]:changed(anchor,'HEAD');
 assertAllowedPaths(paths);
 assert.equal(Object.keys(expected).length,5,'All five reviewed payload/test/workflow files must be pinned');
 for(const p of Object.keys(expected))verifyBlob(p,readFileSync(join(root,p)));
 const temp=mkdtempSync(join(tmpdir(),'step3-completion-'));const prior=join(temp,'previous');let added=false,proof;
 try{
  // Run the unmodified prior release acceptance in its original clean checkout.
  // This reconstructs all 3,721 published blobs from reachable commits in CI.
  git('worktree','add','--detach',prior,anchor);added=true;
  const previous=JSON.parse(execFileSync(process.execPath,['scripts/check-step3-nonelinear-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024}));
  assert.equal(previous.artifactTree,publishedTree,'Previous successful publication changed');
  const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
  const indexGit=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
  indexGit('read-tree',publishedTree);
  for(const p of payload){const blob=working?git('hash-object','-w',p):git('rev-parse','HEAD:'+p);indexGit('update-index','--add','--cacheinfo','100644',blob,p);}
  const artifactTree=indexGit('write-tree');assertArtifactDiff(changed(publishedTree,artifactTree));
  const entries=git('ls-tree','-r',artifactTree).split('\n').filter(Boolean).map(line=>{const match=line.match(/^(\d+) blob ([0-9a-f]+)\t(.+)$/);assert.ok(match,'Unsupported artifact entry');assert.ok(['100644','100755'].includes(match[1]),'Symlinks forbidden');return {mode:match[1],blob:match[2],path:match[3]};});
  proof={independentAcceptance:true,originalFrozenCheck:'Unchanged; historical failures remain separately visible',anchor,publishedTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,allOtherPublishedBytesUnchanged:true,entries};
  if(process.argv.includes('--prepare-pages')){
   assert.equal(working,false);assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
   const output='/tmp/isolated-step3-stream-pages';assert.equal(existsSync(output),false,'Refuse overwrite');mkdirSync(output);
   indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
   for(const entry of entries){const bytes=readFileSync(join(output,entry.path));assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),entry.blob,'Artifact mismatch: '+entry.path);}
   writeFileSync('/tmp/isolated-step3-stream-proof.json',JSON.stringify(proof,null,2));
   assert.equal(git('status','--porcelain','--untracked-files=all'),'','Export changed checkout');
  }
 }finally{if(added)git('worktree','remove','--force',prior);assert.ok(resolve(temp).startsWith(resolve(tmpdir())+'/')||resolve(temp).startsWith(resolve(tmpdir())+'\\'));rmSync(temp,{recursive:true,force:true});}
 console.log(JSON.stringify({...proof,entries:undefined}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
