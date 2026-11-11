import {usesInfistarGemini,geminiImageRequest,geminiImageResult,compatibleImageRequest,requestImageWithRecovery} from './image-api.mjs?v=20261026-nonelinear-resolution';
import {imageRequestDimensions,verifyImageRatio,verifyImageResolution} from './aspect-ratio.mjs?v=20261026-nonelinear-resolution';

// Separate image-edit request: only the chosen generated bitmap is supplied.
// This module never calls or configures the editable reconstruction pipeline.
export async function generateRevision(parent,prompt,{key,toDataURL,loadImage}){
  const {base,model,p,ratio,resolution}=parent.route;
  if(!key)throw new Error('请先填写该服务商的 API Key。');
  const source=await toDataURL(parent.image);
  const native=usesInfistarGemini(base,model);
  const dimensions=imageRequestDimensions(p,model,ratio,resolution,native);
  const instruction='Edit the supplied figure according to the following request. Preserve all content, colors and style not mentioned. Keep the original canvas aspect ratio. Return the complete revised figure.\n\n'+prompt;
  let body={model,prompt:instruction,image:p==='sf'&&!native?source:[source]};
  if(!native){body[dimensions.field]=dimensions.value;if(dimensions.aspectRatio)body.aspect_ratio=dimensions.aspectRatio;}
  const request=native?geminiImageRequest(base,model,instruction,[source],dimensions):compatibleImageRequest(body,base,p);
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
  }};
}

export function createRevisionGallery(adapter){
  const versions=[],store=historyStore();
  let active=null,editing=null,job=null,generating=false,mounted=false,root,panel,list,textarea,error,submit,storageHint;
  const busy=()=>!!job||adapter.busy();
  function mount(){
    if(mounted){if(!root.isConnected){adapter.output.replaceChildren(root);adapter.output.style.display='block';}return;}mounted=true;
    const style=document.createElement('style');
    style.textContent=`.ff-revisions{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:18px;align-items:start}.ff-version{border:1px solid #dedbf5;border-radius:14px;background:white;padding:14px;margin-bottom:18px}.ff-version.selected{border-color:#7860ec;box-shadow:0 0 0 2px #ede9ff}.ff-version header{display:flex;gap:12px;align-items:center;margin-bottom:12px}.ff-version small{color:#73788c}.ff-version img{width:100%;height:auto;border-radius:8px}.ff-version footer{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px}.ff-version button,.ff-revision-editor button{padding:9px 14px;border-radius:9px;border:1px solid #ddd6ff;background:#f3efff;color:#6944db;cursor:pointer;font:inherit}.ff-version button:disabled,.ff-revision-editor button:disabled{opacity:.5;cursor:default}.ff-version [data-build]{margin-left:auto}.ff-revision-editor{position:sticky;top:18px;padding:18px;border:1px solid #e1dcff;border-radius:14px;background:#faf9ff}.ff-revision-editor h3{margin:0 0 14px;color:#6642d9}.ff-revision-editor textarea{box-sizing:border-box;width:100%;min-height:165px;resize:vertical;margin:14px 0;padding:12px;border:1px solid #dcd5ef;border-radius:10px;font:inherit}.ff-revision-editor button{width:100%;background:#7552e8;color:white}.ff-revision-error{color:#b42338;font-size:13px;white-space:pre-wrap}.ff-revision-storage{grid-column:1/-1;color:#9b6216;font-size:13px}@media(max-width:850px){.ff-revisions{grid-template-columns:1fr}.ff-revision-editor{position:static;grid-row:1}}`;
    document.head.append(style);
    root=document.createElement('div');root.className='ff-revisions';
    list=document.createElement('div');panel=document.createElement('aside');panel.className='ff-revision-editor';
    panel.innerHTML='<h3>继续修改</h3><div data-base></div><textarea aria-label="你希望改哪里？" placeholder="你希望改哪里？"></textarea><button type="button">生成修改版</button><p class="ff-revision-error" role="alert"></p>';
    textarea=panel.querySelector('textarea');submit=panel.querySelector('button');error=panel.querySelector('[role=alert]');
    textarea.oninput=()=>{if(editing)editing.draft=textarea.value;};submit.onclick=revise;
    storageHint=document.createElement('div');storageHint.className='ff-revision-storage';storageHint.setAttribute('role','status');
    root.append(list,panel,storageHint);adapter.output.replaceChildren(root);adapter.output.style.display='block';
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
  function edit(v){editing=v;panel.querySelector('[data-base]').textContent='基于 V'+v.number+(v.parentId?' · 修改版':' · 原始图');textarea.value=v.draft||'';error.textContent='';refresh();}
  function append(v){
    mount();versions.push(v);
    const card=document.createElement('article');card.className='ff-version';card.dataset.versionId=v.id;
    const header=document.createElement('header'),title=document.createElement('strong'),meta=document.createElement('small');
    title.textContent='V'+v.number+(v.parentId?' · 修改版':' · 原始图');meta.textContent=v.width+' × '+v.height;
    header.append(title,meta);const image=document.createElement('img');image.src=v.image;image.alt='V'+v.number+' 主图';image.dataset.versionImage='true';
    const footer=document.createElement('footer');
    const download=document.createElement('button');download.type='button';download.textContent='下载图片';download.onclick=()=>adapter.download(v);
    const modify=document.createElement('button');modify.type='button';modify.textContent='继续修改';modify.dataset.modify='true';modify.onclick=()=>{edit(v);panel.scrollIntoView({block:'nearest',behavior:'smooth'});textarea.focus();};
    const build=document.createElement('button');build.type='button';build.dataset.build='true';build.onclick=()=>{if(activate(v)){if(!v.state?.scene)adapter.rebuild();else adapter.showExport();}};
    const status=document.createElement('small');status.dataset.status='true';footer.append(download,modify,status,build);card.append(header,image,footer);list.append(card);v.card=card;
    refresh();
  }
  function refresh(){
    if(!mounted)return;
    for(const v of versions){
      const pending=job?.version===v||v.state?.reconPending;
      const ready=!!v.state?.scene&&!!v.state?.svg;
      v.card.classList.toggle('selected',editing===v);
      v.card.querySelector('[data-status]').textContent=pending?'可编辑版生成中…':ready?'可编辑版已就绪':v.state?.reconFailed?'可编辑版生成失败':'';
      const b=v.card.querySelector('[data-build]');b.disabled=busy();b.textContent=pending?'正在生成可编辑版…':ready?'查看可编辑版':v.state?.reconFailed?'重试生成可编辑版':'生成可编辑版';
    }
    submit.disabled=generating||!editing;submit.textContent=generating?'正在生成修改版…':'生成修改版';
  }
  async function revise(){
    if(generating||!editing)return;
    const parent=editing,prompt=textarea.value.trim();if(!prompt){textarea.focus();return;}
    generating=true;error.textContent='';refresh();
    try{
      const result=await adapter.generate(parent,prompt);
      const v={...result,id:crypto.randomUUID(),number:versions.length+1,parentId:parent.id,prompt,route:{...parent.route},created:Date.now(),state:null};
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
    async addInitial(data){await ready;if(busy())throw new Error('请等待当前可编辑版处理完成后再生成新的原始图。');snapshot();
      const v={...data,id:crypto.randomUUID(),number:versions.length+1,parentId:null,prompt:'',created:Date.now(),state:null};append(v);active=v;adapter.activate(v);edit(v);persist(v);return v;
    },
    begin(){
      if(job)return null;
      const version=active&&adapter.currentImage()===active.image?active:null;
      const token={version};job=token;if(version)version.state=adapter.getState();refresh();return token;
    },
    finish(token){if(job!==token)return;snapshot();job=null;refresh();},
    canGenerate(){return !busy()&&!generating;}
  };
}
