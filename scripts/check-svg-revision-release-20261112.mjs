// Owner-authorized independent revision edit release. Frozen code, manifests and original checkers are unchanged.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const parent="08d923cbd959564fd1dfce6eba2db80415b34fd9";
// Exact tree produced by the successfully deployed parent release's --prepare-pages.
const publishedTree="82b088acbbe4223e27ca9d544990ae3a76a8e7a1";
const liveBase='7e089379d187af99271d0d7de8ae50c2b128dc2f';
const expected={
  "forge/index.html": "f3fcd08647bff6a6b1410a8ff1e64f8aabc74cb1540467db7a2dad7eb8490493",
  "forge/revision-gallery.mjs": "44722fc700cb3b34728a308f4dadf7b8124d28b684bbfc1c86c2b792fcc60c52",
  "forge/svg-revision.mjs": "97aae113f18b2643b33e0449ea910a6e8989e492bb1c63f24f612f4157033e4d",
  "forge/test-revision-gallery.cjs": "da8f1ffe89ff8c1e392adf1efc1b6632d2115d05fe2817d75cee5b6049071459",
  "forge/test-svg-revision.cjs": "9fe51acc101efff5a1591bb13791e52397d195e175eeccd99ff9ca4857a7b616",
  ".github/workflows/deploy.yml": "6c29cbc5fe2b6cb82605d9427c31323f756afa79c0cb8b41af8b4e57ed94e45b",
  ".github/workflows/forge-workflow-lock.yml": "48b3e0cb03e65e7b2790c69393fea3dbf6226d4a858aa0e84a29a085dc911696"
};
const check='scripts/check-svg-revision-release-20261112.mjs';
const module='forge/revision-gallery.mjs';
const artifactChanges=['forge/index.html',module,'forge/svg-revision.mjs'].sort();
const changed=(...args)=>git('diff','--name-only','--no-renames',...args,'--').split('\n').filter(Boolean).sort();
const staged=process.argv.includes('--staged');
const revision=staged?':':'HEAD:';
assert.equal(staged?git('rev-parse','HEAD'):git('show','-s','--format=%P','HEAD'),parent,'Unexpected release parent');
assert.deepEqual(changed(...(staged?['--cached',parent]:[parent,'HEAD'])),[...Object.keys(expected),check].sort(),'Unexpected release scope');
assert.equal(git('status','--porcelain','--untracked-files=all').split('\n').filter(Boolean).length,staged?Object.keys(expected).length+1:0,'Unexpected working tree changes');
for(const [path,hash] of Object.entries(expected)){
 const committed=execFileSync('git',['show',revision+path],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
 assert.equal(createHash('sha256').update(committed).digest('hex'),hash,'Unreviewed patch: '+path);
 assert.equal(readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n'),committed,'Unstaged change: '+path);
}
// Exact authorized interface hooks only: reversing them reproduces the entire parent file.
const hooks=[["import {createRevisionGallery,generateRevision} from './revision-gallery.mjs?v=20261112';\n", "import {createRevisionGallery,generateRevision} from './revision-gallery.mjs?v=20261112-svg';\nimport {svgVersion,generateSVGRevision} from './svg-revision.mjs?v=20261112';\n"], ["", "function revisionConfiguration(version, validate=true){\n  const svg=version.source==='svg',p=$('#provider').value;\n  const model=($('#model').value==='custom'?$('#customModel').value:$('#model').value).trim();\n  const route={p,model,base:baseURL(),proto:cfg().proto,ratio:$('#figureRatio').value,resolution:$('#imageResolution').value};\n  const key=cleanKey($('#key').value);\n  if(validate){\n    if(mode!==(svg?'svg':'image'))throw new Error(svg?'请在步骤三选择「SVG 可编辑初稿」，并选择视觉模型。':'请在步骤三选择「AI 位图初稿」，并选择图像模型。');\n    if(!model || (svg?!isVisualChatModel(model,cfg().vision||[]):!(kindOf(model)==='image'||(cfg().image||[]).includes(model))))throw new Error(svg?'请在步骤三选择支持图像输入的视觉模型。':'请在步骤三选择图像模型。');\n    if(!key)throw new Error('请先填写当前服务商的 API Key。');\n    if(!/^https?:\\/\\//.test(route.base))throw new Error('请先配置有效的服务商接口地址。');\n  }\n  return {route,key};\n}\n"], ["", "  isCurrent:v=>v.source==='svg'?ensureExportState().source==='svg'&&ensureExportState().baseSvg===v.svg:ensureExportState().source!=='svg'&&currentStep3Bitmap()===v.image,\n  modelLabel:v=>{let label='修改模型：'+(revisionConfiguration(v,false).route.model||'未选择')+' · '+(v.source==='svg'?'视觉模型':'图像模型');try{revisionConfiguration(v);}catch(e){label+='（'+e.message+'）';}return label;},\n"], ["", "    if(v.source==='svg'){\n      if(v.state?.svg){window.__ffExportState=structuredClone(v.state);renderEditableExportCard();}\n      else showEditableExportStep(v.svg);\n      return;\n    }\n"], ["  generate:(parent,prompt)=>generateRevision(parent,prompt,{\n    key:cleanKey(parent.route.p===$('#provider').value?$('#key').value:localStorage.getItem('ff_key_'+parent.route.p)),\n    toDataURL:ensureBitmapDataUrl,loadImage}),\n", "  generate:async(parent,prompt)=>{\n    const {route,key}=revisionConfiguration(parent);\n    const input={...parent,route};\n    if(parent.source==='svg')return generateSVGRevision(input,prompt,{route,key,post:async(path,body)=>{\n      const response=route.proto==='anthropic'?await fetchWithTimeout(route.base+path,{method:'POST',headers:anthropicHeaders(key),body:JSON.stringify(body)},240000):await postJSON(route.base,path,body,key,240000);\n      if(!response.ok)throw new Error('SVG 修改请求失败（HTTP '+response.status+'）');\n      return response.json();\n    }});\n    return {...await generateRevision(input,prompt,{key,toDataURL:ensureBitmapDataUrl,loadImage}),route};\n  },\n"], ["  download:async v=>{try{const response=await fetch(v.image);if(!response.ok)throw new Error('download');\n", "  download:async v=>{if(v.source==='svg'){downloadBlob('figure-forge-v'+v.number+'.svg',new Blob([v.svg],{type:'image/svg+xml'}));return;}try{const response=await fetch(v.image);if(!response.ok)throw new Error('download');\n"], ["", "for(const id of ['modeTabs','model','customModel','provider','baseOverride','key']){\n  $('#'+id)?.addEventListener(id==='modeTabs'?'click':'change',()=>queueMicrotask(()=>revisionGallery.refresh()));\n}\n"], ["  const blob = new Blob([svg],{type:'image/svg+xml'});\n  const url = URL.createObjectURL(blob);\n  const n = (useIds||[...refs]).length;\n  const auditNote = auditRes ? auditSummaryText(auditRes) : '';\n  $('#out').style.display='block';\n  $('#out').innerHTML = `<iframe sandbox title=\"SVG preview\"></iframe>\n    <div class=\"dl\"><a class=\"btn-primary\" href=\"${url}\" download=\"figure-forge-draft.svg\">${tt('svg.download')}</a>\n    <span class=\"hint\">${usedVision?tt('svg.hint1',{n:n}):tt('svg.hint2')}${truncated?tt('svg.trunc'):''}${auditNote}</span></div>`;\n  const frame=$('#out iframe');\n  if(frame) frame.srcdoc=svgPreviewDocument(svg);\n  showEditableExportStep(svg);\n", "  try{\n    const result=revisionGallery.addInitial({...svgVersion(svg),route:revisionConfiguration({source:'svg'},false).route});\n    result.catch(error=>showErr(error.message));\n    return result;\n  }catch(error){showErr(error.message);throw error;}\n"]];
let indexText=execFileSync('git',['show',revision+'forge/index.html'],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
for(const [before,after] of hooks){assert.equal(indexText.split(after).length,2,'Ambiguous hook');indexText=indexText.replace(after,before);}
assert.equal(indexText,execFileSync('git',['show',parent+':forge/index.html'],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n'),'Frozen code changed outside approved hooks');
const published=['README.md','forge/assets/nonelinear-wechat.png','forge/index.html','assets/i18n_gallery.js','index.html',module].sort();
for(const path of published.filter(p=>!artifactChanges.includes(p)))assert.equal(git('rev-parse',revision+path),git('rev-parse',parent+':'+path),'Changed published content: '+path);
// Derive the previous artifact from the approved parent without consulting dirty files.
// An isolated temporary index also proves the new artifact changes just one file.
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const temp=mkdtempSync(join(tmpdir(),'revision-release-'));
let artifactTree;
try{
 const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
 const indexGit=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',env}).trim();
 indexGit('read-tree',liveBase);
 const setBlob=(path,rev)=>{
  const entry=git('ls-tree',rev,'--',path);
  const match=entry.match(/^(\d+) blob ([0-9a-f]+)\t(.+)$/);assert.ok(match,'Missing artifact file: '+path);
  indexGit('update-index','--add','--cacheinfo',match[1],match[2],path);
 };
 for(const path of published)setBlob(path,parent);
 assert.equal(indexGit('write-tree'),publishedTree,'Previous deployment tree changed');
 // For staged validation the source blob is already in the real index.
 for(const path of artifactChanges)indexGit('update-index','--add','--cacheinfo','100644',git('rev-parse',revision+path),path);
 artifactTree=indexGit('write-tree');
 assert.deepEqual(changed(publishedTree,artifactTree),artifactChanges,'Only approved SVG revision files may change online');
}finally{rmSync(temp,{recursive:true,force:true});}
if(process.argv.includes('--prepare-pages')){
 assert.equal(process.env.GITHUB_ACTIONS,'true');
 assert.equal(process.env.GITHUB_REF,'refs/heads/main');
 assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
 const restore=changed(liveBase,'HEAD').filter(path=>![...published,'forge/svg-revision.mjs'].includes(path));
 git('restore','--source='+liveBase,'--staged','--worktree','--ignore-skip-worktree-bits','--',...restore);
 assert.equal(git('write-tree'),artifactTree,'Unexpected published artifact');
 assert.deepEqual(changed('--cached',publishedTree),artifactChanges,'Unexpected online changes');
 git('diff','--exit-code');
}
console.log('Verified isolated SVG revision release: only '+artifactChanges.join(', ')+' changes online; Step 4 code, original baseline and all other published files unchanged. Artifact tree: '+artifactTree);
