// Public discovery only: never attach credentials or send inference requests.
export function officialCatalogUrls(config){
  if(config.provider!=='infistar')return [];
  try{
    const url=new URL(config.base);
    if(url.protocol!=='https:'||url.port||url.username||url.password||
      !['infistar.cc','infistar.ai'].includes(url.hostname)||url.pathname.replace(/\/+$/,'')!=='/v1'||url.search||url.hash)return [];
    return [url.origin+'/pricing',...(url.hostname==='infistar.cc'?['https://infistar.ai/pricing']:['https://infistar.cc/pricing'])];
  }catch{return [];}
}
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
    if(endpoints.includes('image-generation')||row.price_presentation?.kind==='image')kinds[name]='image';
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
        const response=await fetchImpl(url,{method:'GET',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal});
        if(!response.ok)throw new Error('http-'+response.status);
        return {...parseOfficialCatalog(await response.text()),url};
      })();
      const result=await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('timeout'));},timeoutMs);})]);
      return {ok:true,...result};
    }catch{}finally{clearTimeout(timer);}
  }
  return {ok:false,error:'official-unavailable'};
}
