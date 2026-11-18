// Publish only the owner-authorized retrieval startup regions; original freeze guards remain untouched.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const baseCommit='e4dad88d578559f4a56f5eab71a952eb8f8a7433';
const baseRun=44313636693;
const baseTree='f604792546db6ca7892e1a4f608d882f3f4f5079';
const baseProofSha256='297ea8116711f97bb7749dac81b2f3304eba7336c8bd6526a1696f781e87cd1a';
export const payload=["forge/index.html", "forge/retrieval-assets.mjs", "forge/retrieval-core-worker.mjs", "forge/retrieval-domestic-worker.mjs", "forge/retrieval-domestic.mjs", "forge/retrieval-resource-loader.mjs"];
export const allowed=["forge/index.html", "forge/retrieval-assets.mjs", "forge/retrieval-core-worker.mjs", "forge/retrieval-domestic-worker.mjs", "forge/retrieval-domestic.mjs", "forge/retrieval-resource-loader.mjs", "scripts/check-retrieval-domestic-release.mjs", "scripts/test-retrieval-domestic-release.mjs", "scripts/retrieval-startup-patch.json", "scripts/retrieval-payload.json", "forge/test-retrieval-domestic.mjs", "forge/test-retrieval-domestic-browser.cjs", ".github/workflows/deploy-retrieval-domestic.yml"].sort();
const gitBytes=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:128*1024*1024});
const git=(...args)=>gitBytes(...args).toString().trim();
const blobId=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
export function assertScope(paths){assert.deepEqual([...paths].sort(),allowed,'Only the authorized Tencent network patch and isolated publication files may change');}
export function assertArtifact(paths){assert.deepEqual([...paths].sort(),payload,'Every other published file must remain byte-identical');}
export function verifyPrevious(bytes){assert.equal(createHash('sha256').update(bytes).digest('hex'),baseProofSha256);const p=JSON.parse(bytes);assert.equal(p.artifactTree,baseTree);assert.equal(p.allOtherPublishedBytesIdentical,true);return p;}
const patches=JSON.parse(readFileSync(new URL('./retrieval-startup-patch.json',import.meta.url)));
const hashes=JSON.parse(readFileSync(new URL('./retrieval-payload.json',import.meta.url)));
export function verifyPatch(path,original,candidate){
 assert.ok(payload.includes(path));
 assert.equal(createHash('sha256').update(candidate).digest('hex'),hashes[path],'Only the exact reviewed retrieval patch is authorized');
 if(path==='forge/index.html'){
  let expected=original.toString();
  for(const p of patches){assert.equal(expected.split(p.before).length,2,'Unique patch anchor required');expected=expected.replace(p.before,p.after);}
  assert.equal(candidate.toString(),expected,'All text outside the authorized retrieval startup regions must remain byte-identical');
 }else assert.equal(original.length,0,'Retrieval modules must be new isolated files');
}
export function verifyHealth(data){
 assert.equal(data.service,'gallery-tencent-backend');assert.equal(data.version,'20261118-native');
 assert.equal(data.ready,true);assert.equal(data.proxy,false);assert.equal(data.storage,'sqlite-wal');
}
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
const health=await fetch('https://analysis.topconf-paper-figure-gallery.cn/health',{signal:AbortSignal.timeout(30000)});
assert.equal(health.status,200);verifyHealth(await health.json());
if(process.argv.includes('--check-published-base')){console.log('Latest successful Pages deployment still matches the verified base.');return;}
const candidates=new Map();
for(const path of payload){
 const prior=previous.entries.find(e=>e.path===path);
 const original=prior?gitBytes('cat-file','blob',prior.blob):Buffer.alloc(0);
 if(path==='forge/index.html')assert.equal(blobId(gitBytes('show',baseCommit+':'+path)),prior.blob,'Index source must equal the exact published file');
 const candidate=working?Buffer.from(readFileSync(join(root,path),'utf8').replace(/\r\n/g,'\n')):gitBytes('show','HEAD:'+path);
 verifyPatch(path,original,candidate);
 if(path.endsWith('.mjs'))execFileSync(process.execPath,['--check','--input-type=module'],{input:candidate,cwd:root});candidates.set(path,candidate);
}
// Every mirrored model, embedding and dataset must equal the published bytes.
const manifest=await import(new URL('../forge/retrieval-assets.mjs',import.meta.url));
for(const [path,meta] of Object.entries(manifest.ASSETS)){
 const published=previous.entries.find(e=>e.path==='forge/'+path);assert.ok(published);
 const bytes=gitBytes('cat-file','blob',published.blob);assert.equal(bytes.length,meta.size);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),meta.sha256,'Published model/data changed: '+path);
 const response=await fetch(manifest.DOMESTIC+path,{method:'HEAD',signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),'*');
}
const temp=mkdtempSync(join(tmpdir(),'retrieval-domestic-'));
const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
const indexGit=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',maxBuffer:128*1024*1024}).trim();
const seen=new Set();
for(const e of previous.entries){
 assert.ok(['100644','100755'].includes(e.mode));assert.match(e.blob,/^[0-9a-f]{40}$/);
 assert.ok(!/[\t\r\n\\]/.test(e.path)&&!e.path.startsWith('/')&&!e.path.split('/').some(p=>p==='..'||p==='.git'));
 assert.ok(!seen.has(e.path));seen.add(e.path);
}
indexGit('read-tree','--empty');
execFileSync('git',['update-index','--index-info'],{cwd:root,env,input:previous.entries.map(e=>e.mode+' '+e.blob+'\t'+e.path+'\n').join(''),maxBuffer:128*1024*1024});
assert.equal(indexGit('write-tree'),baseTree);
for(const [path,bytes] of candidates){const blob=execFileSync('git',['hash-object','-w','--stdin'],{cwd:root,input:bytes}).toString().trim();assert.equal(blob,blobId(bytes));indexGit('update-index','--add','--cacheinfo','100644',blob,path);}
const artifactTree=indexGit('write-tree');
assertArtifact(git('diff','--name-only','--no-renames',baseTree,artifactTree).split('\n'));
const entries=previous.entries.map(e=>candidates.has(e.path)?{...e,blob:blobId(candidates.get(e.path))}:e);
for(const [path,bytes] of candidates)if(!previous.entries.some(e=>e.path===path))entries.push({mode:'100644',blob:blobId(bytes),path});
const result={baseRun,baseCommit,baseTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,allOtherPublishedBytesIdentical:true,onlyAuthorizedRetrievalStartupChanged:true,modelsPromptsDimensionsUnchanged:true,exportAndGenerationBytesUnchanged:true,originalFrozenCheck:'Unchanged; preexisting failures remain failures'};
if(process.argv.includes('--prepare-pages')){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
 const output='/tmp/retrieval-domestic-pages';assert.equal(existsSync(output),false);mkdirSync(output);
 indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
 for(const e of entries)assert.equal(blobId(readFileSync(join(output,e.path))),e.blob,'Published byte mismatch: '+e.path);
 writeFileSync('/tmp/retrieval-domestic-proof.json',JSON.stringify({...result,entries},null,2));
 assert.equal(git('status','--porcelain','--untracked-files=all'),'');
}
console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
