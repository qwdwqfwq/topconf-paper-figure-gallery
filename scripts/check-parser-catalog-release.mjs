// Authorized single-module parser catalog release. The prior production artifact is
// reconstructed with its original checks; all other online blobs are retained.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,existsSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
export const anchor='e9e2550b720f8ed7c2c1230b305f0be203da7e37';
export const publishedTree='bd101b508950aae13c38c3c3c2cce7652a4c727e';
export const payload=['forge/index.html','forge/parser-model-catalog.mjs','forge/parser-nonelinear-catalog.mjs'];
export const allowed=[...payload,'forge/test-parser-model-catalog.mjs','forge/test-parser-model-catalog-browser.cjs','.github/workflows/parser-catalog-release.yml','scripts/check-parser-catalog-release.mjs','scripts/test-parser-catalog-release.mjs','scripts/parser-catalog-entry-patches.json'];
const expected={
  "forge/index.html": "b2cbb213f5dd63f0022106707dd2168a97ff16c7fe19e71c42b2d61f14434e93",
  "forge/parser-model-catalog.mjs": "dd011f63e0f559212587e35d48164da7e80e28a6cad87bb07254784772e23b92",
  "forge/parser-nonelinear-catalog.mjs": "5bb0f45dce07fa88c1779d2b9c00d50a13932a9fc0c225a430c1814b876c734d",
  "forge/test-parser-model-catalog.mjs": "620b928133e6102df0b44df47261e5aba8f9d74b55bb457bf5975d225bea5d7a",
  "forge/test-parser-model-catalog-browser.cjs": "d1ea0a85599ed02c3b0cc65a376f56e8931fdbbbd7c62ed07c6bd474a67014ff",
  ".github/workflows/parser-catalog-release.yml": "e63de41eff36e95ae9839a801282ff360efd3380d6ece7e8782fe6df9ed01e74",
  "scripts/test-parser-catalog-release.mjs": "765445f7cb36b6ab1bf7c938c0bda1209b2f45aa52f405ff881f24c8eb77e519",
  "scripts/parser-catalog-entry-patches.json": "8e6992e161fdcd6bcd149873bacf4db2d8dd3c7f4e95fc992f1a457cc479e522"
};
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
const changed=(a,b)=>git('diff','--name-only','--no-renames',a,b,'--').split('\n').filter(Boolean).sort();
export function assertAllowedPaths(paths){assert.deepEqual([...paths].sort(),[...allowed].sort(),'Unexpected repository scope');}
export function assertArtifactDiff(paths){assert.deepEqual([...paths].sort(),payload,'Only the authorized parser entry patches and two private modules may change online');}
export function assertEntryPatch(before,after){
 const patches=JSON.parse(readFileSync(join(root,'scripts/parser-catalog-entry-patches.json'),'utf8'));
 assert.equal(patches.length,6,'Only six reviewed parser integration edits');
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
 const temp=mkdtempSync(join(tmpdir(),'parser-catalog-release-')),prior=join(temp,'previous');let added=false,proof;
 try{
  git('worktree','add','--detach',prior,anchor);added=true;
  const previous=JSON.parse(execFileSync(process.execPath,['scripts/check-step3-request-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024}));
  assert.equal(previous.artifactTree,publishedTree,'Previous production artifact changed');
  execFileSync(process.execPath,['--test','scripts/test-step3-request-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024});
  const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
  const indexGit=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
  indexGit('read-tree',publishedTree);
  for(const p of payload){const blob=working?git('hash-object','-w',p):git('rev-parse','HEAD:'+p);indexGit('update-index','--add','--cacheinfo','100644',blob,p);}
  const artifactTree=indexGit('write-tree');assertArtifactDiff(changed(publishedTree,artifactTree));
  const entries=git('ls-tree','-r',artifactTree).split('\n').filter(Boolean).map(line=>{const m=line.match(/^(\d+) blob ([0-9a-f]+)\t(.+)$/);assert.ok(m,'Unsupported entry');assert.ok(['100644','100755'].includes(m[1]),'Symlinks forbidden');return {mode:m[1],blob:m[2],path:m[3]};});
  assertEntryPatch(execFileSync('git',['show',publishedTree+':forge/index.html'],{cwd:root}),execFileSync('git',['show',artifactTree+':forge/index.html'],{cwd:root}));
  proof={independentAcceptance:true,originalFrozenCheck:'Unchanged; historical failures remain failures',anchor,publishedTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,authorizedParserEntryPatches:6,allOtherOnlineBlobsIdentical:true,previousAcceptanceAndTests:true,entries};
  if(process.argv.includes('--prepare-pages')){
   assert.equal(working,false);assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
   const output='/tmp/isolated-parser-catalog-pages';assert.equal(existsSync(output),false,'Refuse overwrite');mkdirSync(output);
   indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
   for(const e of entries){const bytes=readFileSync(join(output,e.path));assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),e.blob,'Artifact mismatch: '+e.path);}
   writeFileSync('/tmp/isolated-parser-catalog-proof.json',JSON.stringify(proof,null,2));assert.equal(git('status','--porcelain','--untracked-files=all'),'','Export changed checkout');
  }
 }finally{
  assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep),'Cleanup must remain in the temporary directory');
  assert.ok(resolve(prior).startsWith(resolve(temp)+sep),'Worktree cleanup must remain in the release directory');
  if(added)git('worktree','remove','--force',prior);rmSync(temp,{recursive:true,force:true});
 }
 console.log(JSON.stringify({...proof,entries:undefined}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
