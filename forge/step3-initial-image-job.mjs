import {imageJobRoute,packImageBody} from './step3-image-protocol.mjs';
import {internationalInitialImageUrl} from './step3-international-image-route.mjs';
import {TEMPORARY_INFISTAR_DIRECT} from './infistar-temporary-direct.mjs';
import {requestStep3ImageStream} from './step3-image-stream.mjs';
const ENDPOINT='https://analysis.topconf-paper-figure-gallery.cn/initial';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const transientStatus=status=>status===408||status===425||status===429||status>=500;

export function createInitialImageJobClient({fetchImpl=globalThis.fetch.bind(globalThis),endpoint=ENDPOINT,wait=sleep,pollMs=1500,retryMs=1500,deadlineMs=15*60*1000,requestMs=30000,resultMs=120000,maxReadFailures=5}={}){
 return {async request({url,body,key,usedReferences=false,onProgress=()=>{},routePolicy}){
  if(!imageJobRoute(url))throw Error('Unsupported image job route');
  const submission={url,body:await packImageBody(body),usedReferences,...(routePolicy?{routePolicy}:{})};
  const id=crypto.randomUUID(),end=Date.now()+deadlineMs;
  let closed=false,active=null,deadline,stage='submission',recovered=false;
  const clean=value=>typeof value==='string'?value.replaceAll(key,'[redacted]'):value;
  function failure(code,meta={}){
   const d=meta.diagnostic||{};
   const initial=routePolicy==='preserve-initial-host';
   const info=[meta.error,d.upstreamMessage||d.message,d.resultError,d.errorCode,...(initial?[d.providerErrorType,d.providerErrorCode]:[]),Number.isInteger(d.upstreamStatus)?'上游 HTTP '+d.upstreamStatus:'',meta.requestId||d.requestId].filter(Boolean).map(clean).join('；');
   const label=initial&&code==='JOB_RESULT_UNKNOWN'&&d.upstreamStatus>=400?'生图网关返回错误；结果未确认，不会自动重新提交。':{JOB_CONNECTION:'本次任务连接未恢复；不会重新提交生图。',JOB_EXPIRED:'本次任务已过期。',JOB_RESULT_UNKNOWN:'后台未完成生图；不会自动重新提交。'}[code]||'任务请求失败（'+code+'）。';
   return Object.assign(Error(label+(info?' '+info:'')+' [stage: '+stage+'] [task: '+id+']'),{code,jobId:id,diagnostic:{...meta,stage}});
  }
  function ensureOpen(){if(closed||Date.now()>=end)throw failure('JOB_CONNECTION');}
  async function http(path,init={},budget=requestMs){
   ensureOpen();
   const controller=new AbortController();active=controller;let timer;
   try{
    return await Promise.race([
     new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('REQUEST_TIMEOUT'));},Math.min(budget,Math.max(1,end-Date.now())));}),
     (async()=>{const r=await fetchImpl(endpoint+path,{...init,headers:{Authorization:'Bearer '+key,...init.headers},signal:controller.signal,cache:'no-store'});return {status:r.status,data:await r.json()};})()
    ]);
   }finally{clearTimeout(timer);controller.abort();if(active===controller)active=null;}
  }
  async function read(path,budget){
   for(let count=0;;count++){
    ensureOpen();
    try{
     const r=await http(path,{},budget);
     if(!transientStatus(r.status))return r;
     if(count>=maxReadFailures)throw failure('JOB_HTTP_'+r.status,r.data);
    }catch(error){
     if(error.code?.startsWith('JOB_'))throw error;
     if(count>=maxReadFailures)throw failure('JOB_CONNECTION',{error:clean(error.message)});
    }
    recovered=true;
    onProgress({id,state:'reconnecting',stage});
    await wait(Math.min(retryMs*(count+1),5000));
   }
  }
  async function run(){
   let response;
   onProgress({id,state:'submitting'});
   try{
    // This is the ONLY submission. After an uncertain acknowledgement, only
    // query this same durable ID. Never replay PUT or issue a replacement ID.
    response=await http('/jobs/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(submission)});
    if(transientStatus(response.status)){response=null;recovered=true;}
   }catch(error){
    if(error.code?.startsWith('JOB_'))throw error;
    response=null;recovered=true;
   }
   for(;;){
    ensureOpen();
    if(!response){stage='status';response=await read('/jobs/'+id,requestMs);}
    if(response.status===410)throw failure('JOB_EXPIRED',response.data);
    if(![200,202].includes(response.status))throw failure('JOB_HTTP_'+response.status,response.data);
    const state=response.data.state;
    onProgress({id,state});
    if(state==='unknown')throw failure('JOB_RESULT_UNKNOWN',response.data);
    if(state==='succeeded'||state==='rejected'){
     stage='result';
     const result=await read('/jobs/'+id+'/result',resultMs);
     if(result.status!==200)throw failure('JOB_HTTP_'+result.status,result.data);
     return {...result.data,job:{id,recovered}};
    }
    if(!['queued','running','response_received'].includes(state))throw failure('JOB_INVALID_STATE',response.data);
    await wait(pollMs);response=null;
   }
  }
  const expired=new Promise((_,reject)=>{deadline=setTimeout(()=>{closed=true;active?.abort();reject(failure('JOB_CONNECTION'));},deadlineMs);});
  try{return await Promise.race([run(),expired]);}
  finally{closed=true;clearTimeout(deadline);active?.abort();}
 }};
}
let defaultClient;
export function createInternationalInitialImageJobClient(options){
 const client=createInitialImageJobClient(options);
 return {request:input=>imageJobRoute(input.url)==='infistar'&&TEMPORARY_INFISTAR_DIRECT
  ?requestStep3ImageStream({...input,fetchImpl:options?.fetchImpl||globalThis.fetch.bind(globalThis),timeoutMs:options?.deadlineMs||15*60*1000})
  :client.request({...input,url:internationalInitialImageUrl(input.url,input.body),...(imageJobRoute(input.url)==='infistar'?{routePolicy:'preserve-initial-host'}:{})})};
}
export const requestInfistarImageJob=options=>(defaultClient||=createInternationalInitialImageJobClient()).request(options);
