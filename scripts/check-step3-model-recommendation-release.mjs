// Publish only owner-requested Step 3 recommendation labels; preserve every other published byte.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const baseCommit='c073342b69063679d95658c574eb1edfa111f3a1',baseRun=44500863369;
const baseTree='991a6db1c9e3554755ecbf72ebdde298d42aa1e1';
const payloadHashes={'forge/step3-model-catalog.mjs':'a51170976ec014fd498f5d9030602daea0f60e6de1b8ad7a1abc7f13af9d0c44'};
const payloads=Object.keys(payloadHashes).sort();
const allowed=[...payloads,'scripts/check-step3-model-recommendation-release.mjs','.github/workflows/deploy-step3-model-recommendation.yml'].sort();
const bytes=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:128*1024*1024});
const git=(...args)=>bytes(...args).toString().trim();
const hash=b=>createHash('sha256').update(b).digest('hex');
const blob=b=>createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
const working=process.argv.includes('--working');
assert.equal(git('rev-parse',working?'HEAD':'HEAD^'),baseCommit);
if(!working){assert.equal(git('show','-s','--format=%P','HEAD'),baseCommit);assert.equal(git('status','--porcelain','--untracked-files=all'),'');}
const changed=git('diff','--name-only','--no-renames',baseCommit,...(working?[]:['HEAD'])).split('\n').filter(Boolean);
if(working)changed.push(...git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean));
assert.deepEqual(changed.sort(),allowed);
const candidates=new Map();
for(const p of payloads){
 const b=working?readFileSync(join(root,p)):bytes('show','HEAD:'+p);
 assert.equal(hash(b),payloadHashes[p],'Module must exactly match the reviewed label-only change: '+p);
 assert.equal(hash(bytes('show',baseCommit+':'+p)),'b695f6518f7410c8ed3eeccb11d8c12a8db7b6a0c6201f269acd94af634485ca');
 candidates.set(p,b);
}
const proofBytes=readFileSync(process.argv[2]);
assert.equal(hash(proofBytes),'6b3a944853a060af0cba4516abf89c79ee5f00d20237565e30a1bbdb547b022f');
const previous=JSON.parse(proofBytes);
assert.equal(previous.artifactTree,baseTree);assert.equal(previous.entries.length,3752);assert.equal(previous.allOtherPublishedBytesIdentical,true);
async function api(suffix){
 assert.ok(process.env.GH_TOKEN);
 const r=await fetch('https://api.github.com/repos/qwdwqfwq/topconf-paper-figure-gallery'+suffix,{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000)});
 assert.ok(r.ok,'GitHub HTTP '+r.status);return r.json();
}
const run=await api('/actions/runs/'+baseRun);assert.equal(run.conclusion,'success');assert.equal(run.head_sha,baseCommit);
const deployments=await api('/deployments?environment=github-pages&per_page=20');
const states=await Promise.all(deployments.map(async d=>({d,s:(await api('/deployments/'+d.id+'/statuses'))[0]})));
const published=states.find(x=>x.s?.state==='success');
assert.ok(published);assert.equal(published.d.sha,baseCommit,'Stop if published base changed');assert.ok(published.s.log_url.includes('/runs/'+baseRun+'/'));
if(process.argv.includes('--check-published-base')){console.log('Verified unchanged publication base.');process.exit(0);}
const seen=new Set();
for(const e of previous.entries){
 assert.ok(['100644','100755'].includes(e.mode));assert.match(e.blob,/^[0-9a-f]{40}$/);
 assert.ok(!/[\t\r\n\\]/.test(e.path)&&!e.path.startsWith('/')&&!e.path.split('/').some(p=>p==='..'||p==='.git'));
 assert.ok(!seen.has(e.path));seen.add(e.path);
}
for(const p of payloads){assert.ok(seen.has(p));assert.equal(previous.entries.find(e=>e.path===p).blob,blob(bytes('show',baseCommit+':'+p)),'Published module must equal reviewed source base');}
// Recover generated publication blobs only when their exact recorded IDs match.
const checked=execFileSync('git',['cat-file','--batch-check'],{cwd:root,input:previous.entries.map(e=>e.blob+'\n').join(''),encoding:'utf8',maxBuffer:128*1024*1024}).trim().split('\n');
for(let i=0;i<checked.length;i++)if(checked[i].endsWith(' missing')){
 const e=previous.entries[i];
 const r=await fetch('https://qwdwqfwq.github.io/topconf-paper-figure-gallery/'+e.path.split('/').map(encodeURIComponent).join('/')+'?release='+baseCommit,{signal:AbortSignal.timeout(30000)});
 assert.ok(r.ok);const b=Buffer.from(await r.arrayBuffer());assert.equal(blob(b),e.blob,'Online base blob differs: '+e.path);
 assert.equal(execFileSync('git',['hash-object','-w','--stdin'],{cwd:root,input:b}).toString().trim(),e.blob);
}
const temp=mkdtempSync(join(tmpdir(),'step3-model-recommendation-'));
const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
const ig=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',maxBuffer:128*1024*1024}).trim();
ig('read-tree','--empty');
execFileSync('git',['update-index','--index-info'],{cwd:root,env,input:previous.entries.map(e=>e.mode+' '+e.blob+'\t'+e.path+'\n').join(''),maxBuffer:128*1024*1024});
assert.equal(ig('write-tree'),baseTree);
const replacements=new Map();
for(const [p,b] of candidates){
 const id=execFileSync('git',['hash-object','-w','--stdin'],{cwd:root,input:b}).toString().trim();assert.equal(id,blob(b));
 ig('update-index','--add','--cacheinfo','100644',id,p);replacements.set(p,id);
}
const artifactTree=ig('write-tree');
assert.deepEqual(git('diff','--name-only','--no-renames',baseTree,artifactTree).split('\n').sort(),payloads);
const entries=previous.entries.map(e=>replacements.has(e.path)?{...e,blob:replacements.get(e.path)}:e);
const result={baseRun,baseCommit,baseTree,artifactTree,changedOnline:payloads,unchangedFiles:3751,allOtherPublishedBytesIdentical:true,authorizedFrozenChanges:[],originalFrozenCheck:'Unchanged; existing failures remain failures',payloadHashes};
const preview=process.env.STEP3_RECOMMENDATION_PREVIEW_DIR;
if(process.argv.includes('--prepare-pages')||preview){
 if(!preview){assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));}
 const output=preview||'/tmp/step3-model-recommendation-pages';assert.equal(existsSync(output),false);mkdirSync(output);
 ig('-c','core.autocrlf=false','-c','core.longpaths=true','checkout-index','--all','--prefix='+output.replace(/\\/g,'/')+'/');
 for(const e of entries)assert.equal(blob(readFileSync(join(output,e.path))),e.blob,'Publication byte mismatch: '+e.path);
 const proof=JSON.stringify({...result,entries},null,2);
 writeFileSync(preview?join(output,'..','candidate-proof.json'):'/tmp/step3-model-recommendation-proof.json',proof);
 if(!working)assert.equal(git('status','--porcelain','--untracked-files=all'),'');
}
console.log(JSON.stringify(result,null,2));
