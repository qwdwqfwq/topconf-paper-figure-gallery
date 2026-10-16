// Cache contains image-derived objects, never API credentials. Storage failure
// must not prevent reconstruction. Keep at most three sessions for seven days.
const memory=new Map();
const TTL=7*24*3600*1000;
export async function reconstructionCacheKey(source,configuration){
  const bytes=new TextEncoder().encode(JSON.stringify(['full-scene-v3-fidelity',source,configuration]));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
}
async function database(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('figureforge-reconstruction',1);
    let expired=false;
    const timer=setTimeout(()=>{expired=true;reject(new Error('Cache unavailable'));},2000);
    request.onupgradeneeded=()=>request.result.createObjectStore('sessions',{keyPath:'key'});
    request.onsuccess=()=>{clearTimeout(timer);if(expired)request.result.close();else resolve(request.result);};
    request.onerror=()=>{clearTimeout(timer);reject(request.error);};
  });
}
export async function readReconstructionCache(key){
  let entry=memory.get(key);
  try{
    const db=await database();
    try{entry=await new Promise((resolve,reject)=>{
      const request=db.transaction('sessions').objectStore('sessions').get(key);
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    })||entry;}finally{db.close();}
  }catch{}
  return entry&&Date.now()-entry.savedAt<TTL?structuredClone(entry.value):null;
}
export async function writeReconstructionCache(key,value){
  const entry={key,value:structuredClone(value),savedAt:Date.now()};
  memory.delete(key);memory.set(key,entry);
  while(memory.size>3)memory.delete(memory.keys().next().value);
  try{
    const db=await database();
    try{await new Promise((resolve,reject)=>{
      const tx=db.transaction('sessions','readwrite'),store=tx.objectStore('sessions');
      store.put(entry);
      const request=store.getAll();
      request.onsuccess=()=>request.result.sort((a,b)=>b.savedAt-a.savedAt).forEach((v,i)=>{
        if(i>=3||Date.now()-v.savedAt>=TTL)store.delete(v.key);
      });
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });}finally{db.close();}
  }catch{}
}
export function visionQueue(limit=3){
  let active=0;const queue=[];
  const pump=()=>{
    while(active<limit&&queue.length){
      const {run,resolve,reject}=queue.shift();active++;
      Promise.resolve().then(run).then(resolve,reject).finally(()=>{active--;pump();});
    }
  };
  return run=>new Promise((resolve,reject)=>{queue.push({run,resolve,reject});pump();});
}
