// Public discovery only: never attach credentials or send inference requests.
export function officialCatalogUrls(config){
  try{
    const url=new URL(config.base);
    if(url.protocol!=='https:'||url.port||url.username||url.password||url.pathname.replace(/\/+$/,'')!=='/v1'||url.search||url.hash)return [];
    if(config.provider==='nonelinear'&&['api.nonelinear.com.cn','gallery-nonelinear-relay.lixiao-gallery.workers.dev','analysis.topconf-paper-figure-gallery.cn'].includes(url.hostname)){
      return ['https://nonelinear.com.cn/models?offset=0&limit=500','https://www.nonelinear.com.cn/models?offset=0&limit=500'];
    }
    if(config.provider!=='infistar'||!['infistar.cc','infistar.ai'].includes(url.hostname))return [];
    return [url.origin+'/pricing',...(url.hostname==='infistar.cc'?['https://infistar.ai/pricing']:['https://infistar.cc/pricing'])];
  }catch{return [];}
}
// The same paginated JSON table used by NoneLinear's public models page.
export function parseNonelinearOfficialCatalog(text){
  const body=JSON.parse(text);
  if(!Array.isArray(body.headers)||body.headers.length<11||!Array.isArray(body.data)||
    !Number.isInteger(body.total)||body.total<1||body.total>10000||!body.data.length||body.data.length>body.total)throw new Error('schema');
  const list=[],kinds=Object.create(null),visual=Object.create(null);
  for(const row of body.data){
    const name=row?.[0],modality=row?.[10];
    if(!Array.isArray(row)||row.length<11||typeof name!=='string'||!name.trim()||name.length>256||/[\x00-\x1f\x7f]/.test(name)||
      typeof modality!=='string'||!modality.trim())throw new Error('schema');
    kinds[name]=modality==='image'?'image':['LLM','LMM'].includes(modality)?'chat':'other';
    visual[name]=modality==='LMM';
    list.push(name);
  }
  if(new Set(list).size!==list.length)throw new Error('duplicate');
  return {list,kinds,visual,total:body.total};
}
export const isOfficialGeminiImageModel=name=>/^gemini-(?:[a-z0-9.]+-)*image(?:$|-)|^(?:gemini-)?nano-banana(?:$|-)/i.test(name);
export function parseOfficialCatalog(html){
  const match=String(html).match(/<script\b(?=[^>]*\bid=["']public-site-pricing-data["'])(?=[^>]*\btype=["']application\/json["'])[^>]*>([\s\S]*?)<\/script\s*>/i);
  if(!match)throw new Error('schema');
  const body=JSON.parse(match[1]);
  if(body.success!==true||!Array.isArray(body.data)||body.data.length>10000)throw new Error('schema');
  const models=[],kinds={};
  for(const row of body.data){
    const name=row?.model_name;
    if(typeof name!=='string'||!name.trim()||name.length>256||/[\x00-\x1f\x7f]/.test(name))throw new Error('schema');
    const endpoints=Array.isArray(row.supported_endpoint_types)?row.supported_endpoint_types:[];
    // Use the official endpoint capability for unfamiliar future model names.
    // Gemini native image generation is token-billed and uses the Gemini/chat
    // endpoint. Billing kind "text" does not mean text-only output.
    if(endpoints.includes('image-generation')||row.price_presentation?.kind==='image'||isOfficialGeminiImageModel(name))kinds[name]='image';
    else if(endpoints.some(type=>['openai','openai-response','anthropic','gemini'].includes(type)))kinds[name]='chat';
    models.push(name);
  }
  if(!models.length)throw new Error('empty');
  return {list:[...new Set(models)],kinds};
}
export async function fetchOfficialCatalog(config,{fetchImpl=globalThis.fetch,timeoutMs=6000}={}){
  for(const url of officialCatalogUrls(config)){
    const controller=new AbortController();let timer;
    try{
      const work=(async()=>{
        const read=async target=>{
          const response=await fetchImpl(target,{method:'GET',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal});
          if(!response.ok)throw new Error('http-'+response.status);
          return response.text();
        };
        if(config.provider!=='nonelinear')return {...parseOfficialCatalog(await read(url)),url};
        const result=parseNonelinearOfficialCatalog(await read(url));
        while(result.list.length<result.total){
          const next=new URL(url);next.searchParams.set('offset',result.list.length);
          const page=parseNonelinearOfficialCatalog(await read(next.href));
          if(page.total!==result.total||result.list.length+page.list.length>result.total||page.list.some(name=>result.list.includes(name)))throw new Error('incomplete');
          result.list.push(...page.list);Object.assign(result.kinds,page.kinds);Object.assign(result.visual,page.visual);
        }
        return {...result,url};
      })();
      const result=await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('timeout'));},timeoutMs);})]);
      return {ok:true,...result};
    }catch{}finally{clearTimeout(timer);}
  }
  return {ok:false,error:'official-unavailable'};
}
