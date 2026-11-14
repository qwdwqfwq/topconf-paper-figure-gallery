// Independently authorized single-module release. Original guards remain intact.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,existsSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
export const anchor='20d322c0170118f968e16c483edcd1f412a0c5fa';
export const publishedTree='8948605c951531c92b3cefd4d2373e9c86eec391';
export const payload=['forge/revision-gallery.mjs'];
export const allowed=[...payload,'forge/test-revision-user-directed-r2.cjs','.github/workflows/step3-revision-stream-release.yml','scripts/check-step3-revision-stream-release.mjs','scripts/test-step3-revision-stream-release.mjs'];
const expected={"forge/revision-gallery.mjs":"de3572dbf5fe2dd69846fdcdaebc325524ba5bf818b3977ab421d9f8973f07cc","forge/test-revision-user-directed-r2.cjs":"fdee5a8aefbacb3d7a5b61a3a58a319fc933c4ce6d4735a91b06de17365362a1",".github/workflows/step3-revision-stream-release.yml":"7d352c4c957c3d07e6c86c072a0e8e51566c69cba226411588421736ffcee45f","scripts/test-step3-revision-stream-release.mjs":"671eba6b0139ae4387f9cdbf5b2f0212332546855b7981ee53c65e8f4564c9a4"};
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
const changed=(a,b)=>git('diff','--name-only','--no-renames',a,b,'--').split('\n').filter(Boolean).sort();
export function assertAllowedPaths(paths){assert.deepEqual([...paths].sort(),[...allowed].sort(),'Unexpected repository scope');}
export function assertArtifactDiff(paths){assert.deepEqual([...paths].sort(),payload,'Only revision-gallery.mjs may change online');}
export function assertFrozenEntry(before,after){assert.equal(after,before,'Frozen entry or another online blob changed');}
export function verifyBlob(path,data){assert.ok(expected[path],'Unreviewed path');assert.equal(createHash('sha256').update(data.toString().replace(/\r\n/g,'\n')).digest('hex'),expected[path],'Unreviewed content: '+path);}
function main(){
 const working=process.argv.includes('--working');
 if(working)assert.equal(git('rev-parse','HEAD'),anchor,'Unexpected working base');
 else {assert.equal(git('show','-s','--format=%P','HEAD'),anchor,'Release must directly follow the current production anchor');assert.equal(git('status','--porcelain','--untracked-files=all'),'','Dirty checkout');}
 const paths=working?[...new Set([...git('diff','--name-only','--no-renames',anchor,'--').split('\n').filter(Boolean),...git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean)])]:changed(anchor,'HEAD');
 assertAllowedPaths(paths);assert.equal(Object.keys(expected).length,allowed.length-1);
 for(const p of Object.keys(expected))verifyBlob(p,readFileSync(join(root,p)));
 const temp=mkdtempSync(join(tmpdir(),'step3-revision-stream-release-')),prior=join(temp,'previous');let added=false,proof;
 try{
  git('worktree','add','--detach',prior,anchor);added=true;
  // Materialize this guard's own temporary checkout when the user's clone is sparse.
  execFileSync('git',['sparse-checkout','disable'],{cwd:prior,stdio:'pipe'});
  const previous=JSON.parse(execFileSync(process.execPath,['scripts/check-step3-image-jobs-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024}));
  assert.equal(previous.artifactTree,publishedTree,'Previous production artifact changed');
  execFileSync(process.execPath,['--test','scripts/test-step3-image-jobs-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024});
  const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
  const indexGit=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
  indexGit('read-tree',publishedTree);
  for(const p of payload){const blob=working?git('hash-object','-w',p):git('rev-parse','HEAD:'+p);indexGit('update-index','--add','--cacheinfo','100644',blob,p);}
  const artifactTree=indexGit('write-tree');assertArtifactDiff(changed(publishedTree,artifactTree));
  const entries=git('ls-tree','-r',artifactTree).split('\n').filter(Boolean).map(line=>{const m=line.match(/^(\d+) blob ([0-9a-f]+)\t(.+)$/);assert.ok(m,'Unsupported entry');assert.ok(['100644','100755'].includes(m[1]),'Symlinks forbidden');return {mode:m[1],blob:m[2],path:m[3]};});
  assertFrozenEntry(git('rev-parse',publishedTree+':forge/index.html'),git('rev-parse',artifactTree+':forge/index.html'));
  proof={independentAcceptance:true,originalFrozenCheck:'Unchanged; historical failures remain failures',anchor,publishedTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-1,allOtherOnlineBlobsIdentical:true,previousAcceptanceAndTests:true,entries};
  if(process.argv.includes('--prepare-pages')){
   assert.equal(working,false);assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
   const output='/tmp/isolated-step3-revision-stream-pages';assert.equal(existsSync(output),false,'Refuse overwrite');mkdirSync(output);
   indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
   for(const e of entries){const bytes=readFileSync(join(output,e.path));assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),e.blob,'Artifact mismatch: '+e.path);}
   writeFileSync('/tmp/isolated-step3-revision-stream-proof.json',JSON.stringify(proof,null,2));assert.equal(git('status','--porcelain','--untracked-files=all'),'','Export changed checkout');
  }
 }finally{
  assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep),'Cleanup must remain in the temporary directory');
  assert.ok(resolve(prior).startsWith(resolve(temp)+sep),'Worktree cleanup must remain in the release directory');
  if(added)git('worktree','remove','--force',prior);rmSync(temp,{recursive:true,force:true});
 }
 console.log(JSON.stringify({...proof,entries:undefined}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
