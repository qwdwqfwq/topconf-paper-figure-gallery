// Independent Steps 1/3 catalog display release; preserves every other deployed blob.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,existsSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
export const anchor='b4e07f5aefaf0ffc95bd577b5dce29cd9c25887a';
const reviewedParent='b4e07f5aefaf0ffc95bd577b5dce29cd9c25887a';
export const publishedTree='df2231af0bf8500b7aed0e6582520c216dd00f19';
export const payload=['forge/model-list-display.mjs','forge/parser-model-catalog.mjs','forge/step3-model-catalog.mjs'];
export const allowed=[...payload,'forge/test-model-list-display.mjs','forge/test-model-list-fold-browser.cjs','.github/workflows/model-list-fold-release.yml','scripts/check-model-list-fold-release.mjs','scripts/test-model-list-fold-release.mjs'];
const expected={
  "forge/model-list-display.mjs": "33fa619447c1663a6070b003f2f9aa4ed526f6427960d065a794e6bf4cdba647",
  "forge/parser-model-catalog.mjs": "9123e8e321776cac3d253b8976b7b69e53edc16b251d4342cc42dcabfbcc273f",
  "forge/step3-model-catalog.mjs": "01cda78ec7107d0dc4fe5cd2856f79892ec2510c845f7ac741bf9b0453f9898d",
  "forge/test-model-list-display.mjs": "4f09cccfb2bd62228a90d284955d1a95c631073d7ca2027e1244b3cc24e0ac6e",
  "forge/test-model-list-fold-browser.cjs": "242a4613c6386c77e4f5f29a4d164f266e12130703376075fc4ef82ee784a148",
  ".github/workflows/model-list-fold-release.yml": "b2558d25819912c534a28e90662e81089b8cb007d5022fafc32edb747111ed24",
  "scripts/test-model-list-fold-release.mjs": "092cb479eeb1f5eb08de2cbef8ed7e0e30b76450c9b3fd38c8f6c03794623c9f"
};
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
const changed=(a,b)=>git('diff','--name-only','--no-renames',a,b,'--').split('\n').filter(Boolean).sort();
export function assertAllowedPaths(paths){assert.deepEqual([...paths].sort(),[...allowed].sort(),'Unexpected repository scope');}
export function assertArtifactDiff(paths){assert.deepEqual([...paths].sort(),payload,'Only the private Steps 1/3 catalog selection/display modules may change online');}
export function verifyBlob(path,data){assert.ok(expected[path],'Unreviewed path');assert.equal(createHash('sha256').update(data.toString().replace(/\r\n/g,'\n')).digest('hex'),expected[path],'Unreviewed content: '+path);}
function main(){
 const working=process.argv.includes('--working');
 if(working)assert.equal(git('rev-parse','HEAD'),reviewedParent,'Unexpected working base');
 else {assert.equal(git('show','-s','--format=%P','HEAD'),reviewedParent,'Release must directly follow reviewed production');assert.equal(git('status','--porcelain','--untracked-files=all'),'','Dirty checkout');}
 const paths=working?[...new Set([...git('diff','--name-only','--no-renames',anchor,'--').split('\n').filter(Boolean),...git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean)])]:changed(anchor,'HEAD');
 assertAllowedPaths(paths);assert.equal(Object.keys(expected).length,allowed.length-1);
 for(const p of Object.keys(expected))verifyBlob(p,readFileSync(join(root,p)));
 const temp=mkdtempSync(join(tmpdir(),'model-list-fold-release-')),prior=join(temp,'previous');let added=false,proof;
 try{
  git('worktree','add','--detach',prior,anchor);added=true;
  execFileSync('git',['sparse-checkout','disable'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024});
  const previous=JSON.parse(execFileSync(process.execPath,['scripts/check-step3-model-display-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024}));
  assert.equal(previous.artifactTree,publishedTree,'Previous production artifact changed');
  execFileSync(process.execPath,['--test','scripts/test-step3-model-display-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024});
  // Transport exports are also consumed outside this display layer: preserve them exactly.
  const original=execFileSync('git',['show',anchor+':forge/parser-model-catalog.mjs'],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
  const current=readFileSync(join(root,'forge/parser-model-catalog.mjs'),'utf8').replace(/\r\n/g,'\n');
  const transport=source=>source.slice(source.indexOf('export function normalizeModels'),source.indexOf('const messages='));
  assert.ok(transport(original).length>1000);
  assert.equal(transport(current),transport(original),'Shared catalog transport exports must remain unchanged');
  const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
  const indexGit=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
  indexGit('read-tree',publishedTree);
  for(const p of payload){const blob=working?git('hash-object','-w',p):git('rev-parse','HEAD:'+p);indexGit('update-index','--add','--cacheinfo','100644',blob,p);}
  const artifactTree=indexGit('write-tree');assertArtifactDiff(changed(publishedTree,artifactTree));
  const entries=git('ls-tree','-r',artifactTree).split('\n').filter(Boolean).map(line=>{const m=line.match(/^(\d+) blob ([0-9a-f]+)\t(.+)$/);assert.ok(m,'Unsupported entry');assert.ok(['100644','100755'].includes(m[1]),'Symlinks forbidden');return {mode:m[1],blob:m[2],path:m[3]};});
  proof={independentAcceptance:true,originalFrozenCheck:'Unchanged; historical failures remain failures',anchor,publishedTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,allOtherOnlineBlobsIdentical:true,previousAcceptanceAndTests:true,entries};
  if(process.argv.includes('--prepare-pages')){
   assert.equal(working,false);assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
   const output='/tmp/isolated-model-list-fold-pages';assert.equal(existsSync(output),false,'Refuse overwrite');mkdirSync(output);
   indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
   for(const e of entries){const bytes=readFileSync(join(output,e.path));assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),e.blob,'Artifact mismatch: '+e.path);}
   writeFileSync('/tmp/isolated-model-list-fold-proof.json',JSON.stringify(proof,null,2));assert.equal(git('status','--porcelain','--untracked-files=all'),'','Export changed checkout');
  }
 }finally{
  assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep),'Cleanup must remain in the temporary directory');
  assert.ok(resolve(prior).startsWith(resolve(temp)+sep),'Worktree cleanup must remain in the release directory');
  if(added)git('worktree','remove','--force',prior);rmSync(temp,{recursive:true,force:true});
 }
 console.log(JSON.stringify({...proof,entries:undefined}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
