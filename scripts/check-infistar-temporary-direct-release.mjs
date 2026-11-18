// Scoped temporary routing publication. Frozen HTML and all unrelated published bytes stay identical.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const sourceBase='83a895cd2c6b08a064d01719e8d5f15e074ac247';
const baseCommit=sourceBase;
const baseRun=44330267719;
const baseTree='c2663cdbd72e9bb0532726d675ad48d3048df971';
const payloads=["forge/nonelinear-config.js", "forge/infistar-temporary-direct.mjs", "forge/step3-analysis-job.mjs", "forge/step3-initial-image-job.mjs", "forge/revision-image-job.mjs"];
const pins={"forge/nonelinear-config.js": "f02f0768aa9210076a3dff3378149fa217ebabaff2e771e18bf07cf3bcb566d9", "forge/infistar-temporary-direct.mjs": "6955ba0806c7e0cc072de55386211afb26e03149641cceb00185d6aa8a36c9c7", "forge/step3-analysis-job.mjs": "93238452267394981755ac4853abf0af7b2865f55b0558624932ab39e23faf66", "forge/step3-initial-image-job.mjs": "42d9959aaa4b9f0e69279ceee0610367e1d99387002a7e585568f1e9dd6cef10", "forge/revision-image-job.mjs": "ae8b48c5892436d189867b6eceb40f658e751446527522e62ad55e14dd7354c2"};
const allowed=["forge/nonelinear-config.js", "forge/infistar-temporary-direct.mjs", "forge/step3-analysis-job.mjs", "forge/step3-initial-image-job.mjs", "forge/revision-image-job.mjs", "forge/test-revision-connection-recovery.mjs", "forge/test-revision-job-recovery.mjs", "forge/test-step3-analysis-job.mjs", "forge/test-step3-initial-image-job.mjs", "forge/test-tencent-network.mjs", "无限星河_临时直连与回退记录_2026-11-19.md", "scripts/check-infistar-temporary-direct-release.mjs", ".github/workflows/deploy-infistar-temporary-direct.yml"].sort();
const gitBytes=(...args)=>execFileSync('git',['-c','core.quotepath=false',...args],{cwd:root,maxBuffer:128*1024*1024});
const git=(...args)=>gitBytes(...args).toString().trim();
const blobId=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const working=process.argv.includes('--working');
assert.equal(git('rev-parse',working?'HEAD':'HEAD^'),sourceBase);
if(!working){assert.equal(git('show','-s','--format=%P','HEAD'),sourceBase);assert.equal(git('status','--porcelain','--untracked-files=all'),'');}
const changed=git('diff','--name-only','--no-renames',sourceBase,...(working?[]:['HEAD'])).split('\n').filter(Boolean);
if(working)changed.push(...git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean));
assert.deepEqual(changed.sort(),allowed);
const proofBytes=readFileSync(process.argv[2]);
assert.equal(createHash('sha256').update(proofBytes).digest('hex'),'d6b8bf763703544f8fe03375c289d26e0fc6a3d2949d36738f479708c484b4a5');
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
const candidates=new Map();
for(const payload of payloads){
 const prior=previous.entries.find(e=>e.path===payload);
 if(prior)assert.equal(blobId(gitBytes('show',sourceBase+':'+payload)),prior.blob,'Source differs from published payload: '+payload);
 else assert.equal(payload,'forge/infistar-temporary-direct.mjs');
 const candidate=working?Buffer.from(readFileSync(join(root,payload),'utf8').replace(/\r\n/g,'\n')):gitBytes('show','HEAD:'+payload);
 assert.equal(createHash('sha256').update(candidate).digest('hex'),pins[payload]);
 execFileSync(process.execPath,['--check',...(payload.endsWith('.mjs')?['--input-type=module']:[])],{input:candidate,cwd:root});
 candidates.set(payload,candidate);
}
const temp=mkdtempSync(join(tmpdir(),'infistar-direct-'));
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
const overlays=new Map();
for(const [payload,candidate] of candidates){
 const blob=execFileSync('git',['hash-object','-w','--stdin'],{cwd:root,input:candidate}).toString().trim();assert.equal(blob,blobId(candidate));
 indexGit('update-index','--add','--cacheinfo','100644',blob,payload);overlays.set(payload,blob);
}
const artifactTree=indexGit('write-tree');
assert.deepEqual(git('diff','--name-only','--no-renames',baseTree,artifactTree).split('\n').sort(),[...payloads].sort());
const entries=previous.entries.map(e=>overlays.has(e.path)?{...e,blob:overlays.get(e.path)}:e);
for(const [path,blob]of overlays)if(!seen.has(path))entries.push({mode:'100644',blob,path});
entries.sort((a,b)=>a.path.localeCompare(b.path));
assert.equal(entries.length,3752);
const result={baseRun,baseCommit,sourceBase,baseTree,artifactTree,changedOnline:payloads,unchangedFiles:3747,allOtherPublishedBytesIdentical:true,frozenHtmlUnchanged:true,temporary:true,originalFrozenCheck:'Unchanged; preexisting failures remain failures'};
if(process.argv.includes('--prepare-pages')){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
 const output='/tmp/infistar-direct-pages';assert.equal(existsSync(output),false);mkdirSync(output);
 indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
 for(const e of entries)assert.equal(blobId(readFileSync(join(output,e.path))),e.blob,'Published byte mismatch: '+e.path);
 writeFileSync('/tmp/infistar-direct-proof.json',JSON.stringify({...result,entries},null,2));
 assert.equal(git('status','--porcelain','--untracked-files=all'),'');
}
console.log(JSON.stringify(result,null,2));
