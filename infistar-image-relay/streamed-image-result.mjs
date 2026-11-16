// Backend-only storage/response adapter. Keep the browser's existing JSON
// contract without constructing a second complete Base64/escaped JSON image.
import {imageResultItem} from '../forge/step3-image-protocol.mjs';
import {publicUrl} from './image-result.mjs';
import {imageObjectKey,payloadObject,payloadBucket} from './job-payloads.mjs';
const MAX=32*1024*1024,PART=5*1024*1024,enc=new TextEncoder();
export function imageMime(b){
  if(b[0]===137&&String.fromCharCode(...b.subarray(1,4))==='PNG')return 'image/png';
  if(b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
  if(String.fromCharCode(...b.subarray(0,4))==='RIFF'&&String.fromCharCode(...b.subarray(8,12))==='WEBP')return 'image/webp';
  throw Error('INVALID_IMAGE');
}
export function extractImage(raw){
  if(!raw.ok)return null;
  let data;try{data=JSON.parse(raw.text);}catch{throw Error('INVALID_JSON');}
  const item=imageResultItem(data);if(!item)throw Error('NO_IMAGE');
  return item;
}
export async function storeImage(env,meta,item,fetchImpl=fetch){
  const key=imageObjectKey(meta),bucket=payloadBucket(env,meta),customMetadata={expires:String(meta.expires)};
  if(item.b64_json){
    const b64=item.b64_json;
    if(b64.length>Math.ceil(MAX/3)*4||b64.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(b64))throw Error('INVALID_IMAGE');
    const mime=imageMime(Uint8Array.from(atob(b64.slice(0,32)),c=>c.charCodeAt(0)));
    if(!await bucket.put(key,b64,{customMetadata:{...customMetadata,encoding:'base64',mime}}))throw Error('IMAGE_PAYLOAD_WRITE_FAILED');
    return {mime,encoding:'base64',bytes:b64.length/4*3-(b64.endsWith('==')?2:b64.endsWith('=')?1:0)};
  }
  let url=publicUrl(item.url),response;
  for(let i=0;i<5;i++){
    response=await fetchImpl(url.href,{redirect:'manual',signal:AbortSignal.timeout(90000)});
    if(![301,302,303,307,308].includes(response.status))break;
    await response.body?.cancel();url=publicUrl(new URL(response.headers.get('location'),url).href);response=null;
  }
  if(!response)throw Error('IMAGE_REDIRECT_LIMIT');
  if(!response.ok)throw Error('IMAGE_DOWNLOAD_HTTP_'+response.status);
  if(Number(response.headers.get('content-length'))>MAX){await response.body?.cancel();throw Error('IMAGE_TOO_LARGE');}
  // R2 multipart accepts bounded buffers even when the origin has no known
  // Content-Length. At most one 5 MiB part is accumulated per generation.
  const reader=response.body.getReader(),head=new Uint8Array(12);let headSize=0,size=0,used=0,part=new Uint8Array(PART),upload,parts=[],mime;
  try{
    for(;;){const {done,value}=await reader.read();if(done)break;
      size+=value.length;if(size>MAX)throw Error('IMAGE_TOO_LARGE');
      if(headSize<12){const n=Math.min(12-headSize,value.length);head.set(value.subarray(0,n),headSize);headSize+=n;}
      if(!upload&&headSize>=12){mime=imageMime(head);upload=await bucket.createMultipartUpload(key,{httpMetadata:{contentType:mime},customMetadata:{...customMetadata,encoding:'binary',mime}});}
      let offset=0;while(offset<value.length){const n=Math.min(PART-used,value.length-offset);part.set(value.subarray(offset,offset+n),used);used+=n;offset+=n;
        if(used===PART){if(!upload)throw Error('INVALID_IMAGE');parts.push(await upload.uploadPart(parts.length+1,part));used=0;}
      }
    }
    if(!upload)throw Error('INVALID_IMAGE');
    if(used)parts.push(await upload.uploadPart(parts.length+1,part.subarray(0,used)));
    await upload.complete(parts);return {mime,encoding:'binary',bytes:size};
  }catch(error){await reader.cancel().catch(()=>{});await upload?.abort().catch(()=>{});throw error;}
}
function encode64(bytes){let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return enc.encode(btoa(text));}
export function imageResponseStream(body,descriptor,result){
  const marker='__STEP3_IMAGE_BASE64_STREAM__';
  const nested=JSON.stringify({data:[{b64_json:marker,mimeType:descriptor.mime}]}),envelope=JSON.stringify({...result,text:nested});
  const [prefix,suffix]=envelope.split(marker);if(suffix===undefined)throw Error('INVALID_RESULT_ENVELOPE');
  const reader=body.getReader();let started=false,tail=new Uint8Array(0),pending,finished=false;
  return new ReadableStream({async pull(controller){
    try{
      if(!started){started=true;controller.enqueue(enc.encode(prefix));return;}
      if(pending?.length){const chunk=pending.subarray(0,24576);pending=pending.subarray(chunk.length);controller.enqueue(encode64(chunk));return;}
      if(finished){if(tail.length){controller.enqueue(encode64(tail));tail=new Uint8Array(0);return;}controller.enqueue(enc.encode(suffix));controller.close();return;}
      const {done,value}=await reader.read();if(done){finished=true;return this.pull(controller);}
      if(descriptor.encoding==='base64'){controller.enqueue(value);return;}
      const bytes=new Uint8Array(tail.length+value.length);bytes.set(tail);bytes.set(value,tail.length);const n=bytes.length-bytes.length%3;
      tail=bytes.slice(n);pending=bytes.subarray(0,n);return this.pull(controller);
    }catch(error){controller.error(error);await reader.cancel().catch(()=>{});}
  },cancel(reason){return reader.cancel(reason);}});
}
export async function streamedResult(env,meta){
  const record=JSON.parse(await (await payloadObject(env,meta,'result')).text());
  const image=await payloadObject(env,meta,'image');
  return new Response(imageResponseStream(image.body,record.image,record.result),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
}
