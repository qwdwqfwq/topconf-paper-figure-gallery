// Narrow owner authorization: only Step 3 structure-redraw reader model discovery/selection.
// Original workflow lock and bitmap freeze baselines remain unchanged.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const baseCommit='6dc1345be56029aa1281407afc8308a0892d217a';
const baseRun=43718313447;
const baseTree='928934d6020abb269afce338945c036551283102';
const baseProofSha256='806b6a802d998dabc0234f66208f3d58123bb3eee9717a1400978d6c341c3dee';
const payload=['forge/revision-gallery.mjs','forge/revision-local.mjs','forge/revision-reader-model.mjs'];
const allowed=[...payload,'forge/test-revision-local.cjs','forge/test-revision-reader-model.mjs','scripts/check-redraw-reader-release.mjs','.github/workflows/redraw-reader-release.yml'].sort();
const gitBytes=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:40*1024*1024});
const git=(...args)=>gitBytes(...args).toString().trim();
const blobId=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
assert.equal(git('show','-s','--format=%P','HEAD'),baseCommit);
assert.equal(git('status','--porcelain','--untracked-files=all'),'');
assert.deepEqual(git('diff','--name-only','--no-renames',baseCommit,'HEAD').split('\n').sort(),allowed,'Only the authorized reader model selection, tests and isolated publisher may change');
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
  "forge/revision-gallery.mjs": [
    [
      "localRedrawInstruction,localRedrawReaderModel,compositeLocalEdit",
      "localRedrawInstruction,compositeLocalEdit"
    ],
    [
      "import {imageResultItem} from './step3-image-protocol.mjs';",
      "import {imageResultItem} from './step3-image-protocol.mjs';\nimport {discoverRedrawReaderModel} from './revision-reader-model.mjs?v=20261115-auto';"
    ],
    [
      "const brief=parent.localRedraw?await readLocalRedrawBrief(parent,prompt,patch,options):null;",
      "const reading=parent.localRedraw?await readLocalRedrawBrief(parent,prompt,patch,options):null;\n    const brief=reading?.brief||null;"
    ],
    [
      "contentReadModel:localRedrawReaderModel",
      "contentReadModel:reading.model"
    ],
    [
      "const {base}=parent.route,model=localRedrawReaderModel;",
      "const {base}=parent.route;\n  onProgress?.('正在查询当前服务商最新可用的 GPT 视觉模型。');\n  const model=await discoverRedrawReaderModel({base,key});"
    ],
    [
      "onProgress?.('正在读取选区文字和连接关系，随后按你的要求重新绘制（读取 1 次 + 生图 1 次）。');",
      "onProgress?.('正在用 '+model+' 读取选区文字和连接关系，随后按你的要求重新绘制（读取 1 次 + 生图 1 次）。');"
    ],
    [
      "    return brief;",
      "    return {brief,model};"
    ],
    [
      "gpt-4.1 读取内容 1 次",
      "自动选择当前服务商最新可用的 GPT 视觉模型读取内容 1 次"
    ]
  ],
  "forge/revision-local.mjs": [
    [
      "export const localRedrawReaderModel='gpt-4.1';\n",
      ""
    ]
  ]
};
const sourceHashes={
  "forge/revision-reader-model.mjs": "961f1a6e0c5b307ed683ce7d0c72968e101f7760874470d3cdf2cda9afa6811e",
  "forge/test-revision-reader-model.mjs": "cf19b275963fc5389225114427138549da38e9ac91c58d2647dd375ca5d8b595",
  "forge/test-revision-local.cjs": "079fe8c9f5c6be6aca5d26192b1f2fecc8294e7f53c09a4f9e07e7c20459995d"
};
for(const [file,hash] of Object.entries(sourceHashes)){
 const source=gitBytes('show','HEAD:'+file);
 assert.equal(createHash('sha256').update(source).digest('hex'),hash,'Reviewed reader/test source changed: '+file);
}
const candidates=new Map();
for(const path of payload){
 const candidate=gitBytes('show','HEAD:'+path);
 if(replacements[path]){
  const original=gitBytes('show',baseCommit+':'+path);let expected=original.toString();
  assert.equal(previous.entries.find(e=>e.path===path)?.blob,blobId(original),'Source must equal the exact published module');
  for(const [before,after] of replacements[path]){assert.equal(expected.split(before).length,2);expected=expected.replace(before,after);}
  assert.equal(candidate.toString(),expected,'No changes outside the exact approved reader selection patch');
 }else assert.equal(previous.entries.some(e=>e.path===path),false,'Reader-only module must be new');
 execFileSync(process.execPath,['--check','--input-type=module'],{input:candidate,cwd:root});candidates.set(path,candidate);
}
const temp=mkdtempSync(join(tmpdir(),'redraw-reader-'));
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
const result={baseRun,baseCommit,baseTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,allOtherPublishedBytesIdentical:true,contentExtractionModelOnly:true,imageGenerationAndOutsideProtectionUnchanged:true,exportAndEntrypointUnchanged:true,originalFrozenCheck:'Unchanged; preexisting failures remain failures'};
if(process.argv.includes('--prepare-pages')){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
 const output='/tmp/redraw-reader-pages';assert.equal(existsSync(output),false);mkdirSync(output);
 indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
 for(const e of entries)assert.equal(blobId(readFileSync(join(output,e.path))),e.blob,'Published byte mismatch: '+e.path);
 writeFileSync('/tmp/redraw-reader-proof.json',JSON.stringify({...result,entries},null,2));
 assert.equal(git('status','--porcelain','--untracked-files=all'),'');
}
console.log(JSON.stringify(result,null,2));
