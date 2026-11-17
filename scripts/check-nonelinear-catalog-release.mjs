// Publish only the owner-authorized NoneLinear catalog fix; original freeze guards remain untouched.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const baseCommit='f70ec41754060b44e2f164adff906182dfd9a587';
const baseRun=44168369393;
const baseTree='9dc04c0991f7d01969f52ab23b634b6b153bd3e0';
const baseProofSha256='c254f0793c58faca64ee87d2158e2ef0f3d1c6ac2b257d83b824768a075a7f81';
export const payload=['forge/step3-model-catalog.mjs'];
export const allowed=[...payload,'scripts/check-nonelinear-catalog-release.mjs','scripts/test-nonelinear-catalog-release.mjs','forge/test-nonelinear-restored-catalog-browser.cjs','.github/workflows/deploy-nonelinear-catalog.yml'].sort();
const gitBytes=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:40*1024*1024});
const git=(...args)=>gitBytes(...args).toString().trim();
const blobId=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
export function assertScope(paths){assert.deepEqual([...paths].sort(),allowed,'Only the authorized NoneLinear catalog patch and isolated publication files may change');}
export function assertArtifact(paths){assert.deepEqual([...paths].sort(),payload,'Every other published file must remain byte-identical');}
export function verifyPrevious(bytes){assert.equal(createHash('sha256').update(bytes).digest('hex'),baseProofSha256);const p=JSON.parse(bytes);assert.equal(p.artifactTree,baseTree);assert.equal(p.allOtherPublishedBytesIdentical,true);return p;}
const replacements={
  "forge/step3-model-catalog.mjs": [
    [
      "  const infistarImage=c=>c.provider==='infistar'&&c.mode==='image';",
      "  const conciseImage=c=>['infistar','nonelinear'].includes(c.provider)&&c.mode==='image';"
    ],
    [
      "c.provider==='infistar'?!/^gpt-image-2\\.6(?:-|$)/i.test(m):supportsStep3ReferenceImage(c,m)",
      "c.provider==='nonelinear'||(c.provider==='infistar'?!/^gpt-image-2\\.6(?:-|$)/i.test(m):supportsStep3ReferenceImage(c,m))"
    ],
    [
      "status.textContent=infistarImage(c)?",
      "status.textContent=conciseImage(c)?"
    ],
    [
      "${infistarImage(c)?'模型':'目录'}",
      "${conciseImage(c)?'模型':'目录'}"
    ],
    [
      "render(c,rows,source,infistarImage(c)?",
      "render(c,rows,source,conciseImage(c)?"
    ],
    [
      "render(c,result.list,source,text(`已刷新步骤三：",
      "render(c,result.list,source,c.provider==='nonelinear'&&c.mode==='image'?text(`已同步官网最新模型：${main.length} 个图像模型。`,`Official catalog synchronized: ${main.length} image models.`):text(`已刷新步骤三："
    ]
  ]
};
export function verifyPatch(path,original,candidate){assert.ok(payload.includes(path));let expected=original.toString();for(const [before,after] of replacements[path]){assert.equal(expected.split(before).length,2);expected=expected.replace(before,after);}assert.equal(candidate.toString(),expected,'Only the exact reviewed NoneLinear model-list/status patch is authorized');}
async function main(){
const working=process.argv.includes('--working');
assert.equal(git('rev-parse',working?'HEAD':'HEAD^'),baseCommit);
if(!working){assert.equal(git('show','-s','--format=%P','HEAD'),baseCommit);assert.equal(git('status','--porcelain','--untracked-files=all'),'');}
const changed=git('diff','--name-only','--no-renames',baseCommit,...(working?[]:['HEAD'])).split('\n').filter(Boolean);
if(working)changed.push(...git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean));
assertScope(changed);
const previous=verifyPrevious(readFileSync(process.argv[2]));
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
if(process.argv.includes('--check-published-base')){console.log('Latest successful Pages deployment still matches the verified base.');return;}
const candidates=new Map();
for(const path of payload){
 const original=gitBytes('show',baseCommit+':'+path);
 assert.equal(previous.entries.find(e=>e.path===path)?.blob,blobId(original),'The source must equal the exact published module');
 const candidate=working?Buffer.from(readFileSync(join(root,path),'utf8').replace(/\r\n/g,'\n')):gitBytes('show','HEAD:'+path);
 verifyPatch(path,original,candidate);
 execFileSync(process.execPath,['--check','--input-type=module'],{input:candidate,cwd:root});candidates.set(path,candidate);
}
const temp=mkdtempSync(join(tmpdir(),'nonelinear-catalog-'));
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
for(const [path,bytes] of candidates){const blob=execFileSync('git',['hash-object','-w','--stdin'],{cwd:root,input:bytes}).toString().trim();assert.equal(blob,blobId(bytes));indexGit('update-index','--add','--cacheinfo','100644',blob,path);}
const artifactTree=indexGit('write-tree');
assertArtifact(git('diff','--name-only','--no-renames',baseTree,artifactTree).split('\n'));
const entries=previous.entries.map(e=>candidates.has(e.path)?{...e,blob:blobId(candidates.get(e.path))}:e);
const result={baseRun,baseCommit,baseTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,allOtherPublishedBytesIdentical:true,onlyNoneLinearImageCatalogAndStatusChanged:true,step4AndRequestParametersUnchanged:true,exportAndEntrypointUnchanged:true,otherProvidersUnchanged:true,originalFrozenCheck:'Unchanged; preexisting failures remain failures'};
if(process.argv.includes('--prepare-pages')){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
 const output='/tmp/nonelinear-catalog-pages';assert.equal(existsSync(output),false);mkdirSync(output);
 indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
 for(const e of entries)assert.equal(blobId(readFileSync(join(output,e.path))),e.blob,'Published byte mismatch: '+e.path);
 writeFileSync('/tmp/nonelinear-catalog-proof.json',JSON.stringify({...result,entries},null,2));
 assert.equal(git('status','--porcelain','--untracked-files=all'),'');
}
console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
