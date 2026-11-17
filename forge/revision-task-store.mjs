// Bitmap edit recovery only. No reconstruction or export state is stored here.
export function createRevisionTaskStore(indexedDB=globalThis.indexedDB){
 let opened;
 function open(){return opened||=(new Promise((resolve,reject)=>{
  if(!indexedDB)return reject(Error('浏览器不能保存修改任务；本次未提交。请允许此网站使用本机存储。'));
  const r=indexedDB.open('figureforge-bitmap-edit-tasks',1);
  r.onupgradeneeded=()=>r.result.createObjectStore('tasks',{keyPath:'id'});
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
 }));}
 async function operation(mode,run){
  const db=await open();return new Promise((resolve,reject)=>{
   const tx=db.transaction('tasks',mode),r=run(tx.objectStore('tasks'));
   tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('修改任务未能保存；本次未提交。'));
  });
 }
 return {write:value=>operation('readwrite',s=>s.put(value)),read:id=>operation('readonly',s=>s.get(id)),list:()=>operation('readonly',s=>s.getAll())};
}
export const revisionTaskStore=createRevisionTaskStore();
export function revisionTaskInput(parent){
 const result={};
 for(const name of ['id','number','image','width','height','source','origin','originalName','step1Context','route','attachments','editRegions','manualScope','localRedraw','freeRevision','revisionMode','confirmScope'])
  if(parent[name]!==undefined)result[name]=structuredClone(parent[name]);
 return result;
}
