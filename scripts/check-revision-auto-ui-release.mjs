// Narrow publication exception authorized on 2026-11-14. Historical locks stay intact.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,existsSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const anchor='ac4d5b6fcd88d110ae5f1453c9857bcb31438211';
const publishedTree='f1e8a288befc4e5472467d7119d0535a88e8de80';
export const allowed=['.github/workflows/deploy.yml','forge/revision-gallery.mjs','forge/test-revision-auto-ui.cjs','scripts/check-revision-auto-ui-release.mjs','scripts/test-revision-auto-ui-release.mjs'];
export const payload=['forge/revision-gallery.mjs'];
const expected={".github/workflows/deploy.yml":"912cdcd0ab33acc6de014ef32b1665e1785286bc241a93cd9057c745ae7afaea","forge/revision-gallery.mjs":"7910807bdcc742becaaaddfa1bd5532403411b7203df1e2f5fa39faa7b9795d4","forge/test-revision-auto-ui.cjs":"78e86b43887020e6b1f5d37dea375e0773bbb1d5716bfbaca5c51d2e3d2cedf1","scripts/test-revision-auto-ui-release.mjs":"42fe73bd39de976f8c7edcf816f9ea19e0e52e9928275755a26b6059f39e6879"};
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
const changed=(a,b)=>git('diff','--name-only','--no-renames',a,b,'--').split('\n').filter(Boolean).sort();
export function assertAllowedPaths(paths){assert.deepEqual([...paths].sort(),[...allowed].sort(),'Unexpected repository scope');}
export function assertArtifactDiff(paths){assert.deepEqual([...paths].sort(),payload,'Only the revision editor module may change online');}
export function assertFrozenEntry(actual,before){assert.deepEqual(actual,before,'Frozen entry changed');}
export function verifyBlob(path,data){assert.ok(expected[path],'Unreviewed path');assert.equal(createHash('sha256').update(data.toString().replace(/\r\n/g,'\n')).digest('hex'),expected[path],'Unreviewed content: '+path);}
function main(){
 const working=process.argv.includes('--working');
 if(working)assert.equal(git('rev-parse','HEAD'),anchor,'Unexpected working base');
 else{assert.equal(git('show','-s','--format=%P','HEAD'),anchor,'Release must directly follow reviewed production');assert.equal(git('status','--porcelain','--untracked-files=all'),'','Dirty checkout');}
 const paths=working?[...new Set([...git('diff','--name-only','--no-renames',anchor,'--').split('\n').filter(Boolean),...git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean)])]:changed(anchor,'HEAD');
 assertAllowedPaths(paths);assert.equal(Object.keys(expected).length,4);
 for(const p of Object.keys(expected))verifyBlob(p,readFileSync(join(root,p)));
 // Git clean filters account for Windows checkout line endings without rewriting files.
 assert.equal(git('hash-object','forge/index.html'),git('rev-parse',anchor+':forge/index.html'),'Frozen working entry changed');
 assertFrozenEntry(execFileSync('git',['show','HEAD:forge/index.html'],{cwd:root,maxBuffer:4*1024*1024}),execFileSync('git',['show',anchor+':forge/index.html'],{cwd:root,maxBuffer:4*1024*1024}));
 const temp=mkdtempSync(join(tmpdir(),'revision-auto-ui-release-')),prior=join(temp,'previous');let added=false,proof;
 try{
  git('worktree','add','--detach',prior,anchor);added=true;
  // Reconstruct the last deployed artifact with its unchanged original acceptance.
  const previous=JSON.parse(execFileSync(process.execPath,['scripts/check-revision-context-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024}));
  assert.equal(previous.artifactTree,publishedTree,'Previous publication changed');
  execFileSync(process.execPath,['--test','scripts/test-revision-context-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024});
  const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
  const indexGit=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
  indexGit('read-tree',publishedTree);
  for(const p of payload){const blob=working?git('hash-object','-w',p):git('rev-parse','HEAD:'+p);indexGit('update-index','--add','--cacheinfo','100644',blob,p);}
  const artifactTree=indexGit('write-tree');assertArtifactDiff(changed(publishedTree,artifactTree));
  const entries=git('ls-tree','-r',artifactTree).split('\n').filter(Boolean).map(line=>{const m=line.match(/^(\d+) blob ([0-9a-f]+)\t(.+)$/);assert.ok(m,'Unsupported artifact entry');assert.ok(['100644','100755'].includes(m[1]),'Symlinks forbidden');return {mode:m[1],blob:m[2],path:m[3]};});
  proof={independentAcceptance:true,originalFrozenCheck:'Unchanged; historical failures remain separately visible',anchor,publishedTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,frozenEntryUnchanged:true,previousAcceptanceAndTests:true,entries};
  if(process.argv.includes('--prepare-pages')){
   assert.equal(working,false);assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
   const output='/tmp/isolated-revision-auto-ui-pages';assert.equal(existsSync(output),false,'Refuse overwrite');mkdirSync(output);
   indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
   for(const entry of entries){const bytes=readFileSync(join(output,entry.path));assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),entry.blob,'Artifact mismatch: '+entry.path);}
   writeFileSync('/tmp/isolated-revision-auto-ui-proof.json',JSON.stringify(proof,null,2));assert.equal(git('status','--porcelain','--untracked-files=all'),'','Export changed checkout');
  }
 }finally{if(added)git('worktree','remove','--force',prior);assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep));rmSync(temp,{recursive:true,force:true});}
 console.log(JSON.stringify({...proof,entries:undefined}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
