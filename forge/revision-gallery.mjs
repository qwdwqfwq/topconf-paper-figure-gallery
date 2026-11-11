import {usesInfistarGemini,geminiImageRequest,geminiImageResult,compatibleImageRequest,requestImageWithRecovery} from './image-api.mjs?v=20261026-nonelinear-resolution';
import {imageRequestDimensions,verifyImageRatio,verifyImageResolution} from './aspect-ratio.mjs?v=20261026-nonelinear-resolution';

// Separate image-edit request: chosen full bitmap first, optional screenshot references after it.
// This module never calls or configures the editable reconstruction pipeline.
export async function generateRevision(parent,prompt,{key,toDataURL,loadImage}){
  const {base,model,p,ratio,resolution}=parent.route;
  if(!key)throw new Error('请先填写该服务商的 API Key。');
  const source=await toDataURL(parent.image);
  const references=[source,...(parent.attachments||[]).map(item=>item.data)];
  const native=usesInfistarGemini(base,model);
  const dimensions=imageRequestDimensions(p,model,ratio,resolution,native);
  const instruction='Edit the supplied figure according to the following request. Preserve all content, colors and style not mentioned. Keep the original canvas aspect ratio. Return the complete revised figure.'+(references.length>1?' The first image is the complete figure to edit. Additional images are user-provided screenshots for locating areas or illustrating the requested changes. Use them only as guidance; do not replace the full canvas with a screenshot.':'')+'\n\n'+prompt;
  let body={model,prompt:instruction,image:p==='sf'&&!native&&references.length===1?source:references};
  if(!native){body[dimensions.field]=dimensions.value;if(dimensions.aspectRatio)body.aspect_ratio=dimensions.aspectRatio;}
  const request=native?geminiImageRequest(base,model,instruction,references,dimensions):compatibleImageRequest(body,base,p);
  try{
    const response=await requestImageWithRecovery({url:(request.base||base)+request.endpoint,body:request.body,key,usedReferences:true,allowReferenceFallback:false});
    if(!response.ok)throw new Error('修改生图失败（HTTP '+response.status+'）。'+response.text.slice(0,400));
    const data=JSON.parse(response.text);
    const item=native?geminiImageResult(data,{locale:'zh'}):(data?.data?.[0]||data?.images?.[0]);
    const image=item?.b64_json?`data:${item.mimeType||'image/png'};base64,${item.b64_json}`:item?.url;
    if(!image)throw new Error('服务商未返回图片，未自动重试。');
    const loaded=await loadImage(image),width=loaded.naturalWidth||loaded.width,height=loaded.naturalHeight||loaded.height;
    if(!verifyImageRatio(width,height,ratio)||!verifyImageResolution(width,height,resolution,dimensions.field==='size'?dimensions.value:null))
      throw new Error('修改图的比例或分辨率与所选版本不符，未替换任何已有结果。');
    return {image:await toDataURL(image),width,height};
  }catch(error){
    error.message=String(error.message).split(key).join('[redacted]').replace(/Bearer\s+\S+/gi,'Bearer [redacted]');
    throw error;
  }
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
    document.head.append(style);
    root=document.createElement('div');root.className='ff-revisions';
    list=document.createElement('div');panel=document.createElement('aside');panel.className='ff-revision-editor';
    panel.innerHTML='<h3>继续修改</h3><div data-base></div><textarea aria-label="你希望改哪里？" placeholder="输入修改要求，可粘贴或拖入截图"></textarea><input data-files type="file" accept="image/png,image/jpeg,image/webp" multiple hidden><button data-upload type="button">＋ 上传截图</button><div class="ff-revision-attachments"></div><button data-submit type="button">生成修改版</button><p class="ff-revision-error" role="alert"></p>';
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
    void store.write(record).catch(()=>{storageHint.textContent='浏览器未能保存历史记录；当前页面中的版本和结果仍保留。';});
  }
  function snapshot(){if(active&&adapter.currentImage()===active.image){active.state=structuredClone(savedState(adapter.getState()));active.view=adapter.captureView();persist(active);}}
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
    const build=document.createElement('button');build.type='button';build.dataset.build='true';build.onclick=()=>{if(activate(v)){if(!v.state?.scene)adapter.rebuild();else adapter.showExport();}};
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
    for(const v of versions){
      v.card.querySelector('[data-delete]').disabled=busy()||generating||!!reading||deleting;
      const pending=job?.version===v||v.state?.reconPending;
      const ready=!!v.state?.scene&&!!v.state?.svg;
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
      const result=await adapter.generate({...parent,attachments:[...(parent.attachmentsDraft||[])]},prompt);
      const v={...result,id:crypto.randomUUID(),number:nextNumber,parentId:parent.id,prompt,route:{...parent.route},created:Date.now(),state:null};
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
