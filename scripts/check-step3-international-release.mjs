// Owner authorization 2026-11-16: isolated international routing in Steps 1-3 only.
// Historical freeze baselines and acceptance programs remain unchanged.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
export const baseCommit='e6cbac0ce9776114cce12689c0866358582624c3';
const baseRun=43864925489;
const baseTree='99e9115756727d4c35fdd6bea407ce9b8dcf130e';
const baseProofSha256='42a9d5c3654d20ecddb1a87140bc2e12aeedfef3695ca1acb603de0ef80f340f';
export const payload=['forge/index.html','forge/step3-initial-image-job.mjs','forge/step3-international-image-route.mjs'];
export const allowed=[...payload,'.github/workflows/deploy.yml','forge/test-step3-international-image-route.mjs','scripts/check-step3-international-release.mjs','scripts/test-step3-international-release.mjs'].sort();
const reviewed={
  "forge/index.html": "6a137da2f6602f8fa2cbbf019518c54ae90928cbe51b80a33875031eecdc62b8",
  "forge/step3-initial-image-job.mjs": "1949518ec25583b3bcc33d2d646dc901cb100dbb227a715ad5486dbc66f718c6",
  "forge/step3-international-image-route.mjs": "ea024f80fb05087e55215d8a9c3360a47c79194c069cdea217be3cc511fb0a02",
  ".github/workflows/deploy.yml": "cb056a49bd3050654d2b6c91cca905c33a4c35425d0633b6d4da815f17bcf0d3",
  "forge/test-step3-international-image-route.mjs": "410d5f1a0f9040370d5ba02c7a33e9e5e6a7e24d656e0c7a09a6715c11b72b18",
  "scripts/test-step3-international-release.mjs": "229fff622d516059937a506cbdb963ec23f31caa2f5b96af84f87484f58cddf4"
};
const gitBytes=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:40*1024*1024});
const git=(...args)=>gitBytes(...args).toString().trim();
const blobId=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const normalized=bytes=>bytes.toString().replace(/\r\n/g,'\n');
export function assertScope(paths){assert.deepEqual([...paths].sort(),allowed,'Only the authorized preflight, tests and independent publisher may change');}
export function assertArtifact(paths){assert.deepEqual([...paths].sort(),payload,'Every other published file must remain byte-identical');}
const entryEdits=[
  [
    "import {step3ImageResolutions,assertStep3ImageResolution,step3ImageDimensions,step3NativePixelsMatch} from './step3-image-capabilities.mjs?v=20261116-nonelinear-preflight';\nimport {usesInfistarImageJob,acknowledgeInfistarImageJob,showInfistarJobProgress} from './step3-infistar-job.mjs?v=20261114-durable-jobs';\nimport {requestInfistarImageJob} from './step3-initial-image-job.mjs?v=20261116-initial-read-recovery';\nimport {prepareStep3ImageBody,protocolFetch,imageResultItem} from './step3-image-protocol.mjs?v=20261115-endpoints';\nimport {step3ReferenceInputs} from './step3-reference-input.mjs?v=20261114-errors';\nimport {createRevisionGallery,generateRevision} from './revision-gallery.mjs?v=20261115-endpoints';",
    "import {step3ImageResolutions,assertStep3ImageResolution,step3ImageDimensions,step3NativePixelsMatch} from './step3-image-capabilities.mjs?v=20261116-nonelinear-preflight';\nimport {usesInfistarImageJob,acknowledgeInfistarImageJob,showInfistarJobProgress} from './step3-infistar-job.mjs?v=20261114-durable-jobs';\nimport {requestInfistarImageJob} from './step3-initial-image-job.mjs?v=20261116-initial-read-recovery';\nimport {internationalGalleryBase} from './step3-international-image-route.mjs?v=20261116-international1';\nimport {prepareStep3ImageBody,protocolFetch,imageResultItem} from './step3-image-protocol.mjs?v=20261115-endpoints';\nimport {step3ReferenceInputs} from './step3-reference-input.mjs?v=20261114-errors';\nimport {createRevisionGallery,generateRevision} from './revision-gallery.mjs?v=20261115-endpoints';"
  ],
  [
    "$('#reconReasoningEffort').onchange=e=>localStorage.setItem('ff_recon_reasoning_effort_'+$('#provider').value,e.target.value);\n\nasync function callPdfParser(mode, payload){\n  const c=cfg(), base=baseURL(), key=cleanKey($('#key').value), model=parserModel();\n  if(!base||!key||!model) throw new Error(tt('ps.nocfg'));\n  // Isolated PDF-only official Responses transport; shared generation/export stays unchanged.\n  const officialPdf = async body => {",
    "$('#reconReasoningEffort').onchange=e=>localStorage.setItem('ff_recon_reasoning_effort_'+$('#provider').value,e.target.value);\n\nasync function callPdfParser(mode, payload){\n  const c=cfg(), key=cleanKey($('#key').value), model=parserModel();\n  const base=internationalGalleryBase(baseURL(),{provider:$('#provider').value,model,stage:'parse'});\n  if(!base||!key||!model) throw new Error(tt('ps.nocfg'));\n  // Isolated PDF-only official Responses transport; shared generation/export stays unchanged.\n  const officialPdf = async body => {"
  ],
  [
    "  return step3CatalogController ||= createStep3ModelCatalog({\n    select:$('#model'),analysisSelect:$('#analyzeModel'),status:$('#step3CatalogStatus'),\n    readConfig:()=>{\n      const provider=$('#provider').value,c=cfg(),base=baseURL();\n      return {provider,base,key:cleanKey($('#key').value),proto:c.proto,mode,\n        chat:c.chat||[],image:c.image||[],vision:c.vision||[],\n        snapshotAllowed:provider==='nonelinear'&&base===(MAN.providers.nonelinear.base||'').replace(/\\/+$/,'')};",
    "  return step3CatalogController ||= createStep3ModelCatalog({\n    select:$('#model'),analysisSelect:$('#analyzeModel'),status:$('#step3CatalogStatus'),\n    readConfig:()=>{\n      const provider=$('#provider').value,c=cfg(),base=internationalGalleryBase(baseURL(),{provider,stage:'catalog'});\n      return {provider,base,key:cleanKey($('#key').value),proto:c.proto,mode,\n        chat:c.chat||[],image:c.image||[],vision:c.vision||[],\n        snapshotAllowed:provider==='nonelinear'&&base===(MAN.providers.nonelinear.base||'').replace(/\\/+$/,'')};"
  ],
  [
    "  return parserCatalogController ||= createParserModelCatalog({\n    select:$('#parseModel'),status:$('#parserCatalogStatus'),\n    readConfig:()=>{\n      const provider=$('#provider').value,c=cfg(),base=baseURL();\n      $('#parseCustomModelRow').hidden=provider!=='custom';\n      return {provider,base,key:cleanKey($('#key').value),proto:c.proto,\n        defaults:[...(c.chat||[]),...(c.vision||[])],",
    "  return parserCatalogController ||= createParserModelCatalog({\n    select:$('#parseModel'),status:$('#parserCatalogStatus'),\n    readConfig:()=>{\n      const provider=$('#provider').value,c=cfg(),base=internationalGalleryBase(baseURL(),{provider,stage:'catalog'});\n      $('#parseCustomModelRow').hidden=provider!=='custom';\n      return {provider,base,key:cleanKey($('#key').value),proto:c.proto,\n        defaults:[...(c.chat||[]),...(c.vision||[])],"
  ],
  [
    "  const ordered=[...refs];\n  const uris=await refDataURIs();\n  const c=cfg(), relay=relayBase();\n  const useAnthropic=c.proto==='anthropic'&&!relay;\n  let txt;\n  if(useAnthropic){\n    const blocks=uris.map(u=>{const p=dataURIToParts(u);return {type:'image',source:{type:'base64',media_type:p.media,data:p.data}};});\n    blocks.push({type:'text',text:buildAnalyzePrompt(ordered.length, ordered)});\n    const body={model:$('#analyzeModel').value||$('#model').value,max_tokens:16000,system:ANALYZE_SYS,messages:[{role:'user',content:blocks}]};\n    const r=await fetchWithTimeout(baseURL()+'/v1/messages',{method:'POST',headers:anthropicHeaders(cleanKey($('#key').value)),body:JSON.stringify(withReasoning(body,'visual'))});\n    txt=await r.text(); if(!r.ok) throw new Error(friendlyHttp(r.status,txt));\n    const d=JSON.parse(txt); txt=(d.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');\n  }else{",
    "  const ordered=[...refs];\n  const uris=await refDataURIs();\n  const c=cfg(), relay=relayBase();\n  const internationalBase=model=>internationalGalleryBase(baseURL(),{provider:$('#provider').value,model,stage:'visual'});\n  const useAnthropic=c.proto==='anthropic'&&!relay;\n  let txt;\n  if(useAnthropic){\n    const blocks=uris.map(u=>{const p=dataURIToParts(u);return {type:'image',source:{type:'base64',media_type:p.media,data:p.data}};});\n    blocks.push({type:'text',text:buildAnalyzePrompt(ordered.length, ordered)});\n    const body={model:$('#analyzeModel').value||$('#model').value,max_tokens:16000,system:ANALYZE_SYS,messages:[{role:'user',content:blocks}]};\n    const r=await fetchWithTimeout(internationalBase(body.model)+'/v1/messages',{method:'POST',headers:anthropicHeaders(cleanKey($('#key').value)),body:JSON.stringify(withReasoning(body,'visual'))});\n    txt=await r.text(); if(!r.ok) throw new Error(friendlyHttp(r.status,txt));\n    const d=JSON.parse(txt); txt=(d.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');\n  }else{"
  ],
  [
    "    const body={model:am,temperature:0.2,max_tokens:16000,messages:[{role:'system',content:ANALYZE_SYS},{role:'user',content:parts}]};\n    if($('#provider').value==='ark' && !relayBase()) body.thinking={type:'disabled'};\n    let r;\n    try{ r=await postJSON(baseURL(),'/chat/completions',withReasoning(body,'visual'),cleanKey($('#key').value)); }\n    catch(e){\n      if(e.name==='TimeoutError') throw new Error(tt('analyze.timeout'));\n      const diag=await diagnoseConnection(baseURL(),cleanKey($('#key').value),am);\n      throw new Error(diag || tt('analyze.blocked'));\n    }\n    txt=await r.text(); if(!r.ok) throw new Error(friendlyHttp(r.status,txt));",
    "    const body={model:am,temperature:0.2,max_tokens:16000,messages:[{role:'system',content:ANALYZE_SYS},{role:'user',content:parts}]};\n    if($('#provider').value==='ark' && !relayBase()) body.thinking={type:'disabled'};\n    let r;\n    try{ r=await postJSON(internationalBase(am),'/chat/completions',withReasoning(body,'visual'),cleanKey($('#key').value)); }\n    catch(e){\n      if(e.name==='TimeoutError') throw new Error(tt('analyze.timeout'));\n      const diag=await diagnoseConnection(internationalBase(am),cleanKey($('#key').value),am);\n      throw new Error(diag || tt('analyze.blocked'));\n    }\n    txt=await r.text(); if(!r.ok) throw new Error(friendlyHttp(r.status,txt));"
  ],
  [
    "    if(!model){ showErr(tt('gen.nomodel')); return; }\n    if(mode==='image' && !step3Catalog().isImageModel(model)){ showErr(tt('gen.needimage')); return; }\n  }\n  if(mode==='image'){\n    try{\n      step3ImageDimensions(p,model,$('#figureRatio').value,$('#imageResolution').value,usesInfistarGemini(base,model));",
    "    if(!model){ showErr(tt('gen.nomodel')); return; }\n    if(mode==='image' && !step3Catalog().isImageModel(model)){ showErr(tt('gen.needimage')); return; }\n  }\n  base=internationalGalleryBase(base,{provider:p,model,stage:'generate'});\n  if(mode==='image'){\n    try{\n      step3ImageDimensions(p,model,$('#figureRatio').value,$('#imageResolution').value,usesInfistarGemini(base,model));"
  ],
  [
    "function revisionConfiguration(version, validate=true){\n  const svg=version.source==='svg',p=$('#provider').value;\n  const model=($('#model').value==='custom'?$('#customModel').value:$('#model').value).trim();\n  const route={p,model,base:baseURL(),proto:cfg().proto,ratio:$('#figureRatio').value,resolution:$('#imageResolution').value};\n  const key=cleanKey($('#key').value);\n  if(validate){\n    if(mode!==(svg?'svg':'image'))throw new Error(svg?'请在步骤三选择「SVG 可编辑初稿」，并选择视觉模型。':'请在步骤三选择「AI 位图初稿」，并选择图像模型。');",
    "function revisionConfiguration(version, validate=true){\n  const svg=version.source==='svg',p=$('#provider').value;\n  const model=($('#model').value==='custom'?$('#customModel').value:$('#model').value).trim();\n  const route={p,model,base:internationalGalleryBase(baseURL(),{provider:p,model,stage:'revision'}),proto:cfg().proto,ratio:$('#figureRatio').value,resolution:$('#imageResolution').value};\n  const key=cleanKey($('#key').value);\n  if(validate){\n    if(mode!==(svg?'svg':'image'))throw new Error(svg?'请在步骤三选择「SVG 可编辑初稿」，并选择视觉模型。':'请在步骤三选择「AI 位图初稿」，并选择图像模型。');"
  ]
];
export function assertEntry(actual,before){
 let expected=normalized(before);
 for(const [from,to] of entryEdits){assert.equal(expected.split(from).length,2,"Authorized entry anchor must occur once");expected=expected.replace(from,to);}
 assert.equal(normalized(actual),expected,"Entrypoint changed outside authorized Steps 1-3 routing");
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
  const original=p!=='forge/step3-international-image-route.mjs'?gitBytes('show',baseCommit+':'+p):null;if(original)assert.equal(previous.entries.find(e=>e.path===p)?.blob,blobId(original),'Source must equal published bytes: '+p);else assert.equal(previous.entries.some(e=>e.path===p),false,'International route module must be new');
  const bytes=working?Buffer.from(normalized(readFileSync(join(root,p)))):gitBytes('show','HEAD:'+p);
  if(p==='forge/index.html')assertEntry(bytes,original);
  else execFileSync(process.execPath,['--check','--input-type=module'],{input:bytes,cwd:root});
  candidates.set(p,bytes);
 }
 const temp=mkdtempSync(join(tmpdir(),'step3-initial-read-'));let priorAdded=false;
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
  const result={baseRun,baseCommit,baseTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,allOtherPublishedBytesIdentical:true,entryLimitedToAuthorizedSteps123Routing:true,historicalAcceptanceAndTestsUnchanged:true,step4Unchanged:true,originalFrozenCheck:'Unchanged; existing failures remain failures',entries};
  if(process.argv.includes('--prepare-pages')){
   const output='/tmp/step3-international-pages';assert.equal(existsSync(output),false,'Refuse overwrite');mkdirSync(output);
   indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
   for(const e of entries)assert.equal(blobId(readFileSync(join(output,e.path))),e.blob,'Export mismatch: '+e.path);
   writeFileSync('/tmp/step3-international-proof.json',JSON.stringify(result,null,2));assert.equal(git('status','--porcelain','--untracked-files=all'),'');
  }
  console.log(JSON.stringify({...result,entries:undefined},null,2));
 }finally{
  if(priorAdded)git('worktree','remove','--force',join(temp,'historical'));
  assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep));rmSync(temp,{recursive:true,force:true});
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
