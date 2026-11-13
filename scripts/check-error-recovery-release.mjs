// User-authorized 2026-11-14 error recovery exception; historical locks remain intact.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,existsSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const anchor='deac1d601fa36c42ea09bf5e33cab280db130a33';
const publishedTree='2e935dde6184348e32fbb585bc2bd95d8db3453c';
export const allowed=["nonelinear-relay/test-live-chat.mjs", ".github/workflows/deploy.yml", ".github/workflows/forge-workflow-lock.yml", "forge/index.html", "forge/infistar-reconstruction-responses.mjs", "forge/infistar-reconstruction-stream.mjs", "forge/revision-gallery.mjs", "forge/revision-layout.mjs", "forge/revision-scope.mjs", "forge/step3-reference-input.mjs", "forge/test-infistar-reconstruction-responses.mjs", "forge/test-infistar-reconstruction-stream.mjs", "forge/test-manual-revision-browser.cjs", "forge/test-revision-error-recovery.mjs", "forge/test-revision-compact.cjs", "scripts/check-error-recovery-release.mjs", "scripts/test-error-recovery-release.mjs"];
export const payload=["forge/index.html", "forge/infistar-reconstruction-responses.mjs", "forge/infistar-reconstruction-stream.mjs", "forge/revision-gallery.mjs", "forge/revision-layout.mjs", "forge/revision-scope.mjs", "forge/step3-reference-input.mjs"];
const expected={
  ".github/workflows/deploy.yml": "574f72c56df63540807ce6734e399afcfb773ed779becbb716889fb772a5aefd",
  ".github/workflows/forge-workflow-lock.yml": "61f3425eabd10569c7d7b1df13c8708ac39b2a1648690cb163b95c1ec67bbf31",
  "forge/index.html": "8430ceac46103ddf28da18a1af9cafb3cc6d5648c3212e465aa145be7c0e892f",
  "forge/infistar-reconstruction-responses.mjs": "b07e61aa7d49023c3057092a1bbc259057ee243f141f86c2b5286f977e7522a8",
  "forge/infistar-reconstruction-stream.mjs": "b7b8e03135d81fbaca009ee86ad3d0ed7b2e220bf1c6cc37afce11b05e638cdc",
  "forge/revision-gallery.mjs": "988dcc79ec087b649f2cd6711955fd41aba80efd6377ed327503c1f150c08ab1",
  "forge/revision-layout.mjs": "25cbf1d3fa2dcb4ba6019d0c5658777d20cfc58bf5bb8a2fcf8224b2bd0b9e60",
  "forge/revision-scope.mjs": "47b094ff8995abc148a3a7ecf9ac5cb5df1484feb4763a3b1ba9bdda5d9ba80d",
  "forge/step3-reference-input.mjs": "ad7fb9e8cd1650ee256a33a7579f47e171f25d8aa78f23fb84c239fe46309627",
  "forge/test-infistar-reconstruction-responses.mjs": "58497aff528dbd8dfadfc3da57c739d9bb442ef3c6b2e8e7018e4adc3d18bbfc",
  "forge/test-infistar-reconstruction-stream.mjs": "331234a03edd3339f02f14ed1c2c9797dd6a3bba24ede0c340b0bbca43cdca38",
  "forge/test-manual-revision-browser.cjs": "519592554a86747a5181bcdd217c11d1b35016b75007115c9fb27f321d0da4b1",
  "forge/test-revision-error-recovery.mjs": "c353f16a337def03abb9e0ccb04df7ca864178ac17597adcd67dd1b3b5bde703",
  "forge/test-revision-compact.cjs": "4141c6f00327526fd425fd400c499507d4c5a075d1194a37b6fa772f34c75256",
  "scripts/test-error-recovery-release.mjs": "89e43ec40b6c5f95ad078e70e35108326c5f611f5217671f6cf3d3b2cca69a45",
  "nonelinear-relay/test-live-chat.mjs": "a890c134dfb5d502ae1257a26605be97311bd3c516642bb528e65208792151fd"
};
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
const changed=(a,b)=>git('diff','--name-only','--no-renames',a,b,'--').split('\n').filter(Boolean).sort();
export function assertAllowedPaths(paths){assert.deepEqual([...paths].sort(),[...allowed].sort(),'Unexpected repository scope');}
export function assertArtifactDiff(paths){assert.deepEqual([...paths].sort(),payload,'Only the seven explicitly unlocked runtime files may change online');}
export function assertIndexIsolation(text,before){
 let restored=text.replace(/\r\n/g,'\n');
 const pairs=[["import {fetchReconstructionStream,usesReconstructionStream} from './infistar-reconstruction-stream.mjs';\nimport {fetchReconstructionResponses,usesReconstructionResponses} from './infistar-reconstruction-responses.mjs';\n", "import {fetchReconstructionStream,usesReconstructionStream} from './infistar-reconstruction-stream.mjs?v=20261114-errors';\nimport {fetchReconstructionResponses,usesReconstructionResponses} from './infistar-reconstruction-responses.mjs?v=20261114-errors';\n"], ["import {requestStep3ImageStream} from './step3-image-stream.mjs?v=20261114-nonelinear';\nimport {createRevisionGallery,generateRevision} from './revision-gallery.mjs?v=20261112-svg';\n", "import {requestStep3ImageStream} from './step3-image-stream.mjs?v=20261114-errors';\nimport {step3ReferenceInputs} from './step3-reference-input.mjs?v=20261114-errors';\nimport {createRevisionGallery,generateRevision} from './revision-gallery.mjs?v=20261114-errors';\n"], ["", "      if(err.reconstructionTransport)audit.transport={...err.reconstructionTransport};\n"], ["", "  if(lastError&&audit.transport?.requestId&&!lastError.message.includes(audit.transport.requestId))lastError.message+=' [request-id: '+audit.transport.requestId+']';\n"], ["    const uris = await refDataURIs(useIds);\n", "    const uris = await step3ReferenceInputs(p,useIds,referenceFigure,refDataURIs);\n"], ["    if(/^IMAGE_STREAM_/.test(e.code||'')) throw new Error(tt('img.abnormal',{t:e.message})+apiContext());\n    if(e.name==='TimeoutError') throw new Error(tt('img.timeout')+apiContext());\n    throw new Error(tt('img.connection')+apiContext());\n", "    const diagnostic=e.imageDiagnostics;\n    const hint=diagnostic?' [stage: '+diagnostic.stage+(diagnostic.requestId?'; request-id: '+diagnostic.requestId:'')+']':'';\n    const message=/^IMAGE_STREAM_/.test(e.code||'')?tt('img.abnormal',{t:e.message}):e.name==='TimeoutError'?tt('img.timeout'):tt('img.connection');\n    throw Object.assign(new Error(message+hint+apiContext()),{imageDiagnostics:diagnostic});\n"]];
 for(const [original,current] of pairs){assert.equal(restored.split(current).length,2,'Authorized entry/diagnostic must occur exactly once');restored=restored.replace(current,original);}
 assert.equal(restored,before.replace(/\r\n/g,'\n'),'Index changed beyond explicitly unlocked entry/diagnostic hunks');
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
 assert.equal(Object.keys(expected).length,16,'All sixteen reviewed payload/test/workflow files must be pinned');
 for(const p of Object.keys(expected))verifyBlob(p,readFileSync(join(root,p)));
 assertIndexIsolation(readFileSync(join(root,'forge/index.html'),'utf8'),execFileSync('git',['show',anchor+':forge/index.html'],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024}));
 const temp=mkdtempSync(join(tmpdir(),'error-recovery-'));const prior=join(temp,'previous');let added=false,proof;
 try{
  // Run the unmodified prior release acceptance in its original clean checkout.
  // This reconstructs all 3,721 published blobs from reachable commits in CI.
  git('worktree','add','--detach',prior,anchor);added=true;
  const previous=JSON.parse(execFileSync(process.execPath,['scripts/check-step3-completion-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024}));
  assert.equal(previous.artifactTree,publishedTree,'Previous successful publication changed');
  const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
  const indexGit=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
  indexGit('read-tree',publishedTree);
  for(const p of payload){const blob=working?git('hash-object','-w',p):git('rev-parse','HEAD:'+p);indexGit('update-index','--add','--cacheinfo','100644',blob,p);}
  const artifactTree=indexGit('write-tree');assertArtifactDiff(changed(publishedTree,artifactTree));
  const entries=git('ls-tree','-r',artifactTree).split('\n').filter(Boolean).map(line=>{const match=line.match(/^(\d+) blob ([0-9a-f]+)\t(.+)$/);assert.ok(match,'Unsupported artifact entry');assert.ok(['100644','100755'].includes(match[1]),'Symlinks forbidden');return {mode:match[1],blob:match[2],path:match[3]};});
  proof={independentAcceptance:true,originalFrozenCheck:'Unchanged; historical failures remain separately visible',anchor,publishedTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,unlockedIndexIsolation:true,entries};
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
