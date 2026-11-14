// Step 3 discovery/display only. No generation or reconstruction requests.
import {fetchParserCatalog,normalizeModels} from './parser-model-catalog.mjs?v=20261114';
import {nonelinearCatalog} from './parser-nonelinear-catalog.mjs?v=20261114';
import {officialCatalogUrls,fetchOfficialCatalog} from './step3-official-catalog.mjs';

export function createStep3ModelCatalog({select,analysisSelect,status,readConfig,readSaved,
  kindOf,isVisualModel,onLiveModels=()=>{},onRender=()=>{},
  storage=globalThis.localStorage,fetchImpl=globalThis.fetch,transportOptions={},debounceMs=650,
  language=()=>document.documentElement.lang,now=()=>Date.now(),autoRefreshMs=300000}){
  let revision=0,scheduled,state,lastConfig,lastRefresh=0,officialKinds={};
  const inflight=new Map();
  const text=(zh,en)=>String(language()).startsWith('en')?en:zh;
  const identity=c=>JSON.stringify([c.provider,c.base,c.proto,c.key]); // Never persisted.
  const current=(id,version,mode)=>version===revision&&identity(readConfig())===id&&readConfig().mode===mode;
  const unique=list=>[...new Set(list)];
  const filter=(list,c,analysis=false)=>unique(list.filter(m=>analysis?isVisualModel(m,c.vision||[]):(officialKinds[m]==='image'?'image':kindOf(m))===(c.mode==='svg'?'chat':'image')));
  const permissionNote=()=>text('目录不代表当前 Key 的调用权限。','The catalog does not confirm this key’s inference access.');
  const bundledLabel=()=>text(`内置目录（${nonelinearCatalog.updated}，非实时）`,`Bundled catalog (${nonelinearCatalog.updated}, not live)`);
  function initial(c){
    return {list:unique([...(c.snapshotAllowed?nonelinearCatalog.models:[]),...(c.chat||[]),...(c.image||[]),...(c.vision||[])]),
      source:c.snapshotAllowed?bundledLabel():text('预设模型','Preset models')};
  }
  function drawSelect(element,list,source,c,analysis){
    const same=lastConfig&&identity(lastConfig)===identity(c)&&(analysis||lastConfig.mode===c.mode);
    const saved=readSaved(c.provider,analysis);
    const defaults=analysis?(c.vision||[]):c.mode==='svg'?[...(c.chat||[]),...(c.vision||[])]:c.image||[];
    const preferred=[saved,same?element.value:'',...defaults];
    element.replaceChildren();
    if(list.length){
      const group=document.createElement('optgroup');group.label=source;
      for(const id of list){const option=document.createElement('option');option.value=id;option.textContent=id;group.append(option);}
      element.append(group);
      const choice=preferred.find(id=>id&&list.includes(id));if(choice)element.value=choice;
    }else{
      const option=document.createElement('option');option.value='';option.disabled=true;
      option.textContent=text('暂无适用模型，请刷新目录','No compatible models; refresh the catalog');element.append(option);
    }
  }
  function render(c,rows,source,message,fallback=initial(c)){
    const main=filter(rows,c),analysis=filter(rows,c,true);
    const mainRows=main.length?main:filter(fallback.list,c),analysisRows=analysis.length?analysis:filter(fallback.list,c,true);
    drawSelect(select,mainRows,main.length?source:fallback.source,c,false);
    drawSelect(analysisSelect,analysisRows,analysis.length?source:fallback.source,c,true);
    lastConfig=c;state={source,main:mainRows,analysis:analysisRows};
    const missing=[];
    if(!main.length)missing.push(text(c.mode==='svg'?'SVG 对话':'图像',c.mode==='svg'?'SVG chat':'Image'));
    if(c.mode==='image'&&!analysis.length)missing.push(text('视觉归纳','Visual analysis'));
    const note=missing.length?text(` ${missing.join('、')}目录无适用项，显示${fallback.source}。`,` No compatible ${missing.join(', ')} entries; showing ${fallback.source}.`):'';
    status.textContent=message+note+' '+permissionNote();status.dataset.catalogSource=source;
    onRender();
  }
  const cacheKey=async id=>{
    if(!globalThis.crypto?.subtle)return null;
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id));
    return 'ff_step3_catalog_v1_'+Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
  };
  async function refreshOfficial(c,id,version){
    const fallback=initial(c),publicKey='ff_step3_official_v1_infistar';
    let publicResult,keyResult,publicCache,keyCache,fingerprint;
    const valid=cache=>cache&&now()-cache.updated>=0&&now()-cache.updated<24*60*60*1000;
    const date=cache=>new Date(cache.updated).toLocaleString(String(language()).startsWith('en')?'en-US':'zh-CN');
    try{
      const stored=JSON.parse(storage.getItem(publicKey)||'null');
      if(valid(stored)){publicCache={...parseCachedOfficial(stored),updated:stored.updated};}
    }catch{}
    try{
      fingerprint=c.key?await cacheKey(id):null;
      const stored=JSON.parse(fingerprint&&storage.getItem(fingerprint)||'null');
      if(valid(stored))keyCache={list:normalizeModels({data:stored.models}),updated:stored.updated};
    }catch{}
    function show(){
      if(!current(id,version,c.mode))return;
      const published=publicResult?.ok?publicResult:publicCache;
      const permitted=keyResult?.ok?keyResult:keyCache;
      officialKinds=published?.kinds||{};
      const rows=unique([...(published?.list||[]),...(permitted?.list||[])]);
      const source=publicResult?.ok?text('官网实时目录 + Key 目录','Live official catalog + key catalog'):
        publicCache?text(`官网缓存（${date(publicCache)}，非实时）`,`Official cache (${date(publicCache)}, not live)`):
        keyResult?.ok?text('Key 实时目录','Live key catalog'):keyCache?text(`Key 缓存（${date(keyCache)}，非实时）`,`Key cache (${date(keyCache)}, not live)`):fallback.source;
      const publicNote=publicResult?.ok?text(`已同步官网最新目录：${filter(rows,c).length} 个${c.mode==='svg'?'对话':'图像'}模型。`,`Official catalog synchronized: ${filter(rows,c).length} ${c.mode==='svg'?'chat':'image'} models.`):
        publicResult?text('官网目录暂时无法读取。','Official catalog is temporarily unavailable.'):text('正在同步官网最新目录…','Synchronizing the official catalog…');
      const keyNote=!c.key?text('填写 Key 后可同时刷新 Key 目录。','Enter a key to also refresh its catalog.'):
        !keyResult?text('正在检查 Key 目录…','Checking the key catalog…'):
        keyResult.ok?text('已合并当前 Key 返回的目录。','Merged the current key catalog.'):
        text('Key 目录读取失败，仍显示可获得的官网目录。','Key catalog unavailable; showing the available official catalog.')+(keyCache?text(` Key 缓存时间：${date(keyCache)}（非实时）。`,` Key cache: ${date(keyCache)} (not live).`):'');
      const cacheNote=!publicResult?.ok&&publicCache?text(` 官网缓存时间：${date(publicCache)}（非实时）。`,` Official cache: ${date(publicCache)} (not live).`):'';
      render(c,rows,source,publicNote+' '+keyNote+cacheNote,{list:rows.length?rows:fallback.list,source:rows.length?source:fallback.source});
    }
    function parseCachedOfficial(stored){
      const list=normalizeModels({data:stored.models});
      const kinds=Object.fromEntries(list.filter(name=>['image','chat'].includes(stored.kinds?.[name])).map(name=>[name,stored.kinds[name]]));
      return {list,kinds};
    }
    if(!current(id,version,c.mode))return;
    show();
    await Promise.all([
      fetchOfficialCatalog(c,{fetchImpl,timeoutMs:transportOptions.officialTimeoutMs||6000}).then(result=>{
        if(!current(id,version,c.mode))return;
        publicResult=result;
        if(result.ok)try{storage.setItem(publicKey,JSON.stringify({updated:now(),models:result.list,kinds:result.kinds}));}catch{}
        show();
      }),
      (c.key?fetchParserCatalog(c,{fetchImpl,...transportOptions}):Promise.resolve(null)).then(result=>{
        if(!current(id,version,c.mode))return;
        keyResult=result;
        if(result?.ok){onLiveModels(result.list);try{if(fingerprint)storage.setItem(fingerprint,JSON.stringify({updated:now(),models:result.list}));}catch{}}
        show();
      })
    ]);
  }
  async function refresh(){
    clearTimeout(scheduled);const version=++revision,c=readConfig(),id=identity(c);lastRefresh=now();officialKinds={};
    onLiveModels(null);
    let fallback=initial(c);
    const loading=c.key?text('正在刷新步骤三模型…','Refreshing Step 3 models…'):text('填写 Key 后自动刷新实时目录。','Enter a key to refresh the live catalog automatically.');
    render(c,fallback.list,fallback.source,loading);
    if(officialCatalogUrls(c).length)return refreshOfficial(c,id,version);
    if(!c.provider||c.provider==='custom'||!c.key||!c.base)return;
    let fingerprint;
    try{
      fingerprint=await cacheKey(id);
      const cached=JSON.parse(fingerprint&&storage.getItem(fingerprint)||'null');
      if(cached&&now()-cached.updated>=0&&now()-cached.updated<24*60*60*1000){
        const list=normalizeModels({data:cached.models});
        if(current(id,version,c.mode)){
          // Keep the public fallback for a category absent from a partial cache.
          fallback={list:unique([...list,...fallback.list]),source:text('上次成功目录 / 备用目录（非实时）','Last successful / fallback catalog (not live)')};
          render(c,list,text('上次成功目录（非实时）','Last successful catalog (not live)'),loading,fallback);
        }
      }
    }catch{} // Storage is optional.
    if(!current(id,version,c.mode))return;
    let pending=inflight.get(id);
    if(!pending){pending=fetchParserCatalog(c,{fetchImpl,...transportOptions});inflight.set(id,pending);pending.finally(()=>{if(inflight.get(id)===pending)inflight.delete(id);});}
    const result=await pending;
    if(!current(id,version,c.mode))return;
    if(result.ok){
      const main=filter(result.list,c),analysis=filter(result.list,c,true),source=text('服务商实时目录','Live provider catalog');
      render(c,result.list,source,text(`已刷新步骤三：${main.length} 个${c.mode==='svg'?'对话':'图像'}模型，${analysis.length} 个视觉归纳模型。`,`Step 3 refreshed: ${main.length} ${c.mode==='svg'?'chat':'image'} models, ${analysis.length} visual analysis models.`),fallback);
      onLiveModels(result.list);
      try{if(fingerprint)storage.setItem(fingerprint,JSON.stringify({updated:now(),models:result.list}));}catch{}
    }else{
      const reason=({timeout:text('请求超时','Request timed out'),network:text('网络或跨域请求失败','Network or CORS request failed'),schema:text('目录格式异常','Unexpected catalog format'),empty:text('服务商返回空目录','Provider returned an empty catalog')})[result.error]||
        (/^http-\d+$/.test(result.error)?text(`服务商目录请求失败（HTTP ${result.error.slice(5)}）`,`Provider catalog request failed (HTTP ${result.error.slice(5)})`):text('目录刷新失败','Catalog refresh failed'));
      render(c,fallback.list,fallback.source,reason+text(`。当前显示${fallback.source}；可点击“刷新模型列表”重试。`,`. Showing ${fallback.source}; click “Refresh models” to retry.`),fallback);
    }
  }
  const checkFreshness=()=>{if(globalThis.document?.visibilityState!=='hidden'&&officialCatalogUrls(readConfig()).length&&now()-lastRefresh>=60000)refresh();};
  const timer=autoRefreshMs>0?setInterval(checkFreshness,autoRefreshMs):null;
  timer?.unref?.();
  globalThis.addEventListener?.('focus',checkFreshness);
  globalThis.document?.addEventListener('visibilitychange',checkFreshness);
  return {refresh,dispose(){++revision;clearTimeout(scheduled);clearInterval(timer);globalThis.removeEventListener?.('focus',checkFreshness);globalThis.document?.removeEventListener('visibilitychange',checkFreshness);},schedule(){
    ++revision;clearTimeout(scheduled);onLiveModels(null);officialKinds={};
    const c=readConfig(),fallback=initial(c);render(c,fallback.list,fallback.source,text('设置已更新，即将刷新步骤三模型…','Settings updated; refreshing Step 3 models shortly…'));
    scheduled=setTimeout(refresh,debounceMs);
  },getState:()=>state};
}
