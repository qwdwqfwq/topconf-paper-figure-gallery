// Independent authorized Step 3 endpoint release; preserves every other deployed blob.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,existsSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
export const anchor='ad9e7e31b43a4ba0d1fdee389f4345528d640052';
const reviewedParent='ad9e7e31b43a4ba0d1fdee389f4345528d640052';
export const publishedTree='629b14d34b1a20de13cced2a15b1651fab672dee';
export const payload=["forge/index.html", "forge/revision-gallery.mjs", "forge/step3-image-protocol.mjs", "forge/step3-image-stream.mjs", "forge/step3-reference-upload.mjs"];
export const allowed=[...payload,...["forge/test-step3-image-stream.mjs", "forge/test-step3-image-protocol.mjs", "forge/test-step3-model-display.mjs", "forge/test-step3-reference-upload.mjs", "infistar-image-relay/test-worker.mjs", "forge/test-step3-image-endpoints-browser.cjs", ".github/workflows/step3-image-endpoints-release.yml", "scripts/check-step3-image-endpoints-release.mjs", "scripts/test-step3-image-endpoints-release.mjs"]];
const expected={
  "forge/index.html": "37e6db46b981cb18793dc4e0c4d2b9a1132e0e9041bdbedfd6ee81c0f970df63",
  "forge/revision-gallery.mjs": "9a39cf1d26e2e2912cbeb4680beb29d8e2ac1488cdcd9c67eafdf8269da91c9e",
  "forge/step3-image-protocol.mjs": "db481461a43b50610996535b7c9f32eaec9aad6a3eaccb89b12160191ada2923",
  "forge/step3-image-stream.mjs": "06a3c0af731a5bf8d7392762b99c7f56f6247fa335fc30547b100981284b993e",
  "forge/step3-reference-upload.mjs": "7e3543d9c806ec3b02b16a990055daf5cce66201bd19da60f096982a87242903",
  "forge/test-step3-image-stream.mjs": "4cdc2f1b8c4259647b85300d9cd366f77326f06fd72f20f133717708770b0518",
  "forge/test-step3-image-protocol.mjs": "4f4568871a8e69da7654cbd26d06498783db79cc3486df1df4341832451731e0",
  "forge/test-step3-reference-upload.mjs": "a42f7be097f3e6c60e2010e0b0d627e2275ded63cd01ea274746e98764d998cc",
  "infistar-image-relay/test-worker.mjs": "0ffab6ea94d33c1aeaec4ff31204e2a2adb1a7e28f9ff471a28ef7615765eeb4",
  "forge/test-step3-image-endpoints-browser.cjs": "8ebcf64a24cf0677231839b2ee5703f26cb84590b6c8ceab3bf2cefde3b0c909",
  ".github/workflows/step3-image-endpoints-release.yml": "17ab52eb87bcc9bcbddc50dd6340a8bf338348c77cbf8de2f75840fe588b2947",
  "scripts/test-step3-image-endpoints-release.mjs": "2d3c1a808413e74e0975e8d202c74fefaeea47ed01bd338744f58e731e7f04d3",
  "forge/test-step3-model-display.mjs": "674d8b9a4596d643f95425ca9fa5dff86fc0aced855447f753d6ae28b38eafc2"
};
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
const changed=(a,b)=>git('diff','--name-only','--no-renames',a,b,'--').split('\n').filter(Boolean).sort();
export function assertAllowedPaths(paths){assert.deepEqual([...paths].sort(),[...allowed].sort(),'Unexpected repository scope');}
export function assertArtifactDiff(paths){assert.deepEqual([...paths].sort(),payload,'Only the authorized Step 3 endpoint payload may change online');}
export function verifyBlob(path,data){assert.ok(expected[path],'Unreviewed path');assert.equal(createHash('sha256').update(data.toString().replace(/\r\n/g,'\n')).digest('hex'),expected[path],'Unreviewed content: '+path);}
function main(){
 const working=process.argv.includes('--working');
 if(working)assert.equal(git('rev-parse','HEAD'),reviewedParent,'Unexpected working base');
 else {assert.equal(git('show','-s','--format=%P','HEAD'),reviewedParent,'Release must directly follow reviewed production');assert.equal(git('status','--porcelain','--untracked-files=all'),'','Dirty checkout');}
 const paths=working?[...new Set([...git('diff','--name-only','--no-renames',anchor,'--').split('\n').filter(Boolean),...git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean)])]:changed(anchor,'HEAD');
 assertAllowedPaths(paths);assert.equal(Object.keys(expected).length,allowed.length-1);
 for(const p of Object.keys(expected))verifyBlob(p,readFileSync(join(root,p)));
 const temp=mkdtempSync(join(tmpdir(),'step3-image-endpoints-release-')),prior=join(temp,'previous');let added=false,proof;
 try{
  git('worktree','add','--detach',prior,anchor);added=true;
  execFileSync('git',['sparse-checkout','disable'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024});
  const previous=JSON.parse(execFileSync(process.execPath,['scripts/check-model-list-mobile-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024}));
  assert.equal(previous.artifactTree,publishedTree,'Previous production artifact changed');
  for(const p of payload){if(p==='forge/step3-reference-upload.mjs'){assert.equal(git('ls-tree',publishedTree,'--',p),'');assert.equal(git('ls-tree',anchor,'--',p),'');}else assert.equal(git('rev-parse',publishedTree+':'+p),git('rev-parse',anchor+':'+p),'Payload must start from the exact deployed blob: '+p);}
  execFileSync(process.execPath,['--test','scripts/test-model-list-mobile-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024});
  // These files also contain other workflows. Only private Step 3 import versions may change.
  const imports={
   'forge/index.html':[
    ['step3-image-stream.mjs?v=20261114-errors','step3-image-stream.mjs?v=20261115-endpoints'],
    ['step3-image-protocol.mjs?v=20261114-protocol','step3-image-protocol.mjs?v=20261115-endpoints'],
    ['revision-gallery.mjs?v=20261114-layout','revision-gallery.mjs?v=20261115-endpoints']],
   'forge/revision-gallery.mjs':[['step3-image-stream.mjs?v=20261114-errors','step3-image-stream.mjs?v=20261115-endpoints']]
  };
  for(const [p,replacements] of Object.entries(imports)){
   const original=execFileSync('git',['show',anchor+':'+p],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
   let current=readFileSync(join(root,p),'utf8').replace(/\r\n/g,'\n');
   for(const [before,after] of replacements){assert.equal(current.split(after).length,2,'Expected exactly one private import: '+p);current=current.replace(after,before);}
   assert.equal(current,original,'All code except authorized private import versions must remain identical: '+p);
  }
  const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
  const indexGit=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
  indexGit('read-tree',publishedTree);
  for(const p of payload){const blob=working?git('hash-object','-w',p):git('rev-parse','HEAD:'+p);indexGit('update-index','--add','--cacheinfo','100644',blob,p);}
  const artifactTree=indexGit('write-tree');assertArtifactDiff(changed(publishedTree,artifactTree));
  const entries=git('ls-tree','-r',artifactTree).split('\n').filter(Boolean).map(line=>{const m=line.match(/^(\d+) blob ([0-9a-f]+)\t(.+)$/);assert.ok(m,'Unsupported entry');assert.ok(['100644','100755'].includes(m[1]),'Symlinks forbidden');return {mode:m[1],blob:m[2],path:m[3]};});
  proof={independentAcceptance:true,originalFrozenCheck:'Unchanged; historical failures remain failures',anchor,publishedTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,allOtherOnlineBlobsIdentical:true,previousAcceptanceAndTests:true,entries};
  if(process.argv.includes('--prepare-pages')){
   assert.equal(working,false);assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
   const output='/tmp/isolated-step3-image-endpoints-pages';assert.equal(existsSync(output),false,'Refuse overwrite');mkdirSync(output);
   indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
   for(const e of entries){const bytes=readFileSync(join(output,e.path));assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),e.blob,'Artifact mismatch: '+e.path);}
   writeFileSync('/tmp/isolated-step3-image-endpoints-proof.json',JSON.stringify(proof,null,2));assert.equal(git('status','--porcelain','--untracked-files=all'),'','Export changed checkout');
  }
 }finally{
  assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep),'Cleanup must remain in the temporary directory');
  assert.ok(resolve(prior).startsWith(resolve(temp)+sep),'Worktree cleanup must remain in the release directory');
  if(added)git('worktree','remove','--force',prior);rmSync(temp,{recursive:true,force:true});
 }
 console.log(JSON.stringify({...proof,entries:undefined}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
