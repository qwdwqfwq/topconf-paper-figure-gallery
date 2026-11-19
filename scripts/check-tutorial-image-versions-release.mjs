// Owner-approved exception: only two tutorial image src versions in forge/index.html.
// Keep the original freeze baseline and all historical guards unchanged.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const baseCommit='3d72ab82d6ecc071dfabc5ef313804240918bcf1',baseRun=44509836928;
const baseTree='831648aca4f41e453ac0235be5ecb90f1cd75ba5';
const payload='forge/index.html';
const versions={
 'tutorial/editable-details.png':'dd93d9d0b4acaf8319b14c139845a87349977c8cd304a854323b429accbd00ff',
 'tutorial/exported-figure.png':'c9d51361d6dde99e45423d9139bc42bab89ada172a6090ce5e2643686bfe091c',
};
const allowed=[payload,'scripts/check-tutorial-image-versions-release.mjs','.github/workflows/deploy-tutorial-image-versions.yml'].sort();
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
const original=bytes('show',baseCommit+':'+payload);
function versioned(input){
 let value=input.toString('utf8');
 for(const [p,h] of Object.entries(versions)){
  const from='src="'+p+'"';assert.equal(value.split(from).length,2);
  value=value.replace(from,'src="'+p+'?v='+h.slice(0,16)+'"');
 }
 return Buffer.from(value);
}
for(const [p,h] of Object.entries(versions))assert.equal(hash(bytes('show',baseCommit+':forge/'+p)),h);
const candidate=working?Buffer.from(readFileSync(join(root,payload),'utf8').replace(/\r\n/g,'\n')):bytes('show','HEAD:'+payload);
assert.deepEqual(candidate,versioned(original),'Only the two approved source src values may change');
const proofBytes=readFileSync(process.argv[2]);
assert.equal(hash(proofBytes),'0471a01f883269c3da7f642d504628c138f3c938654b782f5666e13e41b6124e');
const previous=JSON.parse(proofBytes);
assert.equal(previous.artifactTree,baseTree);assert.equal(previous.entries.length,3752);assert.equal(previous.allOtherPublishedBytesIdentical,true);
const publishedHtml=previous.entries.find(e=>e.path===payload);assert.ok(publishedHtml);
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
const checked=execFileSync('git',['cat-file','--batch-check'],{cwd:root,input:previous.entries.map(e=>e.blob+'\n').join(''),encoding:'utf8',maxBuffer:128*1024*1024}).trim().split('\n');
for(let i=0;i<checked.length;i++)if(checked[i].endsWith(' missing')){
 const e=previous.entries[i];
 const r=await fetch('https://qwdwqfwq.github.io/topconf-paper-figure-gallery/'+e.path.split('/').map(encodeURIComponent).join('/')+'?release='+baseCommit,{signal:AbortSignal.timeout(30000)});
 assert.ok(r.ok);const b=Buffer.from(await r.arrayBuffer());assert.equal(blob(b),e.blob,'Online base blob differs: '+e.path);
 assert.equal(execFileSync('git',['hash-object','-w','--stdin'],{cwd:root,input:b}).toString().trim(),e.blob);
}
const temp=mkdtempSync(join(tmpdir(),'tutorial-image-versions-'));
const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
const ig=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',maxBuffer:128*1024*1024}).trim();
ig('read-tree','--empty');
execFileSync('git',['update-index','--index-info'],{cwd:root,env,input:previous.entries.map(e=>e.mode+' '+e.blob+'\t'+e.path+'\n').join(''),maxBuffer:128*1024*1024});
assert.equal(ig('write-tree'),baseTree);
// Published HTML contains earlier authorized release transforms. Preserve those bytes,
// and apply the same two src replacements independently to the published base.
const publishedOriginal=bytes('cat-file','blob',publishedHtml.blob);
assert.equal(blob(publishedOriginal),publishedHtml.blob);
const publishedCandidate=versioned(publishedOriginal);
const id=execFileSync('git',['hash-object','-w','--stdin'],{cwd:root,input:publishedCandidate}).toString().trim();assert.equal(id,blob(publishedCandidate));
ig('update-index','--add','--cacheinfo','100644',id,payload);
const artifactTree=ig('write-tree');
assert.deepEqual(git('diff','--name-only','--no-renames',baseTree,artifactTree).split('\n'),[payload]);
const entries=previous.entries.map(e=>e.path===payload?{...e,blob:id}:e);
const result={baseRun,baseCommit,baseTree,artifactTree,changedOnline:[payload],unchangedFiles:3751,allOtherPublishedBytesIdentical:true,authorizedFrozenChanges:['forge/index.html: only the two tutorial image src content-version query strings'],originalFrozenCheck:'Unchanged; existing failures remain failures',htmlSha256:hash(publishedCandidate),versions};
const preview=process.env.TUTORIAL_IMAGE_VERSIONS_PREVIEW_DIR;
if(process.argv.includes('--prepare-pages')||preview){
 if(!preview){assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));}
 const output=preview||'/tmp/tutorial-image-versions-pages';assert.equal(existsSync(output),false);mkdirSync(output);
 ig('-c','core.autocrlf=false','-c','core.longpaths=true','checkout-index','--all','--prefix='+output.replace(/\\/g,'/')+'/');
 for(const e of entries)assert.equal(blob(readFileSync(join(output,e.path))),e.blob,'Publication byte mismatch: '+e.path);
 writeFileSync(preview?join(output,'..','image-versions-candidate-proof.json'):'/tmp/tutorial-image-versions-proof.json',JSON.stringify({...result,entries},null,2));
 if(!working)assert.equal(git('status','--porcelain','--untracked-files=all'),'');
}
console.log(JSON.stringify(result,null,2));
