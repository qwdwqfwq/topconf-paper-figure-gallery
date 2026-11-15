// Only the requested Step 3 comparison wording may differ from the published artifact.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const baseCommit='dbee9f57e4b02257706175a29a2d749ae1848a9b';
const baseRun=43717807694;
const baseTree='dba5c4e5c528d96203d88775b6fe3bfcb004909c';
const baseProofSha256='ca093c7c51c61b60b2e985bfc46222a72ad3534a2564e5dcb15ed1217b2ec023';
const payload=['forge/revision-gallery.mjs','forge/revision-local.mjs'];
const allowed=[...payload,'scripts/check-comparison-hint-release.mjs','.github/workflows/comparison-hint-release.yml'].sort();
const gitBytes=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:40*1024*1024});
const git=(...args)=>gitBytes(...args).toString().trim();
const blobId=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
assert.equal(git('show','-s','--format=%P','HEAD'),baseCommit);
assert.equal(git('status','--porcelain','--untracked-files=all'),'');
assert.deepEqual(git('diff','--name-only','--no-renames',baseCommit,'HEAD').split('\n').sort(),allowed,'Only the authorized display change and its isolated publisher may change');
const proofBytes=readFileSync(process.argv[2]);
assert.equal(createHash('sha256').update(proofBytes).digest('hex'),baseProofSha256);
const previous=JSON.parse(proofBytes);
assert.equal(previous.artifactTree,baseTree);
assert.equal(previous.allOtherPublishedBytesIdentical,true);
async function api(suffix){
 assert.ok(process.env.GH_TOKEN,'GitHub read token required');
 const response=await fetch('https://api.github.com/repos/qwdwqfwq/topconf-paper-figure-gallery'+suffix,{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000)});
 assert.ok(response.ok,'GitHub HTTP '+response.status);return response.json();
}
const run=await api('/actions/runs/'+baseRun);
assert.equal(run.conclusion,'success');assert.equal(run.head_sha,baseCommit);
const deployments=await api('/deployments?environment=github-pages&per_page=20');
const statuses=await Promise.all(deployments.map(async d=>({deployment:d,status:(await api('/deployments/'+d.id+'/statuses'))[0]})));
const current=statuses.find(s=>s.status?.state==='success');
assert.ok(current);assert.equal(current.deployment.sha,baseCommit,'Stop if another release has been published');
assert.ok(current.status.log_url.includes('/runs/'+baseRun+'/'));
const replacements={
 'forge/revision-gallery.mjs':[
  ["?'框外已通过逐像素保留校验。请核对框内修改是否符合要求，以及框内其他文字、数据和公式是否保留；确认后才保存新版本。'","?''"],
  ['actions.append(reject,accept);dialog.append(title,hint);','actions.append(reject,accept);dialog.append(title);if(hint.textContent)dialog.append(hint);']
 ],
 'forge/revision-local.mjs':[
  ["help.textContent='拖动滑块对比：左侧是修改前，右侧是修改后。也可分别放大查看。'","help.textContent='滑动下方蓝色条，观察修改前后变化'"]
 ]
};
const candidates=new Map();
for(const path of payload){
 const original=gitBytes('show',baseCommit+':'+path);let expected=original.toString();
 assert.equal(previous.entries.find(e=>e.path===path)?.blob,blobId(original),'The source must equal the exact published module');
 for(const [before,after] of replacements[path]){assert.equal(expected.split(before).length,2);expected=expected.replace(before,after);}
 const candidate=gitBytes('show','HEAD:'+path);
 assert.equal(candidate.toString(),expected,'No code except the exact requested display replacement may change');
 execFileSync(process.execPath,['--check','--input-type=module'],{input:candidate,cwd:root});candidates.set(path,candidate);
}
const temp=mkdtempSync(join(tmpdir(),'comparison-hint-'));
const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
const indexGit=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
const seen=new Set();
for(const e of previous.entries){
 assert.ok(['100644','100755'].includes(e.mode));assert.match(e.blob,/^[0-9a-f]{40}$/);
 assert.ok(!/[\t\r\n\\]/.test(e.path)&&!e.path.startsWith('/')&&!e.path.split('/').some(p=>p==='..'||p==='.git'));
 assert.ok(!seen.has(e.path));seen.add(e.path);
}
indexGit('read-tree','--empty');
execFileSync('git',['update-index','--index-info'],{cwd:root,env,input:previous.entries.map(e=>e.mode+' '+e.blob+'\t'+e.path+'\n').join(''),maxBuffer:40*1024*1024});
assert.equal(indexGit('write-tree'),baseTree);
for(const [path,bytes] of candidates)indexGit('update-index','--cacheinfo','100644',blobId(bytes),path);
const artifactTree=indexGit('write-tree');
assert.deepEqual(git('diff','--name-only','--no-renames',baseTree,artifactTree).split('\n'),payload,'Every other published file must remain byte-identical');
const entries=previous.entries.map(e=>candidates.has(e.path)?{...e,blob:blobId(candidates.get(e.path))}:e);
const result={baseRun,baseCommit,baseTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,allOtherPublishedBytesIdentical:true,displayWordingOnly:true,originalFrozenCheck:'Unchanged; preexisting failures remain failures'};
if(process.argv.includes('--prepare-pages')){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
 const output='/tmp/comparison-hint-pages';assert.equal(existsSync(output),false);mkdirSync(output);
 indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
 for(const e of entries)assert.equal(blobId(readFileSync(join(output,e.path))),e.blob,'Published byte mismatch: '+e.path);
 writeFileSync('/tmp/comparison-hint-proof.json',JSON.stringify({...result,entries},null,2));
 assert.equal(git('status','--porcelain','--untracked-files=all'),'');
}
console.log(JSON.stringify(result,null,2));
