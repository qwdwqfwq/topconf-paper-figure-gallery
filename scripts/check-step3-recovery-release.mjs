// Owner authorization 2026-11-17: isolated Step 3 durable recovery and local revision transport only.
// Historical freeze baselines and acceptance programs remain unchanged.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
export const baseCommit='1aa0f3940cc1cf81747d6e2b9559dabe5da1d688';
const baseRun=43907732087;
const baseTree='f41d8c12e03d428525afd738bbcec304e8479238';
const baseProofSha256="84f951c1433bfb2a271812ac692aeec28141fc13d88ea5686f2faf150f2745c8";
export const payload=['forge/revision-gallery.mjs'];
export const allowed=[".github/workflows/deploy.yml","forge/revision-gallery.mjs","forge/test-revision-job-recovery.mjs","infistar-image-relay/README.md","infistar-image-relay/browser-image-fetch.mjs","infistar-image-relay/image-result.mjs","infistar-image-relay/job-diagnostics.mjs","infistar-image-relay/job-payloads.mjs","infistar-image-relay/sqlite-image-payloads.mjs","infistar-image-relay/streamed-image-result.mjs","infistar-image-relay/test-worker.mjs","infistar-image-relay/worker.mjs","infistar-image-relay/wrangler.jsonc","scripts/check-step3-recovery-release.mjs","scripts/test-step3-recovery-release.mjs"].sort();
const reviewed={
  ".github/workflows/deploy.yml": "1d6f025cf73b16a6bb642b76bbd0afe21e89555dcc027bfe8d1309b0d264fb07",
  "forge/revision-gallery.mjs": "931eae1657b0232cdaf1ef821f0d676538848b00bf71db64ca893d802658c767",
  "forge/test-revision-job-recovery.mjs": "ec6b8b3d3290921323cf79bfc771f87a9dd4b7322a9da933cc9df701fa780ce4",
  "infistar-image-relay/README.md": "111f093bc0ff1d248d4698c088ad2cc16b27d793af648f12ca8001704a228ac4",
  "infistar-image-relay/browser-image-fetch.mjs": "6c96001380dda2d2941b5aa71dd319bb2ed632a79697b0338fc38c71ba5ab73f",
  "infistar-image-relay/image-result.mjs": "2b3eb57e8809609bf4e67c63a789ceb2cdfb1a7c2f6124b9fd52f483da03ad27",
  "infistar-image-relay/job-diagnostics.mjs": "6df41b48e50148436c9c6c00493574fd3826e6126fd9e76e00d0ad6ca25ad4e2",
  "infistar-image-relay/job-payloads.mjs": "fce14141063aa1c1ca2dadad334d6a6a50c52fef5e0a377e78c9f9a9c2f77272",
  "infistar-image-relay/sqlite-image-payloads.mjs": "872ca5857f6a633743b9405dae1b8ac8f53f7a0e6f7d66f98063ddcd76869a19",
  "infistar-image-relay/streamed-image-result.mjs": "7bb12c43c21d5a5a84654ab576ef828046d9b3106a94e29e6c0f2add88a95119",
  "infistar-image-relay/test-worker.mjs": "98052a3f1b5a6ef6ce15429e6bf27c2e30ed4e483f73cc7a403e02722d73db80",
  "infistar-image-relay/worker.mjs": "7995ffe1f041915407daee66cebd5f3008ef8bd44c8f81e2771cadd70c24d492",
  "infistar-image-relay/wrangler.jsonc": "2342bc6cc88323aefbcafbeb7e0e1eb0603628a4e0a97dc689af918e91f9deee",
  "scripts/test-step3-recovery-release.mjs": "452f92a86bae042142f0b5ba5adc425cabe14a76e4a1721cc8ae06d8ee810abc"
};
const gitBytes=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:40*1024*1024});
const git=(...args)=>gitBytes(...args).toString().trim();
const blobId=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const normalized=bytes=>bytes.toString().replace(/\r\n/g,'\n');
export function assertScope(paths){assert.deepEqual([...paths].sort(),allowed,'Only authorized Step 3 backend recovery, revision transport, tests and independent publisher may change');}
export function assertArtifact(paths){assert.deepEqual([...paths].sort(),payload,'Every other published file must remain byte-identical');}
const entryEdits=[
  [
    "import {usesInfistarImageJob,requestInfistarImageJob,acknowledgeInfistarImageJob} from './step3-infistar-job.mjs?v=20261114-durable-jobs';",
    "import {usesInfistarImageJob,acknowledgeInfistarImageJob} from './step3-infistar-job.mjs?v=20261114-durable-jobs';\nimport {createInitialImageJobClient} from './step3-initial-image-job.mjs?v=20261117-revision-recovery';\nconst revisionJobClient=createInitialImageJobClient();\nconst requestInfistarImageJob=input=>revisionJobClient.request(input);"
  ],
  [
    "  const dimensions=native?{field:'gemini',aspectRatio:ratio,imageSize:resolution}:imageRequestDimensions(p,model,ratio,resolution,false);",
    "  // Revision-only alias support: keep the provider model ID and shared Step 4 adapter unchanged.\n  const dimensions=native?{field:'gemini',aspectRatio:ratio,imageSize:resolution}:\n    p==='nonelinear'&&model==='gemini-nano-banana-2.1'&&['1K','2K','4K'].includes(resolution)\n      ?{field:'size',value:resolution,aspectRatio:ratio}:imageRequestDimensions(p,model,ratio,resolution,false);"
  ],
  [
    "    const revisionBase=p==='nonelinear'&&base==='https://gallery-nonelinear-relay.lixiao-gallery.workers.dev/v1'?'https://gallery-revision-images.lixiao-gallery.workers.dev/v1':(request.base||base);",
    "    const revisionBase=request.base||base;"
  ]
];
export function assertEntry(actual,before){
 let expected=normalized(before);
 assert.equal(createHash('sha256').update(expected).digest('hex'),"a1c5d5e6c46e41c446ab9f2d3601924cb002c5050a4eca1aa73073d8e3672c66",'Unexpected entry baseline');
 for(const [from,to] of entryEdits){assert.equal(expected.split(from).length,2,"Authorized entry anchor must occur once");expected=expected.replace(from,to);}
 assert.equal(normalized(actual),expected,"Revision changed outside authorized private request transport and parameters");
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
  const original=p==='forge/revision-gallery.mjs'?gitBytes('show',baseCommit+':'+p):null;if(original)assert.equal(previous.entries.find(e=>e.path===p)?.blob,blobId(original),'Source must equal published bytes: '+p);else assert.equal(previous.entries.some(e=>e.path===p),false,'New module must be new');
  const bytes=working?Buffer.from(normalized(readFileSync(join(root,p)))):gitBytes('show','HEAD:'+p);
  if(p==='forge/revision-gallery.mjs')assertEntry(bytes,original);
  else execFileSync(process.execPath,['--check','--input-type=module'],{input:bytes,cwd:root});
  candidates.set(p,bytes);
 }
 const temp=mkdtempSync(join(tmpdir(),'step3-recovery-'));let priorAdded=false;
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
  const result={baseRun,baseCommit,baseTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,allOtherPublishedBytesIdentical:true,revisionLimitedToRecoverableJobTransport:true,historicalAcceptanceAndTestsUnchanged:true,step4Unchanged:true,originalFrozenCheck:'Unchanged; existing failures remain failures',entries};
  if(process.argv.includes('--prepare-pages')){
   const output='/tmp/step3-recovery-pages';assert.equal(existsSync(output),false,'Refuse overwrite');mkdirSync(output);
   indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
   for(const e of entries)assert.equal(blobId(readFileSync(join(output,e.path))),e.blob,'Export mismatch: '+e.path);
   writeFileSync('/tmp/step3-recovery-proof.json',JSON.stringify(result,null,2));assert.equal(git('status','--porcelain','--untracked-files=all'),'');
  }
  console.log(JSON.stringify({...result,entries:undefined},null,2));
 }finally{
  if(priorAdded)git('worktree','remove','--force',join(temp,'historical'));
  assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep));rmSync(temp,{recursive:true,force:true});
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
