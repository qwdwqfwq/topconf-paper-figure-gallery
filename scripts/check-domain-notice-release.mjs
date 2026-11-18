// Isolated notice publication: frozen HTML and every other published file remain identical.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const sourceBase='4a7acbc4d038e09ba513d70cbf4f3a7cd949d85e';
const baseCommit='e4dad88d578559f4a56f5eab71a952eb8f8a7433';
const baseRun=44313636693;
const baseTree='f604792546db6ca7892e1a4f608d882f3f4f5079';
const payload='assets/analytics.js';
const allowed=[payload,'.github/workflows/deploy-domain-notice.yml','scripts/check-domain-notice-release.mjs'].sort();
const gitBytes=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:128*1024*1024});
const git=(...args)=>gitBytes(...args).toString().trim();
const blobId=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const working=process.argv.includes('--working');
assert.equal(git('rev-parse',working?'HEAD':'HEAD^'),sourceBase);
if(!working){assert.equal(git('show','-s','--format=%P','HEAD'),sourceBase);assert.equal(git('status','--porcelain','--untracked-files=all'),'');}
const changed=git('diff','--name-only','--no-renames',sourceBase,...(working?[]:['HEAD'])).split('\n').filter(Boolean);
if(working)changed.push(...git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean));
assert.deepEqual(changed.sort(),allowed);
const proofBytes=readFileSync(process.argv[2]);
assert.equal(createHash('sha256').update(proofBytes).digest('hex'),'297ea8116711f97bb7749dac81b2f3304eba7336c8bd6526a1696f781e87cd1a');
const previous=JSON.parse(proofBytes);
assert.equal(previous.artifactTree,baseTree);assert.equal(previous.entries.length,3751);
assert.equal(previous.allOtherPublishedBytesIdentical,true);
async function api(suffix){
 assert.ok(process.env.GH_TOKEN);
 const r=await fetch('https://api.github.com/repos/qwdwqfwq/topconf-paper-figure-gallery'+suffix,{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000)});
 assert.ok(r.ok,'GitHub HTTP '+r.status);return r.json();
}
const run=await api('/actions/runs/'+baseRun);assert.equal(run.conclusion,'success');assert.equal(run.head_sha,baseCommit);
const deployments=await api('/deployments?environment=github-pages&per_page=20');
const statuses=await Promise.all(deployments.map(async deployment=>({deployment,status:(await api('/deployments/'+deployment.id+'/statuses'))[0]})));
const current=statuses.find(s=>s.status?.state==='success');
assert.ok(current);assert.equal(current.deployment.sha,baseCommit,'Stop if another release has been published');
assert.ok(current.status.log_url.includes('/runs/'+baseRun+'/'));
if(process.argv.includes('--check-published-base')){console.log('Verified unchanged published base.');process.exit(0);}
const prior=previous.entries.find(e=>e.path===payload);assert.ok(prior);
const original=gitBytes('cat-file','blob',prior.blob);
assert.equal(blobId(gitBytes('show',sourceBase+':'+payload)),prior.blob);
const candidate=working?Buffer.from(readFileSync(join(root,payload),'utf8').replace(/\r\n/g,'\n')):gitBytes('show','HEAD:'+payload);
assert.ok(candidate.subarray(0,original.length).equals(original),'Existing script must remain byte-identical');
assert.equal(createHash('sha256').update(candidate).digest('hex'),'bccfbfe184979c39a1422bac35ba69fcb7ec6955583f080d2a8890e38a62db92');
execFileSync(process.execPath,['--check'],{input:candidate,cwd:root});
const temp=mkdtempSync(join(tmpdir(),'domain-notice-'));
const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
const indexGit=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',maxBuffer:128*1024*1024}).trim();
const seen=new Set();
for(const e of previous.entries){
 assert.ok(['100644','100755'].includes(e.mode));assert.match(e.blob,/^[0-9a-f]{40}$/);
 assert.ok(!/[\t\r\n\\]/.test(e.path)&&!e.path.startsWith('/')&&!e.path.split('/').some(p=>p==='..'||p==='.git'));
 assert.ok(!seen.has(e.path));seen.add(e.path);
}
indexGit('read-tree','--empty');
execFileSync('git',['update-index','--index-info'],{cwd:root,env,input:previous.entries.map(e=>e.mode+' '+e.blob+'\t'+e.path+'\n').join(''),maxBuffer:128*1024*1024});
assert.equal(indexGit('write-tree'),baseTree);
const blob=execFileSync('git',['hash-object','-w','--stdin'],{cwd:root,input:candidate}).toString().trim();assert.equal(blob,blobId(candidate));
indexGit('update-index','--add','--cacheinfo','100644',blob,payload);
const artifactTree=indexGit('write-tree');
assert.deepEqual(git('diff','--name-only','--no-renames',baseTree,artifactTree).split('\n'),[payload]);
const entries=previous.entries.map(e=>e.path===payload?{...e,blob}:e);
const result={baseRun,baseCommit,sourceBase,baseTree,artifactTree,changedOnline:[payload],unchangedFiles:3750,allOtherPublishedBytesIdentical:true,frozenHtmlUnchanged:true,originalFrozenCheck:'Unchanged; preexisting failures remain failures'};
if(process.argv.includes('--prepare-pages')){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
 const output='/tmp/domain-notice-pages';assert.equal(existsSync(output),false);mkdirSync(output);
 indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
 for(const e of entries)assert.equal(blobId(readFileSync(join(output,e.path))),e.blob,'Published byte mismatch: '+e.path);
 writeFileSync('/tmp/domain-notice-proof.json',JSON.stringify({...result,entries},null,2));
 assert.equal(git('status','--porcelain','--untracked-files=all'),'');
}
console.log(JSON.stringify(result,null,2));
