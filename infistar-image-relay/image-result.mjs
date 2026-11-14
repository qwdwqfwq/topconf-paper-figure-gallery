import {imageResultItem} from '../forge/step3-image-protocol.mjs';
const MAX_IMAGE=32*1024*1024;
function mime64(value){
  let bytes;try{bytes=Uint8Array.from(atob(value.slice(0,32)),c=>c.charCodeAt(0));}catch{return null;}
  if(bytes[0]===137&&String.fromCharCode(...bytes.slice(1,4))==='PNG')return 'image/png';
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';
  return null;
}
function publicUrl(value){
  const u=new URL(value);
  // URLs originate in the provider response. Limit downloads to public DNS
  // names and verify each redirect; never forward the generation credential.
  if(u.protocol!=='https:'||u.username||u.password||u.port||!u.hostname.includes('.')||/^[\d.]+$/.test(u.hostname)||u.hostname.includes(':')||/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(u.hostname))throw Error('UNSAFE_IMAGE_URL');
  return u;
}
async function download(value,fetchImpl){
  let url=publicUrl(value);const signal=AbortSignal.timeout(90000);
  for(let redirects=0;redirects<5;redirects++){
    const r=await fetchImpl(url.href,{redirect:'manual',signal});
    if([301,302,303,307,308].includes(r.status)){await r.body?.cancel();url=publicUrl(new URL(r.headers.get('location'),url).href);continue;}
    if(!r.ok)throw Error('IMAGE_DOWNLOAD_HTTP_'+r.status);
    if(Number(r.headers.get('content-length'))>MAX_IMAGE)throw Error('IMAGE_TOO_LARGE');
    const reader=r.body.getReader(),chunks=[];let length=0;
    for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>MAX_IMAGE){await reader.cancel();throw Error('IMAGE_TOO_LARGE');}chunks.push(value);}
    let binary='';for(const bytes of chunks)for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
    return btoa(binary);
  }throw Error('IMAGE_REDIRECT_LIMIT');
}
export async function preserveImageResult(result,fetchImpl=fetch){
  if(!result.ok)return result;
  let data;try{data=JSON.parse(result.text);}catch{return {...result,ok:false,resultError:'INVALID_JSON'};}
  const item=imageResultItem(data);
  if(!item)return {...result,ok:false,resultError:'NO_IMAGE'};
  let b64=item.b64_json;
  if(!b64&&item.url){
    try{b64=await download(item.url,fetchImpl);}
    catch(error){return {...result,downloadError:error.message};} // Original URL remains recoverable; no generation retry.
  }
  const mime=mime64(b64||'');
  if(!mime||b64.length>Math.ceil(MAX_IMAGE*4/3)||!/^[A-Za-z0-9+/]*={0,2}$/.test(b64))return {...result,ok:false,resultError:'INVALID_IMAGE'};
  // A durable copy avoids temporary URL expiry, browser CORS and falsely
  // labeling JPEG/WebP as PNG. Keep transport diagnostics beside the image.
  return {...result,downloadError:undefined,text:JSON.stringify({data:[{b64_json:b64,mimeType:mime}]})};
}
