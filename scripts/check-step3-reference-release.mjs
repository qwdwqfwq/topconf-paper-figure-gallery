// Owner authorized Step 3 reference-only catalog filtering, isolated tests and byte-preserving publication.
// Historical freeze baselines and acceptance programs remain unchanged.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
export const baseCommit='bfc24b841652081d13b4dd866c4e3b279b5d53c5';
const publishedCommit='bfc24b841652081d13b4dd866c4e3b279b5d53c5';
const baseRun=44080978615;
const baseTree='bd6f148032cd9a1b0a2e7b9c7f7e310a83a9d85a';
const baseProofSha256='3c23569aad649c47fd0fbd1bf64fed4c71da658e68f4d7bc4aea11fe9307fb2a';
export const payload=["forge/step3-model-catalog.mjs", "forge/step3-reference-models.mjs"];
export const allowed=[".github/workflows/deploy-step3-reference.yml", "forge/step3-model-catalog.mjs", "forge/step3-reference-models.mjs", "forge/test-step3-official-catalog-browser.cjs", "forge/test-step3-reference-models.mjs", "scripts/check-step3-reference-release.mjs", "scripts/test-step3-reference-release.mjs"];
const reviewed={
  ".github/workflows/deploy-step3-reference.yml": "e69ccc89121948df4537acdbb6cacf3fa4009eacf2a941bfce3c8a558f83ce44",
  "forge/step3-model-catalog.mjs": "a2b2fae8d25c6b26d36211fa888c0a1d9192a17ce8102b7f338da0f4c6d8b28d",
  "forge/step3-reference-models.mjs": "5871e36f81fb5f10cc3b47725d607ae66a6bb645343d5528fca8d1cd404642cd",
  "forge/test-step3-official-catalog-browser.cjs": "bc259037e8657fefaacdbc01b3d2417532633b5ae596a96135046ba5e821ffc3",
  "forge/test-step3-reference-models.mjs": "cf0b4c44737afb1576147b9b18454f390191587be6432df6d9298ff58c2befd7",
  "scripts/test-step3-reference-release.mjs": "2ccfafa81dcb4ba0e43a52a9c904882f07055cfcba30c475aaae9c354fd56b46"
};
const gitBytes=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:40*1024*1024});
const git=(...args)=>gitBytes(...args).toString().trim();
const blobId=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const normalized=bytes=>bytes.toString().replace(/\r\n/g,'\n');
export function assertScope(paths){assert.deepEqual([...paths].sort(),allowed,'Only authorized Step 3 catalog filtering, tests and independent publisher may change');}
export function assertArtifact(paths){assert.deepEqual([...paths].sort(),payload,'Every other published file must remain byte-identical');}
export function verifyReviewed(path,bytes){assert.ok(reviewed[path],'Unreviewed path');assert.equal(createHash('sha256').update(normalized(bytes)).digest('hex'),reviewed[path],'Unreviewed content: '+path);}
export function verifyPrevious(bytes){assert.equal(createHash('sha256').update(bytes).digest('hex'),baseProofSha256,'Previous publication proof changed');const p=JSON.parse(bytes);assert.equal(p.artifactTree,baseTree);assert.equal(p.allOtherPublishedBytesIdentical,true);return p;}
export function verifyPatch(path,original,candidate){
 verifyReviewed(path,candidate);
 assert.ok(payload.includes(path),'Only Step 3 catalog and isolated policy are publishable');
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
  const run=await api('/actions/runs/'+baseRun);assert.equal(run.conclusion,'success');assert.equal(run.head_sha,publishedCommit);
  const deployments=await api('/deployments?environment=github-pages&per_page=20');
  const statuses=await Promise.all(deployments.map(async d=>({deployment:d,status:(await api('/deployments/'+d.id+'/statuses'))[0]})));
  const current=statuses.find(s=>s.status?.state==='success');assert.ok(current);assert.equal(current.deployment.sha,publishedCommit,'Another release has been published');assert.ok(current.status.log_url.includes('/runs/'+baseRun+'/'));
 }
 const candidates=new Map();
 for(const p of payload){
  const isNew=p==='forge/step3-reference-models.mjs';if(isNew)assert.equal(git('ls-tree','--name-only',baseCommit,'--',p),'','Reference policy must be new');const original=isNew?Buffer.alloc(0):gitBytes('show',baseCommit+':'+p);if(original.length)assert.equal(previous.entries.find(e=>e.path===p)?.blob,blobId(original),'Source must equal published bytes: '+p);else assert.equal(previous.entries.some(e=>e.path===p),false,'New module must be new');
  const bytes=working?Buffer.from(normalized(readFileSync(join(root,p)))):gitBytes('show','HEAD:'+p);
  verifyPatch(p,original,bytes);
  const script=p.endsWith('.html')?Buffer.from(bytes.toString().match(/<script type="module">([\s\S]*?)<\/script>/)[1]):bytes;
  execFileSync(process.execPath,['--check','--input-type=module'],{input:script,cwd:root});
  candidates.set(p,bytes);
 }
 const temp=mkdtempSync(join(tmpdir(),'step3-reference-'));let priorAdded=false;
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
  const result={baseRun,baseCommit,baseTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,allOtherPublishedBytesIdentical:true,onlyAuthorizedStep3CatalogChanges:true,forgeIndexUnchanged:true,step4PromptsSizesParametersAndExportsUnchanged:true,reconstructionAndExportFunctionsUnchanged:true,historicalAcceptanceAndTestsUnchanged:true,originalFrozenCheck:'Unchanged; existing failures remain failures',entries};
  if(process.argv.includes('--prepare-pages')){
   const output='/tmp/step3-reference-pages';assert.equal(existsSync(output),false,'Refuse overwrite');mkdirSync(output);
   indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
   for(const e of entries)assert.equal(blobId(readFileSync(join(output,e.path))),e.blob,'Export mismatch: '+e.path);
   writeFileSync('/tmp/step3-reference-proof.json',JSON.stringify(result,null,2));assert.equal(git('status','--porcelain','--untracked-files=all'),'');
  }
  console.log(JSON.stringify({...result,entries:undefined},null,2));
 }finally{
  if(priorAdded)git('worktree','remove','--force',join(temp,'historical'));
  assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep));rmSync(temp,{recursive:true,force:true});
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
