// Independent Steps 1/3 catalog display release; preserves every other deployed blob.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,existsSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
export const anchor='c38b854cc68f49e0a7728e5578463b12fa727910';
const reviewedParent='6d85ba78ea4c9b0516d1c0dd51f056e689a5cc41';
export const publishedTree='31891a579f828498585b7d33dde5129dab041539';
export const payload=['forge/step3-model-catalog.mjs'];
export const allowed=[...payload,'forge/test-model-list-fold-browser.cjs','.github/workflows/model-list-selection-release.yml','scripts/check-model-list-selection-release.mjs','scripts/test-model-list-selection-release.mjs'];
const expected={
  "forge/step3-model-catalog.mjs": "f2295083745e33390dbc158c7f120855d839cb8022d7b61e7521ebffd76b5c05",
  "forge/test-model-list-fold-browser.cjs": "6110909faa81774aaa66a6dba2066ba5e5fe173c0ca2095cd4402c222dbcf554",
  ".github/workflows/model-list-selection-release.yml": "d8c2d8fc25e56129f4454ed37b6dc76ba7ab6e8d3f92907e79e0e85e70b4d971",
  "scripts/test-model-list-selection-release.mjs": "2de4bd3f5653467afbf1d0e15d198b5d8066986f59e8575380354c2624acbdfc"
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
 const temp=mkdtempSync(join(tmpdir(),'model-list-selection-release-')),prior=join(temp,'previous');let added=false,proof;
 try{
  git('worktree','add','--detach',prior,anchor);added=true;
  execFileSync('git',['sparse-checkout','disable'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024});
  const previous=JSON.parse(execFileSync(process.execPath,['scripts/check-model-list-fold-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024}));
  assert.equal(previous.artifactTree,publishedTree,'Previous production artifact changed');
  execFileSync(process.execPath,['--test','scripts/test-model-list-fold-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024});
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
   const output='/tmp/isolated-model-list-selection-pages';assert.equal(existsSync(output),false,'Refuse overwrite');mkdirSync(output);
   indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
   for(const e of entries){const bytes=readFileSync(join(output,e.path));assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),e.blob,'Artifact mismatch: '+e.path);}
   writeFileSync('/tmp/isolated-model-list-selection-proof.json',JSON.stringify(proof,null,2));assert.equal(git('status','--porcelain','--untracked-files=all'),'','Export changed checkout');
  }
 }finally{
  assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep),'Cleanup must remain in the temporary directory');
  assert.ok(resolve(prior).startsWith(resolve(temp)+sep),'Worktree cleanup must remain in the release directory');
  if(added)git('worktree','remove','--force',prior);rmSync(temp,{recursive:true,force:true});
 }
 console.log(JSON.stringify({...proof,entries:undefined}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
