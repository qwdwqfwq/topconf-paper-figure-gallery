// Independent Step 3 model display release; preserves every other deployed blob.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,existsSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
export const anchor='a395d4de477b4daebf0413096fb67d73f7c13c5d';
const reviewedParent='542b8d9ad024bd044a7bd47be8b98dc2f8a6bfbb';
export const publishedTree='6ef5ba51058be406071320aba59c46741e1d0d29';
export const payload=['forge/step3-image-capabilities.mjs','forge/step3-model-catalog.mjs','forge/step3-official-catalog.mjs','forge/step3-resolution-display.mjs'];
export const allowed=[...payload,'forge/test-step3-model-display.mjs','forge/test-step3-model-display-browser.cjs','.github/workflows/step3-model-display-release.yml','scripts/check-step3-model-display-release.mjs','scripts/test-step3-model-display-release.mjs'];
const expected={
  "forge/step3-image-capabilities.mjs": "2fb53e0baf40dfc40921530d4e50c89bc8e31590842f0559cc9609ebbbb3bffa",
  "forge/step3-model-catalog.mjs": "e25ccf9a3d34910b3cf82b8b06749f87112e84105c555354c8474822b5db317a",
  "forge/step3-official-catalog.mjs": "1bb9b45cf1c0f936e1ef5893b816a9b8a15aa8f88dc653f8879a3374420e7746",
  "forge/step3-resolution-display.mjs": "a62e03ce60774caee7f20495affdc9ff2685851290ea723a637e10f12db2a54c",
  "forge/test-step3-model-display.mjs": "d3043f49f994c7d429f29e215dc72903b5b96e0c72b9d20364dcaf979c743826",
  "forge/test-step3-model-display-browser.cjs": "d8a23d30972abaaf3d49fdcc27342965540d6741b6c07f5077f4c9bd189dbbd8",
  ".github/workflows/step3-model-display-release.yml": "2544c0d3279e2d4112341ee977a51c059d35d64aea0c38e93cd5751b82cc1dc8",
  "scripts/test-step3-model-display-release.mjs": "7a1596b9b6f9daae1b6aa028373eb4215943026827a0c14ed9c92dbbe3ff928e"
};
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
const changed=(a,b)=>git('diff','--name-only','--no-renames',a,b,'--').split('\n').filter(Boolean).sort();
export function assertAllowedPaths(paths){assert.deepEqual([...paths].sort(),[...allowed].sort(),'Unexpected repository scope');}
export function assertArtifactDiff(paths){assert.deepEqual([...paths].sort(),payload,'Only the private Step 3 selection/display modules may change online');}
export function verifyBlob(path,data){assert.ok(expected[path],'Unreviewed path');assert.equal(createHash('sha256').update(data.toString().replace(/\r\n/g,'\n')).digest('hex'),expected[path],'Unreviewed content: '+path);}
function main(){
 const working=process.argv.includes('--working');
 if(working)assert.equal(git('rev-parse','HEAD'),reviewedParent,'Unexpected working base');
 else {assert.equal(git('show','-s','--format=%P','HEAD'),reviewedParent,'Release must directly follow reviewed production');assert.equal(git('status','--porcelain','--untracked-files=all'),'','Dirty checkout');}
 const paths=working?[...new Set([...git('diff','--name-only','--no-renames',anchor,'--').split('\n').filter(Boolean),...git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean)])]:changed(anchor,'HEAD');
 assertAllowedPaths(paths);assert.equal(Object.keys(expected).length,allowed.length-1);
 for(const p of Object.keys(expected))verifyBlob(p,readFileSync(join(root,p)));
 const temp=mkdtempSync(join(tmpdir(),'step3-model-display-release-')),prior=join(temp,'previous');let added=false,proof;
 try{
  git('worktree','add','--detach',prior,anchor);added=true;
  execFileSync('git',['sparse-checkout','disable'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024});
  const previous=JSON.parse(execFileSync(process.execPath,['scripts/check-step3-nonelinear-official-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024}));
  assert.equal(previous.artifactTree,publishedTree,'Previous production artifact changed');
  execFileSync(process.execPath,['--test','scripts/test-step3-nonelinear-official-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024});
  // Preserve the old serializer-gated selection assertions on their original version.
  // The current display contract is tested separately without altering those tests.
  execFileSync(process.execPath,['--test','forge/test-step3-image-capabilities.mjs','forge/test-step3-image-protocol.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024});
  const original=execFileSync('git',['show',anchor+':forge/step3-image-capabilities.mjs'],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
  const current=readFileSync(join(root,'forge/step3-image-capabilities.mjs'),'utf8').replace(/\r\n/g,'\n');
  const marker='export function step3ImageDimensions';
  assert.equal(current.slice(current.indexOf(marker)),original.slice(original.indexOf(marker)),'Generation dimensions and pixel acceptance must remain unchanged');
  const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
  const indexGit=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
  indexGit('read-tree',publishedTree);
  for(const p of payload){const blob=working?git('hash-object','-w',p):git('rev-parse','HEAD:'+p);indexGit('update-index','--add','--cacheinfo','100644',blob,p);}
  const artifactTree=indexGit('write-tree');assertArtifactDiff(changed(publishedTree,artifactTree));
  const entries=git('ls-tree','-r',artifactTree).split('\n').filter(Boolean).map(line=>{const m=line.match(/^(\d+) blob ([0-9a-f]+)\t(.+)$/);assert.ok(m,'Unsupported entry');assert.ok(['100644','100755'].includes(m[1]),'Symlinks forbidden');return {mode:m[1],blob:m[2],path:m[3]};});
  proof={independentAcceptance:true,originalFrozenCheck:'Unchanged; historical failures remain failures',anchor,publishedTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,allOtherOnlineBlobsIdentical:true,previousAcceptanceAndTests:true,entries};
  if(process.argv.includes('--prepare-pages')){
   assert.equal(working,false);assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
   const output='/tmp/isolated-step3-model-display-pages';assert.equal(existsSync(output),false,'Refuse overwrite');mkdirSync(output);
   indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
   for(const e of entries){const bytes=readFileSync(join(output,e.path));assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),e.blob,'Artifact mismatch: '+e.path);}
   writeFileSync('/tmp/isolated-step3-model-display-proof.json',JSON.stringify(proof,null,2));assert.equal(git('status','--porcelain','--untracked-files=all'),'','Export changed checkout');
  }
 }finally{
  assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep),'Cleanup must remain in the temporary directory');
  assert.ok(resolve(prior).startsWith(resolve(temp)+sep),'Worktree cleanup must remain in the release directory');
  if(added)git('worktree','remove','--force',prior);rmSync(temp,{recursive:true,force:true});
 }
 console.log(JSON.stringify({...proof,entries:undefined}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
