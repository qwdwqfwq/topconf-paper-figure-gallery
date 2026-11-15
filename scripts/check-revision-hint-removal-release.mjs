// This release may remove one display hint; every other published byte is preserved.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const baseCommit='2486b83bf2bbb1d5b69fd1778e65d51e6f97436a';
const baseRun=43716834189;
const baseProofSha256='0525c69eea7d751ef8ab7c0f91454eec90073e4ac1b0206cd6d01c55adecdc30';
const baseTree='f5a5152cdc05d9c7a148aa3192e7d64fecaeb0ee';
const target='forge/revision-gallery.mjs';
const allowed=[target,'.github/workflows/revision-hint-removal-release.yml','scripts/check-revision-hint-removal-release.mjs'].sort();
const gitBytes=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:40*1024*1024});
const git=(...args)=>gitBytes(...args).toString().trim();
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const blobId=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');

assert.equal(git('show','-s','--format=%P','HEAD'),baseCommit,'Source must directly follow the reviewed published source');
assert.equal(git('status','--porcelain','--untracked-files=all'),'','Source checkout must be clean');
assert.deepEqual(git('diff','--name-only','--no-renames',baseCommit,'HEAD').split('\n').sort(),allowed,'No existing guard, entry point, generation or export file may change');
const proofBytes=readFileSync(process.argv[2]);
assert.equal(sha256(proofBytes),baseProofSha256,'Preceding published proof must match the reviewed immutable artifact');
const previous=JSON.parse(proofBytes);
assert.equal(previous.artifactTree,baseTree);
assert.equal(previous.allOtherOnlineBlobsIdentical,true);

// Do not publish against a stale version or interfere with a newer release.
async function api(suffix){
 assert.ok(process.env.GH_TOKEN,'GitHub read token required');
 const response=await fetch('https://api.github.com/repos/qwdwqfwq/topconf-paper-figure-gallery'+suffix,{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000)});
 assert.ok(response.ok,'GitHub metadata HTTP '+response.status);
 return response.json();
}
const run=await api('/actions/runs/'+baseRun);
assert.equal(run.conclusion,'success','The base release must be successfully published first');
assert.equal(run.head_sha,baseCommit);
const deployments=await api('/deployments?environment=github-pages&per_page=20');
const statuses=await Promise.all(deployments.map(async d=>({deployment:d,status:(await api('/deployments/'+d.id+'/statuses'))[0]})));
const current=statuses.find(s=>s.status?.state==='success');
assert.ok(current,'Current successful Pages deployment required');
assert.equal(current.deployment.sha,baseCommit,'A newer release exists; stop rather than overwrite it');
assert.ok(current.status.log_url.includes('/runs/'+baseRun+'/'),'The base manifest must belong to the current published run');

const original=gitBytes('show',baseCommit+':'+target).toString();
const note='以当前选中图片和最新要求为准；步骤一存档继续保留，不作为本次改图的布局约束。';
const before=original.split('\n').find(line=>line.includes("panel.querySelector('[data-step1-context]').textContent=")&&line.includes(note));
assert.ok(before,'The exact requested display hint must occur');
assert.equal(original.split(note).length,2,'The requested note must be unique');
const after=before.replace(note,'')+"\n      panel.querySelector('[data-step1-context]').style.display=editing.source==='svg'?'block':'none';";
const candidate=gitBytes('show','HEAD:'+target);
assert.equal(candidate.toString(),original.replace(before,after),'Only the exact display deletion and empty-space removal are allowed');
assert.equal(candidate.toString().includes(note),false);
execFileSync(process.execPath,['--check','--input-type=module'],{input:candidate,cwd:root});

const temp=mkdtempSync(join(tmpdir(),'revision-hint-removal-'));
const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
const indexGit=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
const seen=new Set();
for(const entry of previous.entries){
 assert.ok(['100644','100755'].includes(entry.mode),'Only regular published files are allowed');
 assert.match(entry.blob,/^[0-9a-f]{40}$/);
 assert.ok(!/[\t\r\n\\]/.test(entry.path)&&!entry.path.startsWith('/')&&!entry.path.split('/').some(p=>p==='..'||p==='.git'),'Unsafe published path');
 assert.ok(!seen.has(entry.path),'Duplicate published path');seen.add(entry.path);
}
assert.equal(previous.entries.find(e=>e.path===target)?.blob,blobId(Buffer.from(original)),'The source module must equal the exact currently published module');
indexGit('read-tree','--empty');
execFileSync('git',['update-index','--index-info'],{cwd:root,env,input:previous.entries.map(e=>e.mode+' '+e.blob+'\t'+e.path+'\n').join(''),maxBuffer:40*1024*1024});
assert.equal(indexGit('write-tree'),baseTree,'All original published paths, modes and blobs must be identical');
const candidateBlob=blobId(candidate);
assert.equal(git('rev-parse','HEAD:'+target),candidateBlob);
indexGit('update-index','--cacheinfo','100644',candidateBlob,target);
const artifactTree=indexGit('write-tree');
assert.deepEqual(git('diff','--name-only','--no-renames',baseTree,artifactTree).split('\n'),[target],'Every other published file must be byte-identical');
const result={baseRun,baseCommit,baseTree,artifactTree,changedOnline:[target],unchangedFiles:previous.entries.length-1,allOtherPublishedBytesIdentical:true,originalFrozenCheck:'Unchanged; existing failures remain failures',displayDeletionOnly:true};
if(process.argv.includes('--prepare-pages')){
 assert.equal(process.env.GITHUB_ACTIONS,'true');
 assert.equal(process.env.GITHUB_REF,'refs/heads/main');
 assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
 const output='/tmp/revision-hint-removal-pages';assert.equal(existsSync(output),false);mkdirSync(output);
 indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
 for(const entry of previous.entries){
  const expected=entry.path===target?candidateBlob:entry.blob;
  assert.equal(blobId(readFileSync(join(output,entry.path))),expected,'Published byte mismatch: '+entry.path);
 }
 writeFileSync('/tmp/revision-hint-removal-proof.json',JSON.stringify({...result,entries:previous.entries.map(e=>e.path===target?{...e,blob:candidateBlob}:e)},null,2));
 assert.equal(git('status','--porcelain','--untracked-files=all'),'','Artifact preparation must not change source');
}
console.log(JSON.stringify(result,null,2));
