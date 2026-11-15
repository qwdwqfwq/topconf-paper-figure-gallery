// Independent authorized Step 3 ordinary image and immediate-error release; preserves every other deployed blob.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,existsSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
export const anchor='235ed565f87c8bbc866eeb6ede0c4c5821fc54dc';
const reviewedParent='d1eb457c3dbd644807ce9c553d63637240d2a451';
export const publishedTree='d8aee3a87cacf43da0d59c9d1d48910f57e05248';
export const payload=["forge/step3-image-compat.mjs", "forge/step3-image-stream.mjs", "forge/step3-infistar-job.mjs"];
export const workerPayload=["infistar-image-relay/worker.mjs"];
export const allowed=[".github/workflows/step3-nonelinear-ordinary-release.yml", "forge/step3-image-compat.mjs", "forge/step3-image-stream.mjs", "forge/step3-infistar-job.mjs", "forge/test-step3-image-protocol.mjs", "forge/test-step3-image-stream.mjs", "forge/test-step3-model-display.mjs", "forge/test-step3-no-recovery-browser.cjs", "forge/test-step3-no-recovery.mjs", "forge/test-step3-nonelinear-ordinary-browser.cjs", "forge/test-step3-nonelinear-ordinary.mjs", "forge/test-step3-stream-compat-browser.cjs", "forge/test-step3-stream-compat.mjs", "infistar-image-relay/test-worker.mjs", "infistar-image-relay/worker.mjs", "scripts/check-step3-nonelinear-ordinary-release.mjs", "scripts/test-step3-nonelinear-ordinary-release.mjs"];
const expected={
  ".github/workflows/step3-nonelinear-ordinary-release.yml": "9ceccba0828ccc0f4b5ff0b1cd25898a41baedcaace0272518fa430beae78a69",
  "forge/step3-image-compat.mjs": "048917e4fe24be2585f5216e32d1c2941dc8d0cb4e632a84ce06e8967b2ad6dd",
  "forge/step3-image-stream.mjs": "a741be95d4c6adae26d7c6cd3cc78e13f55b86a36c501d5a793622c40d817609",
  "forge/step3-infistar-job.mjs": "a3b23f68c6bc37e51ce8616e11cc71d7d946c2a091540668e834f3c134076130",
  "forge/test-step3-image-protocol.mjs": "8287e8ffc7d72d75207f47e170523c10460f39485d6628cb3be87bc26dab4494",
  "forge/test-step3-image-stream.mjs": "e425e910ade1894dcedfa260c74dd5c50dc5ce9d274d72faed1579a85b79914f",
  "forge/test-step3-model-display.mjs": "4be8d12422fd77780dd54400c9d674a1f58de84f32f09db3708fccf2cb94291c",
  "forge/test-step3-no-recovery-browser.cjs": "2446a6873b77ef2d922a945b3c030fd8cf78d57a5941d3439cbdc1045943436b",
  "forge/test-step3-no-recovery.mjs": "06d40db1290565ea321387a86c66917b4ea50f0c9ce41f473c9e64f2c0f1034f",
  "forge/test-step3-nonelinear-ordinary-browser.cjs": "3bdba22d784a57d971e54b321e4b61ac37089fac1814eea78091324ef7a4fd69",
  "forge/test-step3-nonelinear-ordinary.mjs": "2e19bdcea2f696bc3d9639c5e3d9a9a72d26bd76e6864348c6bf1ce14ec46edc",
  "forge/test-step3-stream-compat-browser.cjs": "f6ebc40d9c240ffcab925d26ef389c35977e6568d2453a76bb7ea4ab00701151",
  "forge/test-step3-stream-compat.mjs": "ce538a575a15b8111d0dddaf5be5fc0bb8a0eb59ddc1300ab85edf05227fc338",
  "infistar-image-relay/test-worker.mjs": "dc1fcd2bc9d2acf935852b2bb2e2b83199cae781708eb518b84e16c99cf396b9",
  "infistar-image-relay/worker.mjs": "44835f73b02fad11f2bbbf520b36fe261470f426566a829072701474d1fbcfe4",
  "scripts/test-step3-nonelinear-ordinary-release.mjs": "78d1a8cd72f09ffbdd412fd329a402449d1ee239082e17287c033df58debc7cb"
};
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
const changed=(a,b)=>git('diff','--name-only','--no-renames',a,b,'--').split('\n').filter(Boolean).sort();
export function assertAllowedPaths(paths){assert.deepEqual([...paths].sort(),[...allowed].sort(),'Unexpected repository scope');}
export function assertArtifactDiff(paths){assert.deepEqual([...paths].sort(),payload,'Only the authorized Step 3 image transport payload may change online');}
export function verifyBlob(path,data){assert.ok(expected[path],'Unreviewed path');assert.equal(createHash('sha256').update(data.toString().replace(/\r\n/g,'\n')).digest('hex'),expected[path],'Unreviewed content: '+path);}
function main(){
 const working=process.argv.includes('--working');
 if(working)assert.equal(git('rev-parse','HEAD'),reviewedParent,'Unexpected working base');
 else {assert.equal(git('show','-s','--format=%P','HEAD'),reviewedParent,'Release must directly follow reviewed production');assert.equal(git('status','--porcelain','--untracked-files=all'),'','Dirty checkout');}
 const paths=working?[...new Set([...git('diff','--name-only','--no-renames',anchor,'--').split('\n').filter(Boolean),...git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean)])]:changed(anchor,'HEAD');
 assertAllowedPaths(paths);assert.equal(Object.keys(expected).length,allowed.length-1);
 for(const p of Object.keys(expected))verifyBlob(p,readFileSync(join(root,p)));
 const temp=mkdtempSync(join(tmpdir(),'step3-nonelinear-ordinary-release-')),prior=join(temp,'previous');let added=false,proof;
 try{
  git('worktree','add','--detach',prior,anchor);added=true;
  execFileSync('git',['sparse-checkout','disable'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024});
  const previous=JSON.parse(execFileSync(process.execPath,['scripts/check-step3-no-recovery-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024}));
  assert.equal(previous.artifactTree,publishedTree,'Previous production artifact changed');
  for(const p of payload){assert.equal(git('rev-parse',publishedTree+':'+p),git('rev-parse',anchor+':'+p),'Payload must start from the exact deployed blob: '+p);}
  execFileSync(process.execPath,['--test','scripts/test-step3-no-recovery-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024});
  // The frozen entry point, adapters, Step 4 and all previous guards stay byte-identical.
  const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
  const indexGit=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
  indexGit('read-tree',publishedTree);
  for(const p of payload){const blob=working?git('hash-object','-w',p):git('rev-parse','HEAD:'+p);indexGit('update-index','--add','--cacheinfo','100644',blob,p);}
  const artifactTree=indexGit('write-tree');assertArtifactDiff(changed(publishedTree,artifactTree));
  const entries=git('ls-tree','-r',artifactTree).split('\n').filter(Boolean).map(line=>{const m=line.match(/^(\d+) blob ([0-9a-f]+)\t(.+)$/);assert.ok(m,'Unsupported entry');assert.ok(['100644','100755'].includes(m[1]),'Symlinks forbidden');return {mode:m[1],blob:m[2],path:m[3]};});
  for(const p of workerPayload)assert.equal(git('ls-tree',publishedTree,'--',p),'','Worker services must remain outside the static Pages artifact');
  proof={independentAcceptance:true,originalFrozenCheck:'Unchanged; historical failures remain failures',anchor,publishedTree,artifactTree,changedOnline:payload,separatelyDeployedWorker:workerPayload,unchangedFiles:entries.length-payload.length,allOtherOnlineBlobsIdentical:true,previousAcceptanceAndTests:true,entries};
  if(process.argv.includes('--prepare-pages')){
   assert.equal(working,false);assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
   const output='/tmp/isolated-step3-nonelinear-ordinary-pages';assert.equal(existsSync(output),false,'Refuse overwrite');mkdirSync(output);
   indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
   for(const e of entries){const bytes=readFileSync(join(output,e.path));assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),e.blob,'Artifact mismatch: '+e.path);}
   writeFileSync('/tmp/isolated-step3-nonelinear-ordinary-proof.json',JSON.stringify(proof,null,2));assert.equal(git('status','--porcelain','--untracked-files=all'),'','Export changed checkout');
  }
 }finally{
  assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep),'Cleanup must remain in the temporary directory');
  assert.ok(resolve(prior).startsWith(resolve(temp)+sep),'Worktree cleanup must remain in the release directory');
  if(added)git('worktree','remove','--force',prior);rmSync(temp,{recursive:true,force:true});
 }
 console.log(JSON.stringify({...proof,entries:undefined}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
