// Only immutable, public retrieval assets use these routes and this bounded cache.
import {ASSETS,VERSION,DOMESTIC} from './retrieval-assets.mjs';
export const CACHE_PREFIX='forge-retrieval-assets-v1-';
const bounded=(promise,ms,fallback)=>{let timer;return Promise.race([promise,new Promise(resolve=>{timer=setTimeout(()=>resolve(fallback),ms);})]).finally(()=>clearTimeout(timer));};
export const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
export async function verifyAsset(path,bytes){
  const meta=ASSETS[path];
  if(!meta||bytes.byteLength!==meta.size||await digest(bytes)!==meta.sha256)throw new Error(path+' integrity check failed');
  return bytes;
}
async function assetCache(){
  if(!globalThis.caches)return null;
  const name=CACHE_PREFIX+VERSION,cache=await caches.open(name);
  // Never touch the shared service worker's caches or Transformers' cache.
  const names=(await caches.keys()).filter(n=>n.startsWith(CACHE_PREFIX)&&n!==name);
  await Promise.all(names.slice(0,Math.max(0,names.length-1)).map(n=>caches.delete(n)));
  return cache;
}
export async function fetchAsset(path,{signal,onProgress=()=>{},fetchImpl=globalThis.fetch.bind(globalThis),bases=[DOMESTIC,new URL('./',import.meta.url).href],cache=true,idleMs=10000,hedgeMs=3500,budgetMs=180000}={}){
  const meta=ASSETS[path];if(!meta)throw new Error('Unknown retrieval resource: '+path);
  if(signal?.aborted)throw signal.reason;
  const key=new URL(path,DOMESTIC).href;
  let storage;
  if(cache)try{
    storage=await bounded(assetCache(),1000,null);const hit=await bounded(Promise.resolve(storage?.match(key)),1000,null);
    if(hit){try{const bytes=await verifyAsset(path,await hit.arrayBuffer());onProgress({status:'cache',file:path});return bytes;}
      catch{await storage.delete(key);}}
  }catch{/* Storage denial/quota must never stop retrieval. */}
  const controller=new AbortController(),errors=[];
  let idleTimers=new Set(),hedge,totalTimer;
  const abort=()=>controller.abort(signal.reason);
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted)abort();
  const sources=[...new Set(bases)];
  let nextSource=0,active=0,settled=false;
  try{
    const bytes=await new Promise((resolve,reject)=>{
      const finishError=e=>{if(!settled){settled=true;reject(e);controller.abort(e);}};
      const cancelled=()=>finishError(controller.signal.reason||new Error('Retrieval cancelled'));
      controller.signal.addEventListener('abort',cancelled,{once:true});
      if(controller.signal.aborted){cancelled();return;}
      totalTimer=setTimeout(()=>finishError(new Error(path+' download timeout')),budgetMs);
      async function attempt(base){
        active++;const one=new AbortController();
        const cancel=()=>one.abort(controller.signal.reason);
        controller.signal.addEventListener('abort',cancel,{once:true});
        let idle;
        const touch=()=>{clearTimeout(idle);idleTimers.delete(idle);idle=setTimeout(()=>one.abort(new Error(path+' connection stalled')),idleMs);idleTimers.add(idle);};
        const source=base===DOMESTIC?'国内':'备用';
        try{
          onProgress({status:'source',file:path,source});touch();
          const response=await fetchImpl(new URL(path,base).href,{signal:one.signal,cache:'default',credentials:'omit'});
          if(!response.ok)throw new Error('HTTP '+response.status);
          const reader=response.body?.getReader();let bytes;
          if(reader){
            const chunks=[];let loaded=0;
            while(true){const {value,done}=await reader.read();if(done)break;touch();loaded+=value.byteLength;
              if(loaded>meta.size){await reader.cancel();throw new Error('Oversized retrieval resource');}
              chunks.push(value);onProgress({status:'progress',file:path,source,loaded,total:meta.size});}
            bytes=new Uint8Array(loaded);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}bytes=bytes.buffer;
          }else bytes=await response.arrayBuffer();
          await verifyAsset(path,bytes);
          if(one.signal.aborted)throw one.signal.reason;
          if(!settled){settled=true;resolve(bytes);controller.abort(new Error('Verified source selected'));}
        }catch(e){errors.push(source+': '+(e?.message||e));}
        finally{
          clearTimeout(idle);idleTimers.delete(idle);controller.signal.removeEventListener('abort',cancel);active--;
          if(!settled){if(nextSource<sources.length)start();else if(!active)finishError(new Error(path+' unavailable ('+errors.join('; ')+')'));}
        }
      }
      function start(){if(nextSource<sources.length)void attempt(sources[nextSource++]);}
      if(!sources.length){finishError(new Error('No retrieval sources'));return;}
      start();hedge=setTimeout(()=>{if(!settled)start();},hedgeMs);
    });
    if(signal?.aborted)throw signal.reason;
    if(storage)try{await bounded(storage.put(key,new Response(bytes,{headers:{'Content-Type':meta.type}})),1000,null);}catch{/* usable without persistence */}
    return bytes;
  }finally{
    clearTimeout(hedge);clearTimeout(totalTimer);for(const timer of idleTimers)clearTimeout(timer);
    signal?.removeEventListener('abort',abort);controller.abort();
  }
}
export async function loadEmbedding(name,rows,options){
  const vector=new Float32Array(await fetchAsset('data/'+name,options));
  if(vector.length!==rows*512)throw new Error(name+' dimensions mismatch');
  return vector;
}
