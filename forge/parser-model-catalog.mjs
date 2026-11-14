// Parser discovery only. Generation/reconstruction transports remain independent.
import {nonelinearCatalog} from './parser-nonelinear-catalog.mjs?v=20261114';

export function normalizeModels(body){
  const rows=body?.data??body?.models;
  if(!Array.isArray(rows))throw new Error('schema');
  const models=[...new Set(rows.map(row=>typeof row==='string'?row:row?.id||row?.model||row?.name)
    .filter(id=>typeof id==='string'&&id.trim()).map(id=>id.trim()))];
  if(!models.length)throw new Error('empty');
  return models;
}

export async function fetchParserCatalog(config,{fetchImpl=globalThis.fetch,timeoutMs=8000,retries=1,delayMs=400}={}){
  let error='network';
  for(let attempt=0;attempt<=retries;attempt++){
    const controller=new AbortController();let timer;
    try{
      const request=(async()=>{
        const anthropic=config.proto==='anthropic';
        const response=await fetchImpl(config.base.replace(/\/+$/,'')+(anthropic?'/v1/models':'/models'),{
          headers:anthropic?{'x-api-key':config.key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'}:{Authorization:'Bearer '+config.key},
          signal:controller.signal,cache:'no-store'
        });
        if(!response.ok)throw new Error('http-'+response.status);
        return normalizeModels(await response.json());
      })();
      const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('timeout'));},timeoutMs);});
      return {ok:true,list:await Promise.race([request,deadline]),error:null};
    }catch(e){
      error=controller.signal.aborted?'timeout':/^http-\d+$|^schema$|^empty$/.test(e.message)?e.message:'network';
      if(/^http-4\d\d$/.test(error)&&error!=='http-429')break;
      if(error==='schema'||error==='empty')break;
    }finally{clearTimeout(timer);}
    if(attempt<retries)await new Promise(resolve=>setTimeout(resolve,delayMs*(attempt+1)));
  }
  return {ok:false,list:[],error};
}

const messages={
  timeout:['请求超时','Request timed out'],network:['网络或跨域请求失败','Network or CORS request failed'],
  schema:['服务商返回的目录格式异常','Unexpected catalog format'],empty:['服务商返回空目录','Provider returned an empty catalog'],
  'http-401':['Key 无效或已过期（HTTP 401）','Invalid or expired key (HTTP 401)'],
  'http-403':['Key 无权读取目录（HTTP 403）','Key cannot read the catalog (HTTP 403)'],
  'http-429':['服务商限流（HTTP 429）','Provider rate limit (HTTP 429)']
};

export function createParserModelCatalog({select,status,readConfig,readSaved,isParserModel,onLiveModels=()=>{},
  storage=globalThis.localStorage,fetchImpl=globalThis.fetch,transportOptions={},debounceMs=650,
  language=()=>document.documentElement.lang,now=()=>Date.now()}){
  let revision=0,scheduled,lastProvider='',state;
  const inflight=new Map();
  const text=(zh,en)=>String(language()).startsWith('en')?en:zh;
  const identity=c=>JSON.stringify([c.provider,c.base,c.proto,c.key]); // Memory only; never persisted.
  const current=(id,version)=>version===revision&&identity(readConfig())===id;
  const parserList=list=>[...new Set(list.filter(isParserModel))];
  const cacheKey=async id=>{
    if(!globalThis.crypto?.subtle)return null;
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id));
    return 'ff_parser_catalog_v1_'+Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
  };
  function draw(config,list,source,message){
    const preferred=[readSaved(config.provider),lastProvider===config.provider?select.value:'',...(config.defaults||[])];
    lastProvider=config.provider;
    select.replaceChildren();
    const group=document.createElement('optgroup');group.label=source;
    for(const id of list){const option=document.createElement('option');option.value=id;option.textContent=id;group.append(option);}
    if(list.length)select.append(group);
    else {const option=document.createElement('option');option.textContent=config.placeholder||text('未获取到解析模型，请重试','No parser models; please retry');option.value='';option.disabled=true;select.append(option);}
    const selected=preferred.find(id=>id&&list.includes(id));
    if(selected)select.value=selected;
    status.textContent=message;status.dataset.catalogSource=state?.source||'defaults';
  }
  const permissionNote=()=>text('目录不代表当前 Key 的调用权限。','The catalog does not confirm this key’s inference access.');
  function render(config,source,list,message){
    state={config,source,list,message};draw(config,list,source,message);
  }
  function initial(config){
    const bundled=config.snapshotAllowed?parserList(nonelinearCatalog.models):[];
    return {
      list:bundled.length?bundled:parserList(config.defaults||[]),
      source:bundled.length?text(`内置目录（${nonelinearCatalog.updated}，非实时）`,`Bundled catalog (${nonelinearCatalog.updated}, not live)`):text('预设模型','Preset models')
    };
  }
  async function refresh(){
    clearTimeout(scheduled);
    const version=++revision,config=readConfig(),id=identity(config);
    onLiveModels(null);
    const initialState=initial(config);
    let fallback=initialState.list,source=initialState.source;
    const loading=config.key?text('正在刷新解析模型…','Refreshing parser models…'):text('填写 Key 后自动刷新实时目录。','Enter a key to refresh the live catalog automatically.');
    render(config,source,fallback,loading+' '+permissionNote());
    if(!config.provider||config.provider==='custom'||!config.key||!config.base)return;
    let fingerprint;
    try{
      fingerprint=await cacheKey(id);
      const cached=JSON.parse(fingerprint&&storage.getItem(fingerprint)||'null');
      if(cached&&now()-cached.updated>=0&&now()-cached.updated<24*60*60*1000){
        const cachedList=parserList(normalizeModels({data:cached.models}));
        if(cachedList.length&&current(id,version)){
          fallback=cachedList;source=text('上次成功目录（非实时）','Last successful catalog (not live)');
          render(config,source,fallback,loading+' '+permissionNote());
        }
      }
    }catch{} // Storage is optional, including private browsing and quota failures.
    if(!current(id,version))return;
    let pending=inflight.get(id);
    if(!pending){pending=fetchParserCatalog(config,{fetchImpl,...transportOptions});inflight.set(id,pending);pending.finally(()=>{if(inflight.get(id)===pending)inflight.delete(id);});}
    const result=await pending;
    if(!current(id,version))return;
    const online=parserList(result.list);
    if(result.ok&&online.length){
      const label=text('服务商实时目录','Live provider catalog');
      render(config,label,online,text(`已刷新 ${online.length} 个解析模型。`,`Refreshed ${online.length} parser models.`)+' '+permissionNote());
      onLiveModels(result.list);
      try{if(fingerprint)storage.setItem(fingerprint,JSON.stringify({updated:now(),models:result.list}));}catch{}
    }else{
      const error=result.ok?'empty':result.error;
      const reason=messages[error]||[error?.startsWith('http-')?'服务商错误（HTTP '+error.slice(5)+'）':'目录刷新失败',error?.startsWith('http-')?'Provider error (HTTP '+error.slice(5)+')':'Catalog refresh failed'];
      render(config,source,fallback,text(...reason)+'。'+text('当前显示'+source+'；可点击“刷新模型列表”重试。',' Showing '+source+'; click “Refresh models” to retry.')+' '+permissionNote());
    }
  }
  return {
    refresh,
    schedule(){
      ++revision;clearTimeout(scheduled);onLiveModels(null);
      const config=readConfig(),preview=initial(config);
      render(config,preview.source,preview.list,text('设置已更新，即将刷新解析模型…','Settings updated; refreshing parser models shortly…')+' '+permissionNote());
      scheduled=setTimeout(refresh,debounceMs);
    },
    getState:()=>state
  };
}
