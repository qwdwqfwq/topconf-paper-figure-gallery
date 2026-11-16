// Owner authorization 2026-11-16: initial Step 3 client import and private client only.
// Historical freeze baselines and acceptance programs remain unchanged.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
export const baseCommit='874360027896ad0d0d99a9b0ced5a11653b17ae4';
const baseRun=43864466485;
const baseTree='2b232908e0a516a05f2f76ddb606e9555528dc5b';
const baseProofSha256='d6ee53bf5a7625233b5bdf3cfc815f12b4ad9d82d8d9b03ae3ac54cffbfd6e5e';
export const payload=['forge/index.html','forge/step3-initial-image-job.mjs'];
export const allowed=[...payload,'.github/workflows/deploy.yml','forge/test-step3-initial-image-job.mjs','scripts/check-step3-initial-read-release.mjs','scripts/test-step3-initial-read-release.mjs'].sort();
const reviewed={
  "forge/index.html": "96a043fde484935c66bd8bf127f20f4be77367efeedeccca318887b1f6239ffc",
  "forge/step3-initial-image-job.mjs": "ff2e179bfef01a6317512e252c31b1d6c4b8a5fe0447626d2a5f7792f811918b",
  ".github/workflows/deploy.yml": "379202eee3939a9f33452d78fbfde5997cce970e83a9cd47841e35df6221ad22",
  "forge/test-step3-initial-image-job.mjs": "7746c55714b62892404aef39713d5b1da087c06dc611b2e88bab2ee44a0a316c",
  "scripts/test-step3-initial-read-release.mjs": "f536c421ffa928367ed5ee24d85e48983612bde9c107bdac8d4896b46199430f"
};
const gitBytes=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:40*1024*1024});
const git=(...args)=>gitBytes(...args).toString().trim();
const blobId=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const normalized=bytes=>bytes.toString().replace(/\r\n/g,'\n');
export function assertScope(paths){assert.deepEqual([...paths].sort(),allowed,'Only the authorized preflight, tests and independent publisher may change');}
export function assertArtifact(paths){assert.deepEqual([...paths].sort(),payload,'Every other published file must remain byte-identical');}
export function assertEntry(actual,before){
 let expected=normalized(before);
 const from="import {usesInfistarImageJob,requestInfistarImageJob,acknowledgeInfistarImageJob,showInfistarJobProgress} from './step3-infistar-job.mjs?v=20261114-durable-jobs';"; const to="import {usesInfistarImageJob,acknowledgeInfistarImageJob,showInfistarJobProgress} from './step3-infistar-job.mjs?v=20261114-durable-jobs';\nimport {requestInfistarImageJob} from './step3-initial-image-job.mjs?v=20261116-initial-read-recovery';";
 assert.equal(expected.split(from).length,2);expected=expected.replace(from,to);
 assert.equal(normalized(actual),expected,'Entrypoint changed outside the exact initial-image client import split');
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
  const original=p==='forge/index.html'?gitBytes('show',baseCommit+':'+p):null;if(original)assert.equal(previous.entries.find(e=>e.path===p)?.blob,blobId(original),'Source must equal published bytes: '+p);else assert.equal(previous.entries.some(e=>e.path===p),false,'Private initial client must be new');
  const bytes=working?Buffer.from(normalized(readFileSync(join(root,p)))):gitBytes('show','HEAD:'+p);
  if(p==='forge/index.html')assertEntry(bytes,original);
  else execFileSync(process.execPath,['--check','--input-type=module'],{input:bytes,cwd:root});
  candidates.set(p,bytes);
 }
 const temp=mkdtempSync(join(tmpdir(),'step3-initial-read-'));let priorAdded=false;
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
  for(const [p,bytes] of candidates){const blob=execFileSync('git',['hash-object','-w','--stdin'],{cwd:root,input:bytes}).toString().trim();assert.equal(blob,blobId(bytes));indexGit('update-index','--add','--cacheinfo','100644',blob,p);}
  const artifactTree=indexGit('write-tree');assertArtifact(git('diff','--name-only','--no-renames',baseTree,artifactTree).split('\n'));
  const entries=previous.entries.map(e=>candidates.has(e.path)?{...e,blob:blobId(candidates.get(e.path))}:e);for(const [p,bytes] of candidates)if(!entries.some(e=>e.path===p))entries.push({mode:'100644',blob:blobId(bytes),path:p});entries.sort((a,b)=>a.path.localeCompare(b.path));
  const result={baseRun,baseCommit,baseTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,allOtherPublishedBytesIdentical:true,entryLimitedToInitialClientImportSplit:true,historicalAcceptanceAndTestsUnchanged:true,step4Unchanged:true,originalFrozenCheck:'Unchanged; existing failures remain failures',entries};
  if(process.argv.includes('--prepare-pages')){
   const output='/tmp/step3-initial-read-pages';assert.equal(existsSync(output),false,'Refuse overwrite');mkdirSync(output);
   indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
   for(const e of entries)assert.equal(blobId(readFileSync(join(output,e.path))),e.blob,'Export mismatch: '+e.path);
   writeFileSync('/tmp/step3-initial-read-proof.json',JSON.stringify(result,null,2));assert.equal(git('status','--porcelain','--untracked-files=all'),'');
  }
  console.log(JSON.stringify({...result,entries:undefined},null,2));
 }finally{
  if(priorAdded)git('worktree','remove','--force',join(temp,'historical'));
  assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep));rmSync(temp,{recursive:true,force:true});
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
