// User-authorized 2026-11-14 layout intent exception; historical locks remain intact.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,existsSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const anchor='6239f015089099ba187020e8d4173d6a20db093c';
const publishedTree='051f4e5030960bc7811d8d3da1163f83314e3ed2';
export const allowed=[".github/workflows/deploy.yml", ".github/workflows/forge-workflow-lock.yml", "forge/index.html", "forge/revision-gallery.mjs", "forge/revision-layout.mjs", "forge/revision-scope.mjs", "forge/revision-routing.mjs", "forge/test-revision-compact.cjs", "forge/test-revision-routing.mjs", "scripts/check-layout-intent-release.mjs", "scripts/test-layout-intent-release.mjs"];
export const payload=["forge/index.html", "forge/revision-gallery.mjs", "forge/revision-layout.mjs", "forge/revision-routing.mjs", "forge/revision-scope.mjs"];
const expected={
  ".github/workflows/deploy.yml": "9d447e6f2e2fd40d1a0879b5d0db330c32b7a17fab981d304ad508ae10e31b0a",
  ".github/workflows/forge-workflow-lock.yml": "5a193c6c9f0ff228e1865bbfd4f7795057d560c7771008703a4e455d26f0fc15",
  "forge/index.html": "08e4a9598c916d9a99e2b8a2ab3cd0188095851b4e1a01a4ad88c43c1fcf8442",
  "forge/revision-gallery.mjs": "5a3338bdcdc32da18cbf326b9a84156e7bde725624c7ee3e9eb1ae51da4491fa",
  "forge/revision-layout.mjs": "704f66f668749caa9b2a0b44089fd29cda711773ddcbb29811d5e6523159bf7a",
  "forge/revision-scope.mjs": "fcba4017e0590ca7390849c0f360f2a16e33aa7af57622c7762b9f6033116429",
  "forge/revision-routing.mjs": "b36d2aed84051876e17464abe3377503a50e700dcdcce407f2a24604cf623d5d",
  "forge/test-revision-compact.cjs": "a704e7dfab07be2afbe1abdec8dd7612660f06d1c24d04e3d9e5b775eddfe69e",
  "forge/test-revision-routing.mjs": "905906e730095c3eed2d94939d7dab0ecb5103983d985802f510ad0aee63a900",
  "scripts/test-layout-intent-release.mjs": "a47a5527cf8be2317b7fa39f25ecbca121146db1ad9326dd7e82ad8c57b550cd"
};
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
const changed=(a,b)=>git('diff','--name-only','--no-renames',a,b,'--').split('\n').filter(Boolean).sort();
export function assertAllowedPaths(paths){assert.deepEqual([...paths].sort(),[...allowed].sort(),'Unexpected repository scope');}
export function assertArtifactDiff(paths){assert.deepEqual([...paths].sort(),payload,'Only the five explicitly unlocked Step 3 revision runtime files may change online');}
export function assertEntryIsolation(text,before,path){
 const queries={
  'forge/index.html':["./revision-gallery.mjs?v=20261114-layout"],
  'forge/revision-gallery.mjs':["./revision-scope.mjs?v=20261114-layout"]
 };
 assert.ok(queries[path],'Unreviewed entry file');
 let restored=text.replace(/\r\n/g,'\n');
 for(const current of queries[path]){
  assert.equal(restored.split(current).length,2,'Authorized revision query must occur exactly once');
  restored=restored.replace(current,current.replace('20261114-layout','20261114-errors'));
 }
 assert.equal(restored,before.replace(/\r\n/g,'\n'),'Entry changed beyond isolated Step 3 revision cache query: '+path);
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
 assert.equal(Object.keys(expected).length,allowed.length-1,'All reviewed payload/test/workflow files except this guard must be pinned');
 for(const p of Object.keys(expected))verifyBlob(p,readFileSync(join(root,p)));
 for(const p of ['forge/index.html','forge/revision-gallery.mjs'])assertEntryIsolation(readFileSync(join(root,p),'utf8'),execFileSync('git',['show',anchor+':'+p],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024}),p);
 const temp=mkdtempSync(join(tmpdir(),'layout-intent-'));const prior=join(temp,'previous');let added=false,proof;
 try{
  // Run the unmodified prior release acceptance in its original clean checkout.
  // This reconstructs the previously published blobs from reachable commits in CI.
  git('worktree','add','--detach',prior,anchor);added=true;
  const previous=JSON.parse(execFileSync(process.execPath,['scripts/check-error-recovery-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024}));
  assert.equal(previous.artifactTree,publishedTree,'Previous successful publication changed');
  const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
  const indexGit=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
  indexGit('read-tree',publishedTree);
  for(const p of payload){const blob=working?git('hash-object','-w',p):git('rev-parse','HEAD:'+p);indexGit('update-index','--add','--cacheinfo','100644',blob,p);}
  const artifactTree=indexGit('write-tree');assertArtifactDiff(changed(publishedTree,artifactTree));
  const entries=git('ls-tree','-r',artifactTree).split('\n').filter(Boolean).map(line=>{const match=line.match(/^(\d+) blob ([0-9a-f]+)\t(.+)$/);assert.ok(match,'Unsupported artifact entry');assert.ok(['100644','100755'].includes(match[1]),'Symlinks forbidden');return {mode:match[1],blob:match[2],path:match[3]};});
  proof={independentAcceptance:true,originalFrozenCheck:'Unchanged; historical failures remain separately visible',anchor,publishedTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,unlockedStep3EntryIsolation:true,entries};
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
