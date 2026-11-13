// Step 3-only publication. Every other deployed blob, including all Step 4 files,
// is copied from the independently reconstructed current production artifact.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,existsSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
export const anchor='f9bfba3d6c318ec79593a7e3240ad72adbf6f1ee';
const releaseParent='77dbdc5b4f371e4f6beb493dcaff09eaae8163f1';
export const publishedTree='90313784e6c8080769c71a39ef6c7b011b11bade';
export const payload=['forge/revision-gallery.mjs','forge/revision-layout.mjs','forge/revision-pixels.mjs','forge/revision-routing.mjs'];
export const allowed=[...payload,'forge/test-revision-compact.cjs','forge/test-revision-routing.mjs','forge/test-revision-flexible.cjs','.github/workflows/step3-flexible-release.yml','scripts/check-step3-flexible-release.mjs','scripts/test-step3-flexible-release.mjs'];
const expected={
  "forge/revision-gallery.mjs": "8e6172bd98d1a38ec9363bfae849ac8a6287b470890b0c7a08af65ee2e53c3e0",
  "forge/revision-layout.mjs": "b73cfe43c23133c83f36c1b79972e534fd8139002473366744195495ef4b22b6",
  "forge/revision-pixels.mjs": "8c8bda61b56f3358c5b6ddc4e1b8f0e53aa5991d20bee058cc1fc51c54cc3fcc",
  "forge/revision-routing.mjs": "273630897cd396edda70749071803ab4af9f483772c1c1658b95d8d56285c1c9",
  "forge/test-revision-compact.cjs": "16ca3521ed904024807e969c7133a195c5407c2dfecd69ed86b236dc030ec9ed",
  "forge/test-revision-routing.mjs": "7ebc26b4b856fa5b478bcb63c6a14df8d1e34a6db5e309c09b91227e79716b95",
  "forge/test-revision-flexible.cjs": "3ee687bcde0ef8a3afd3fedce6e368117b65586d744b0204c9ca1c789198e98b",
  ".github/workflows/step3-flexible-release.yml": "2aa929581f340e92c9ab6d3af7a02ce1f30664b9042dad9936eb9eca6c675b47",
  "scripts/test-step3-flexible-release.mjs": "bdb46620c8d361e02e67874a86df00ed0aa46c951c36a0b6a4b8ffce15cb06b4"
};
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
const changed=(a,b)=>git('diff','--name-only','--no-renames',a,b,'--').split('\n').filter(Boolean).sort();
export function assertAllowedPaths(paths){assert.deepEqual([...paths].sort(),[...allowed].sort(),'Unexpected repository scope');}
export function assertArtifactDiff(paths){assert.deepEqual([...paths].sort(),[...payload].sort(),'Only four private Step 3 modules may change online');}
export function verifyBlob(path,data){assert.ok(expected[path],'Unreviewed path');assert.equal(createHash('sha256').update(data.toString().replace(/\r\n/g,'\n')).digest('hex'),expected[path],'Unreviewed content: '+path);}
function main(){
 const working=process.argv.includes('--working');
 if(working)assert.equal(git('rev-parse','HEAD'),releaseParent,'Unexpected working base');
 else {assert.equal(git('show','-s','--format=%P','HEAD'),releaseParent,'Release must directly follow the reviewed Step 3 candidate');assert.equal(git('status','--porcelain','--untracked-files=all'),'','Dirty checkout');}
 const paths=working?[...new Set([...git('diff','--name-only','--no-renames',anchor,'--').split('\n').filter(Boolean),...git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean)])]:changed(anchor,'HEAD');
 assertAllowedPaths(paths);
 assert.equal(Object.keys(expected).length,allowed.length-1);
 for(const p of Object.keys(expected))verifyBlob(p,readFileSync(join(root,p)));
 const temp=mkdtempSync(join(tmpdir(),'step3-flexible-release-')),prior=join(temp,'previous');let added=false,proof;
 try{
  git('worktree','add','--detach',prior,anchor);added=true;
  const previous=JSON.parse(execFileSync(process.execPath,['scripts/check-nonelinear-source-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024}));
  assert.equal(previous.artifactTree,publishedTree,'Previous production artifact changed');
  execFileSync(process.execPath,['--test','scripts/test-nonelinear-source-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024});
  const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
  const indexGit=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
  indexGit('read-tree',publishedTree);
  for(const p of payload){const blob=working?git('hash-object','-w',p):git('rev-parse','HEAD:'+p);indexGit('update-index','--add','--cacheinfo','100644',blob,p);}
  const artifactTree=indexGit('write-tree');assertArtifactDiff(changed(publishedTree,artifactTree));
  const entries=git('ls-tree','-r',artifactTree).split('\n').filter(Boolean).map(line=>{const m=line.match(/^(\d+) blob ([0-9a-f]+)\t(.+)$/);assert.ok(m,'Unsupported entry');assert.ok(['100644','100755'].includes(m[1]),'Symlinks forbidden');return {mode:m[1],blob:m[2],path:m[3]};});
  assert.equal(git('rev-parse',publishedTree+':forge/index.html'),git('rev-parse',artifactTree+':forge/index.html'),'Frozen shared entry changed');
  proof={independentAcceptance:true,originalFrozenCheck:'Unchanged; historical failures remain failures',anchor,publishedTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,frozenEntryIdentical:true,previousAcceptanceAndTests:true,entries};
  if(process.argv.includes('--prepare-pages')){
   assert.equal(working,false);assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
   const output='/tmp/isolated-step3-flexible-pages';assert.equal(existsSync(output),false,'Refuse overwrite');mkdirSync(output);
   indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
   for(const e of entries){const bytes=readFileSync(join(output,e.path));assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),e.blob,'Artifact mismatch: '+e.path);}
   writeFileSync('/tmp/isolated-step3-flexible-proof.json',JSON.stringify(proof,null,2));assert.equal(git('status','--porcelain','--untracked-files=all'),'','Export changed checkout');
  }
 }finally{if(added)git('worktree','remove','--force',prior);assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep));rmSync(temp,{recursive:true,force:true});}
 console.log(JSON.stringify({...proof,entries:undefined}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
