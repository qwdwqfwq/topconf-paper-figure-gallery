import {revisionFailure} from './revision-diagnostics.mjs';
// Step 3 revision results only. Retrying a stored image never starts generation.
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const transient=status=>[408,425,429].includes(status)||status>=500;
export async function receiveRevisionOutput(image,provider,toDataURL,{fetchImpl=globalThis.fetch.bind(globalThis),wait=sleep,deadlineMs=120000,requestMs=90000,onProgress=()=>{},diagnostics,key=''}={}){
 let url;if(provider==='nonelinear'&&!image.startsWith('data:')){try{url=new URL(image);}catch{throw Error('服务商返回了无效图片地址。');}}
 const relay=provider==='nonelinear'&&url?.protocol==='https:'&&url.hostname==='imagen-nonelinear-2025.tos-cn-beijing.volces.com'&&!url.port&&!url.username&&!url.password&&!url.search&&!url.hash&&/^\/(?:others|gemini)\/[A-Za-z0-9_-]+\.(?:png|jpe?g|webp)$/.test(url.pathname);
 const end=Date.now()+deadlineMs;let last,interrupted=false;
 await diagnostics?.record({stage:'image-download',outcome:'started'});
 for(let attempt=0;;attempt++){
  if(attempt&&Date.now()>=end)break;
  const controller=new AbortController();let timer;const started=Date.now();
  try{
   const output=await Promise.race([
    new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Object.assign(Error('图片接收超时'),{retryable:true}));},Math.max(1,Math.min(requestMs,end-Date.now())));}),
    (async()=>{
     if(!relay)return toDataURL(image);
     const response=await fetchImpl('https://analysis.topconf-paper-figure-gallery.cn/revision-image',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:url.href}),
      credentials:'omit',redirect:'error',signal:controller.signal
     });
     if(!response.ok)throw Object.assign(Error('HTTP '+response.status),{retryable:transient(response.status),httpStatus:response.status});
     const blob=await response.blob();
     return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('修改图读取失败。'));reader.readAsDataURL(blob);});
    })()
   ]);
   if(interrupted)await diagnostics?.record({stage:'image-download',outcome:'recovered',attempt:attempt+1,elapsedMs:Date.now()-started});
   return output;
  }catch(error){
   last=revisionFailure(Object.assign(error,{code:'REVISION_RESULT_DOWNLOAD'}),'image-download',{httpStatus:error.httpStatus,attempt:attempt+1,elapsedMs:Date.now()-started},key);
   await diagnostics?.record({...last.diagnostic,outcome:'request-error'});interrupted=true;
   const retryable=error.retryable??(/Failed to fetch|NetworkError|Load failed/i.test(error.message)||['AbortError','TimeoutError'].includes(error.name));
   if(!retryable||Date.now()>=end)break;
  }finally{clearTimeout(timer);controller.abort();}
  onProgress('修改结果已返回，正在恢复图片下载；不会重复生图。');
  await wait(Math.min(1500*(attempt+1),5000,Math.max(0,end-Date.now())));
 }
 throw last;
}
