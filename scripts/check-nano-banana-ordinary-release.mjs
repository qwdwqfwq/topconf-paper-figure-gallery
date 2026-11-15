// Narrow owner authorization: restore Infistar Nano Banana 2.1 ordinary transport only.
// Original workflow lock and bitmap freeze baselines remain unchanged.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const baseCommit='ca2713693c8a5c73d4c47dff0764aef7226d1148';
const baseRun=43719621140;
const baseTree='93c7ca57d7cdcaa9b5f2855c44133a18a82a578f';
const baseProofSha256='29b8c1217455b4eee8b187e5da3e7571c189de41c76855999e8b274e9151c069';
const payload=['forge/step3-image-compat.mjs'];
const allowed=[...payload,'forge/test-step3-image-stream.mjs','forge/test-step3-nano-banana-ordinary.mjs','infistar-image-relay/test-worker.mjs','infistar-image-relay/NANO_BANANA_ORDINARY.md','.github/workflows/nano-banana-ordinary-guard.yml','scripts/check-nano-banana-ordinary-release.mjs','.github/workflows/nano-banana-ordinary-release.yml'].sort();
const gitBytes=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:40*1024*1024});
const git=(...args)=>gitBytes(...args).toString().trim();
const blobId=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
assert.equal(git('show','-s','--format=%P','HEAD'),baseCommit);
assert.equal(git('status','--porcelain','--untracked-files=all'),'');
assert.deepEqual(git('diff','--name-only','--no-renames',baseCommit,'HEAD').split('\n').sort(),allowed,'Only the authorized ordinary route, tests, contract and isolated publisher may change');
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
  "forge/step3-image-compat.mjs": [
    [
      "  if(u.username||u.password)return false;\n",
      "  if(u.username||u.password)return false;\n  // Infistar Nano Banana 2.1 requires the ordinary Gemini native endpoint.\n  // This positive policy overrides stale streaming capability records in both\n  // the browser and durable Worker. Keep other Gemini models negotiating.\n  if(u.protocol==='https:'&&!u.port&&['infistar.cc','www.infistar.cc','infistar.ai','www.infistar.ai'].includes(u.hostname)&&/^\\/v1beta\\/models\\/gemini-nano-banana-2\\.1:(?:streamGenerateContent|generateContent)$/.test(u.pathname))return true;\n"
    ]
  ]
};
const sourceHashes={
  "forge/test-step3-image-stream.mjs": "d4b1cce4d5f02095f4aabbc7ab31a31475582451fb49a0cea1987fd5f3096bda",
  "forge/test-step3-nano-banana-ordinary.mjs": "8d1d1fe2d2063a7b7c1c6de61ef76d6076723bdf529450e3d1833ddbbf4f9a99",
  "infistar-image-relay/test-worker.mjs": "5f0ef3c50ab5131b59b2424d7b8e532573cede8092c90f46ad5a0e7ab0aa9632",
  "infistar-image-relay/NANO_BANANA_ORDINARY.md": "9f18f47d30d9b287b02d09d6aca1e513958f6b9ac0c05d9981d069b31eb204da",
  ".github/workflows/nano-banana-ordinary-guard.yml": "de1558d041f76a2a470092b316abc6a6daf1c5e066b88ac04eb0cbc206f6f6a5"
};
for(const [file,hash] of Object.entries(sourceHashes)){
 const source=gitBytes('show','HEAD:'+file);
 assert.equal(createHash('sha256').update(source).digest('hex'),hash,'Reviewed regression/contract source changed: '+file);
}
const candidates=new Map();
for(const path of payload){
 const candidate=gitBytes('show','HEAD:'+path);
 if(replacements[path]){
  const original=gitBytes('show',baseCommit+':'+path);let expected=original.toString();
  assert.equal(previous.entries.find(e=>e.path===path)?.blob,blobId(original),'Source must equal the exact published module');
  for(const [before,after] of replacements[path]){assert.equal(expected.split(before).length,2);expected=expected.replace(before,after);}
  assert.equal(candidate.toString(),expected,'No changes outside the exact approved ordinary endpoint policy');
 }else assert.equal(previous.entries.some(e=>e.path===path),false,'Ordinary policy payload must be explicitly reviewed');
 execFileSync(process.execPath,['--check','--input-type=module'],{input:candidate,cwd:root});candidates.set(path,candidate);
}
const temp=mkdtempSync(join(tmpdir(),'nano-banana-ordinary-'));
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
for(const [path,bytes] of candidates)indexGit('update-index','--add','--cacheinfo','100644',blobId(bytes),path);
const artifactTree=indexGit('write-tree');
assert.deepEqual(git('diff','--name-only','--no-renames',baseTree,artifactTree).split('\n'),payload,'Every other published file must remain byte-identical');
const entries=previous.entries.map(e=>candidates.has(e.path)?{...e,blob:blobId(candidates.get(e.path))}:e);
for(const [path,bytes] of candidates)if(!seen.has(path))entries.push({mode:'100644',path,blob:blobId(bytes)});
entries.sort((a,b)=>a.path.localeCompare(b.path,'en'));
const result={baseRun,baseCommit,baseTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,allOtherPublishedBytesIdentical:true,ordinaryTransportOnly:true,promptsAndOutsideProtectionUnchanged:true,exportAndEntrypointUnchanged:true,originalFrozenCheck:'Unchanged; preexisting failures remain failures'};
if(process.argv.includes('--prepare-pages')){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
 const output='/tmp/nano-banana-ordinary-pages';assert.equal(existsSync(output),false);mkdirSync(output);
 indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
 for(const e of entries)assert.equal(blobId(readFileSync(join(output,e.path))),e.blob,'Published byte mismatch: '+e.path);
 writeFileSync('/tmp/nano-banana-ordinary-proof.json',JSON.stringify({...result,entries},null,2));
 assert.equal(git('status','--porcelain','--untracked-files=all'),'');
}
console.log(JSON.stringify(result,null,2));
