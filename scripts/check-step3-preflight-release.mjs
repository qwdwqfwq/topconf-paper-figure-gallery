// Owner authorization 2026-11-16: only two Step 3 preflight runtime files.
// Historical freeze baselines and acceptance programs remain unchanged.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
export const baseCommit='bd8d03b9fb7702d6707e5f4701c887553807eacf';
const baseRun=43723203769;
const baseTree='d23603856cf20b21f3b8bcb6d84bf961fd102046';
const baseProofSha256='ae33239a50804d6bd20ffe546725828fc6716cba03390f62e6c627f9bf5c6166';
export const payload=['forge/index.html','forge/step3-image-capabilities.mjs'];
export const allowed=[...payload,'.github/workflows/deploy.yml','forge/test-step3-nonelinear-dimensions.mjs','forge/test-step3-preflight-jobs-browser.cjs','scripts/check-step3-preflight-release.mjs','scripts/test-step3-preflight-release.mjs'].sort();
const reviewed={
  "forge/test-step3-preflight-jobs-browser.cjs": "6ba89a892e8db9559e99e5977144559d6cc7a3a6001b29818d946c56f8271325",
  "forge/index.html": "07693349622c533b01fa13882347daf8dc2618708f3f9365b4cb7a9f05893c8e",
  "forge/step3-image-capabilities.mjs": "dd7234ceda28041d497cd9604beb4517b9581570dffeffae702eed8842079c37",
  ".github/workflows/deploy.yml": "559c5d280251869a03b221b92296d9663441af99315ee10c7f8e40b4930d07f5",
  "forge/test-step3-nonelinear-dimensions.mjs": "8d5c7f3610d6340bcfb50f79daa86f690394412578fe30d3d2a29955547b68e1",
  "scripts/test-step3-preflight-release.mjs": "6f2b8986c32e5c79c72031e38b8c4e24dfe008d497d6ac6718d4884e4f3c60b9"
};
const gitBytes=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:40*1024*1024});
const git=(...args)=>gitBytes(...args).toString().trim();
const blobId=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const normalized=bytes=>bytes.toString().replace(/\r\n/g,'\n');
export function assertScope(paths){assert.deepEqual([...paths].sort(),allowed,'Only the authorized preflight, tests and independent publisher may change');}
export function assertArtifact(paths){assert.deepEqual([...paths].sort(),payload,'Every other published file must remain byte-identical');}
export function assertEntry(actual,before){
 let expected=normalized(before);
 for(const [from,to] of [
  ['./step3-image-capabilities.mjs?v=20261114-model-resolution','./step3-image-capabilities.mjs?v=20261116-nonelinear-preflight'],
  ["imageRequestDimensions(p,model,$('#figureRatio').value,$('#imageResolution').value,usesInfistarGemini(base,model));","step3ImageDimensions(p,model,$('#figureRatio').value,$('#imageResolution').value,usesInfistarGemini(base,model));"]
 ]){assert.equal(expected.split(from).length,2,'Replacement must match exactly once');expected=expected.replace(from,to);}
 assert.equal(normalized(actual),expected,'Entrypoint changed outside the exact two Step 3 preflight replacements');
}
export function verifyReviewed(path,bytes){assert.ok(reviewed[path],'Unreviewed path');assert.equal(createHash('sha256').update(normalized(bytes)).digest('hex'),reviewed[path],'Unreviewed content: '+path);}
export function verifyPrevious(bytes){assert.equal(createHash('sha256').update(bytes).digest('hex'),baseProofSha256,'Previous publication proof changed');const p=JSON.parse(bytes);assert.equal(p.artifactTree,baseTree);assert.equal(p.allOtherPublishedBytesIdentical,true);return p;}
async function api(suffix){
 assert.ok(process.env.GH_TOKEN,'GitHub read token required');
 const r=await fetch('https://api.github.com/repos/qwdwqfwq/topconf-paper-figure-gallery'+suffix,{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000)});
 assert.ok(r.ok,'GitHub HTTP '+r.status);return r.json();
}
async function main(){
 const working=process.argv.includes('--working');
 git('merge-base','--is-ancestor',baseCommit,'HEAD');
 if(!working)assert.equal(git('status','--porcelain','--untracked-files=all'),'','Dirty checkout');
 const paths=working?[...new Set([...git('diff','--name-only','--no-renames',baseCommit,'--').split('\n').filter(Boolean),...git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean)])]:git('diff','--name-only','--no-renames',baseCommit,'HEAD').split('\n').filter(Boolean);
 assertScope(paths);
 for(const p of Object.keys(reviewed))verifyReviewed(p,readFileSync(join(root,p)));
 const previous=verifyPrevious(readFileSync(process.argv[2]));
 if(process.argv.includes('--prepare-pages')){
  assert.equal(working,false);assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
  const run=await api('/actions/runs/'+baseRun);assert.equal(run.conclusion,'success');assert.equal(run.head_sha,baseCommit);
  const deployments=await api('/deployments?environment=github-pages&per_page=20');
  const statuses=await Promise.all(deployments.map(async d=>({deployment:d,status:(await api('/deployments/'+d.id+'/statuses'))[0]})));
  const current=statuses.find(s=>s.status?.state==='success');assert.ok(current);assert.equal(current.deployment.sha,baseCommit,'Another release has been published');assert.ok(current.status.log_url.includes('/runs/'+baseRun+'/'));
 }
 const candidates=new Map();
 for(const p of payload){
  const original=gitBytes('show',baseCommit+':'+p);assert.equal(previous.entries.find(e=>e.path===p)?.blob,blobId(original),'Source must equal published bytes: '+p);
  const bytes=working?Buffer.from(normalized(readFileSync(join(root,p)))):gitBytes('show','HEAD:'+p);
  if(p==='forge/index.html')assertEntry(bytes,original);
  else execFileSync(process.execPath,['--check','--input-type=module'],{input:bytes,cwd:root});
  candidates.set(p,bytes);
 }
 const temp=mkdtempSync(join(tmpdir(),'step3-preflight-'));let priorAdded=false;
 try{
  // Preserve and execute the historical acceptance and tests in their own exact release.
  const prior=join(temp,'historical');git('worktree','add','--detach',prior,'f9bfba3d6c318ec79593a7e3240ad72adbf6f1ee');priorAdded=true;
  execFileSync(process.execPath,['scripts/check-nonelinear-source-release.mjs'],{cwd:prior,maxBuffer:8*1024*1024});
  execFileSync(process.execPath,['--test','scripts/test-nonelinear-source-release.mjs'],{cwd:prior,maxBuffer:8*1024*1024});
  const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
  const indexGit=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
  const seen=new Set();
  for(const e of previous.entries){assert.ok(['100644','100755'].includes(e.mode));assert.match(e.blob,/^[0-9a-f]{40}$/);assert.ok(!/[\t\r\n\\]/.test(e.path)&&!e.path.startsWith('/')&&!e.path.split('/').some(p=>p==='..'||p==='.git'));assert.ok(!seen.has(e.path));seen.add(e.path);}
  indexGit('read-tree','--empty');
  execFileSync('git',['update-index','--index-info'],{cwd:root,env,input:previous.entries.map(e=>e.mode+' '+e.blob+'\t'+e.path+'\n').join(''),maxBuffer:40*1024*1024});
  assert.equal(indexGit('write-tree'),baseTree,'Previous artifact entries changed');
  for(const [p,bytes] of candidates){const blob=execFileSync('git',['hash-object','-w','--stdin'],{cwd:root,input:bytes}).toString().trim();assert.equal(blob,blobId(bytes));indexGit('update-index','--cacheinfo','100644',blob,p);}
  const artifactTree=indexGit('write-tree');assertArtifact(git('diff','--name-only','--no-renames',baseTree,artifactTree).split('\n'));
  const entries=previous.entries.map(e=>candidates.has(e.path)?{...e,blob:blobId(candidates.get(e.path))}:e);
  const result={baseRun,baseCommit,baseTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,allOtherPublishedBytesIdentical:true,entryLimitedToTwoPreflightReplacements:true,historicalAcceptanceAndTestsUnchanged:true,step4Unchanged:true,originalFrozenCheck:'Unchanged; existing failures remain failures',entries};
  if(process.argv.includes('--prepare-pages')){
   const output='/tmp/step3-preflight-pages';assert.equal(existsSync(output),false,'Refuse overwrite');mkdirSync(output);
   indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
   for(const e of entries)assert.equal(blobId(readFileSync(join(output,e.path))),e.blob,'Export mismatch: '+e.path);
   writeFileSync('/tmp/step3-preflight-proof.json',JSON.stringify(result,null,2));assert.equal(git('status','--porcelain','--untracked-files=all'),'');
  }
  console.log(JSON.stringify({...result,entries:undefined},null,2));
 }finally{
  if(priorAdded)git('worktree','remove','--force',join(temp,'historical'));
  assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep));rmSync(temp,{recursive:true,force:true});
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
