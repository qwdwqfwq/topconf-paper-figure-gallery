// Owner-authorized static note only; preserve every other published byte.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const baseCommit='f01a55eb397aef97e3a33cff4fb1224523b71c5e',baseRun=44419236753;
const baseTree='825550759ae66e2d345b26a16f303d5d776e96e1';
const payload='forge/index.html';
const note='<span style="font-size:12px;color:#b45309">建议不要开极高，容易网络连接不稳定</span>';
const before='        <div class="bfield" style="margin-bottom:9px"><label class="blab" for="reconReasoningEffort">步骤四推理强度</label><select id="reconReasoningEffort"><option value="">服务商默认</option><option value="medium">中</option><option value="high">高</option><option value="xhigh">极高</option></select></div>';
const after=before.replace('</select></div>','</select>'+note+'</div>');
const allowed=[payload,'scripts/check-reasoning-effort-note-release.mjs','.github/workflows/deploy-reasoning-effort-note.yml'].sort();
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
const source=bytes('show',baseCommit+':'+payload).toString();
assert.equal(source.split(before).length,2);
const current=working?readFileSync(join(root,payload),'utf8').replace(/\r\n/g,'\n'):bytes('show','HEAD:'+payload).toString();
assert.equal(current,source.replace(before,after),'Source may add only the approved static span');
const proofBytes=readFileSync(process.argv[2]);
assert.equal(hash(proofBytes),'6841d32c9106c0bee5fc49f876b99ce4949d9680bfd81c07429890538c9ad6d3');
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
// Generated publication blobs may not be reachable from a source commit.
// Recover missing blobs from the current site only after verifying their exact IDs.
const checked=execFileSync('git',['cat-file','--batch-check'],{cwd:root,input:previous.entries.map(e=>e.blob+'\n').join(''),encoding:'utf8',maxBuffer:128*1024*1024}).trim().split('\n');
for(let i=0;i<checked.length;i++)if(checked[i].endsWith(' missing')){
 const e=previous.entries[i];
 const r=await fetch('https://qwdwqfwq.github.io/topconf-paper-figure-gallery/'+e.path.split('/').map(encodeURIComponent).join('/')+'?release='+baseCommit,{signal:AbortSignal.timeout(30000)});
 assert.ok(r.ok);const b=Buffer.from(await r.arrayBuffer());assert.equal(blob(b),e.blob,'Online base blob differs: '+e.path);
 assert.equal(execFileSync('git',['hash-object','-w','--stdin'],{cwd:root,input:b}).toString().trim(),e.blob);
}
const old=bytes('cat-file','blob',previous.entries.find(e=>e.path===payload).blob);
assert.equal(hash(old),'167aafd80c08b251da2e15c54c9d6b8b74ba15da3896b5c0c5d5ca2779e4e87b');
assert.equal(old.toString().split(before).length,2);const candidate=Buffer.from(old.toString().replace(before,after));
assert.equal(candidate.toString().replace(note,''),old.toString(),'Only the approved static note may change online');
const temp=mkdtempSync(join(tmpdir(),'reasoning-effort-note-'));
const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
const ig=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',maxBuffer:128*1024*1024}).trim();
ig('read-tree','--empty');
execFileSync('git',['update-index','--index-info'],{cwd:root,env,input:previous.entries.map(e=>e.mode+' '+e.blob+'\t'+e.path+'\n').join(''),maxBuffer:128*1024*1024});
assert.equal(ig('write-tree'),baseTree);
const replacement=execFileSync('git',['hash-object','-w','--stdin'],{cwd:root,input:candidate}).toString().trim();assert.equal(replacement,blob(candidate));
ig('update-index','--add','--cacheinfo','100644',replacement,payload);
const artifactTree=ig('write-tree');assert.equal(git('diff','--name-only','--no-renames',baseTree,artifactTree),payload);
const entries=previous.entries.map(e=>e.path===payload?{...e,blob:replacement}:e);
const result={baseRun,baseCommit,baseTree,artifactTree,changedOnline:[payload],unchangedFiles:3751,allOtherPublishedBytesIdentical:true,authorizedFrozenChanges:['Static reasoning effort note only'],originalFrozenCheck:'Unchanged; existing failures remain failures',payloadHashes:{[payload]:hash(candidate)}};
const preview=process.env.REASONING_NOTE_PREVIEW_DIR;
if(process.argv.includes('--prepare-pages')||preview){
 if(!preview){assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));}
 const output=preview||'/tmp/reasoning-effort-note-pages';assert.equal(existsSync(output),false);mkdirSync(output);
 ig('-c','core.autocrlf=false','-c','core.longpaths=true','checkout-index','--all','--prefix='+output.replace(/\\/g,'/')+'/');
 for(const e of entries)assert.equal(blob(readFileSync(join(output,e.path))),e.blob,'Publication byte mismatch: '+e.path);
 writeFileSync(preview?join(temp,'proof.json'):'/tmp/reasoning-effort-note-proof.json',JSON.stringify({...result,entries},null,2));
 if(!working)assert.equal(git('status','--porcelain','--untracked-files=all'),'');
}
console.log(JSON.stringify(result,null,2));
