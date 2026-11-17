// Publish only the owner-authorized Step 3 revision stage diagnostics; original freeze guards remain untouched.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const baseCommit='c1980b6dc4b060a6e6b081d24440d0384b17ba42';
const baseRun=44167826843;
const baseTree='1a294e07c355aaca785b8941811e395ca36046a4';
const baseProofSha256='b7e4f78b47e27e3464d389d4af70b4bbaa37742595904e4c3431270b89d1c6f9';
export const payload=["forge/revision-diagnostics.mjs","forge/revision-gallery.mjs","forge/revision-image-job.mjs","forge/revision-result-recovery.mjs"];
export const allowed=[...payload,"forge/test-revision-diagnostics.mjs","forge/test-revision-task-browser.cjs","scripts/check-revision-diagnostics-release.mjs","scripts/test-revision-diagnostics-release.mjs",".github/workflows/deploy-revision-diagnostics.yml"].sort();
const gitBytes=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:40*1024*1024});
const git=(...args)=>gitBytes(...args).toString().trim();
const blobId=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
export function assertScope(paths){assert.deepEqual([...paths].sort(),allowed,'Only the authorized revision stage diagnostics patch and isolated tests/publication files may change');}
export function assertArtifact(paths){assert.deepEqual([...paths].sort(),payload,'Every other published file must remain byte-identical');}
export function verifyPrevious(bytes){assert.equal(createHash('sha256').update(bytes).digest('hex'),baseProofSha256);const p=JSON.parse(bytes);assert.equal(p.artifactTree,baseTree);assert.equal(p.allOtherPublishedBytesIdentical,true);return p;}
const reviewedSha256={
 "forge/revision-gallery.mjs":"9ba0da853929490f1954625a80eb8100b32a79ef4b00b7d82c4e9570f74ce5af",
 "forge/revision-image-job.mjs":"5b8d235dbec851d43ff9b0d62a20b97e2aa40b5a4744142762e77bfe674efcd6",
 "forge/revision-result-recovery.mjs":"9f7d03dd98d48300449577f7cba6159b0af76ac0695d3dbe5d7b90c91224b68b",
 "forge/revision-diagnostics.mjs":"8a9ec516114a813dc502fb4127b8d734e9fc9860293d274408fd4502a432146f"
};
export function verifyPatch(path,original,candidate){
 assert.ok(payload.includes(path));
 assert.equal(createHash('sha256').update(candidate).digest('hex'),reviewedSha256[path],'Only the exact reviewed revision stage diagnostics patch is authorized');
}
async function main(){
const working=process.argv.includes('--working');
const implementationCommit='6fd8de5572635c1660a94e02b3be442b92660192';
assert.equal(git('rev-parse',working?'HEAD':'HEAD^'),implementationCommit);
assert.equal(git('rev-parse',implementationCommit+'^'),baseCommit);
if(!working){assert.equal(git('show','-s','--format=%P','HEAD'),implementationCommit);assert.equal(git('status','--porcelain','--untracked-files=all'),'');}
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
 const isNew=path==='forge/revision-diagnostics.mjs';
 assert.equal(Boolean(entry),!isNew,'Only the new diagnostics module may be added');
 const original=isNew?Buffer.alloc(0):gitBytes('show',baseCommit+':'+path);
 if(entry)assert.equal(entry.blob,blobId(original),'The source must equal the exact published module');
 else assert.equal(git('ls-tree',baseCommit,'--',path),'');
 const candidate=working?Buffer.from(readFileSync(join(root,path),'utf8').replace(/\r\n/g,'\n')):gitBytes('show','HEAD:'+path);
 verifyPatch(path,original,candidate);
 execFileSync(process.execPath,['--check','--input-type=module'],{input:candidate,cwd:root});candidates.set(path,candidate);
}
const temp=mkdtempSync(join(tmpdir(),'revision-diagnostics-'));
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
const result={baseRun,baseCommit,baseTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,allOtherPublishedBytesIdentical:true,onlyRevisionDiagnosticsChanged:true,step4AndSharedModulesUnchanged:true,exportAndEntrypointUnchanged:true,modelListAndGenerationParametersUnchanged:true,originalFrozenCheck:'Unchanged; preexisting failures remain failures'};
if(process.argv.includes('--prepare-pages')){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
 const output='/tmp/revision-diagnostics-pages';assert.equal(existsSync(output),false);mkdirSync(output);
 indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
 for(const e of entries)assert.equal(blobId(readFileSync(join(output,e.path))),e.blob,'Published byte mismatch: '+e.path);
 writeFileSync('/tmp/revision-diagnostics-proof.json',JSON.stringify({...result,entries},null,2));
 assert.equal(git('status','--porcelain','--untracked-files=all'),'');
}
console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
