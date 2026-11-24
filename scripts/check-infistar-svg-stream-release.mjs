// Isolated Infistar SVG revision streaming: preserve all other published bytes and original freeze guards.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const sourceBase='f9352983afb7ae362bb93d62822bd79c170310ff';
const baseCommit='f9352983afb7ae362bb93d62822bd79c170310ff';
const baseRun=45308323816;
const baseTree='b0929caed80695e43a0a30addb69ecc4f2ef4c29';
const payload='forge/svg-revision.mjs';
const allowed=[payload,'forge/test-svg-revision-stream.cjs','.github/workflows/deploy-infistar-svg-stream.yml','scripts/check-infistar-svg-stream-release.mjs'].sort();
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
assert.equal(createHash('sha256').update(proofBytes).digest('hex'),'3e9839d5d564357c0092a97a78c4d8cd5d3d5db389a276885295a74e48bdf709');
const previous=JSON.parse(proofBytes);
assert.equal(previous.artifactTree,baseTree);assert.equal(previous.entries.length,3752);
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
const checked=execFileSync('git',['cat-file','--batch-check'],{cwd:root,input:previous.entries.map(e=>e.blob+'\n').join(''),encoding:'utf8',maxBuffer:128*1024*1024}).trim().split('\n');
for(let i=0;i<checked.length;i++)if(checked[i].endsWith(' missing')){
 const e=previous.entries[i];
 const r=await fetch('https://qwdwqfwq.github.io/topconf-paper-figure-gallery/'+e.path.split('/').map(encodeURIComponent).join('/')+'?release='+baseCommit,{signal:AbortSignal.timeout(30000)});
 assert.ok(r.ok);const b=Buffer.from(await r.arrayBuffer());assert.equal(blobId(b),e.blob,'Online base blob differs: '+e.path);
 assert.equal(execFileSync('git',['hash-object','-w','--stdin'],{cwd:root,input:b}).toString().trim(),e.blob);
}
const prior=previous.entries.find(e=>e.path===payload);assert.ok(prior);
const original=gitBytes('cat-file','blob',prior.blob);
assert.equal(blobId(gitBytes('show',sourceBase+':'+payload)),prior.blob);
const candidate=working?Buffer.from(readFileSync(join(root,payload),'utf8').replace(/\r\n/g,'\n')):gitBytes('show','HEAD:'+payload);
assert.equal(prior.blob,'397a6ccc4fc34d3506ee3ffed4d8e1ad2baca633','Only replace the reviewed SVG revision base');
assert.equal(createHash('sha256').update(candidate).digest('hex'),'5e8b77f891f0bdc2bcbbe5596d4a1cf481064db7f4c59e31694dea9ff6c80aff');
execFileSync(process.execPath,['--input-type=module','--check'],{input:candidate,cwd:root});
const temp=mkdtempSync(join(tmpdir(),'infistar-svg-stream-'));
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
const result={baseRun,baseCommit,sourceBase,baseTree,artifactTree,changedOnline:[payload],unchangedFiles:3751,allOtherPublishedBytesIdentical:true,frozenHtmlUnchanged:true,originalFrozenCheck:'Unchanged; preexisting failures remain failures'};
const preview=process.env.INFISTAR_SVG_STREAM_PREVIEW_DIR;
if(process.argv.includes('--prepare-pages')||preview){
 if(!preview){assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));}
 const output=preview||'/tmp/infistar-svg-stream-pages';assert.equal(existsSync(output),false);mkdirSync(output);
 indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output.replace(/\\/g,'/')+'/');
 for(const e of entries)assert.equal(blobId(readFileSync(join(output,e.path))),e.blob,'Published byte mismatch: '+e.path);
 writeFileSync(preview?join(output,'..','candidate-proof.json'):'/tmp/infistar-svg-stream-proof.json',JSON.stringify({...result,entries},null,2));
 if(!working)assert.equal(git('status','--porcelain','--untracked-files=all'),'');
}
console.log(JSON.stringify(result,null,2));
