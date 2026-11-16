// Owner authorization 2026-11-17: isolated Step 3 reference-analysis diagnostics only.
// Historical freeze baselines and acceptance programs remain unchanged.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
export const baseCommit='5f1ea4acd3e417a1545b06af9f6e9ad90a11f1b2';
const baseRun=43869741849;
const baseTree='6af760638f0e44686c067fa32497f9559d683096';
const baseProofSha256='8b314cc12ccfb959aa0d4640511b69abaaff44c1fcadbe97577d4edf0ef9a68c';
export const payload=['forge/index.html','forge/step3-analysis-request.mjs'];
export const allowed=[...payload,'.github/workflows/deploy.yml','forge/test-step3-analysis-request.mjs','forge/test-step3-analysis-scope.mjs','forge/test-step3-analysis-browser.cjs','scripts/check-step3-analysis-release.mjs','scripts/test-step3-analysis-release.mjs'].sort();
const reviewed={
  "forge/index.html": "2b1151f44d0dd926f85adb2d6ecd08285fba287baa4fe5d8bbaaa18b7b2ae476",
  "forge/step3-analysis-request.mjs": "11425c08784868279a6d43cff072b2a0c4b5872a2b6403c97852d17839c6876e",
  ".github/workflows/deploy.yml": "dd21baadce26a698e918ffbb8c2210d40ffd93681b93100a5eea7d57f16f6bb1",
  "forge/test-step3-analysis-request.mjs": "fb489f42093aaafc029d9d8a5cec6e2d80c0371a71880c27ffab487ca10c5dd3",
  "forge/test-step3-analysis-scope.mjs": "e78422e1d6b737fb76b3488af5faa62f086e008e92ab6d8271c4109d9873e83b",
  "forge/test-step3-analysis-browser.cjs": "72a8b634314ab10a6c3ece8bd68bec7e0af4f79e22166ebfb45dbf76f5e37eff",
  "scripts/test-step3-analysis-release.mjs": "967f891cfcfb25eeedc3db33928c7a6b053e84639464e4579b18acb598456c2c"
};
const gitBytes=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:40*1024*1024});
const git=(...args)=>gitBytes(...args).toString().trim();
const blobId=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const normalized=bytes=>bytes.toString().replace(/\r\n/g,'\n');
export function assertScope(paths){assert.deepEqual([...paths].sort(),allowed,'Only authorized reference-analysis diagnostics, tests and independent publisher may change');}
export function assertArtifact(paths){assert.deepEqual([...paths].sort(),payload,'Every other published file must remain byte-identical');}
const entryEdits=[
  [
    "import {internationalGalleryBase} from './step3-international-image-route.mjs?v=20261116-international1';\n",
    "import {internationalGalleryBase} from './step3-international-image-route.mjs?v=20261116-international1';\nimport {requestStep3Analysis} from './step3-analysis-request.mjs?v=20261117-diagnostics1';\n"
  ],
  [
    "    const r=await fetchWithTimeout(internationalBase(body.model)+'/v1/messages',{method:'POST',headers:anthropicHeaders(cleanKey($('#key').value)),body:JSON.stringify(withReasoning(body,'visual'))});\n    txt=await r.text(); if(!r.ok) throw new Error(friendlyHttp(r.status,txt));\n    const d=JSON.parse(txt); txt=(d.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');\n",
    "    const url=internationalBase(body.model)+'/v1/messages',key=cleanKey($('#key').value);\n    const d=await requestStep3Analysis({model:body.model,url,key,english:GAL_I18N.lang==='en',request:()=>fetchWithTimeout(url,{method:'POST',headers:anthropicHeaders(key),body:JSON.stringify(withReasoning(body,'visual'))})});\n    txt=(d.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');\n"
  ],
  [
    "    let r;\n    try{ r=await postJSON(internationalBase(am),'/chat/completions',withReasoning(body,'visual'),cleanKey($('#key').value)); }\n    catch(e){\n      if(e.name==='TimeoutError') throw new Error(tt('analyze.timeout'));\n      const diag=await diagnoseConnection(internationalBase(am),cleanKey($('#key').value),am);\n      throw new Error(diag || tt('analyze.blocked'));\n    }\n    txt=await r.text(); if(!r.ok) throw new Error(friendlyHttp(r.status,txt));\n    const d=JSON.parse(txt);\n",
    "    const base=internationalBase(am),key=cleanKey($('#key').value);\n    const d=await requestStep3Analysis({model:am,url:base+'/chat/completions',key,english:GAL_I18N.lang==='en',request:()=>postJSON(base,'/chat/completions',withReasoning(body,'visual'),key)});\n"
  ]
];
export function assertEntry(actual,before){
 let expected=normalized(before);
 assert.equal(createHash('sha256').update(expected).digest('hex'),'6a137da2f6602f8fa2cbbf019518c54ae90928cbe51b80a33875031eecdc62b8','Unexpected entry baseline');
 for(const [from,to] of entryEdits){assert.equal(expected.split(from).length,2,"Authorized entry anchor must occur once");expected=expected.replace(from,to);}
 assert.equal(normalized(actual),expected,"Entrypoint changed outside authorized reference-analysis request handling");
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
  const original=p==='forge/index.html'?gitBytes('show',baseCommit+':'+p):null;if(original)assert.equal(previous.entries.find(e=>e.path===p)?.blob,blobId(original),'Source must equal published bytes: '+p);else assert.equal(previous.entries.some(e=>e.path===p),false,'Analysis diagnostics module must be new');
  const bytes=working?Buffer.from(normalized(readFileSync(join(root,p)))):gitBytes('show','HEAD:'+p);
  if(p==='forge/index.html')assertEntry(bytes,original);
  else execFileSync(process.execPath,['--check','--input-type=module'],{input:bytes,cwd:root});
  candidates.set(p,bytes);
 }
 const temp=mkdtempSync(join(tmpdir(),'step3-analysis-'));let priorAdded=false;
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
  const result={baseRun,baseCommit,baseTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,allOtherPublishedBytesIdentical:true,entryLimitedToAuthorizedReferenceAnalysis:true,historicalAcceptanceAndTestsUnchanged:true,step4Unchanged:true,originalFrozenCheck:'Unchanged; existing failures remain failures',entries};
  if(process.argv.includes('--prepare-pages')){
   const output='/tmp/step3-analysis-pages';assert.equal(existsSync(output),false,'Refuse overwrite');mkdirSync(output);
   indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
   for(const e of entries)assert.equal(blobId(readFileSync(join(output,e.path))),e.blob,'Export mismatch: '+e.path);
   writeFileSync('/tmp/step3-analysis-proof.json',JSON.stringify(result,null,2));assert.equal(git('status','--porcelain','--untracked-files=all'),'');
  }
  console.log(JSON.stringify({...result,entries:undefined},null,2));
 }finally{
  if(priorAdded)git('worktree','remove','--force',join(temp,'historical'));
  assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep));rmSync(temp,{recursive:true,force:true});
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
