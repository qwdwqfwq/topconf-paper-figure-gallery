// Authorized single-module Step 3 catalog release. The prior production artifact is
// reconstructed with its original checks; all other online blobs are retained.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,existsSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
export const anchor='af9d8baefc770f0ad134fcdd750541c26960888f';
export const publishedTree='c401b91b42cc51a9b84df6f25e15c1e6fed267c3';
export const payload=['forge/index.html','forge/step3-model-catalog.mjs'];
export const allowed=[...payload,'forge/test-step3-model-catalog-browser.cjs','.github/workflows/step3-catalog-release.yml','scripts/check-step3-catalog-release.mjs','scripts/test-step3-catalog-release.mjs','scripts/step3-catalog-entry-patches.json'];
const expected={
  "forge/index.html": "b48283d9c4a71e1b693e99242f9dbe84c506d7744455b8b264cc005cea0add34",
  "forge/step3-model-catalog.mjs": "3ee1f8a8c719b1555f46c8246cfd6a0054ee795eccb75ba3dd300bf967541b9a",
  "forge/test-step3-model-catalog-browser.cjs": "6ec86270d573311aae124d9c9c62058e90abfb805eec265f97831e7f8468cbbc",
  ".github/workflows/step3-catalog-release.yml": "3da3adc7fdf89a0c6fee69aaa625efae79fc8da57b9627643b5811a5ba33c1c2",
  "scripts/test-step3-catalog-release.mjs": "d7dede4ea5dfa79cb1f8f4724100698685f764816ae946e5ef16301a4a09fcf2",
  "scripts/step3-catalog-entry-patches.json": "9d2e8ca6f672a5c5708fc813242e0087cef7bc9101d547f6ec327cf3ecc51336"
};
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
const changed=(a,b)=>git('diff','--name-only','--no-renames',a,b,'--').split('\n').filter(Boolean).sort();
export function assertAllowedPaths(paths){assert.deepEqual([...paths].sort(),[...allowed].sort(),'Unexpected repository scope');}
export function assertArtifactDiff(paths){assert.deepEqual([...paths].sort(),payload,'Only the authorized Step 3 entry patches and private catalog module may change online');}
export function assertEntryPatch(before,after){
 const patches=JSON.parse(readFileSync(join(root,'scripts/step3-catalog-entry-patches.json'),'utf8'));
 assert.equal(patches.length,8,'Only eight reviewed Step 3 list integration edits');
 let expectedEntry=before.toString().replace(/\r\n/g,'\n');
 for(const {before:oldText,after:newText} of patches){assert.equal(expectedEntry.split(oldText).length,2,'Patch must match exactly once');expectedEntry=expectedEntry.replace(oldText,newText);}
 assert.equal(after.toString().replace(/\r\n/g,'\n'),expectedEntry,'Unapproved shared entry change');
}
export function verifyBlob(path,data){assert.ok(expected[path],'Unreviewed path');assert.equal(createHash('sha256').update(data.toString().replace(/\r\n/g,'\n')).digest('hex'),expected[path],'Unreviewed content: '+path);}
function main(){
 const working=process.argv.includes('--working');
 if(working)assert.equal(git('rev-parse','HEAD'),anchor,'Unexpected working base');
 else {assert.equal(git('show','-s','--format=%P','HEAD'),anchor,'Release must directly follow the reviewed production commit');assert.equal(git('status','--porcelain','--untracked-files=all'),'','Dirty checkout');}
 const paths=working?[...new Set([...git('diff','--name-only','--no-renames',anchor,'--').split('\n').filter(Boolean),...git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean)])]:changed(anchor,'HEAD');
 assertAllowedPaths(paths);assert.equal(Object.keys(expected).length,allowed.length-1);
 for(const p of Object.keys(expected))verifyBlob(p,readFileSync(join(root,p)));
 assertEntryPatch(execFileSync('git',['show',anchor+':forge/index.html'],{cwd:root}),readFileSync(join(root,'forge/index.html')));
 const temp=mkdtempSync(join(tmpdir(),'step3-catalog-release-')),prior=join(temp,'previous');let added=false,proof;
 try{
  git('worktree','add','--detach',prior,anchor);added=true;
  const previous=JSON.parse(execFileSync(process.execPath,['scripts/check-parser-catalog-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024}));
  assert.equal(previous.artifactTree,publishedTree,'Previous production artifact changed');
  execFileSync(process.execPath,['--test','scripts/test-parser-catalog-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024});
  const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
  const indexGit=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
  indexGit('read-tree',publishedTree);
  for(const p of payload){const blob=working?git('hash-object','-w',p):git('rev-parse','HEAD:'+p);indexGit('update-index','--add','--cacheinfo','100644',blob,p);}
  const artifactTree=indexGit('write-tree');assertArtifactDiff(changed(publishedTree,artifactTree));
  const entries=git('ls-tree','-r',artifactTree).split('\n').filter(Boolean).map(line=>{const m=line.match(/^(\d+) blob ([0-9a-f]+)\t(.+)$/);assert.ok(m,'Unsupported entry');assert.ok(['100644','100755'].includes(m[1]),'Symlinks forbidden');return {mode:m[1],blob:m[2],path:m[3]};});
  assertEntryPatch(execFileSync('git',['show',publishedTree+':forge/index.html'],{cwd:root}),execFileSync('git',['show',artifactTree+':forge/index.html'],{cwd:root}));
  proof={independentAcceptance:true,originalFrozenCheck:'Unchanged; historical failures remain failures',anchor,publishedTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,authorizedStep3EntryPatches:8,allOtherOnlineBlobsIdentical:true,previousAcceptanceAndTests:true,entries};
  if(process.argv.includes('--prepare-pages')){
   assert.equal(working,false);assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
   const output='/tmp/isolated-step3-catalog-pages';assert.equal(existsSync(output),false,'Refuse overwrite');mkdirSync(output);
   indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
   for(const e of entries){const bytes=readFileSync(join(output,e.path));assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),e.blob,'Artifact mismatch: '+e.path);}
   writeFileSync('/tmp/isolated-step3-catalog-proof.json',JSON.stringify(proof,null,2));assert.equal(git('status','--porcelain','--untracked-files=all'),'','Export changed checkout');
  }
 }finally{
  assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep),'Cleanup must remain in the temporary directory');
  assert.ok(resolve(prior).startsWith(resolve(temp)+sep),'Worktree cleanup must remain in the release directory');
  if(added)git('worktree','remove','--force',prior);rmSync(temp,{recursive:true,force:true});
 }
 console.log(JSON.stringify({...proof,entries:undefined}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
