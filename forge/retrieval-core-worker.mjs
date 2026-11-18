import {buildIndex} from './retrieval.mjs';
import {fetchAsset,digest} from './retrieval-resource-loader.mjs';
import {VERSION,ROWS} from './retrieval-assets.mjs';
const DB='forge-keyword-index-v1';
const fingerprint=async value=>digest(new TextEncoder().encode(JSON.stringify(value,(_,v)=>v instanceof Map?{map:[...v]}:v instanceof Set?{set:[...v]}:v)));
const bounded=(promise,ms,fallback)=>{let timer;return Promise.race([promise,new Promise(r=>{timer=setTimeout(()=>r(fallback),ms);})]).finally(()=>clearTimeout(timer));};
function database(){return new Promise((resolve,reject)=>{
  if(!globalThis.indexedDB){resolve(null);return;}
  const request=indexedDB.open(DB,1);
  request.onupgradeneeded=()=>request.result.createObjectStore('versions');
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>resolve(null);
});}
function valid(data,index){
  if(data?.N!==ROWS||data.ids?.length!==ROWS||data.figs?.length!==ROWS||data.bm?.docs?.length!==ROWS||data.figs.some((f,i)=>f.id!==data.ids[i])||index?.rows?.length!==ROWS||!(index.rows[0]?.tf instanceof Map)||!(index.rows[0]?.title instanceof Set)||!Number.isFinite(index.avgdl))throw new Error('Invalid cached keyword index');
}
async function readCache(){
  let db;
  try{
    db=await database();if(!db)return null;
    const saved=await new Promise((resolve,reject)=>{const r=db.transaction('versions').objectStore('versions').get(VERSION);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    if(!saved)return null;valid(saved.data,saved.index);
    if(saved.hash!==await fingerprint([saved.data,saved.index]))return null;
    return saved;
  }catch{return null;}finally{db?.close();}
}
async function writeCache(data,index){
  let db;
  try{
    const hash=await fingerprint([data,index]);db=await database();if(!db)return;
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('versions','readwrite'),store=tx.objectStore('versions');
      store.put({data,index,hash},VERSION);
      const keys=store.getAllKeys();keys.onsuccess=()=>{const old=keys.result.filter(k=>k!==VERSION);for(const key of old.slice(0,Math.max(0,old.length-1)))store.delete(key);};
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
  }catch{/* Search still works when persistence is denied. */}finally{db?.close();}
}
self.onmessage=async({data:message})=>{
  if(message.type!=='load')return;
  const progress=p=>self.postMessage({type:'progress',progress:p});
  try{
    progress({status:'cache-check'});
    const cached=await bounded(readCache(),1200,null);
    if(cached){progress({status:'cache',file:'keyword index'});self.postMessage({type:'ready',data:cached.data,index:cached.index,cached:true});return;}
    const json=async name=>JSON.parse(new TextDecoder().decode(await fetchAsset('data/'+name,{cache:false,onProgress:progress,idleMs:6000,hedgeMs:1500,budgetMs:24000})));
    const [figs,ids,bm]=await Promise.all(['figures.json','ids.json','bm25.json'].map(json));
    const data={figs,ids,bm,IE:null,TE:null,N:ids.length};
    progress({status:'build'});const index=buildIndex(data);valid(data,index);
    // Send only after a single, validated dataset is available. Never commit partial rows.
    await bounded(writeCache(data,index),1200,null);
    self.postMessage({type:'ready',data,index,cached:false});
  }catch(error){self.postMessage({type:'error',message:error?.message||String(error)});}
};
