// Publish only Step 3 error diagnostics; preserve every other published byte.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const baseCommit='f036ad9c1ba9a8e502bc675d8107e021e6820abf';
const baseRun=43721560023;
const baseTree='ed6da1a56370729c3d3859e3e2b0dea9de3c8705';
const baseProofSha256='5fcbd910012627358f6ca81117604cb55f8f0e4234a8d1e445bc9fc8280ba928';
const payload=['forge/step3-infistar-job.mjs'];
const allowed=[...payload,'forge/test-step3-no-recovery.mjs','infistar-image-relay/worker.mjs','infistar-image-relay/job-diagnostics.mjs','infistar-image-relay/test-worker.mjs','scripts/check-step3-task-diagnostics-release.mjs','.github/workflows/step3-task-diagnostics-release.yml'].sort();
const gitBytes=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:40*1024*1024});
const git=(...args)=>gitBytes(...args).toString().trim();
const blobId=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
assert.equal(git('show','-s','--format=%P','HEAD'),baseCommit);
assert.equal(git('status','--porcelain','--untracked-files=all'),'');
assert.deepEqual(git('diff','--name-only','--no-renames',baseCommit,'HEAD').split('\n').sort(),allowed,'Only the authorized Step 3 diagnostics and its isolated publisher may change');
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
  "forge/step3-infistar-job.mjs": [
    [
      "function jobError(code,id){\n  const messages={JOB_RESULT_UNKNOWN:'本次生图失败，未取得完整结果。',JOB_EXPIRED:'本次任务已过期。',JOB_CONNECTION:'本次生图连接中断或超时。'};\n  return Object.assign(new Error((messages[code]||code)+(id?' [task: '+id+']':'')),{code,jobId:id});\n}\n",
      "function jobError(code,id,meta={}){\n  const messages={JOB_RESULT_UNKNOWN:'本次生图未完成，后台报告：',JOB_EXPIRED:'本次任务已过期。',JOB_CONNECTION:'本次生图连接中断或超时。'};\n  const d=meta.diagnostic||{},details=[];\n  if(meta.error)details.push(meta.error);\n  if(Number.isInteger(d.upstreamStatus))details.push('上游 HTTP '+d.upstreamStatus);\n  if(d.resultError)details.push('结果处理：'+d.resultError);\n  if(d.upstreamMessage||d.message)details.push(d.upstreamMessage||d.message);\n  if(d.errorCode)details.push('连接错误：'+d.errorCode);\n  if(d.stage)details.push('阶段：'+d.stage);\n  if(meta.requestId||d.requestId)details.push('request-id: '+(meta.requestId||d.requestId));\n  if(code==='JOB_RESULT_UNKNOWN'&&!details.length)details.push('后台未保存具体异常，请凭任务 ID 查询；不会自动重新提交。');\n  return Object.assign(new Error((messages[code]||code)+(details.length?' '+details.join('；'):'')+(id?' [task: '+id+']':'')),{code,jobId:id,diagnostic:meta});\n}\n"
    ],
    [
      "jobError('JOB_EXPIRED',record.id)",
      "jobError('JOB_EXPIRED',record.id,response.data)"
    ],
    [
      "jobError('JOB_HTTP_'+response.status,record.id)",
      "jobError('JOB_HTTP_'+response.status,record.id,response.data)"
    ],
    [
      "jobError('JOB_RESULT_UNKNOWN',record.id)",
      "jobError('JOB_RESULT_UNKNOWN',record.id,response.data)"
    ],
    [
      "jobError('JOB_HTTP_'+result.status,record.id)",
      "jobError('JOB_HTTP_'+result.status,record.id,result.data)"
    ]
  ]
};
const candidates=new Map();
for(const path of payload){
 const original=gitBytes('show',baseCommit+':'+path);let expected=original.toString();
 assert.equal(previous.entries.find(e=>e.path===path)?.blob,blobId(original),'The source must equal the exact published module');
 for(const [before,after] of replacements[path]){assert.equal(expected.split(before).length,2);expected=expected.replace(before,after);}
 const candidate=gitBytes('show','HEAD:'+path);
 assert.equal(candidate.toString(),expected,'Only the exact Step 3 error display replacement may change');
 execFileSync(process.execPath,['--check','--input-type=module'],{input:candidate,cwd:root});candidates.set(path,candidate);
}
const temp=mkdtempSync(join(tmpdir(),'step3-task-diagnostics-'));
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
const result={baseRun,baseCommit,baseTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,allOtherPublishedBytesIdentical:true,step3ErrorDisplayOnly:true,step4AndEntrypointUnchanged:true,requestsAndRetriesUnchanged:true,originalFrozenCheck:'Unchanged; preexisting failures remain failures'};
if(process.argv.includes('--prepare-pages')){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
 const output='/tmp/step3-task-diagnostics-pages';assert.equal(existsSync(output),false);mkdirSync(output);
 indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
 for(const e of entries)assert.equal(blobId(readFileSync(join(output,e.path))),e.blob,'Published byte mismatch: '+e.path);
 writeFileSync('/tmp/step3-task-diagnostics-proof.json',JSON.stringify({...result,entries},null,2));
 assert.equal(git('status','--porcelain','--untracked-files=all'),'');
}
console.log(JSON.stringify(result,null,2));
