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
export const baseCommit='75df68b5bc703beda2e4458b2fa32a62db49e20c';
const baseRun=44060812144;
const baseTree='3544d235a2563d3f1d1651f7f365b81adf484c99';
const baseProofSha256='7a4abda6409d9201701e06a2a2b37cb8abffdff945a780e37aa1b8f989d0a886';
export const payload=["forge/index.html", "forge/revision-gallery.mjs", "forge/revision-image-job.mjs", "forge/revision-upload.mjs"];
export const allowed=[".github/workflows/deploy-revision-upload.yml", "forge/index.html", "forge/revision-gallery.mjs", "forge/revision-image-job.mjs", "forge/revision-upload.mjs", "forge/test-revision-durable-task.mjs", "revision-image-jobs/test-worker.mjs", "revision-image-jobs/upload-store.mjs", "revision-image-jobs/worker.mjs", "scripts/check-revision-upload-release.mjs", "scripts/test-revision-upload-release.mjs"];
const reviewed={
  ".github/workflows/deploy-revision-upload.yml": "672706afb0ccd9060ec7c2890e3c244314c241a1919835b05001c3558310ecac",
  "forge/index.html": "d33057fe43979c5f3e52ef880a93f5cde5e1be3aecab9aa653ee493f83b8cee2",
  "forge/revision-gallery.mjs": "86ed0209514846c240ecb0ff4b5ce32bda52db448953358caae1e5b1dc461ef5",
  "forge/revision-image-job.mjs": "efe25deb510aba93597d107d36a981f4ce763c19177ab822f387871008952543",
  "forge/revision-upload.mjs": "2663f7e162cce435d213f5801d26b18733411af08163b85562715eaec1a20929",
  "forge/test-revision-durable-task.mjs": "3c6e24b382ae206a3c32e8f15e80e195849b929c1ecc61574c6a8a699105192d",
  "revision-image-jobs/test-worker.mjs": "fe425886860c3826c772f674f7435b3bf1abc4062a4381bb5b0b990be693e84c",
  "revision-image-jobs/upload-store.mjs": "f98500a137b2605d79b16a1b0c190d801498dd9ff489e5a4b0421d24fb6dcb39",
  "revision-image-jobs/worker.mjs": "5478b2c0bbd46557f1aff22050ae3e0f57e134fc1f37bda8b28afa7859572528",
  "scripts/test-revision-upload-release.mjs": "72fe688a20cd8dcdbd952a8e2fed80d283f1168ca8b24dd61daecf7711e4b4f2"
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
 if(!['forge/index.html','forge/revision-gallery.mjs'].includes(path))return;
 let expected=normalized(original);
 const replacements=path==='forge/index.html'?[["import {createRevisionGallery,generateRevision} from './revision-gallery.mjs?v=20261117-durable-revision';\n", "import {createRevisionGallery,generateRevision} from './revision-gallery.mjs?v=20261117-chunked-revision';\n"]]:[["import {createRevisionImageJobClient} from './revision-image-job.mjs';\n", "import {createRevisionImageJobClient} from './revision-image-job.mjs?v=20261117-chunked-revision';\n"], ["      onProgress?.(state.stage==='waiting_response'?'请求已发送，正在等待修改图响应。':state.stage==='response_received'?(parent.localPatch?'修改图已接收，正在还原选区并校验框外像素。':'修改图已接收，正在校验并保存。'):`已收到接口响应，正在接收修改图（${Math.ceil((state.responseBytes||0)/1024)} KB）。`);\n", "      onProgress?.(state.state==='uploading'?`正在上传原始修改图（${state.completed} / ${state.total}），刷新后可继续。`:state.state==='submitting'?'正在保存修改图任务，尚未确认接收。':state.state==='queued'?'后台已保存修改图任务，正在排队。':state.state==='running'?'后台正在生成修改图，刷新后可取回同一任务。':state.state==='reconnecting'?'连接中断，正在恢复同一修改任务；不会重复生图。':state.stage==='waiting_response'?'请求已发送，正在等待修改图响应。':state.stage==='response_received'?(parent.localPatch?'修改图已接收，正在还原选区并校验框外像素。':'修改图已接收，正在校验并保存。'):`已收到接口响应，正在接收修改图（${Math.ceil((state.responseBytes||0)/1024)} KB）。`);\n"]];
 for(const [from,to] of replacements){assert.equal(expected.split(from).length,2,'Unique original patch');expected=expected.replace(from,to);}
 assert.equal(normalized(candidate),expected,'Only reviewed private modification import/progress changes may change');
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
  const isNew=p==='forge/revision-upload.mjs';if(isNew)assert.equal(git('ls-tree','--name-only',baseCommit,'--',p),'','Modification module must be new');const original=isNew?Buffer.alloc(0):gitBytes('show',baseCommit+':'+p);if(original.length)assert.equal(previous.entries.find(e=>e.path===p)?.blob,blobId(original),'Source must equal published bytes: '+p);else assert.equal(previous.entries.some(e=>e.path===p),false,'New module must be new');
  const bytes=working?Buffer.from(normalized(readFileSync(join(root,p)))):gitBytes('show','HEAD:'+p);
  verifyPatch(p,original,bytes);
  const script=p.endsWith('.html')?Buffer.from(bytes.toString().match(/<script type="module">([\s\S]*?)<\/script>/)[1]):bytes;
  execFileSync(process.execPath,['--check','--input-type=module'],{input:script,cwd:root});
  candidates.set(p,bytes);
 }
 const temp=mkdtempSync(join(tmpdir(),'revision-upload-'));let priorAdded=false;
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
   const output='/tmp/revision-upload-pages';assert.equal(existsSync(output),false,'Refuse overwrite');mkdirSync(output);
   indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
   for(const e of entries)assert.equal(blobId(readFileSync(join(output,e.path))),e.blob,'Export mismatch: '+e.path);
   writeFileSync('/tmp/revision-upload-proof.json',JSON.stringify(result,null,2));assert.equal(git('status','--porcelain','--untracked-files=all'),'');
  }
  console.log(JSON.stringify({...result,entries:undefined},null,2));
 }finally{
  if(priorAdded)git('worktree','remove','--force',join(temp,'historical'));
  assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep));rmSync(temp,{recursive:true,force:true});
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
