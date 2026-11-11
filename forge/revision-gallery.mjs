import {usesInfistarGemini,geminiImageRequest,geminiImageResult,compatibleImageRequest,requestImageWithRecovery,imageRequestDiagnostics} from './image-api.mjs?v=20261026-nonelinear-resolution';
import {imageRequestDimensions,verifyImageRatio,verifyImageResolution} from './aspect-ratio.mjs?v=20261026-nonelinear-resolution';

// Separate image-edit request: chosen full bitmap first, optional screenshot references after it.
// This module never calls or configures the editable reconstruction pipeline.
export function revisionInstruction(prompt,count){
  return `本次任务：根据用户要求编辑图片并输出完整的新图。
用户要求：${prompt}

The first image is the complete figure to edit. ${count>1?`Images 2 through ${count} are screenshots explaining the requested edits, possibly cropped or marked.`:'There are no extra screenshots.'}
以第一张图为内容基础，结合其他截图定位用户指定的区域。截图中的红框、箭头和界面仅作说明，不要画入结果；do not assume every screenshot requests deletion.
必须落实用户要求的增删、替换或文字修改。如果要求删除，删除指定内容本身及失效连线；如果要求重新排版，重新调整保留内容的大小、位置和连线，充分利用画布，不留删除后的空洞。保留未要求改变的信息与科学含义。输出符合指定画布比例的完整图片。检查结果已包含用户要求的实际改动，不能直接复刻输入图。

USER REQUEST (verbatim):\n${prompt}`;
}

const imageData=/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/;
// NoneLinear's image API accepts public HTTPS references, not data URLs.
// Upload only to the provider's documented endpoint; never forward credentials
// to the returned storage URL or silently fall back to text-only generation.
async function uploadRevisionReference(data,key,index){
  const [,type,bytes]=data.match(/^data:image\/(png|jpeg|webp);base64,([\s\S]+)$/);
  let response;
  try{
    response=await fetch('https://nonelinear.com.cn/api/upload-file',{
      method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify({image:bytes.replace(/[\r\n]/g,''),type:'.'+(type==='jpeg'?'jpg':type)}),
      signal:AbortSignal.timeout(60000)
    });
  }catch{throw new Error('第 '+(index+1)+' 张修改参考图上传失败，本次未调用生图 API；请检查网络后手动重试。');}
  if(!response.ok)throw new Error('第 '+(index+1)+' 张修改参考图上传失败（HTTP '+response.status+'），本次未调用生图 API。');
  let url;
  try{
    const data=await response.json();url=new URL(data.url);
    if(url.protocol!=='https:'||url.username||url.password||url.port||
      !url.hostname.includes('.')||/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url.hostname))throw new Error();
  }catch{throw new Error('参考图上传未返回有效的公网 HTTPS 地址，本次未调用生图 API。');}
  return url.href;
}
async function fingerprint(value){
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');
}

// Private output path: never change the frozen Step 3/4 source-image relay.
async function revisionOutput(image,provider,toDataURL){
  if(provider!=='nonelinear'||image.startsWith('data:'))return toDataURL(image);
  let url;try{url=new URL(image);}catch{throw new Error('服务商返回了无效图片地址。');}
  if(url.protocol!=='https:'||url.hostname!=='imagen-nonelinear-2025.tos-cn-beijing.volces.com'||url.port||url.username||url.password||url.search||url.hash||!/^\/(?:others|gemini)\/[A-Za-z0-9_-]+\.(?:png|jpe?g|webp)$/.test(url.pathname))return toDataURL(image);
  const response=await fetch('https://gallery-revision-images.lixiao-gallery.workers.dev/revision-image',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:url.href}),
    credentials:'omit',redirect:'error',signal:AbortSignal.timeout(90000)
  });
  if(!response.ok)throw new Error('修改图接收失败（HTTP '+response.status+'），未保存新版本。');
  const blob=await response.blob();
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('修改图读取失败。'));reader.readAsDataURL(blob);});
}

// Exact decoded-pixel comparison also detects an original re-encoded as PNG/WebP.
// No similarity threshold: a legitimate one-character or small-area edit is allowed.
async function samePixels(left,right,loadImage){
  if(left===right)return true;
  const a=await loadImage(left),b=await loadImage(right);
  const width=a.naturalWidth||a.width,height=a.naturalHeight||a.height;
  if(width!==(b.naturalWidth||b.width)||height!==(b.naturalHeight||b.height))return false;
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=Math.min(128,height);
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw new Error('无法检查修改图，请使用支持 Canvas 的浏览器。');
  for(let y=0;y<height;y+=canvas.height){
    const h=Math.min(canvas.height,height-y);
    ctx.clearRect(0,0,width,canvas.height);ctx.drawImage(a,0,y,width,h,0,0,width,h);
    const first=ctx.getImageData(0,0,width,h).data;
    ctx.clearRect(0,0,width,canvas.height);ctx.drawImage(b,0,y,width,h,0,0,width,h);
    const second=ctx.getImageData(0,0,width,h).data;
    if(first.some((n,i)=>n!==second[i]))return false;
  }
  return true;
}

export async function generateRevision(parent,prompt,{key,toDataURL,loadImage}){
  const {base,model:requestedModel,p,ratio,resolution}=parent.route;
  // Infistar retired the preview ID; this is its current name, not a model-family fallback.
  const model=usesInfistarGemini(base,requestedModel)&&requestedModel==='gemini-3.1-flash-image-preview'?'gemini-3.1-flash-image':requestedModel;
  if(!key)throw new Error('请先填写该服务商的 API Key。');
  if(typeof prompt!=='string'||!prompt.trim())throw new Error('请填写本次修改要求。');
  const source=await toDataURL(parent.image);
  const references=[source,...(parent.attachments||[]).map(item=>item.data)];
  if(references.length>5||references.some(data=>typeof data!=='string'||!imageData.test(data)))
    throw new Error('待修改原图或截图无效，请重新选择；本次未发送请求。');
  const native=usesInfistarGemini(base,model);
  const dimensions=imageRequestDimensions(p,model,ratio,resolution,native);
  const instruction=revisionInstruction(prompt,references.length);
  const inputHashes=await Promise.all(references.map(fingerprint));
  const startedAt=Date.now(),clientRequestId=crypto.randomUUID();
  try{
    const apiReferences=[];
    for(const [index,data] of references.entries())apiReferences.push(p==='nonelinear'?await uploadRevisionReference(data,key,index):data);
    let body={model,prompt:instruction,image:p==='sf'&&!native&&references.length===1?source:apiReferences};
    if(!native){body[dimensions.field]=dimensions.value;if(dimensions.aspectRatio)body.aspect_ratio=dimensions.aspectRatio;}
    // Infistar GPT edits use the same multipart image[] protocol as OpenAI.
    // Keep this override private: the shared Step 3/4 adapter stays frozen.
    const multipartGPT=p!=='nonelinear'&&/^gpt-image-/i.test(model);
    const request=native?geminiImageRequest(base,model,instruction,references,dimensions):
      compatibleImageRequest(body,multipartGPT?'':base,multipartGPT?'':p);
    const revisionBase=p==='nonelinear'&&base==='https://gallery-nonelinear-relay.lixiao-gallery.workers.dev/v1'?'https://gallery-revision-images.lixiao-gallery.workers.dev/v1':(request.base||base);
    const url=revisionBase+request.endpoint;
    const transport=imageRequestDiagnostics(url,request.body);
    if(transport.referenceCount!==references.length)throw new Error('修改请求未完整包含原图和截图，本次未发送。');
    const response=await requestImageWithRecovery({url,body:request.body,key,usedReferences:true,allowReferenceFallback:false});
    if(!response.ok)throw new Error('修改生图失败（HTTP '+response.status+'）。'+response.text.slice(0,400));
    const data=JSON.parse(response.text);
    if(data._revisionUpstreamStatus>=400)throw new Error('修改生图失败（HTTP '+data._revisionUpstreamStatus+'）。'+JSON.stringify(data.error||{}).slice(0,400));
    const item=native?geminiImageResult(data,{locale:'zh',requestId:response.requestId}):(data?.data?.[0]||data?.images?.[0]);
    const image=item?.b64_json?`data:${item.mimeType||'image/png'};base64,${item.b64_json}`:item?.url;
    if(!image)throw new Error('服务商未返回图片，未自动重试。');
    const output=await revisionOutput(image,p,toDataURL);
    if(await samePixels(source,output,loadImage))throw new Error('修改未生效：API 返回的图片与原图像素相同，未保存新版本。请调整要求后手动重试；不会自动重复计费。');
    for(const screenshot of references.slice(1)){
      if(await samePixels(screenshot,output,loadImage))throw new Error('API 返回了上传的示意截图，未生成完整修改图，未保存新版本。');
    }
    const loaded=await loadImage(output),width=loaded.naturalWidth||loaded.width,height=loaded.naturalHeight||loaded.height;
    if(!verifyImageRatio(width,height,ratio)||!verifyImageResolution(width,height,resolution,dimensions.field==='size'?dimensions.value:null))
      throw new Error('修改图的比例或分辨率与所选版本不符，未替换任何已有结果。');
    return {image:output,width,height,revisionAudit:{clientRequestId,startedAt,completedAt:Date.now(),
      provider:p,model,requestedModel,apiRequestCount:1,endpoint:transport.endpoint,format:transport.format,referenceCount:references.length,
      referenceTransport:p==='nonelinear'?'https-upload':'inline',uploadedReferenceCount:p==='nonelinear'?apiReferences.length:0,
      inputHashes,promptHash:await fingerprint(prompt),instructionHash:await fingerprint(instruction),
      requestId:String(response.requestId||'').replaceAll(key,'[redacted]').slice(0,160),
      status:response.status,pixelCheck:'changed',review:'pending'}};
  }catch(error){
    error.message=String(error.message).split(key).join('[redacted]').replace(/Bearer\s+\S+/gi,'Bearer [redacted]');
    throw error;
  }
}

// Semantic completion is reviewed by the user; changed pixels alone cannot prove it.
function reviewRevision(parent,result,prompt,references,host){
  return new Promise(resolve=>{
    const dialog=document.createElement('section');dialog.className='ff-revision-review';dialog.setAttribute('aria-label','本次修改结果');
    const title=document.createElement('h3');title.textContent='核对本次修改结果';
    const hint=document.createElement('p');hint.textContent='请按本次要求逐项检查指定内容和排版。像素有变化不代表所有要求都已完成；确认后才保存新版本。';
    const request=document.createElement('pre');request.textContent=prompt;
    const grid=document.createElement('div');grid.className='ff-revision-compare';
    const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='展开原图、截图和请求信息';details.append(summary,request);
    for(const [label,src] of [['待修改图 · V'+parent.number,parent.image],['API 返回的修改图',result.image],...references.map((item,i)=>['参考截图 '+(i+1),item.data])]){
      const figure=document.createElement('figure'),caption=document.createElement('figcaption'),img=document.createElement('img');
      caption.textContent=label;img.src=src;img.alt=label;figure.append(caption,img);grid.append(figure);
    }
    const audit=document.createElement('p'),a=result.revisionAudit;
    audit.textContent=a?`API 已响应：HTTP ${a.status} · 原图 1 张 + 截图 ${a.referenceCount-1} 张 · ${a.model}${a.requestId?' · 请求 ID：'+a.requestId:''}`:'请核对返回图片。';
    const actions=document.createElement('div');actions.className='ff-revision-review-actions';
    const reject=document.createElement('button'),accept=document.createElement('button');
    reject.type=accept.type='button';reject.dataset.revisionReject='true';accept.dataset.revisionAccept='true';
    reject.textContent='未符合要求，保留输入';accept.textContent='确认符合要求，保存新版本';
    const finish=accepted=>{dialog.remove();resolve(accepted);};
    reject.onclick=()=>finish(false);accept.onclick=()=>finish(true);
    const output=grid.children[1];grid.removeChild(output);details.append(audit,grid);
    actions.append(reject,accept);dialog.append(title,hint,output,actions,details);host.append(dialog);
  });
}

function historyStore(){
  let db;
  const open=new Promise(resolve=>{
    try{const r=indexedDB.open('figureforge-revisions',1);
      r.onupgradeneeded=()=>r.result.createObjectStore('versions',{keyPath:'id'});
      r.onsuccess=()=>resolve(db=r.result);r.onerror=()=>resolve(null);
    }catch{resolve(null);}
  });
  return {async read(){const d=await open;if(!d)return [];
    return new Promise(resolve=>{const r=d.transaction('versions').objectStore('versions').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>resolve([]);});
  },async write(version){const d=await open;if(!d)throw new Error('历史记录存储不可用');
    return new Promise((resolve,reject)=>{const tx=d.transaction('versions','readwrite');tx.objectStore('versions').put(version);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
  },async remove(id){const d=await open;if(!d)throw new Error('历史记录存储不可用');
    return new Promise((resolve,reject)=>{const tx=d.transaction('versions','readwrite');tx.objectStore('versions').delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
  }};
}

export function createRevisionGallery(adapter){
  const versions=[],store=historyStore();
  let active=null,editing=null,job=null,generating=false,reading=0,deleting=false,nextNumber=1,mounted=false,root,panel,list,textarea,error,submit,storageHint,attachments,fileInput;
  const busy=()=>!!job||adapter.busy();
  function mount(){
    if(mounted){if(!root.isConnected){adapter.output.replaceChildren(root);adapter.output.style.display='block';}return;}mounted=true;
    const style=document.createElement('style');
    style.textContent=`.ff-revisions{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:18px;align-items:start}.ff-version{border:1px solid #dedbf5;border-radius:14px;background:white;padding:14px;margin-bottom:18px}.ff-version.selected{border-color:#7860ec;box-shadow:0 0 0 2px #ede9ff}.ff-version header{display:flex;gap:12px;align-items:center;margin-bottom:12px}.ff-version small{color:#73788c}.ff-version img{width:100%;height:auto;border-radius:8px}.ff-version footer{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px}.ff-version button,.ff-revision-editor button{padding:9px 14px;border-radius:9px;border:1px solid #ddd6ff;background:#f3efff;color:#6944db;cursor:pointer;font:inherit}.ff-version button:disabled,.ff-revision-editor button:disabled{opacity:.5;cursor:default}.ff-version [data-build]{margin-left:auto}.ff-revision-editor{position:sticky;top:18px;padding:18px;border:1px solid #e1dcff;border-radius:14px;background:#faf9ff}.ff-revision-editor h3{margin:0 0 14px;color:#6642d9}.ff-revision-editor textarea{box-sizing:border-box;width:100%;min-height:165px;resize:vertical;margin:14px 0;padding:12px;border:1px solid #dcd5ef;border-radius:10px;font:inherit}.ff-revision-editor button{width:100%;background:#7552e8;color:white}.ff-revision-error{color:#b42338;font-size:13px;white-space:pre-wrap}.ff-revision-storage{grid-column:1/-1;color:#9b6216;font-size:13px}@media(max-width:850px){.ff-revisions{grid-template-columns:1fr}.ff-revision-editor{position:static;grid-row:1}}`;
    style.textContent+=`.ff-revision-editor.dragging{outline:2px dashed #7552e8;outline-offset:3px}.ff-revision-editor [data-upload]{width:auto;background:#f3efff;color:#6944db;margin-bottom:12px}.ff-revision-attachments{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}.ff-revision-attachment{position:relative;width:72px}.ff-revision-editor [data-preview]{padding:0;width:72px;height:64px;background:white;overflow:hidden}.ff-revision-attachment img{width:100%;height:100%;object-fit:contain}.ff-revision-editor [data-remove]{position:absolute;right:-5px;top:-7px;width:24px;height:24px;padding:0;border-radius:50%;background:white;color:#6944db}.ff-revision-preview{border:1px solid #dedbf5;border-radius:14px;max-width:90vw;max-height:90vh;padding:16px}.ff-revision-preview::backdrop{background:#15112699}.ff-revision-preview img{display:block;max-width:80vw;max-height:75vh;object-fit:contain}.ff-revision-preview button{display:block;margin:0 0 12px auto;padding:6px 14px;cursor:pointer}`;
    style.textContent+=`.ff-version [data-delete]{margin-left:auto;padding:6px 10px;font-size:13px}.ff-revision-history{grid-column:1/-1;color:#73788c;font-size:13px}`;
    style.textContent+=`.ff-revision-review{box-sizing:border-box;width:100%;min-width:0;margin:18px 0;border:1px solid #dedbf5;border-radius:14px;padding:16px;background:white;color:#29243d;overflow-wrap:anywhere}.ff-revision-review pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;background:#f3efff;padding:12px}.ff-revision-review figure{min-width:0;margin:0}.ff-revision-review img{display:block;width:100%;height:auto}.ff-revision-review details{margin-top:12px}.ff-revision-review summary{cursor:pointer;color:#6944db}.ff-revision-compare{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}.ff-revision-review-actions{display:flex;gap:12px;flex-wrap:wrap;padding:12px 0}.ff-revision-review button{font:inherit;cursor:pointer;padding:10px;border:1px solid #dcd5ef;border-radius:8px}.ff-revision-review [data-revision-accept]{background:#7552e8;color:white}@media(max-width:650px){.ff-revision-compare{grid-template-columns:1fr}}`;
    document.head.append(style);
    root=document.createElement('div');root.className='ff-revisions';
    list=document.createElement('div');panel=document.createElement('aside');panel.className='ff-revision-editor';
    panel.innerHTML='<h3>继续修改</h3><div data-base></div><small data-model style="display:block;margin-top:10px;overflow-wrap:anywhere"></small><textarea aria-label="你希望改哪里？" placeholder="输入修改要求，可粘贴或拖入截图"></textarea><input data-files type="file" accept="image/png,image/jpeg,image/webp" multiple hidden><button data-upload type="button">＋ 上传截图</button><div class="ff-revision-attachments"></div><button data-submit type="button">生成修改版</button><p class="ff-revision-error" role="alert"></p>';
    textarea=panel.querySelector('textarea');submit=panel.querySelector('[data-submit]');error=panel.querySelector('[role=alert]');
    attachments=panel.querySelector('.ff-revision-attachments');fileInput=panel.querySelector('[data-files]');
    panel.querySelector('[data-upload]').onclick=()=>fileInput.click();
    fileInput.onchange=()=>{void receiveFiles([...fileInput.files]);fileInput.value='';};
    panel.onpaste=event=>{const files=[...(event.clipboardData?.items||[])].filter(item=>item.kind==='file'&&item.type.startsWith('image/')).map(item=>item.getAsFile()).filter(Boolean);if(files.length){event.preventDefault();void receiveFiles(files);}};
    panel.ondragover=event=>{if([...event.dataTransfer.types].includes('Files')){event.preventDefault();event.dataTransfer.dropEffect='copy';panel.classList.add('dragging');}};
    panel.ondragleave=event=>{if(!panel.contains(event.relatedTarget))panel.classList.remove('dragging');};
    panel.ondrop=event=>{panel.classList.remove('dragging');if([...event.dataTransfer.types].includes('Files')){event.preventDefault();void receiveFiles([...event.dataTransfer.files]);}};
    textarea.oninput=()=>{if(editing)editing.draft=textarea.value;};submit.onclick=revise;
    storageHint=document.createElement('div');storageHint.className='ff-revision-storage';storageHint.setAttribute('role','status');
    const historyHint=document.createElement('div');historyHint.className='ff-revision-history';historyHint.textContent='本机历史版本 · 下次使用同一浏览器打开此页面，自动恢复在这里。';
    root.append(historyHint,list,panel,storageHint);adapter.output.replaceChildren(root);adapter.output.style.display='block';
  }
  function renderAttachments(){
    attachments.replaceChildren();
    for(const [index,item] of (editing?.attachmentsDraft||[]).entries()){
      const tile=document.createElement('div');tile.className='ff-revision-attachment';
      const preview=document.createElement('button');preview.type='button';preview.dataset.preview='true';preview.setAttribute('aria-label','预览截图 '+(index+1));
      const image=document.createElement('img');image.src=item.data;image.alt=item.name;preview.append(image);
      preview.onclick=()=>{const dialog=document.createElement('dialog');dialog.className='ff-revision-preview';const close=document.createElement('button');close.type='button';close.textContent='关闭';close.onclick=()=>dialog.close();dialog.append(close,image.cloneNode());dialog.onclose=()=>dialog.remove();dialog.onclick=event=>{if(event.target===dialog)dialog.close();};document.body.append(dialog);dialog.showModal();close.focus();};
      const remove=document.createElement('button');remove.type='button';remove.dataset.remove='true';remove.textContent='×';remove.setAttribute('aria-label','删除截图 '+(index+1));remove.onclick=()=>{editing.attachmentsDraft.splice(index,1);renderAttachments();};
      tile.append(preview,remove);attachments.append(tile);
    }
  }
  async function receiveFiles(files){
    if(!editing||!files.length)return;
    const target=editing;reading++;error.textContent='';refresh();
    try{
      for(const file of files){
        if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('请使用 PNG、JPG 或 WebP 截图。');
        if(file.size>10*1024*1024)throw new Error('单张截图请控制在 10 MB 以内。');
        const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('截图读取失败，请重新上传。'));reader.readAsDataURL(file);});
        await new Promise((resolve,reject)=>{const image=new Image();image.onload=resolve;image.onerror=()=>reject(new Error('无法识别该截图，请重新上传。'));image.src=data;});
        target.attachmentsDraft||=[];
        if(target.attachmentsDraft.length>=4)throw new Error('每次最多添加 4 张截图。');
        target.attachmentsDraft.push({name:file.name||'截图',data});
      }
    }catch(e){if(editing===target)error.textContent=e.message;}
    finally{reading--;if(editing===target)renderAttachments();refresh();}
  }
  function savedState(state){
    const result={};
    for(const key of ['svg','baseSvg','scene','source','bitmap','reconBitmap','hasStep3Output','reconFailed','reconError','target','font','vectorScene','vectorSvg','fidelityScene','fidelitySvg','exportMode','wholeImageResult'])
      if(state?.[key]!==undefined)result[key]=state[key];
    result.recon=state?.recon?{mode:state.recon.mode,nodes:state.recon.nodes,qualityState:state.recon.qualityState,audit:state.recon.audit?{pipeline:state.recon.audit.pipeline,state:state.recon.audit.state}:undefined}:null;
    result.reconPending=false;return result;
  }
  function persist(v){
    const record={id:v.id,number:v.number,parentId:v.parentId,prompt:v.prompt,image:v.image,width:v.width,height:v.height,route:v.route,created:v.created,state:savedState(v.state)};
    if(v.source==='svg'){record.source='svg';record.svg=v.svg;}
    if(v.revisionAudit)record.revisionAudit=v.revisionAudit;
    void store.write(record).catch(()=>{storageHint.textContent='浏览器未能保存历史记录；当前页面中的版本和结果仍保留。';});
  }
  function snapshot(){if(active&&(adapter.isCurrent?adapter.isCurrent(active):adapter.currentImage()===active.image)){active.state=structuredClone(savedState(adapter.getState()));active.view=adapter.captureView();persist(active);}}
  function activate(v){
    if(busy())return false;
    snapshot();active=v;adapter.activate(v);refresh();return true;
  }
  function edit(v){editing=v;panel.querySelector('[data-base]').textContent='基于 V'+v.number+(v.parentId?' · 修改版':' · 原始图');textarea.value=v.draft||'';error.textContent='';renderAttachments();refresh();}
  function append(v){
    mount();versions.push(v);nextNumber=Math.max(nextNumber,v.number+1);
    const card=document.createElement('article');card.className='ff-version';card.dataset.versionId=v.id;
    const header=document.createElement('header'),title=document.createElement('strong'),meta=document.createElement('small');
    title.textContent='V'+v.number+(v.parentId?' · 修改版':' · 原始图');meta.textContent=v.width+' × '+v.height;
    const remove=document.createElement('button');remove.type='button';remove.dataset.delete='true';remove.textContent='删除';remove.setAttribute('aria-label','删除 V'+v.number);remove.onclick=()=>void removeVersion(v);
    header.append(title,meta,remove);const image=document.createElement('img');image.src=v.image;image.alt='V'+v.number+' 主图';image.dataset.versionImage='true';
    const footer=document.createElement('footer');
    const download=document.createElement('button');download.type='button';download.textContent='下载图片';download.onclick=()=>adapter.download(v);
    const modify=document.createElement('button');modify.type='button';modify.textContent='继续修改';modify.dataset.modify='true';modify.onclick=()=>{edit(v);panel.scrollIntoView({block:'nearest',behavior:'smooth'});textarea.focus();};
    const build=document.createElement('button');build.type='button';build.dataset.build='true';build.onclick=()=>{if(activate(v)){if(v.source==='svg'||v.state?.scene)adapter.showExport();else adapter.rebuild();}};
    const status=document.createElement('small');status.dataset.status='true';footer.append(download,modify,status,build);card.append(header,image,footer);list.append(card);v.card=card;
    refresh();
  }
  async function removeVersion(v){
    if(busy()||generating||reading||deleting)return;
    const last=versions.length===1;
    if(!window.confirm('删除 V'+v.number+' 的图片和对应可编辑结果？仅清除本浏览器中的这个版本，其他版本不受影响。'+(last?'最后一个版本删除后将刷新页面。':'')))return;
    deleting=true;storageHint.textContent='';refresh();
    try{
      await store.remove(v.id);
      const wasActive=active===v;
      if(wasActive)active=null;
      versions.splice(versions.indexOf(v),1);v.card.remove();
      if(versions.length){
        if(wasActive)activate(versions.at(-1));
        if(editing===v)edit(versions.at(-1));
      }else{
        editing=null;
        // Reload only after the committed deletion, so no in-memory export or pending
        // snapshot can restore the removed final version. Reconstruction is untouched.
        try{if(sessionStorage.getItem('__ffStep3Bitmap')===v.image)sessionStorage.removeItem('__ffStep3Bitmap');}catch{}
        window.location.reload();
      }
    }catch{storageHint.textContent='删除失败，版本和保存记录仍保留，请重试。';}
    finally{deleting=false;refresh();}
  }
  function refresh(){
    if(!mounted)return;
    if(editing)panel.querySelector('[data-model]').textContent=adapter.modelLabel?.(editing)||'';
    for(const v of versions){
      v.card.querySelector('[data-delete]').disabled=busy()||generating||!!reading||deleting;
      const pending=job?.version===v||v.state?.reconPending;
      const ready=v.source==='svg'?!!v.svg:!!v.state?.scene&&!!v.state?.svg;
      v.card.classList.toggle('selected',editing===v);
      v.card.querySelector('[data-status]').textContent=pending?'可编辑版生成中…':ready?'可编辑版已就绪':v.state?.reconFailed?'可编辑版生成失败':'';
      const b=v.card.querySelector('[data-build]');b.disabled=busy()||deleting;b.textContent=pending?'正在生成可编辑版…':ready?'查看可编辑版':v.state?.reconFailed?'重试生成可编辑版':'生成可编辑版';
    }
    submit.disabled=generating||!!reading||deleting||!editing;submit.textContent=generating?'正在生成修改版…':reading?'正在读取截图…':'生成修改版';
  }
  async function revise(){
    if(generating||reading||deleting||!editing)return;
    const parent=editing,prompt=textarea.value.trim();if(!prompt){textarea.focus();return;}
    generating=true;error.textContent='';refresh();
    try{
      // Request-only attachments; never replace a version bitmap or reconstruction state.
      const references=(parent.attachmentsDraft||[]).map(item=>({...item}));
      const result=await adapter.generate({...parent,route:{...parent.route},attachments:references},prompt);
      error.textContent='';
      if(!await reviewRevision(parent,result,prompt,references,list)){
        edit(parent);error.textContent='本次结果未保存。修改要求和截图已保留；再次生成会发起新的 API 请求。';return;
      }
      if(result.revisionAudit)result.revisionAudit={...result.revisionAudit,review:'user-confirmed',reviewedAt:Date.now()};
      const v={...result,id:crypto.randomUUID(),number:nextNumber,parentId:parent.id,prompt,route:{...(result.route||parent.route)},created:Date.now(),state:null};
      append(v);persist(v);edit(v);v.card.scrollIntoView({block:'nearest',behavior:'smooth'});
    }catch(e){error.textContent=e.message||'修改失败，请重试。';}
    finally{generating=false;refresh();}
  }
  const ready=(async()=>{
    const history=await store.read();history.sort((a,b)=>a.created-b.created||a.number-b.number);
    for(const v of history){if(v.image&&v.route)append(v);}
    if(versions.length){edit(versions.at(-1));activate(versions.at(-1));}
  })();
  return {ready,refresh,busy,
    leave(){if(busy())return;snapshot();active=null;},
    async addInitial(data){await ready;if(busy()||deleting)throw new Error('请等待当前可编辑版处理完成后再生成新的原始图。');snapshot();
      const v={...data,id:crypto.randomUUID(),number:nextNumber,parentId:null,prompt:'',created:Date.now(),state:null};append(v);active=v;adapter.activate(v);edit(v);persist(v);return v;
    },
    begin(){
      if(job)return null;
      const version=active&&adapter.currentImage()===active.image?active:null;
      const token={version};job=token;if(version)version.state=adapter.getState();refresh();return token;
    },
    finish(token){if(job!==token)return;snapshot();job=null;refresh();},
    canGenerate(){return !busy()&&!generating&&!deleting;}
  };
}
