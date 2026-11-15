// Explicitly authorized image validation fix; preserve every other deployed blob.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,existsSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
export const anchor='8edfd70a676cc698e4b1a369bca92b613f789a68';
const reviewedParent=anchor;
export const publishedTree='f620625d124bb216225245d44a9ff9a5903ad7e2';
export const payload=['forge/index.html','forge/step3-model-catalog.mjs'];
export const allowed=[...payload,'forge/test-step3-image-classification-browser.cjs','.github/workflows/step3-image-classification-release.yml','scripts/check-step3-image-classification-release.mjs','scripts/test-step3-image-classification-release.mjs'];
const expected={
  "forge/index.html": "e40cc119c303be333813b60e8e5a433ed7a3ce812cbf4d2640a4aba793c70dce",
  "forge/step3-model-catalog.mjs": "5aa9b98b1f48e5ce48e99d862057359c4e5fb5cb688d61f64ad5466704da2446",
  "forge/test-step3-image-classification-browser.cjs": "7a1c11a9811c01c032a0582ffcbc6e65376b0afaeb713b5b4e0d72912b751f4b",
  ".github/workflows/step3-image-classification-release.yml": "79b572cc878ac89a177a647452ae2e61bf2c0928d6e662f0eab08c3448ff984b",
  "scripts/test-step3-image-classification-release.mjs": "9c818971bc45e078c1b7cc47df542ab31f281c6aa900cd83262eb226b03a2cb7"
};
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
const changed=(a,b)=>git('diff','--name-only','--no-renames',a,b,'--').split('\n').filter(Boolean).sort();
export function assertAllowedPaths(paths){assert.deepEqual([...paths].sort(),[...allowed].sort(),'Unexpected repository scope');}
export function assertArtifactDiff(paths){assert.deepEqual([...paths].sort(),payload,'Only the authorized Step 3 image guards and private catalog classifier may change online');}
export function verifyBlob(path,data){assert.ok(expected[path],'Unreviewed path');assert.equal(createHash('sha256').update(data.toString().replace(/\r\n/g,'\n')).digest('hex'),expected[path],'Unreviewed content: '+path);}
export function verifyIndex(html){
 const prior=git('show',anchor+':forge/index.html').replace(/\r\n/g,'\n');
 const replacements=[
  ["if(mode==='image' && kindOf(model)!=='image')", "if(mode==='image' && !step3Catalog().isImageModel(model))"],
  ["!(kindOf(model)==='image'||(cfg().image||[]).includes(model))", "!step3Catalog().isImageModel(model)"]
 ];
 let expected=prior;
 for(const [before,after] of replacements){assert.equal(expected.split(before).length,2,'Guard must occur once');expected=expected.replace(before,after);}
 assert.equal(html.replace(/\r\n/g,'\n').trimEnd(),expected,'Only two authorized Step 3 guards may change in the frozen HTML');
}
function main(){
 const working=process.argv.includes('--working');
 if(working)assert.equal(git('rev-parse','HEAD'),reviewedParent,'Unexpected working base');
 else {assert.equal(git('show','-s','--format=%P','HEAD'),reviewedParent,'Release must directly follow reviewed production');assert.equal(git('status','--porcelain','--untracked-files=all'),'','Dirty checkout');}
 const paths=working?[...new Set([...git('diff','--name-only','--no-renames',anchor,'--').split('\n').filter(Boolean),...git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean)])]:changed(anchor,'HEAD');
 assertAllowedPaths(paths);assert.equal(Object.keys(expected).length,allowed.length-1);
 for(const p of Object.keys(expected))verifyBlob(p,readFileSync(join(root,p)));
 verifyIndex(readFileSync(join(root,'forge/index.html'),'utf8'));
 const temp=mkdtempSync(join(tmpdir(),'step3-image-classification-release-')),prior=join(temp,'previous');let added=false,proof;
 try{
  git('worktree','add','--detach',prior,anchor);added=true;
  execFileSync('git',['sparse-checkout','disable'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024});
  const previous=JSON.parse(execFileSync(process.execPath,['scripts/check-model-list-selection-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024}));
  assert.equal(previous.artifactTree,publishedTree,'Previous production artifact changed');
  for(const p of payload)assert.equal(git('rev-parse',publishedTree+':'+p),git('rev-parse',anchor+':'+p),'Payload must start from the exact deployed blob: '+p);
  execFileSync(process.execPath,['--test','scripts/test-model-list-selection-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024});
  const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
  const indexGit=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
  indexGit('read-tree',publishedTree);
  for(const p of payload){const blob=working?git('hash-object','-w',p):git('rev-parse','HEAD:'+p);indexGit('update-index','--add','--cacheinfo','100644',blob,p);}
  const artifactTree=indexGit('write-tree');assertArtifactDiff(changed(publishedTree,artifactTree));
  const entries=git('ls-tree','-r',artifactTree).split('\n').filter(Boolean).map(line=>{const m=line.match(/^(\d+) blob ([0-9a-f]+)\t(.+)$/);assert.ok(m,'Unsupported entry');assert.ok(['100644','100755'].includes(m[1]),'Symlinks forbidden');return {mode:m[1],blob:m[2],path:m[3]};});
  proof={independentAcceptance:true,originalFrozenCheck:'Unchanged; historical failures remain failures',anchor,publishedTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,allOtherOnlineBlobsIdentical:true,previousAcceptanceAndTests:true,entries};
  if(process.argv.includes('--prepare-pages')){
   assert.equal(working,false);assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
   const output='/tmp/isolated-step3-image-classification-pages';assert.equal(existsSync(output),false,'Refuse overwrite');mkdirSync(output);
   indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
   for(const e of entries){const bytes=readFileSync(join(output,e.path));assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),e.blob,'Artifact mismatch: '+e.path);}
   writeFileSync('/tmp/isolated-step3-image-classification-proof.json',JSON.stringify(proof,null,2));assert.equal(git('status','--porcelain','--untracked-files=all'),'','Export changed checkout');
  }
 }finally{
  assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep),'Cleanup must remain in the temporary directory');
  assert.ok(resolve(prior).startsWith(resolve(temp)+sep),'Worktree cleanup must remain in the release directory');
  if(added)git('worktree','remove','--force',prior);rmSync(temp,{recursive:true,force:true});
 }
 console.log(JSON.stringify({...proof,entries:undefined}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
