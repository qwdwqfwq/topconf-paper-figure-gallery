// Narrow publication exception authorized on 2026-11-14. Historical locks stay intact.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,existsSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const anchor='661d2648bdc4efc0b49772243340dcb4e2704789';
const publishedTree='5a3932cffef7a9efe9b7b690b86f7737850733cd';
export const allowed=['.github/workflows/deploy.yml','.github/workflows/forge-workflow-lock.yml','forge/index.html','forge/nonelinear-source.mjs','nonelinear-relay/source-image.mjs','forge/test-nonelinear-source.mjs','forge/test-nonelinear-source-browser.cjs','nonelinear-relay/test-source-image.mjs','scripts/nonelinear-source-entry-patch.json','scripts/check-nonelinear-source-release.mjs','scripts/test-nonelinear-source-release.mjs'];
export const payload=['forge/index.html','forge/nonelinear-source.mjs','nonelinear-relay/source-image.mjs'];
const expected={
  ".github/workflows/deploy.yml": "359a3f9ec6fe9b213708a6316553da951c65d434f0fdceb9efa81128685bf5e3",
  ".github/workflows/forge-workflow-lock.yml": "dacc1a2e4ef2ae6e1de55e0492e29abf7ddc46358a5fa08a98d535c0317aa2de",
  "forge/index.html": "42debbd44f06d51c3262f358a1d2fd2c6f5b35be54ba4375d55110a8e8e10391",
  "forge/nonelinear-source.mjs": "990976d7c1d6aafde95805df93e226b5c98513fde9fc6a86a17ea4af1db3df2c",
  "nonelinear-relay/source-image.mjs": "f14dd96a98e1defba7cdd695dabf8b75d59c74144530a5737f4a05fa834a2ba6",
  "forge/test-nonelinear-source.mjs": "049aecb977675ae1ab9e7558b6bcc537a2534e6ad6b15802c1cc9f025bdd0cb6",
  "forge/test-nonelinear-source-browser.cjs": "844fef99ac3100096ef213eb4186f26374912d08ca4482b52730c60f3188cc43",
  "nonelinear-relay/test-source-image.mjs": "a135ec20f3a7142e8d7120a383e0712c13c79af16df97ec9f9cf60396069f42c",
  "scripts/nonelinear-source-entry-patch.json": "8120918b6748855b5e131f67e711a417344a5946370fed3bbb37d29486231717",
  "scripts/test-nonelinear-source-release.mjs": "7155d0753b9af209cdb8940519e0b851b334baf6255132e0c4effb6e9876143f"
}; // REVIEWED_HASHES
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
const changed=(a,b)=>git('diff','--name-only','--no-renames',a,b,'--').split('\n').filter(Boolean).sort();
export function assertAllowedPaths(paths){assert.deepEqual([...paths].sort(),[...allowed].sort(),'Unexpected repository scope');}
export function assertArtifactDiff(paths){assert.deepEqual([...paths].sort(),payload,'Only the three explicitly unlocked original-source files may change online');}
export function assertFrozenEntry(actual,before){
 const patches=JSON.parse(readFileSync(new URL('./nonelinear-source-entry-patch.json',import.meta.url),'utf8'));
 assert.equal(patches.length,5,'Exactly five authorized entry replacements');
 let result=before.toString().replace(/\r\n/g,'\n');
 for(const [from,to] of patches){assert.equal(result.split(from).length,2,'Entry replacement must match exactly once');result=result.replace(from,to);}
 assert.equal(actual.toString().replace(/\r\n/g,'\n'),result,'Entry contains changes outside the authorized source handoff');
}
export function verifyBlob(path,data){assert.ok(expected[path],'Unreviewed path');assert.equal(createHash('sha256').update(data.toString().replace(/\r\n/g,'\n')).digest('hex'),expected[path],'Unreviewed content: '+path);}
function main(){
 const working=process.argv.includes('--working');
 if(working)assert.equal(git('rev-parse','HEAD'),anchor,'Unexpected working base');
 else{assert.equal(git('show','-s','--format=%P','HEAD'),anchor,'Release must directly follow reviewed production');assert.equal(git('status','--porcelain','--untracked-files=all'),'','Dirty checkout');}
 const paths=working?[...new Set([...git('diff','--name-only','--no-renames',anchor,'--').split('\n').filter(Boolean),...git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean)])]:changed(anchor,'HEAD');
 assertAllowedPaths(paths);assert.equal(Object.keys(expected).length,10);
 for(const p of Object.keys(expected))verifyBlob(p,readFileSync(join(root,p)));
 assertFrozenEntry(readFileSync(join(root,'forge/index.html')),execFileSync('git',['show',anchor+':forge/index.html'],{cwd:root,maxBuffer:4*1024*1024}));
 const temp=mkdtempSync(join(tmpdir(),'nonelinear-source-release-')),prior=join(temp,'previous');let added=false,proof;
 try{
  git('worktree','add','--detach',prior,anchor);added=true;
  // Reconstruct the last deployed artifact with its unchanged original acceptance.
  const previous=JSON.parse(execFileSync(process.execPath,['scripts/check-revision-auto-ui-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024}));
  assert.equal(previous.artifactTree,publishedTree,'Previous publication changed');
  execFileSync(process.execPath,['--test','scripts/test-revision-auto-ui-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024});
  const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
  const indexGit=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
  indexGit('read-tree',publishedTree);
  for(const p of payload){const blob=working?git('hash-object','-w',p):git('rev-parse','HEAD:'+p);indexGit('update-index','--add','--cacheinfo','100644',blob,p);}
  const artifactTree=indexGit('write-tree');assertArtifactDiff(changed(publishedTree,artifactTree));
  const entries=git('ls-tree','-r',artifactTree).split('\n').filter(Boolean).map(line=>{const m=line.match(/^(\d+) blob ([0-9a-f]+)\t(.+)$/);assert.ok(m,'Unsupported artifact entry');assert.ok(['100644','100755'].includes(m[1]),'Symlinks forbidden');return {mode:m[1],blob:m[2],path:m[3]};});
  proof={independentAcceptance:true,originalFrozenCheck:'Unchanged; historical failures remain separately visible',anchor,publishedTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,entryLimitedToFiveReviewedSourceReplacements:true,previousAcceptanceAndTests:true,entries};
  if(process.argv.includes('--prepare-pages')){
   assert.equal(working,false);assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
   const output='/tmp/isolated-nonelinear-source-pages';assert.equal(existsSync(output),false,'Refuse overwrite');mkdirSync(output);
   indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
   for(const entry of entries){const bytes=readFileSync(join(output,entry.path));assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),entry.blob,'Artifact mismatch: '+entry.path);}
   writeFileSync('/tmp/isolated-nonelinear-source-proof.json',JSON.stringify(proof,null,2));assert.equal(git('status','--porcelain','--untracked-files=all'),'','Export changed checkout');
  }
 }finally{if(added)git('worktree','remove','--force',prior);assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep));rmSync(temp,{recursive:true,force:true});}
 console.log(JSON.stringify({...proof,entries:undefined}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
