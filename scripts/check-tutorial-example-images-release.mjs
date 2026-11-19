// Replace only the two owner-supplied tutorial PNGs; preserve all other published bytes.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const baseCommit='4cafeeec95a85768ae376392dbf1f71c29b2b380',baseRun=44509416333;
const baseTree='78f5d69ad7099e4ac2aa6d3715322846dd119a4d';
const payloadHashes={
 'forge/tutorial/editable-details.png':'dd93d9d0b4acaf8319b14c139845a87349977c8cd304a854323b429accbd00ff',
 'forge/tutorial/exported-figure.png':'c9d51361d6dde99e45423d9139bc42bab89ada172a6090ce5e2643686bfe091c',
};
const payloads=Object.keys(payloadHashes).sort();
const allowed=[...payloads,'scripts/check-tutorial-example-images-release.mjs','.github/workflows/deploy-tutorial-example-images.yml'].sort();
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
 assert.equal(hash(b),payloadHashes[p],'Image must exactly match the owner-supplied original: '+p);
 assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 candidates.set(p,b);
}
const proofBytes=readFileSync(process.argv[2]);
assert.equal(hash(proofBytes),'1d215f7b1febfa1fe5b4ca26579a304fe0458f6378d48416f0a9ef697670953d');
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
for(const p of payloads)assert.ok(seen.has(p));
// Recover generated publication blobs only when their exact recorded IDs match.
const checked=execFileSync('git',['cat-file','--batch-check'],{cwd:root,input:previous.entries.map(e=>e.blob+'\n').join(''),encoding:'utf8',maxBuffer:128*1024*1024}).trim().split('\n');
for(let i=0;i<checked.length;i++)if(checked[i].endsWith(' missing')){
 const e=previous.entries[i];
 const r=await fetch('https://qwdwqfwq.github.io/topconf-paper-figure-gallery/'+e.path.split('/').map(encodeURIComponent).join('/')+'?release='+baseCommit,{signal:AbortSignal.timeout(30000)});
 assert.ok(r.ok);const b=Buffer.from(await r.arrayBuffer());assert.equal(blob(b),e.blob,'Online base blob differs: '+e.path);
 assert.equal(execFileSync('git',['hash-object','-w','--stdin'],{cwd:root,input:b}).toString().trim(),e.blob);
}
const temp=mkdtempSync(join(tmpdir(),'tutorial-example-images-'));
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
const result={baseRun,baseCommit,baseTree,artifactTree,changedOnline:payloads,unchangedFiles:3750,allOtherPublishedBytesIdentical:true,authorizedFrozenChanges:[],originalFrozenCheck:'Unchanged; existing failures remain failures',payloadHashes};
const preview=process.env.TUTORIAL_IMAGES_PREVIEW_DIR;
if(process.argv.includes('--prepare-pages')||preview){
 if(!preview){assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));}
 const output=preview||'/tmp/tutorial-example-images-pages';assert.equal(existsSync(output),false);mkdirSync(output);
 ig('-c','core.autocrlf=false','-c','core.longpaths=true','checkout-index','--all','--prefix='+output.replace(/\\/g,'/')+'/');
 for(const e of entries)assert.equal(blob(readFileSync(join(output,e.path))),e.blob,'Publication byte mismatch: '+e.path);
 const proof=JSON.stringify({...result,entries},null,2);
 writeFileSync(preview?join(output,'..','candidate-proof.json'):'/tmp/tutorial-example-images-proof.json',proof);
 if(!working)assert.equal(git('status','--porcelain','--untracked-files=all'),'');
}
console.log(JSON.stringify(result,null,2));
