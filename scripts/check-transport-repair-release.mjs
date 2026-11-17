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
export const baseCommit='18f59f3ada897d437b4617978f6d40ac497bd972';
const baseRun=43959420530;
const baseTree='cec03102685ac16d7790e91dbb0605b524babc74';
const baseProofSha256='ea8f99fd36b1f1c369604b60fe8ae52c4a702fd37420f8c142290c5c2c17073e';
export const payload=["forge/index.html","forge/infistar-reconstruction-responses.mjs","forge/step3-analysis-request.mjs"];
export const allowed=[".github/workflows/deploy-transport-repair.yml","forge/index.html","forge/infistar-reconstruction-responses.mjs","forge/step3-analysis-request.mjs","forge/test-infistar-reconstruction-responses.mjs","forge/test-step3-analysis-request.mjs","nonelinear-relay/chat-stream.mjs","nonelinear-relay/test-chat-stream.mjs","scripts/check-transport-repair-release.mjs","scripts/test-transport-repair-release.mjs"];
const reviewed={
  ".github/workflows/deploy-transport-repair.yml": "43feb3bbdac8ba97ed5e3ec7788df11146acc4bec592e1240f03046de9f52590",
  "forge/index.html": "902ebcb31f37c80ff9087e8b0be22084b25e70e8f01afb2a914fc24b6e0e3c60",
  "forge/infistar-reconstruction-responses.mjs": "5e030a47178a3cc02d3be710a652ad8e947cb111ed7977ee3df88fb7be84f204",
  "forge/step3-analysis-request.mjs": "4e848a1570c8794d1aa7777a12dfe9ba6b0ce2d66fc950b2031495843496043f",
  "forge/test-infistar-reconstruction-responses.mjs": "27d76e56f464f9561980a7c9a3c92283529b14b150a85b02a0512caaf3ef5120",
  "forge/test-step3-analysis-request.mjs": "1573a491e8928b7fe702ac5a78d5ed7bf7243620247c30142041ab38e191fc7c",
  "nonelinear-relay/chat-stream.mjs": "7d9413251f8034ed83b3452c3d2b68c92431046875f391379cb68d7b8985ab25",
  "nonelinear-relay/test-chat-stream.mjs": "d430af08d47d08a72675d3bcef86d57dcb9a0df4a14003df96fc8df4c83d1f48",
  "scripts/test-transport-repair-release.mjs": "0ea75f7ae7492be6051cb10a63889406b32739e241dc7d8f48a83345d9e0d433"
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
 for(const [from,to] of [["infistar-reconstruction-responses.mjs?v=20261114-errors","infistar-reconstruction-responses.mjs?v=20261117-sol-chat"],["step3-analysis-request.mjs?v=20261117-diagnostics1","step3-analysis-request.mjs?v=20261117-read-phase"],["request:()=>fetchWithTimeout(url,{method:'POST',headers:anthropicHeaders(key),body:JSON.stringify(withReasoning(body,'visual'))})","request:()=>fetch(url,{method:'POST',headers:anthropicHeaders(key),body:JSON.stringify(withReasoning(body,'visual'))})"],["request:()=>postJSON(base,'/chat/completions',withReasoning(body,'visual'),key)","request:()=>fetch(base+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify(normalizeChatTokenLimit(withReasoning(body,'visual')))})"]]){assert.equal(expected.split(from).length,2,'Unique original patch');expected=expected.replace(from,to);}
 assert.equal(normalized(candidate),expected,'Only four reviewed HTML transport/cache replacements may change');
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
  const original=gitBytes('show',baseCommit+':'+p);if(original)assert.equal(previous.entries.find(e=>e.path===p)?.blob,blobId(original),'Source must equal published bytes: '+p);else assert.equal(previous.entries.some(e=>e.path===p),false,'New module must be new');
  const bytes=working?Buffer.from(normalized(readFileSync(join(root,p)))):gitBytes('show','HEAD:'+p);
  verifyPatch(p,original,bytes);
  const script=p.endsWith('.html')?Buffer.from(bytes.toString().match(/<script type="module">([\s\S]*?)<\/script>/)[1]):bytes;
  execFileSync(process.execPath,['--check','--input-type=module'],{input:script,cwd:root});
  candidates.set(p,bytes);
 }
 const temp=mkdtempSync(join(tmpdir(),'transport-repair-'));let priorAdded=false;
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
   const output='/tmp/transport-repair-pages';assert.equal(existsSync(output),false,'Refuse overwrite');mkdirSync(output);
   indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
   for(const e of entries)assert.equal(blobId(readFileSync(join(output,e.path))),e.blob,'Export mismatch: '+e.path);
   writeFileSync('/tmp/transport-repair-proof.json',JSON.stringify(result,null,2));assert.equal(git('status','--porcelain','--untracked-files=all'),'');
  }
  console.log(JSON.stringify({...result,entries:undefined},null,2));
 }finally{
  if(priorAdded)git('worktree','remove','--force',join(temp,'historical'));
  assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep));rmSync(temp,{recursive:true,force:true});
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
