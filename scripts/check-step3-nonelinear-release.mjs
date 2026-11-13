// Authorized NoneLinear Step 3 exception. Historical locks stay byte-for-byte intact.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,existsSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const anchor='26910dee446fe5b2dc607074e5e6a6dd6bbd0e36';
const publishedTree='7c86b00b676432fab11a81a98207ae3c87450a09';
export const allowed=['.github/workflows/deploy.yml','.github/workflows/forge-workflow-lock.yml','forge/index.html','forge/step3-image-stream.mjs','forge/test-step3-image-stream-browser.cjs','forge/test-step3-image-stream.mjs','scripts/check-step3-nonelinear-release.mjs','scripts/test-step3-nonelinear-release.mjs'];
const payload=['forge/index.html','forge/step3-image-stream.mjs'];
const expected={
  ".github/workflows/deploy.yml": "417a72d09028e5bb0da14403c5a58ee928717d4fd81f07f40cfee52e48c70ac8",
  ".github/workflows/forge-workflow-lock.yml": "621c2b29c48f36aee3211f2bc2bf482d204fd7cd3daab14a2c29bb800431e529",
  "forge/index.html": "0a29d834c80ebe70f0defe05cef7637293f2c5de1d325dc2f096a6c01347ba3d",
  "forge/step3-image-stream.mjs": "fbc881f038594d8424ee73da476f1c289d526cb0f1379c59c2a9f4bc55a112aa",
  "forge/test-step3-image-stream-browser.cjs": "1bfa5d0956183b861b3d3e64e7f56159b388c0e94a23c32d5f652b87e0642a32",
  "forge/test-step3-image-stream.mjs": "a55ce066ed0edbf5abe9d9becfb39f3af5f60dd2065a5f846c87d73e51ee9f77",
  "scripts/test-step3-nonelinear-release.mjs": "cf7fe3360b6aa349d5230f239559c366f3fc7a57e9fa6ce6d3623ac3f2464d8e"
};
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
const changed=(a,b)=>git('diff','--name-only','--no-renames',a,b,'--').split('\n').filter(Boolean).sort();
export function assertAllowedPaths(paths){assert.deepEqual([...paths].sort(),[...allowed].sort(),'Unexpected repository scope');}
export function assertArtifactDiff(paths){assert.deepEqual([...paths].sort(),payload,'Only the authorized Step 3 files may change online');}
export function assertIndexIsolation(text,before){
 const old="./step3-image-stream.mjs?v=20261113",current="./step3-image-stream.mjs?v=20261114-nonelinear";
 const normalized=text.replace(/\r\n/g,'\n');
 assert.equal(normalized.split(current).length,2,'Version change must occur exactly once');
 assert.equal(normalized.replace(current,old),before.replace(/\r\n/g,'\n'),'Index changed beyond the authorized Step 3 module version');
}
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
 assert.equal(Object.keys(expected).length,7,'All seven reviewed payload/test/workflow files must be pinned');
 for(const p of Object.keys(expected))verifyBlob(p,readFileSync(join(root,p)));
 assertIndexIsolation(readFileSync(join(root,'forge/index.html'),'utf8'),execFileSync('git',['show',anchor+':forge/index.html'],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024}));
 const temp=mkdtempSync(join(tmpdir(),'step3-nonelinear-'));const prior=join(temp,'previous');let added=false,proof;
 try{
  // Run the unmodified prior release acceptance in its original clean checkout.
  // This reconstructs all 3,721 published blobs from reachable commits in CI.
  git('worktree','add','--detach',prior,anchor);added=true;
  const previous=JSON.parse(execFileSync(process.execPath,['scripts/check-step3-stream-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024}));
  assert.equal(previous.artifactTree,publishedTree,'Previous successful publication changed');
  const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
  const indexGit=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
  indexGit('read-tree',publishedTree);
  for(const p of payload){const blob=working?git('hash-object','-w',p):git('rev-parse','HEAD:'+p);indexGit('update-index','--add','--cacheinfo','100644',blob,p);}
  const artifactTree=indexGit('write-tree');assertArtifactDiff(changed(publishedTree,artifactTree));
  const entries=git('ls-tree','-r',artifactTree).split('\n').filter(Boolean).map(line=>{const match=line.match(/^(\d+) blob ([0-9a-f]+)\t(.+)$/);assert.ok(match,'Unsupported artifact entry');assert.ok(['100644','100755'].includes(match[1]),'Symlinks forbidden');return {mode:match[1],blob:match[2],path:match[3]};});
  proof={independentAcceptance:true,originalFrozenCheck:'Unchanged; historical failures remain separately visible',anchor,publishedTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,step4IndexIsolation:true,entries};
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
