// Owner limited unlock 2026-11-17: bitmap modification recovery, private jobs, tests and minimal publication only.
// Historical freeze baselines and acceptance programs remain unchanged.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
export const baseCommit='4b1c049a2956c6d7d81f7065faad3df45e36fd3a';
const baseRun=44060095453;
const baseTree='d5a17b0e1c1437cda131d9a51b07d42ff3e39c60';
const baseProofSha256='8124b8c658934a0918afb5db35c77f062d3ccbec3e4e701c1693adb810c2319f';
export const payload=["forge/index.html", "forge/revision-gallery.mjs", "forge/revision-image-job.mjs", "forge/revision-image-protocol.mjs", "forge/revision-task-store.mjs"];
export const allowed=[".github/workflows/deploy-revision-task.yml", "forge/index.html", "forge/revision-gallery.mjs", "forge/revision-image-job.mjs", "forge/revision-image-protocol.mjs", "forge/revision-task-store.mjs", "forge/test-revision-durable-task.mjs", "forge/test-revision-entry-durable.mjs", "forge/test-revision-task-browser.cjs", "revision-image-jobs/browser-image-fetch.mjs", "revision-image-jobs/test-worker.mjs", "revision-image-jobs/worker.mjs", "revision-image-jobs/wrangler.jsonc", "scripts/check-revision-task-release.mjs", "scripts/test-revision-task-release.mjs"];
const reviewed={
  ".github/workflows/deploy-revision-task.yml": "68cc64295d1e21cc77cc061d3300e288ff25818de38f431d076eba4c7bc239df",
  "forge/index.html": "5eb50b2ee9303473e566b1cce8d4a941d92312221557d5d4c9d83b657260a4df",
  "forge/revision-gallery.mjs": "fb7682db4a0558e5aa2eb92b600ec45f0be9e05bb21ced9373e9a8fc1ccdd586",
  "forge/revision-image-job.mjs": "793c21309f711619366d71ae0b6cde08af6c53f6a7f43a5a3eb19a40148ae7bf",
  "forge/revision-image-protocol.mjs": "ecd3257f4124d539030107c64eeb991bcfd0636a3651f86c0ebbe6440774586a",
  "forge/revision-task-store.mjs": "4b6f9fd025ba9e14331748e8afbd046158d0d762c6c05aef9d14380dde2d972c",
  "forge/test-revision-durable-task.mjs": "729974f471b76ef19098b0ea4e49bdbf6e17020fcf44dab3991aeffee70bf21b",
  "forge/test-revision-entry-durable.mjs": "bfcc18f61ef70a4ef9eda97643db833f2c5f1a9075e61681c31d02b5264e19c1",
  "forge/test-revision-task-browser.cjs": "124e04faab594dd341a7092a673c0034c3a4814624b08a1a9c808f3da267f37f",
  "revision-image-jobs/browser-image-fetch.mjs": "3e9f986da8b50f0b87fbf65ac4bd715b54e0ca466c29cb0fadc7fb34f6a0f69c",
  "revision-image-jobs/test-worker.mjs": "7eeaed3b6392341fbc04649220361015bb51e4833b46cbb189a85209573159ec",
  "revision-image-jobs/worker.mjs": "81e4a0794b07379d7460da746a1dd6dcce0d2896905f564d2703b12f6c640f64",
  "revision-image-jobs/wrangler.jsonc": "ea876a10c92c79c11c6a1cb179cf27c058a6e112648eed263ff5b4f145eda786",
  "scripts/test-revision-task-release.mjs": "2fa82d7be90c8afc824e37ccfe3c0fbb68c348191cb9f2e28dfde05fbb07136f"
};
const gitBytes=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:40*1024*1024});
const git=(...args)=>gitBytes(...args).toString().trim();
const blobId=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const normalized=bytes=>bytes.toString().replace(/\r\n/g,'\n');
export function assertScope(paths){assert.deepEqual([...paths].sort(),allowed,'Only authorized bitmap modification recovery, tests and independent publisher may change');}
export function assertArtifact(paths){assert.deepEqual([...paths].sort(),payload,'Every other published file must remain byte-identical');}
export function verifyReviewed(path,bytes){assert.ok(reviewed[path],'Unreviewed path');assert.equal(createHash('sha256').update(normalized(bytes)).digest('hex'),reviewed[path],'Unreviewed content: '+path);}
export function verifyPrevious(bytes){assert.equal(createHash('sha256').update(bytes).digest('hex'),baseProofSha256,'Previous publication proof changed');const p=JSON.parse(bytes);assert.equal(p.artifactTree,baseTree);assert.equal(p.allOtherPublishedBytesIdentical,true);return p;}
export function verifyPatch(path,original,candidate){
 verifyReviewed(path,candidate);
 if(path==='forge/revision-gallery.mjs'){
  const section=text=>text.slice(text.indexOf('  function savedState('),text.indexOf('  function refresh('));
  assert.ok(section(normalized(original)).length>3000);
  assert.equal(section(normalized(candidate)),section(normalized(original)),'History snapshots, reconstruction, export and deletion functions must remain unchanged');
 }
 if(path!=='forge/index.html')return;
 let expected=normalized(original);
 for(const [from,to] of [["import {createRevisionGallery,generateRevision} from './revision-gallery.mjs?v=20261115-endpoints';\n", "import {createRevisionGallery,generateRevision} from './revision-gallery.mjs?v=20261117-durable-revision';\n"], ["  const route={p,model,base:internationalGalleryBase(baseURL(),{provider:p,model,stage:'revision'}),proto:cfg().proto,ratio:$('#figureRatio').value,resolution:$('#imageResolution').value};\n", "  const route=version.revisionTask?.input.route||{p,model,base:svg?internationalGalleryBase(baseURL(),{provider:p,model,stage:'revision'}):baseURL(),proto:cfg().proto,ratio:$('#figureRatio').value,resolution:$('#imageResolution').value};\n"], ["    if(mode!==(svg?'svg':'image'))throw new Error(svg?'请在步骤三选择「SVG 可编辑初稿」，并选择视觉模型。':'请在步骤三选择「AI 位图初稿」，并选择图像模型。');\n    if(!model || (svg?!isVisualChatModel(model,cfg().vision||[]):!step3Catalog().isImageModel(model)))throw new Error(svg?'请在步骤三选择支持图像输入的视觉模型。':'请在步骤三选择图像模型。');\n", "    if(!version.revisionTask&&mode!==(svg?'svg':'image'))throw new Error(svg?'请在步骤三选择「SVG 可编辑初稿」，并选择视觉模型。':'请在步骤三选择「AI 位图初稿」，并选择图像模型。');\n    if(!version.revisionTask&&(!model || (svg?!isVisualChatModel(model,cfg().vision||[]):!step3Catalog().isImageModel(model))))throw new Error(svg?'请在步骤三选择支持图像输入的视觉模型。':'请在步骤三选择图像模型。');\n"]]){assert.equal(expected.split(from).length,2,'Unique original patch');expected=expected.replace(from,to);}
 assert.equal(normalized(candidate),expected,'Only reviewed bitmap modification route/import replacements may change');
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
  const isNew=['forge/revision-image-job.mjs','forge/revision-image-protocol.mjs','forge/revision-task-store.mjs'].includes(p);if(isNew)assert.equal(git('ls-tree','--name-only',baseCommit,'--',p),'','Modification module must be new');const original=isNew?Buffer.alloc(0):gitBytes('show',baseCommit+':'+p);if(original.length)assert.equal(previous.entries.find(e=>e.path===p)?.blob,blobId(original),'Source must equal published bytes: '+p);else assert.equal(previous.entries.some(e=>e.path===p),false,'New module must be new');
  const bytes=working?Buffer.from(normalized(readFileSync(join(root,p)))):gitBytes('show','HEAD:'+p);
  verifyPatch(p,original,bytes);
  const script=p.endsWith('.html')?Buffer.from(bytes.toString().match(/<script type="module">([\s\S]*?)<\/script>/)[1]):bytes;
  execFileSync(process.execPath,['--check','--input-type=module'],{input:script,cwd:root});
  candidates.set(p,bytes);
 }
 const temp=mkdtempSync(join(tmpdir(),'revision-task-'));let priorAdded=false;
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
  const result={baseRun,baseCommit,baseTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,allOtherPublishedBytesIdentical:true,onlyAuthorizedBitmapModificationChanges:true,step4PromptsSizesParametersAndExportsUnchanged:true,reconstructionAndExportFunctionsUnchanged:true,historicalAcceptanceAndTestsUnchanged:true,originalFrozenCheck:'Unchanged; existing failures remain failures',entries};
  if(process.argv.includes('--prepare-pages')){
   const output='/tmp/revision-task-pages';assert.equal(existsSync(output),false,'Refuse overwrite');mkdirSync(output);
   indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
   for(const e of entries)assert.equal(blobId(readFileSync(join(output,e.path))),e.blob,'Export mismatch: '+e.path);
   writeFileSync('/tmp/revision-task-proof.json',JSON.stringify(result,null,2));assert.equal(git('status','--porcelain','--untracked-files=all'),'');
  }
  console.log(JSON.stringify({...result,entries:undefined},null,2));
 }finally{
  if(priorAdded)git('worktree','remove','--force',join(temp,'historical'));
  assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep));rmSync(temp,{recursive:true,force:true});
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
