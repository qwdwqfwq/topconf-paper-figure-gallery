// Used only by analyzeReferences(). Image generation and exports do not import it.
export const ANALYSIS_JOB_BASE='https://public.gallery-reference-analysis.pages.dev';
const hosts=new Set(['gallery-nonelinear-relay.lixiao-gallery.workers.dev','api.nonelinear.com.cn','api.nonelinear.com']);
export function usesAnalysisJob(provider,url){try{const u=new URL(url);return provider==='nonelinear'&&u.protocol==='https:'&&hosts.has(u.hostname)&&u.pathname==='/v1/chat/completions';}catch{return false;}}
async function digest(text){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function storageGet(storage,key){try{return JSON.parse(storage?.getItem(key)||'null');}catch{return null;}}
function storageSet(storage,key,value){try{storage?.setItem(key,JSON.stringify(value));}catch{}}
function storageDelete(storage,key){try{storage?.removeItem(key);}catch{}}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function requestReferenceAnalysis({provider,url,init,fetchImpl=globalThis.fetch,storage=globalThis.sessionStorage,sleep=pause,now=Date.now,deadlineMs=15*60*1000,networkMs=20000,pollMs=2000,uuid=()=>crypto.randomUUID()}){
 if(!usesAnalysisJob(provider,url))return fetchImpl(url,init);
 const authorization=new Headers(init.headers).get('Authorization');
 // Persist only hashes and the opaque task identifier, never the key or pictures.
 const slot='gallery.reference-analysis.v1.'+await digest(url+'\n'+authorization+'\n'+init.body);
 const saved=storageGet(storage,slot),start=now();
 const resume=saved&&/^[0-9a-f-]{36}$/.test(saved.id)&&saved.created>start-86400000;
 const task=resume?saved:{id:uuid(),created:start};storageSet(storage,slot,task);
 const endpoint=ANALYSIS_JOB_BASE+'/jobs/'+task.id;
 let accepted=!!resume,submit=!resume,lastError='';
 async function read(target,options){
  const response=await fetchImpl(target,{...options,signal:AbortSignal.timeout(networkMs)});
  // Read and validate completely before exposing it. An interrupted result GET is
  // safe to repeat; retrying the model POST would not be safe.
  const text=await response.text();let data;try{data=JSON.parse(text);}catch{throw Error('归纳结果读取中断');}
  return {response,text,data};
 }
 while(now()-start<deadlineMs){
  try{
   if(submit){
    submit=false;
    const ack=await read(endpoint,{method:'PUT',headers:init.headers,body:init.body});
    if(ack.response.status!==202){
     const error=ack.data?.error;
     if(ack.response.status>=500)throw Error('归纳任务提交暂时不可用');
     return new Response(JSON.stringify({error:typeof error==='object'?{...error,request_id:task.id}:{message:String(error||'归纳任务提交失败'),code:'analysis_job_rejected',request_id:task.id}}),{status:ack.response.status,headers:{'Content-Type':'application/json'}});
    }
    accepted=true;
   }
   const result=await read(endpoint+'/result',{headers:{Authorization:authorization}});
   if(result.response.status===404){
    // A lost submission acknowledgement is retried with THE SAME task id. The
    // backend serializes duplicate PUTs and never repeats the upstream call.
    accepted=false;submit=true;
   }else if(result.response.status===202){accepted=true;}
   else if(result.response.status>=500){throw Error('归纳结果暂时无法读取');}
   else{
    if(result.response.status===410){storageDelete(storage,slot);return new Response(JSON.stringify({error:{message:'保存的归纳任务已过期，请重新发起归纳。',code:'analysis_job_expired',request_id:task.id}}),{status:410,headers:{'Content-Type':'application/json'}});}
    if(result.data.error&&typeof result.data.error==='object')result.data.error.request_id??=task.id;
    if(!result.data.error)storageDelete(storage,slot);
    return new Response(JSON.stringify(result.data),{status:result.response.status,headers:{'Content-Type':'application/json','X-Analysis-Job-Id':task.id}});
   }
  }catch(error){lastError=error?.message||'网络连接中断';if(!accepted)submit=true;}
  await sleep(pollMs);
 }
 throw Error('归纳任务的结果暂未读到，任务编号 '+task.id+'。请保留页面，稍后再次点击将读取同一任务，不会自动重复提交模型。'+(lastError?'（'+lastError+'）':''));
}
