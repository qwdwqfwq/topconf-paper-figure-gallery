// Used only by analyzeReferences(). Image generation and exports do not import it.
import {requestDirectAnalysis} from './step3-analysis-direct.mjs';
import {TEMPORARY_INFISTAR_DIRECT} from './infistar-temporary-direct.mjs';
export const ANALYSIS_JOB_BASE='https://analysis.topconf-paper-figure-gallery.cn/analysis';
// Tencent runs the durable analysis service directly, without an overseas ingress.
export const ANALYSIS_JOB_BASES=Object.freeze([ANALYSIS_JOB_BASE]);
const hosts=new Set(['gallery-nonelinear-relay.lixiao-gallery.workers.dev','api.nonelinear.com.cn','api.nonelinear.com','analysis.topconf-paper-figure-gallery.cn']);
export function analysisUpstream(provider,url){
 try{
  const u=new URL(url);
  if(u.protocol!=='https:'||u.port||u.username||u.password||u.search||u.hash||u.pathname!=='/v1/chat/completions')return null;
  if(provider==='nonelinear'&&hosts.has(u.hostname))return 'nonelinear';
  if(provider==='infistar'&&u.hostname==='infistar.cc')return 'infistar-cc';
  if(provider==='infistar'&&u.hostname==='infistar.ai')return 'infistar-ai';
 }catch{}
 return null;
}
export const usesAnalysisJob=(provider,url)=>analysisUpstream(provider,url)!==null;
async function digest(text){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function storageGet(storage,key){try{return JSON.parse(storage?.getItem(key)||'null');}catch{return null;}}
function storageSet(storage,key,value){try{storage?.setItem(key,JSON.stringify(value));}catch{}}
function storageDelete(storage,key){try{storage?.removeItem(key);}catch{}}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function requestReferenceAnalysis({provider,url,init,fetchImpl=globalThis.fetch,storage=globalThis.sessionStorage,sleep=pause,now=Date.now,deadlineMs=15*60*1000,networkMs=20000,submitMs=120000,pollMs=2000,hedgeMs=1500,probeMs=6000,probe=true,jobBases=ANALYSIS_JOB_BASES,uuid=()=>crypto.randomUUID()}){
 const upstream=analysisUpstream(provider,url);
 if(!upstream)return fetchImpl(url,init);
 const headers=new Headers(init.headers),authorization=headers.get('Authorization');
 // NoneLinear retains its existing task namespace and wire format.
 if(upstream!=='nonelinear')headers.set('X-Analysis-Upstream',upstream);
 const readHeaders=new Headers({Authorization:authorization});
 if(upstream!=='nonelinear')readHeaders.set('X-Analysis-Upstream',upstream);
 // Persist only hashes and the opaque task identifier, never the key or pictures.
 let slot='gallery.reference-analysis.v1.'+await digest(url+'\n'+authorization+'\n'+init.body);
 let saved=storageGet(storage,slot);
 // A base-URL migration must still find the old opaque task ID. Old server
 // storage is separate: a missing legacy job must never become a new paid call.
 if(!saved&&upstream==='nonelinear'){
  for(const oldBase of ['https://gallery-nonelinear-relay.lixiao-gallery.workers.dev/v1','https://api.nonelinear.com.cn/v1','https://api.nonelinear.com/v1']){
   const oldSlot='gallery.reference-analysis.v1.'+await digest(oldBase+'/chat/completions'+'\n'+authorization+'\n'+init.body);
   const old=storageGet(storage,oldSlot);if(old){slot=oldSlot;saved=old;break;}
  }
 }
 const start=now();
 const resume=saved&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(saved.id)&&Number.isFinite(saved.created)&&saved.created<=start&&saved.created>start-86400000;
 // Temporary ingress bypass; preserve uncertain paid jobs across route changes.
 const infistar=upstream==='infistar-cc'||upstream==='infistar-ai';
 if(infistar&&resume&&saved.transport==='direct')return requestDirectAnalysis({url,init,fetchImpl,storage,slot,id:saved.id,now,deadlineMs});
 if(infistar&&TEMPORARY_INFISTAR_DIRECT){
  if(resume)return new Response(JSON.stringify({error:{message:'此归纳任务已记录在原后台，备案期间暂不能取回。任务编号 '+saved.id+' 已保留；为避免重复扣费，本次未重新提交模型。请先核对服务商记录。',code:'analysis_temporary_direct_legacy_job',request_id:saved.id}}),{status:409,headers:{'Content-Type':'application/json'}});
  return requestDirectAnalysis({url,init,fetchImpl,storage,slot,id:uuid(),now,deadlineMs});
 }
 const task=resume?saved:{id:uuid(),created:start,endpoint:jobBases[0]};storageSet(storage,slot,task);
 const bases=[...new Set(jobBases)];
 if(!bases.length)throw new Error('归纳服务入口未配置');
 let preferred=bases[0];
 // A locally saved UUID is not proof that the server accepted a submission.
 // Legacy records have no acknowledgement flag: read them before any PUT.
 let accepted=task.accepted===true,submit=!resume,lastFailure={phase:'submit',kind:'transport'},requests=0;
 function confirm(){accepted=true;task.accepted=true;storageSet(storage,slot,task);}
 function serviceResponse(data,status){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','X-Analysis-Error-Layer':'job-service','X-Analysis-Job-Id':task.id}});}
 async function read(base,path,options,phase,signal){
  const diagnostic={phase,kind:'transport',jobEndpoint:base};requests++;
  try{
  const response=await fetchImpl(base+path,{...options,signal});
  diagnostic.kind='response-read';diagnostic.httpStatus=response.status;
  // Read and validate completely before exposing it. An interrupted result GET is
  // safe to repeat; retrying the model POST would not be safe.
  const text=await response.text();let data;try{data=JSON.parse(text);}catch{diagnostic.kind='invalid-response';throw Error('归纳任务服务返回了无效 JSON');}
  if(response.status>=500&&!response.headers.get('X-Analysis-Job-Id')){diagnostic.kind='service-http';throw Error('归纳服务入口暂时不可用');}
  preferred=base;lastFailure=diagnostic;
  return {response,text,data};
  }catch(error){
   if(diagnostic.kind==='transport'&&(signal?.reason?.name==='TimeoutError'||error?.name==='TimeoutError'))diagnostic.kind='timeout';
   throw Object.assign(new Error('归纳服务连接尚未完成'),{name:error?.name||'Error',analysisJobAttempt:diagnostic});
  }
 }
 // GETs are read-only. Start a second route without waiting for the stalled
 // route's 20-second timeout, then abort the losing reads (including bodies).
 async function across(path,options,phase,stagger,timeout){
  const ordered=[preferred,...bases.filter(b=>b!==preferred)],controllers=[],timers=[];
  let settled=false,accelerate=()=>{};
  const attempts=ordered.map((base,index)=>new Promise((resolve,reject)=>{
   let started=false;
   const launch=()=>{
    if(started||settled)return;started=true;
    const controller=new AbortController();controllers.push(controller);
    timers.push(setTimeout(()=>controller.abort(new DOMException('归纳连接超时','TimeoutError')),timeout));
    read(base,path,options,phase,controller.signal).then(result=>{
     if(phase==='health'&&result.data?.ready!==true)throw Error('归纳服务未就绪');
     resolve(result);
    }).catch(error=>{accelerate();reject(error);});
   };
   if(index===0)queueMicrotask(launch);
   else{const earlier=accelerate;accelerate=()=>{earlier();launch();};timers.push(setTimeout(launch,index*stagger));}
  }));
  try{return await Promise.any(attempts);}
  catch(error){const attempt=error.errors?.find(e=>e?.analysisJobAttempt);if(attempt)lastFailure=attempt.analysisJobAttempt;throw attempt||error;}
  finally{settled=true;for(const timer of timers)clearTimeout(timer);for(const controller of controllers)controller.abort();}
 }
 if(submit&&probe){
  try{await across('/health',{},'health',0,Math.min(probeMs,deadlineMs));}
  catch{} // A health probe cannot prove that a job PUT will fail; retain recovery.
 }
 while(now()-start<deadlineMs){
  try{
   if(submit){
    submit=false;
    // Upload original reference images only once at a time. Large uploads need
    // their own deadline; result reads still fail over after hedgeMs.
    const ack=await read(preferred,'/jobs/'+task.id,{method:'PUT',headers,body:init.body},'submit',AbortSignal.timeout(Math.max(1,Math.min(submitMs,deadlineMs-(now()-start)))));
    if(ack.response.status!==202){
     const error=ack.data?.error;
     if(ack.response.status>=500){lastFailure.kind='service-http';throw Error('归纳任务提交暂时不可用');}
     return serviceResponse({error:typeof error==='object'?{...error,request_id:task.id}:{message:String(error||'归纳任务提交失败'),code:'analysis_job_rejected',request_id:task.id}},ack.response.status);
    }
    confirm();
   }
   const result=await across('/jobs/'+task.id+'/result',{headers:readHeaders},'result',hedgeMs,Math.max(1,Math.min(networkMs,deadlineMs-(now()-start))));
   if(result.response.status===404&&result.data?.error==='NOT_FOUND'){
    if(resume&&task.endpoint!==preferred)return serviceResponse({error:{message:'此任务保存在迁移前的后台，新服务器没有该结果。原任务编号 '+task.id+' 已保留；为避免重复扣费，本次未重新提交模型。请先核对旧任务或服务商记录。',code:'analysis_legacy_job_unavailable',request_id:task.id}},409);
    // A lost submission acknowledgement is retried with THE SAME task id. The
    // backend serializes duplicate PUTs and never repeats the upstream call.
    accepted=false;task.accepted=false;storageSet(storage,slot,task);submit=true;
   }else if(result.response.status===202){confirm();lastFailure={phase:'result',kind:'pending',httpStatus:202};}
   else if(result.response.status>=500&&!result.response.headers.get('X-Analysis-Job-Id')){lastFailure.kind='service-http';throw Error('归纳结果暂时无法读取');}
   else{
    if(result.response.status===410){storageDelete(storage,slot);return serviceResponse({error:{message:'保存的归纳任务已过期，请重新发起归纳。',code:'analysis_job_expired',request_id:task.id}},410);}
    if(!result.response.ok&&!result.response.headers.get('X-Analysis-Job-Id'))return serviceResponse({error:{message:typeof result.data?.error==='string'?result.data.error:'归纳任务服务拒绝了结果读取',code:'analysis_job_service_error',request_id:task.id}},result.response.status);
    confirm();
    if(result.data.error&&typeof result.data.error==='object')result.data.error.request_id??=task.id;
    // Keep completed jobs too: a lost downstream image response or a refresh
    // must not discard an already paid-for, recoverable reference analysis.
    return new Response(JSON.stringify(result.data),{status:result.response.status,headers:{'Content-Type':'application/json','X-Analysis-Job-Id':task.id}});
   }
  }catch(error){
   // An ambiguous PUT may already have started the paid job. Only a confirmed
   // NOT_FOUND permits another idempotent PUT; a timeout never does.
   if(error?.analysisJobAttempt)lastFailure=error.analysisJobAttempt;
   lastFailure.errorName=error?.name||'Error';
   if(lastFailure.kind==='transport'&&error?.name==='TimeoutError')lastFailure.kind='timeout';
  }
  await sleep(pollMs);
 }
 const state=accepted?'后台已确认接收，结果暂未读到':'尚未取得后台接收确认，不能判断模型是否已开始';
 const detail=state+'。任务编号 '+task.id+'。请保留页面，稍后再次点击将读取同一任务，不会自动重复提交模型。';
 throw Object.assign(new Error(detail),{name:'AnalysisJobError',analysisJobDiagnostic:{requestId:task.id,jobEndpoint:preferred,accepted,requests,...lastFailure}});
}
