// Owner limited unlock 2026-11-17: request transport, diagnostics, tests and minimal publication only.
// Historical freeze baselines and acceptance programs remain unchanged.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
export const baseCommit='9ee1132307876b2db085e011c69c18d9c426fbc2';
const baseRun=44023069511;
const baseTree='fa86c3f8ac7820c112ba7abfc627a05d8c67aecc';
const baseProofSha256='c258c3ac3f251f359175febe5528e83839254e03c2a75aba6795d822e90f0bf7';
export const payload=["forge/index.html","forge/step3-analysis-job.mjs"];
export const allowed=[".github/workflows/deploy-reference-analysis.yml","forge/index.html","forge/step3-analysis-job.mjs","forge/test-reference-analysis-job-browser.cjs","forge/test-reference-analysis-route-browser.cjs","forge/test-step3-analysis-job.mjs","reference-analysis-backend/pages/_worker.js","reference-analysis-backend/pages/wrangler.jsonc","reference-analysis-backend/test-worker.mjs","reference-analysis-backend/worker.mjs","reference-analysis-backend/wrangler.jsonc","scripts/check-reference-analysis-release.mjs","scripts/test-reference-analysis-release.mjs"];
const reviewed={
  ".github/workflows/deploy-reference-analysis.yml": "b444fc8ee7efd0faeb4defeaaa9e99f972e0274d199eef825059d9c468687485",
  "forge/index.html": "38d9b1746608ddd3b7347ca3eb3575adca1f0c95a385fd4ffd56100c36974788",
  "forge/step3-analysis-job.mjs": "3558fe4dcd89023520f266542dc96e8762d9fa052037d3ebd98fccda3fa48386",
  "forge/test-reference-analysis-job-browser.cjs": "b7651e05884531892d1daae9cb1332e8ef1fa34475db0731ce3d8a57e4643442",
  "forge/test-reference-analysis-route-browser.cjs": "bd9103ea6718cc7d6ab7108cac0c92f27dfdd69c97978e7d164f2e4c42efb944",
  "forge/test-step3-analysis-job.mjs": "da58e6f369f8426dd04d2b8d9f76f6877f344f6a9f2100a52f966ce55591b627",
  "reference-analysis-backend/pages/_worker.js": "328b930a270e3be34d665c2ea2aff916eb503c0d74e0c81dfdd3d271d31d5be5",
  "reference-analysis-backend/pages/wrangler.jsonc": "8ae7a13f3ced3e3c56ce2196d269dd6efd27778274aa40cb0a06de6b4c70e798",
  "reference-analysis-backend/test-worker.mjs": "bea6121f0a35c1a443e8a5e3e50c72e7c074dd12c008267af32b3d7f082fa122",
  "reference-analysis-backend/worker.mjs": "424433909386908f7d10ee8cbc04d28c344371b0380b84c99cfcd2f9338d9ff1",
  "reference-analysis-backend/wrangler.jsonc": "49b36f337915a2caf3a122871d068bab53532e8a813a33d09d4da5b5b26a06c9",
  "scripts/test-reference-analysis-release.mjs": "b2800432d533d1576c2d20c87fd11695dac346d0cc87310b1e0a668b96426dd6"
};
const gitBytes=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:40*1024*1024});
const git=(...args)=>gitBytes(...args).toString().trim();
const blobId=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const normalized=bytes=>bytes.toString().replace(/\r\n/g,'\n');
export function assertScope(paths){assert.deepEqual([...paths].sort(),allowed,'Only authorized transport repair, tests and independent publisher may change');}
export function assertArtifact(paths){assert.deepEqual([...paths].sort(),payload,'Every other published file must remain byte-identical');}
export function verifyReviewed(path,bytes){assert.ok(reviewed[path],'Unreviewed path');assert.equal(createHash('sha256').update(normalized(bytes)).digest('hex'),reviewed[path],'Unreviewed content: '+path);}
export function verifyPrevious(bytes){assert.equal(createHash('sha256').update(bytes).digest('hex'),baseProofSha256,'Previous publication proof changed');const p=JSON.parse(bytes);assert.equal(p.artifactTree,baseTree);assert.equal(p.allOtherPublishedBytesIdentical,true);return p;}
export function verifyPatch(path,original,candidate){
 verifyReviewed(path,candidate);
 if(path!=='forge/index.html')return;
 let expected=normalized(original);
 for(const [from,to] of [["const internationalBase=model=>internationalGalleryBase(baseURL(),{provider:$('#provider').value,model,stage:'visual'});","const analysisBase=()=>baseURL();"],["const url=internationalBase(body.model)+'/v1/messages',key=cleanKey($('#key').value);","const url=analysisBase()+'/v1/messages',key=cleanKey($('#key').value);"],["const base=internationalBase(am),key=cleanKey($('#key').value);","const base=analysisBase(),key=cleanKey($('#key').value);"],["import {requestStep3Analysis} from './step3-analysis-request.mjs?v=20261117-read-phase';","import {requestStep3Analysis} from './step3-analysis-request.mjs?v=20261117-read-phase';\nimport {requestReferenceAnalysis} from './step3-analysis-job.mjs?v=20261117-durable-v1';"],["request:()=>fetch(base+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify(normalizeChatTokenLimit(withReasoning(body,'visual')))})","request:()=>requestReferenceAnalysis({provider:$('#provider').value,url:base+'/chat/completions',init:{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify(normalizeChatTokenLimit(withReasoning(body,'visual')))}})"]]){assert.equal(expected.split(from).length,2,'Unique original patch');expected=expected.replace(from,to);}
 assert.equal(normalized(candidate),expected,'Only five reviewed reference-analysis replacements may change');
}

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
  const isNew=p==='forge/step3-analysis-job.mjs';if(isNew)assert.equal(git('ls-tree','--name-only',baseCommit,'--',p),'','Analysis module must be new');const original=isNew?Buffer.alloc(0):gitBytes('show',baseCommit+':'+p);if(original.length)assert.equal(previous.entries.find(e=>e.path===p)?.blob,blobId(original),'Source must equal published bytes: '+p);else assert.equal(previous.entries.some(e=>e.path===p),false,'New module must be new');
  const bytes=working?Buffer.from(normalized(readFileSync(join(root,p)))):gitBytes('show','HEAD:'+p);
  verifyPatch(p,original,bytes);
  const script=p.endsWith('.html')?Buffer.from(bytes.toString().match(/<script type="module">([\s\S]*?)<\/script>/)[1]):bytes;
  execFileSync(process.execPath,['--check','--input-type=module'],{input:script,cwd:root});
  candidates.set(p,bytes);
 }
 const temp=mkdtempSync(join(tmpdir(),'reference-analysis-'));let priorAdded=false;
 try{
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
  const result={baseRun,baseCommit,baseTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,allOtherPublishedBytesIdentical:true,onlyAuthorizedTransportChanges:true,step4PromptsSizesParametersAndExportsUnchanged:true,localHistoryBytesUnchanged:true,historicalAcceptanceAndTestsUnchanged:true,originalFrozenCheck:'Unchanged; existing failures remain failures',entries};
  if(process.argv.includes('--prepare-pages')){
   const output='/tmp/reference-analysis-pages';assert.equal(existsSync(output),false,'Refuse overwrite');mkdirSync(output);
   indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
   for(const e of entries)assert.equal(blobId(readFileSync(join(output,e.path))),e.blob,'Export mismatch: '+e.path);
   writeFileSync('/tmp/reference-analysis-proof.json',JSON.stringify(result,null,2));assert.equal(git('status','--porcelain','--untracked-files=all'),'');
  }
  console.log(JSON.stringify({...result,entries:undefined},null,2));
 }finally{
  if(priorAdded)git('worktree','remove','--force',join(temp,'historical'));
  assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep));rmSync(temp,{recursive:true,force:true});
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
