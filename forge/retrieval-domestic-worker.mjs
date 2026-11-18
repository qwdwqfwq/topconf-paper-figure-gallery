// Keep the existing CLIP inference implementation byte-identical. Only its public
// model/WASM downloads use verified domestic assets with the original fallback.
import {ASSETS} from './retrieval-assets.mjs';
import {fetchAsset} from './retrieval-resource-loader.mjs';
const nativeFetch=self.fetch.bind(self),base=new URL('./',import.meta.url);
self.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,base);
  const path=url.origin===base.origin&&url.pathname.startsWith(base.pathname)?url.pathname.slice(base.pathname.length):'';
  if(ASSETS[path]&&(!init?.method||init.method==='GET')&&(!input?.method||input.method==='GET')){
    const bytes=await fetchAsset(path,{fetchImpl:nativeFetch,signal:init?.signal||input?.signal,onProgress:progress=>self.postMessage({type:'progress',progress})});
    return new Response(bytes,{headers:{'Content-Type':ASSETS[path].type,'Content-Length':String(bytes.byteLength)}});
  }
  return nativeFetch(input,init);
};
// Messages can arrive while module dependencies are loading. Queue the initial
// message before the asynchronous import, then hand every message to the old worker.
const queued=[];self.onmessage=event=>queued.push(event);
await import('./retrieval-worker.mjs');
for(const event of queued)await self.onmessage(event);
