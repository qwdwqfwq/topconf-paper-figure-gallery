import {REVISION_CHUNK,validUpload,revisionDigest} from '../forge/revision-upload.mjs';
const ROW=32000,RETENTION=24*60*60*1000;
const same=(a,b)=>a?.count===b?.count&&a?.digest===b?.digest;
export {same as sameUpload};
export async function clearUpload(storage){
 for(;;){const keys=[...(await storage.list({prefix:'upload:',limit:128})).keys()];if(!keys.length)return;await storage.delete(keys);}
}
export async function readUpload(storage,descriptor){
 const manifest=await storage.get('upload:manifest');
 if(!same(manifest,descriptor)||Object.keys(manifest.parts).length!==manifest.count)throw Error('UPLOAD_INCOMPLETE');
 const parts=[];
 for(let i=0;i<manifest.count;i++){
  const keys=Array.from({length:manifest.parts[i].rows},(_,row)=>`upload:${i}:${row}`);
  const values=await storage.get(keys,{noCache:true});
  if(keys.some(k=>typeof values.get(k)!=='string'))throw Error('UPLOAD_INCOMPLETE');
  parts.push(keys.map(k=>values.get(k)).join(''));
 }
 const text=parts.join('');
 if(await revisionDigest(text)!==descriptor.digest)throw Error('UPLOAD_CORRUPT');
 return text;
}
export async function receiveUpload(storage,descriptor,index,data){
 if(!validUpload(descriptor)||!Number.isInteger(index)||index<0||index>=descriptor.count||typeof data!=='string'||!data.length||data.length>REVISION_CHUNK||(index<descriptor.count-1&&data.length!==REVISION_CHUNK))throw Error('INVALID_UPLOAD');
 let manifest=await storage.get('upload:manifest');
 if(manifest&&Date.now()>=manifest.expires)throw Error('UPLOAD_EXPIRED');
 if(manifest&&!same(manifest,descriptor))throw Error('UPLOAD_CONFLICT');
 manifest||={...descriptor,created:Date.now(),expires:Date.now()+RETENTION,parts:{}};
 const hash=await revisionDigest(data),existing=manifest.parts[index];
 if(existing){if(existing.hash!==hash)throw Error('UPLOAD_CONFLICT');return manifest;}
 const rows=Math.ceil(data.length/ROW),record={};
 for(let row=0;row<rows;row++)record[`upload:${index}:${row}`]=data.slice(row*ROW,(row+1)*ROW);
 // One bounded batch instead of hundreds of sequential writes under a DO lock.
 await storage.put(record,{noCache:true});
 manifest.parts[index]={hash,rows};
 await storage.put('upload:manifest',manifest);
 await storage.setAlarm(manifest.expires); // Abandoned, uncommitted uploads expire without generation.
 return manifest;
}
