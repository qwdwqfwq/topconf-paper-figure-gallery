// Owner-authorized stream recovery only. Original freeze manifests/checkers stay unchanged.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const sourceBase='c1840b3b27f0d8e2fb00aae68fa3cf3100158cc0';
const baseCommit='ebeb57a73d095e848dc3cb61b12228a7997eb421';
const baseRun=44360068394;
const baseTree='2ae946ca8ff259294ee2f5239d555037d57b7d10';
const payloads=['forge/index.html','forge/infistar-reconstruction-stream.mjs'];
const hashes=['df59fb9a528aec50b7b67bc80923e5c4922db7e9d32b6551cdacbb25b263230a','081fd63661284b89564922124ba97be98b0741e7dde9fc4b0e7869fe4c0e41b1'];
const allowed=[...payloads,'forge/test-infistar-reconstruction-stream.mjs','scripts/test-infistar-stream-recovery-browser.cjs','scripts/check-infistar-stream-recovery-release.mjs','.github/workflows/deploy-infistar-stream-recovery.yml'].sort();
const gitBytes=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:128*1024*1024});
const git=(...args)=>gitBytes(...args).toString().trim();
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const blobId=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');

// Replay only reviewed edits onto the exact published HTML. Source contains
// unrelated, unpublished retrieval edits; they must not enter this release.
function replayReviewedEdits(original,source,diff){
 const sourceLines=source.split('\n');
 const hunks=diff.split(/(?=^@@ )/m).filter(h=>h.startsWith('@@ '));
 assert.ok(hunks.length);
 for(const hunk of hunks){
  const lines=hunk.split('\n'),match=lines.shift().match(/^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/);
  assert.ok(match);const start=Number(match[1]),count=match[2]===undefined?1:Number(match[2]);
  const oldLines=lines.filter(l=>l.startsWith('-')).map(l=>l.slice(1));
  const newLines=lines.filter(l=>l.startsWith('+')).map(l=>l.slice(1));
  assert.equal(oldLines.length,count);
  assert.deepEqual(oldLines,sourceLines.slice(count?start-1:start,count?start-1+count:start));
  // An insertion uses its preceding original line as a mandatory unique anchor.
  const anchor=count?[]:[sourceLines[start-1]];
  const before=[...anchor,...oldLines].join('\n')+'\n';
  const after=[...anchor,...newLines].join('\n')+'\n';
  assert.equal(original.split(before).length,2,'Published edit context must occur exactly once');
  original=original.replace(before,after);
 }
 return original;
}
if(process.argv.includes('--self-test')){
 assert.equal(replayReviewedEdits('published\nold\nanchor\nend\n','source\nold\nanchor\nend\n','@@ -2 +2 @@\n-old\n+new\n@@ -3,0 +4 @@\n+added\n'),'published\nnew\nanchor\nadded\nend\n');
 assert.throws(()=>replayReviewedEdits('old\nold\n','old\n','@@ -1 +1 @@\n-old\n+new\n'));
 assert.throws(()=>replayReviewedEdits('changed\n','old\n','@@ -1 +1 @@\n-old\n+new\n'));
 console.log('Published patch isolation: replacement, insertion, ambiguity and context checks passed.');process.exit(0);
}
const working=process.argv.includes('--working');
assert.equal(git('rev-parse',working?'HEAD':'HEAD^'),sourceBase);
if(!working){assert.equal(git('show','-s','--format=%P','HEAD'),sourceBase);assert.equal(git('status','--porcelain','--untracked-files=all'),'');}
const changed=git('diff','--name-only','--no-renames',sourceBase,...(working?[]:['HEAD'])).split('\n').filter(Boolean);
if(working)changed.push(...git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean));
assert.deepEqual(changed.sort(),allowed);
const proofBytes=readFileSync(process.argv[2]);
assert.equal(sha256(proofBytes),'c08f943cfef45966bb451accd2d742c1237261ffdc17465b6b9a979beb6d687d');
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
const candidates=payloads.map((payload,i)=>{
 const prior=previous.entries.find(e=>e.path===payload);assert.ok(prior);
 const original=gitBytes('cat-file','blob',prior.blob);
 const source=gitBytes('show',sourceBase+':'+payload);
 const candidate=working?Buffer.from(readFileSync(join(root,payload),'utf8').replace(/\r\n/g,'\n')):gitBytes('show','HEAD:'+payload);
 assert.equal(sha256(candidate),hashes[i],'Only the reviewed source bytes may be released');
 if(i===1){assert.equal(blobId(source),prior.blob);return candidate;}
 const diff=git('diff','--unified=0','--no-ext-diff',sourceBase,...(working?[]:['HEAD']),'--',payload)+'\n';
 const published=Buffer.from(replayReviewedEdits(original.toString(),source.toString(),diff));
 // Explicitly preserve the previous published retrieval path and startup.
 assert.ok(!published.includes(Buffer.from("from './retrieval-domestic.mjs'")));
 assert.ok(published.includes(Buffer.from('await boot();')));
 return published;
});
const temp=mkdtempSync(join(tmpdir(),'infistar-stream-recovery-'));
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
const replacements=new Map();
payloads.forEach((payload,i)=>{
 const blob=execFileSync('git',['hash-object','-w','--stdin'],{cwd:root,input:candidates[i]}).toString().trim();assert.equal(blob,blobId(candidates[i]));
 indexGit('update-index','--add','--cacheinfo','100644',blob,payload);replacements.set(payload,blob);
});
const artifactTree=indexGit('write-tree');
assert.deepEqual(git('diff','--name-only','--no-renames',baseTree,artifactTree).split('\n'),payloads);
const entries=previous.entries.map(e=>replacements.has(e.path)?{...e,blob:replacements.get(e.path)}:e);
const result={baseRun,baseCommit,sourceBase,baseTree,artifactTree,changedOnline:payloads,unchangedFiles:3750,allOtherPublishedBytesIdentical:true,authorizedFrozenChanges:payloads,originalFrozenCheck:'Unchanged; preexisting failures remain failures',payloadHashes:Object.fromEntries(payloads.map((p,i)=>[p,sha256(candidates[i])]))};
const preview=process.env.INFISTAR_PREVIEW_DIR;
if(process.argv.includes('--prepare-pages')||preview){
 if(!preview){assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));}
 const output=preview||'/tmp/infistar-stream-recovery-pages';assert.equal(existsSync(output),false);mkdirSync(output);
 indexGit('-c','core.autocrlf=false','-c','core.longpaths=true','checkout-index','--all','--prefix='+output.replace(/\\/g,'/')+'/');
 for(const e of entries)assert.equal(blobId(readFileSync(join(output,e.path))),e.blob,'Published byte mismatch: '+e.path);
 writeFileSync(preview?join(temp,'proof.json'):'/tmp/infistar-stream-recovery-proof.json',JSON.stringify({...result,entries},null,2));
 if(!working)assert.equal(git('status','--porcelain','--untracked-files=all'),'');
}
console.log(JSON.stringify(result,null,2));
