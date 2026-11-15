// Independent authorized Step 3 streaming compatibility release; preserves every other deployed blob.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,existsSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
export const anchor='6c67ba49254163942f8d95fcd4127d48f252dfb9';
const reviewedParent='6c67ba49254163942f8d95fcd4127d48f252dfb9';
export const publishedTree='c6fb83dfefbd3aabce5fdf4d440f5976b939d6c3';
export const payload=["forge/revision-gallery.mjs","forge/step3-image-compat.mjs","forge/step3-image-protocol.mjs","forge/step3-image-stream.mjs"];
export const allowed=[...payload,...["forge/test-step3-stream-compat.mjs","forge/test-step3-stream-compat-browser.cjs","forge/test-step3-image-stream.mjs","forge/test-step3-image-protocol.mjs","forge/test-step3-reference-upload.mjs","forge/test-step3-model-display.mjs","infistar-image-relay/worker.mjs","infistar-image-relay/browser-image-fetch.mjs","infistar-image-relay/test-worker.mjs",".github/workflows/step3-stream-compat-release.yml","scripts/check-step3-stream-compat-release.mjs","scripts/test-step3-stream-compat-release.mjs"]];
const expected={
  "forge/test-step3-model-display.mjs": "cbd14b023b90d97bcda58d69d05b9b6b2cdc17629f4edab4f2ae233f6ab4a08d",
  "forge/revision-gallery.mjs": "4b2b28efafb2b87805ed44b6e9624883e6275ebfd70efe60b7d5cc441374ea08",
  "forge/step3-image-compat.mjs": "8fd45a459305f1fca23a3d78ffa8c72f110abf4b995fa5bea2c8a9b899c0a870",
  "forge/step3-image-protocol.mjs": "40a955f00db97b28aa37871f4d899fa438164c984fd3d5411d4d177df197d077",
  "forge/step3-image-stream.mjs": "743044fc88b0d5a8f66941af6422f58732b6ea15dfe82dded4c7bab1f4be29d7",
  "forge/test-step3-stream-compat.mjs": "2e89195420892d7161238e89a9d85e5fb9a1db98bbe681e1d874c3e350e0bb81",
  "forge/test-step3-stream-compat-browser.cjs": "b4835e2d45c4f7a358d025dd6f9d4401f9e9be58d70162132df8b19f0064b884",
  "forge/test-step3-image-stream.mjs": "f6661ff61f0c01016948989ba9981a1c409001be3c272e89b7fbfa8676024caf",
  "forge/test-step3-image-protocol.mjs": "b85511aded9bef0b7b070258f26637700a1de84936463ccbd151585646f86dae",
  "forge/test-step3-reference-upload.mjs": "05d36625e8070a30a598ae43e7637174f215a533212fdaea8bdfaa13b6039d12",
  "infistar-image-relay/worker.mjs": "b6e7b1c70991028c8b780f9bab5b8a2473870bdd9e6254fd6efe72b7ded7a070",
  "infistar-image-relay/browser-image-fetch.mjs": "3ec22aed9583ed6083127505e98dfd9bd1a3ff98ad2e168d14184a025c573a7d",
  "infistar-image-relay/test-worker.mjs": "e9a0e6280178ca23234b24c03c23bd7144e4f7cc7404f049640633078b520303",
  ".github/workflows/step3-stream-compat-release.yml": "f86d288ecace2dd68a0212e39cd20ad52d799a70e5163f9e263e557afd4bb8fb",
  "scripts/test-step3-stream-compat-release.mjs": "3e9805710c898404448471745327beacc8ae35cf1a1facabaac66d4b51cc776f"
};
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
const changed=(a,b)=>git('diff','--name-only','--no-renames',a,b,'--').split('\n').filter(Boolean).sort();
export function assertAllowedPaths(paths){assert.deepEqual([...paths].sort(),[...allowed].sort(),'Unexpected repository scope');}
export function assertArtifactDiff(paths){assert.deepEqual([...paths].sort(),payload,'Only the authorized Step 3 compatibility payload may change online');}
export function verifyBlob(path,data){assert.ok(expected[path],'Unreviewed path');assert.equal(createHash('sha256').update(data.toString().replace(/\r\n/g,'\n')).digest('hex'),expected[path],'Unreviewed content: '+path);}
function main(){
 const working=process.argv.includes('--working');
 if(working)assert.equal(git('rev-parse','HEAD'),reviewedParent,'Unexpected working base');
 else {assert.equal(git('show','-s','--format=%P','HEAD'),reviewedParent,'Release must directly follow reviewed production');assert.equal(git('status','--porcelain','--untracked-files=all'),'','Dirty checkout');}
 const paths=working?[...new Set([...git('diff','--name-only','--no-renames',anchor,'--').split('\n').filter(Boolean),...git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean)])]:changed(anchor,'HEAD');
 assertAllowedPaths(paths);assert.equal(Object.keys(expected).length,allowed.length-1);
 for(const p of Object.keys(expected))verifyBlob(p,readFileSync(join(root,p)));
 const temp=mkdtempSync(join(tmpdir(),'step3-stream-compat-release-')),prior=join(temp,'previous');let added=false,proof;
 try{
  git('worktree','add','--detach',prior,anchor);added=true;
  execFileSync('git',['sparse-checkout','disable'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024});
  const previous=JSON.parse(execFileSync(process.execPath,['scripts/check-step3-local-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024}));
  assert.equal(previous.artifactTree,publishedTree,'Previous production artifact changed');
  for(const p of payload){if(p==='forge/step3-image-compat.mjs'){assert.equal(git('ls-tree',publishedTree,'--',p),'');assert.equal(git('ls-tree',anchor,'--',p),'');}else assert.equal(git('rev-parse',publishedTree+':'+p),git('rev-parse',anchor+':'+p),'Payload must start from the exact deployed blob: '+p);}
  execFileSync(process.execPath,['--test','scripts/test-step3-local-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024});
  // The frozen entry point, adapters, Step 4 and all previous guards stay byte-identical.
  const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
  const indexGit=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
  indexGit('read-tree',publishedTree);
  for(const p of payload){const blob=working?git('hash-object','-w',p):git('rev-parse','HEAD:'+p);indexGit('update-index','--add','--cacheinfo','100644',blob,p);}
  const artifactTree=indexGit('write-tree');assertArtifactDiff(changed(publishedTree,artifactTree));
  const entries=git('ls-tree','-r',artifactTree).split('\n').filter(Boolean).map(line=>{const m=line.match(/^(\d+) blob ([0-9a-f]+)\t(.+)$/);assert.ok(m,'Unsupported entry');assert.ok(['100644','100755'].includes(m[1]),'Symlinks forbidden');return {mode:m[1],blob:m[2],path:m[3]};});
  proof={independentAcceptance:true,originalFrozenCheck:'Unchanged; historical failures remain failures',anchor,publishedTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,allOtherOnlineBlobsIdentical:true,previousAcceptanceAndTests:true,entries};
  if(process.argv.includes('--prepare-pages')){
   assert.equal(working,false);assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
   const output='/tmp/isolated-step3-stream-compat-pages';assert.equal(existsSync(output),false,'Refuse overwrite');mkdirSync(output);
   indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
   for(const e of entries){const bytes=readFileSync(join(output,e.path));assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),e.blob,'Artifact mismatch: '+e.path);}
   writeFileSync('/tmp/isolated-step3-stream-compat-proof.json',JSON.stringify(proof,null,2));assert.equal(git('status','--porcelain','--untracked-files=all'),'','Export changed checkout');
  }
 }finally{
  assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep),'Cleanup must remain in the temporary directory');
  assert.ok(resolve(prior).startsWith(resolve(temp)+sep),'Worktree cleanup must remain in the release directory');
  if(added)git('worktree','remove','--force',prior);rmSync(temp,{recursive:true,force:true});
 }
 console.log(JSON.stringify({...proof,entries:undefined}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
