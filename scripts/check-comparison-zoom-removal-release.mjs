// Only remove the two requested Step 3 zoom buttons from the published artifact.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const baseCommit='9fe328029db6cb7fd37f9162f423cf05f5f19b4b';
const baseRun=43720828639;
const baseTree='53fe088d66861bef4bec07dcab9983f128124203';
const baseProofSha256='d2983840f1bfac11d2f0df0fb4b1051a60de7236e3b875a73f2929f150c22d08';
const payload=['forge/revision-local.mjs'];
const allowed=[...payload,'scripts/check-comparison-zoom-removal-release.mjs','.github/workflows/comparison-zoom-removal-release.yml'].sort();
const gitBytes=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:40*1024*1024});
const git=(...args)=>gitBytes(...args).toString().trim();
const blobId=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
assert.equal(git('show','-s','--format=%P','HEAD'),baseCommit);
assert.equal(git('status','--porcelain','--untracked-files=all'),'');
assert.deepEqual(git('diff','--name-only','--no-renames',baseCommit,'HEAD').split('\n').sort(),allowed,'Only the authorized display change and its isolated publisher may change');
const proofBytes=readFileSync(process.argv[2]);
assert.equal(createHash('sha256').update(proofBytes).digest('hex'),baseProofSha256);
const previous=JSON.parse(proofBytes);
assert.equal(previous.artifactTree,baseTree);
assert.equal(previous.allOtherPublishedBytesIdentical,true);
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
const replacements={
  "forge/revision-local.mjs": [
    [
      "  const links=document.createElement('div');links.style.cssText='display:flex;gap:12px;flex-wrap:wrap';\n  for(const [label,src] of [['放大修改前',before],['放大修改后',after]]){\n    const button=document.createElement('button');button.type='button';button.textContent=label;\n    button.onclick=()=>{const dialog=document.createElement('dialog');dialog.style.cssText='width:94vw;max-width:1600px;max-height:94vh;overflow:auto;border:1px solid #dedbf5;border-radius:12px';const close=document.createElement('button');close.textContent='关闭';close.type='button';close.onclick=()=>dialog.close();const img=document.createElement('img');img.src=src;img.alt=label;img.style.cssText='display:block;max-width:none';dialog.append(close,img);dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();};\n    links.append(button);\n  }\n",
      ""
    ],
    [
      "view.append(help,stage,slider,links)",
      "view.append(help,stage,slider)"
    ]
  ]
};
const candidates=new Map();
for(const path of payload){
 const original=gitBytes('show',baseCommit+':'+path);let expected=original.toString();
 assert.equal(previous.entries.find(e=>e.path===path)?.blob,blobId(original),'The source must equal the exact published module');
 for(const [before,after] of replacements[path]){assert.equal(expected.split(before).length,2);expected=expected.replace(before,after);}
 const candidate=gitBytes('show','HEAD:'+path);
 assert.equal(candidate.toString(),expected,'No code except the exact requested display replacement may change');
 execFileSync(process.execPath,['--check','--input-type=module'],{input:candidate,cwd:root});candidates.set(path,candidate);
}
const temp=mkdtempSync(join(tmpdir(),'comparison-zoom-removal-'));
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
for(const [path,bytes] of candidates)indexGit('update-index','--cacheinfo','100644',blobId(bytes),path);
const artifactTree=indexGit('write-tree');
assert.deepEqual(git('diff','--name-only','--no-renames',baseTree,artifactTree).split('\n'),payload,'Every other published file must remain byte-identical');
const entries=previous.entries.map(e=>candidates.has(e.path)?{...e,blob:blobId(candidates.get(e.path))}:e);
const result={baseRun,baseCommit,baseTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,allOtherPublishedBytesIdentical:true,comparisonZoomButtonsOnly:true,promptsAndOutsideProtectionUnchanged:true,exportAndEntrypointUnchanged:true,nanoBananaOrdinaryPolicyUnchanged:true,originalFrozenCheck:'Unchanged; preexisting failures remain failures'};
if(process.argv.includes('--prepare-pages')){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
 const output='/tmp/comparison-zoom-removal-pages';assert.equal(existsSync(output),false);mkdirSync(output);
 indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
 for(const e of entries)assert.equal(blobId(readFileSync(join(output,e.path))),e.blob,'Published byte mismatch: '+e.path);
 writeFileSync('/tmp/comparison-zoom-removal-proof.json',JSON.stringify({...result,entries},null,2));
 assert.equal(git('status','--porcelain','--untracked-files=all'),'');
}
console.log(JSON.stringify(result,null,2));
