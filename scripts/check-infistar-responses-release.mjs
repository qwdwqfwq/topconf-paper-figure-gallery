// Owner-authorized transport-only exception. Historical locks/manifests are unchanged.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync,mkdirSync,existsSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const anchor='e25b969c8f631efcf14a7acbaa1cdca006b5e901';
const publishedTree='2a0bfddbb797e7b1a6bb5ff4467aaac283418a58';
const payload=['forge/index.html','forge/infistar-reconstruction-responses.mjs'];
const allowed=[...payload,'forge/test-infistar-reconstruction-responses.mjs','.github/workflows/deploy.yml','.github/workflows/forge-workflow-lock.yml','scripts/check-infistar-responses-release.mjs','scripts/test-infistar-responses-release.mjs'].sort();
const expected={
  "forge/index.html": "f43867dd4e51b10874f05c72dd92f7d5e733d7157374a5252912dbd9c614a8b0",
  "forge/infistar-reconstruction-responses.mjs": "e1768821dac00b8e89e834c2820df7a2799c6ced929d5ffc8f54bafdc134d675",
  "forge/test-infistar-reconstruction-responses.mjs": "c82b91f5d3ef212207265a66b3bc91e547da4369d873182626ad279777a956c6",
  ".github/workflows/deploy.yml": "1d6b27739efd6a015e6680e80a5c01f470d48d1fd413ea2d00d990161a4d29a9",
  ".github/workflows/forge-workflow-lock.yml": "2c6c1b3ee25a7d58d756fd543da4664376bb717270d6a1d2c878ae7b41e6ee0c",
  "scripts/test-infistar-responses-release.mjs": "4bee2c8346e1f6f41b9b69529e30185b4f2a61f7b24100908384669f5014985d"
};
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024}).trim();
const changed=(a,b)=>git('diff','--name-only','--no-renames',a,b,'--').split('\n').filter(Boolean).sort();
export function assertAllowedPaths(paths){assert.deepEqual([...paths].sort(),allowed,'Unexpected source release scope');}
export function assertArtifactDiff(paths){assert.deepEqual([...paths].sort(),payload,'Only index request branch and Responses adapter may change online');}
export function verifyBlob(path,data){assert.ok(expected[path],'Unreviewed release file');assert.equal(createHash('sha256').update(data.toString().replace(/\r\n/g,'\n')).digest('hex'),expected[path],'Release content changed: '+path);}
export function patchIndex(base){
 const a="import {fetchReconstructionStream,usesReconstructionStream} from './infistar-reconstruction-stream.mjs';";
 const b="const r=await (usesReconstructionStream($('#provider').value)?fetchReconstructionStream:fetchTextWithTimeout)(baseURL()+'/chat/completions',{";
 for(const text of [a,b])assert.equal(base.split(text).length,2,'Request patch anchor must occur exactly once');
 return base.replace(a,a+"\nimport {fetchReconstructionResponses,usesReconstructionResponses} from './infistar-reconstruction-responses.mjs';")
 .replace(b,"const responses=usesReconstructionResponses($('#provider').value,model,wholeRequest);\n  const r=await (responses?fetchReconstructionResponses:usesReconstructionStream($('#provider').value)?fetchReconstructionStream:fetchTextWithTimeout)(baseURL()+(responses?'/responses':'/chat/completions'),{");
}
function main(){
 const working=process.argv.includes('--working');
 assert.equal(working?git('rev-parse','HEAD'):git('show','-s','--format=%P','HEAD'),anchor,'Release must immediately follow successful production');
 const paths=working?[...new Set([...git('diff','--name-only',anchor,'--').split('\n').filter(Boolean),...git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean)])]:changed(anchor,'HEAD');
 assertAllowedPaths(paths);
 if(!working)assert.equal(git('status','--porcelain','--untracked-files=all'),'','Dirty release checkout');
 for(const path of Object.keys(expected))verifyBlob(path,working?readFileSync(join(root,path)):execFileSync('git',['show','HEAD:'+path],{cwd:root}));
 // Reconstruct the exact successful artifact with its unchanged acceptance script.
 const baselineTemp=mkdtempSync(join(tmpdir(),'infistar-baseline-'));
 const baselineCheckout=join(baselineTemp,'source');
 try{
  git('worktree','add','--detach',baselineCheckout,anchor);
  const result=JSON.parse(execFileSync(process.execPath,['scripts/check-revision-isolated-release.mjs'],{cwd:baselineCheckout,encoding:'utf8',maxBuffer:64*1024*1024}));
  assert.equal(result.artifactTree,publishedTree,'Successful production artifact changed');
 }finally{
  if(existsSync(baselineCheckout))git('worktree','remove',baselineCheckout);
  rmSync(baselineTemp,{recursive:true,force:true});
 }
 const blob=(rev,path)=>execFileSync('git',['show',rev+':'+path],{cwd:root,maxBuffer:32*1024*1024});
 assert.equal((working?readFileSync(join(root,'forge/index.html')):blob('HEAD','forge/index.html')).toString().replace(/\r\n/g,'\n'),patchIndex(blob(publishedTree,'forge/index.html').toString().replace(/\r\n/g,'\n')),'Other index behavior changed');
 const temp=mkdtempSync(join(tmpdir(),'infistar-release-'));
 try{
  const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
  const ig=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',env,maxBuffer:64*1024*1024}).trim();
  ig('read-tree',publishedTree);
  for(const path of payload)ig('update-index','--add','--cacheinfo','100644',working?git('hash-object','-w',path):git('rev-parse','HEAD:'+path),path);
  const artifactTree=ig('write-tree');assertArtifactDiff(changed(publishedTree,artifactTree));
  const entries=git('ls-tree','-r',artifactTree).split('\n').filter(Boolean).map(line=>{const m=line.match(/^(\d+) blob ([0-9a-f]+)\t(.+)$/);assert.ok(m);return {mode:m[1],blob:m[2],path:m[3]};});
  const proof={anchor,productionRun:43317525556,publishedTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,originalFreeze:'unchanged; historical failures remain failures',entries};
  if(process.argv.includes('--prepare-pages')){
   assert.equal(working,false);assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
   const output='/tmp/isolated-infistar-pages';assert.equal(existsSync(output),false);mkdirSync(output);
   ig('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
   for(const e of entries){assert.ok(['100644','100755'].includes(e.mode));const b=readFileSync(join(output,e.path));assert.equal(createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex'),e.blob,'Artifact bytes differ: '+e.path);}
   writeFileSync('/tmp/isolated-infistar-proof.json',JSON.stringify(proof,null,2));assert.equal(git('status','--porcelain','--untracked-files=all'),'');
  }
  console.log(JSON.stringify({...proof,entries:undefined}));
 }finally{rmSync(temp,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
