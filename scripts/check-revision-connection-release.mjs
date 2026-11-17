// Publish only the owner-authorized Step 3 revision connection recovery; original freeze guards remain untouched.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const baseCommit='a957e48dfee630ef40bf514412b2f1798958aba3';
const baseRun=44129144122;
const baseTree='bf4a9006b9c92523c8157ce7633b70f17d86cfb1';
const baseProofSha256='9f619210622ef0da42903aae87880200257d743caa0fa0a688bb040dda1f9e4d';
export const payload=["forge/revision-gallery.mjs", "forge/revision-image-job.mjs", "forge/revision-result-recovery.mjs"];
export const allowed=["forge/revision-gallery.mjs", "forge/revision-image-job.mjs", "forge/revision-result-recovery.mjs", "forge/test-revision-connection-recovery.mjs", "forge/test-revision-entry-durable.mjs", "forge/test-revision-task-browser.cjs", "scripts/check-revision-connection-release.mjs", "scripts/test-revision-connection-release.mjs", ".github/workflows/deploy-revision-connection.yml"].sort();
const gitBytes=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:40*1024*1024});
const git=(...args)=>gitBytes(...args).toString().trim();
const blobId=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
export function assertScope(paths){assert.deepEqual([...paths].sort(),allowed,'Only the authorized revision recovery patch and isolated tests/publication files may change');}
export function assertArtifact(paths){assert.deepEqual([...paths].sort(),payload,'Every other published file must remain byte-identical');}
export function verifyPrevious(bytes){assert.equal(createHash('sha256').update(bytes).digest('hex'),baseProofSha256);const p=JSON.parse(bytes);assert.equal(p.artifactTree,baseTree);assert.equal(p.allOtherPublishedBytesIdentical,true);return p;}
const reviewedSha256={
  "forge/revision-gallery.mjs": "4aa43b4f188dccf1152d67d82860f4a0d8bad138409511969fd67b9bc6b0a8e4",
  "forge/revision-image-job.mjs": "6f2047e51012793a128cba8e056bd37a04ca5ffa91acf4ff0fca692f9c892439",
  "forge/revision-result-recovery.mjs": "a7e7d8d453c71a90218ae0dcc8a1d3aa3f6c91ff41a419e35016927c44bdedb2"
};
export function verifyPatch(path,original,candidate){
 assert.ok(payload.includes(path));
 assert.equal(createHash('sha256').update(candidate).digest('hex'),reviewedSha256[path],'Only the exact reviewed revision recovery patch is authorized');
}
async function main(){
const working=process.argv.includes('--working');
assert.equal(git('rev-parse',working?'HEAD':'HEAD^'),baseCommit);
if(!working){assert.equal(git('show','-s','--format=%P','HEAD'),baseCommit);assert.equal(git('status','--porcelain','--untracked-files=all'),'');}
const changed=git('diff','--name-only','--no-renames',baseCommit,...(working?[]:['HEAD'])).split('\n').filter(Boolean);
if(working)changed.push(...git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean));
assertScope(changed);
const previous=verifyPrevious(readFileSync(process.argv[2]));
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
if(process.argv.includes('--check-published-base')){console.log('Latest successful Pages deployment still matches the verified base.');return;}
const candidates=new Map();
for(const path of payload){
 const entry=previous.entries.find(e=>e.path===path);
 const original=entry?gitBytes('show',baseCommit+':'+path):null;
 if(entry)assert.equal(entry.blob,blobId(original),'The source must equal the exact published module');
 else assert.equal(path,'forge/revision-result-recovery.mjs','Only the private revision result helper may be added');
 const candidate=working?Buffer.from(readFileSync(join(root,path),'utf8').replace(/\r\n/g,'\n')):gitBytes('show','HEAD:'+path);
 verifyPatch(path,original,candidate);
 execFileSync(process.execPath,['--check','--input-type=module'],{input:candidate,cwd:root});candidates.set(path,candidate);
}
const temp=mkdtempSync(join(tmpdir(),'revision-connection-'));
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
for(const [path,bytes] of candidates){const blob=execFileSync('git',['hash-object','-w','--stdin'],{cwd:root,input:bytes}).toString().trim();assert.equal(blob,blobId(bytes));indexGit('update-index','--add','--cacheinfo','100644',blob,path);}
const artifactTree=indexGit('write-tree');
assertArtifact(git('diff','--name-only','--no-renames',baseTree,artifactTree).split('\n'));
const entries=previous.entries.map(e=>candidates.has(e.path)?{...e,blob:blobId(candidates.get(e.path))}:e);
for(const [path,bytes] of candidates)if(!seen.has(path))entries.push({mode:'100644',blob:blobId(bytes),path});
entries.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
const result={baseRun,baseCommit,baseTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,allOtherPublishedBytesIdentical:true,onlyStep3RevisionRecoveryChanged:true,step4AndSharedModulesUnchanged:true,exportAndEntrypointUnchanged:true,modelListAndGenerationParametersUnchanged:true,originalFrozenCheck:'Unchanged; preexisting failures remain failures'};
if(process.argv.includes('--prepare-pages')){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
 const output='/tmp/revision-connection-pages';assert.equal(existsSync(output),false);mkdirSync(output);
 indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
 for(const e of entries)assert.equal(blobId(readFileSync(join(output,e.path))),e.blob,'Published byte mismatch: '+e.path);
 writeFileSync('/tmp/revision-connection-proof.json',JSON.stringify({...result,entries},null,2));
 assert.equal(git('status','--porcelain','--untracked-files=all'),'');
}
console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
