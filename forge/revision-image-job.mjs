import {revisionFailure} from './revision-diagnostics.mjs';
import {packImageBody} from './step3-image-protocol.mjs';
import {revisionImageJobRoute} from './revision-image-protocol.mjs';
import {TEMPORARY_INFISTAR_DIRECT} from './infistar-temporary-direct.mjs';
import {requestStep3ImageStream} from './step3-image-stream.mjs';
import {REVISION_CHUNK,REVISION_UPLOAD_MAX,revisionDigest} from './revision-upload.mjs';
const ENDPOINT='https://analysis.topconf-paper-figure-gallery.cn/revision';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const transientStatus=status=>status===408||status===425||status===429||status>=500;

export function createRevisionImageJobClient({fetchImpl=globalThis.fetch.bind(globalThis),endpoint=ENDPOINT,wait=sleep,pollMs=1500,retryMs=1500,deadlineMs=15*60*1000,requestMs=30000,submissionMs=180000,resultMs=120000,maxReadFailures=5,directRequest=requestStep3ImageStream}={}){
 return {async request({url,body,key,task,saveTask,usedReferences=false,onProgress=()=>{},routePolicy,diagnostics}){
  if(!task?.id||typeof saveTask!=='function')throw Error('修改任务尚未保存；本次未提交。');
  if(task.raw)return task.raw;
  async function save(){try{await saveTask(task);}catch(error){throw revisionFailure(error,'storage',{jobId:task.id},key);}}
  if(!revisionImageJobRoute(url)||(revisionImageJobRoute(url)==='infistar'&&(TEMPORARY_INFISTAR_DIRECT||task.transport==='direct'))){
   // Preserve existing custom/other-provider support without turning this
   // private relay into an unrestricted proxy. Uncertain direct calls are not replayed.
   if(task.submitted)throw Error('此服务商使用浏览器直连，上次结果未确认；原图和输入已保留，未重复生图。请先核对服务商记录。');
   const previousState=task.state;task.submitted=true;task.state='submitting';task.transport='direct';
   try{await save();}catch(error){delete task.submitted;task.state=previousState;throw error;}
   let raw;try{raw=await directRequest({url,body,key,usedReferences,onProgress,fetchImpl,timeoutMs:deadlineMs});}
   catch(error){throw revisionFailure(error,'submission',{jobId:task.id,requestId:error.imageDiagnostics?.requestId},key);}
   task.raw=raw;task.state=raw.ok?'received':'rejected';await save();return raw;
  }
  const submission={url,body:await packImageBody(body),usedReferences,...(routePolicy?{routePolicy}:{})};
  const id=task.id,end=Date.now()+deadlineMs;
  let closed=false,active=null,deadline,stage='submission',recovered=false,lastReadFailure;
  const clean=value=>typeof value==='string'?value.replaceAll(key,'[redacted]'):value;
  function failure(code,meta={}){
   const d=meta.diagnostic||{};
   const initial=routePolicy==='preserve-initial-host';
   const info=[meta.error,d.upstreamMessage||d.message,d.resultError,d.errorCode,...(initial?[d.providerErrorType,d.providerErrorCode]:[]),Number.isInteger(d.upstreamStatus)?'上游 HTTP '+d.upstreamStatus:'',meta.requestId||d.requestId].filter(Boolean).map(clean).join('；');
   const phase={upload:'上传参考图',submission:'确认任务接收',status:'查询后台任务',result:'读取已生成结果'}[stage]||stage;
   const label=initial&&code==='JOB_RESULT_UNKNOWN'&&d.upstreamStatus>=400?'生图网关返回错误；结果未确认，不会自动重新提交。':{JOB_CONNECTION:phase+'暂未恢复。请用「取回修改任务」继续查询原任务；不会重新提交生图。',JOB_EXPIRED:'本次任务已过期。',JOB_RESULT_UNKNOWN:'后台未完成生图；不会自动重新提交。'}[code]||'任务请求失败（'+code+'）。';
   const httpStatus=meta.httpStatus??(Number(code.match(/^JOB_HTTP_(\d+)$/)?.[1])||undefined);
   return revisionFailure(Object.assign(Error(label+(info?' '+info:'')),{code,jobId:id,diagnostic:{...meta,stage:code==='JOB_RESULT_UNKNOWN'?'upstream':stage}}),stage,{...meta,httpStatus,jobId:id,reason:meta.reason||(code==='JOB_CONNECTION'&&Date.now()>=end?'timeout':undefined)},key);
  }
  function ensureOpen(){if(closed||Date.now()>=end)throw failure('JOB_CONNECTION',lastReadFailure);}
  let lastPhase,interrupted=false;const attempts=new Map();
  async function http(path,init={},budget=requestMs){
   ensureOpen();
   const controller=new AbortController();active=controller;let timer;
   const operation=(init.method||'GET')+' '+path.replace(id,':task'),attempt=(attempts.get(operation)||0)+1;attempts.set(operation,attempt);
   const context={operation,attempt,jobId:id,...(/\/upload\/\d+$/.test(path)?{chunk:Number(path.split('/').at(-1))+1,total:task.upload?.count}:{})};
   const started=Date.now();let httpStatus,requestId;
   if(lastPhase!==stage){lastPhase=stage;await diagnostics?.record({stage,outcome:'started',operation});}
   try{
    return await Promise.race([
     new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('REQUEST_TIMEOUT'));},Math.min(budget,Math.max(1,end-Date.now())));}),
     (async()=>{
      const r=await fetchImpl(endpoint+path,{...init,headers:{Authorization:'Bearer '+key,...init.headers},signal:controller.signal,cache:'no-store'});
      httpStatus=r.status;requestId=r.headers?.get?.('x-request-id')||r.headers?.get?.('cf-ray');
      let data;try{data=await r.json();}catch{
       // Preserve real HTTP failures even when a gateway returns HTML. Never
       // expose its response body or misclassify a 403 as a network outage.
       if(r.status<400)throw Error('任务接口返回了不完整的响应');
       data={error:'任务接口未返回有效的错误说明'};
      }
      if(!data||typeof data!=='object'||Array.isArray(data))throw Error('任务接口返回了不完整的响应');
      requestId=data.requestId||data.diagnostic?.requestId||requestId;
      if(r.status>=400&&!(stage==='upload'&&r.status===404&&(!init.method||init.method==='GET'))){
       const failure=revisionFailure(Error(data.error||'任务接口请求失败'),stage,{...context,httpStatus:r.status,requestId,elapsedMs:Date.now()-started},key);
       lastReadFailure={...context,error:failure.diagnostic.observedError,httpStatus:r.status,requestId};interrupted=true;
       await diagnostics?.record({...failure.diagnostic,outcome:'request-error'});
      }else if(interrupted){await diagnostics?.record({stage,outcome:'recovered',...context,httpStatus:r.status,requestId,elapsedMs:Date.now()-started});interrupted=false;}
      return {status:r.status,data,requestId};
     })()
    ]);
   }catch(error){
    const failure=revisionFailure(error,stage,{...context,httpStatus,requestId,elapsedMs:Date.now()-started},key);
    lastReadFailure={...context,error:failure.diagnostic.observedError,httpStatus,requestId,reason:failure.diagnostic.reason};interrupted=true;
    await diagnostics?.record({...failure.diagnostic,outcome:'request-error'});throw error;
   }finally{clearTimeout(timer);controller.abort();if(active===controller)active=null;}
  }
  async function read(path,budget){
   for(let count=0;;count++){
    ensureOpen();
    try{
     const r=await http(path,{},budget);
     if(!transientStatus(r.status)){lastReadFailure=undefined;return r;}
     lastReadFailure={...lastReadFailure,error:'任务接口 HTTP '+r.status,httpStatus:r.status};
    }catch(error){
     if(error.code?.startsWith('JOB_'))throw error;
     lastReadFailure={...lastReadFailure,error:clean(error.message)};
    }
    recovered=true;
    // GET cannot start generation. Recover until the existing overall deadline,
    // rather than giving up after a few failures while the paid job still runs.
    onProgress({id,state:'reconnecting',stage,attempt:count+1});
    await wait(Math.min(retryMs*(count+1),5000,Math.max(0,end-Date.now())));
   }
  }
  async function run(){
   let response,submissionText,upload;
   onProgress({id,state:'submitting'});
   if(!task.submitted){
    submissionText=JSON.stringify(submission);
    if(submissionText.length>REVISION_UPLOAD_MAX)throw failure('UPLOAD_TOO_LARGE',{error:'修改图请求超过 32 MiB；未提交生图，请减少附加参考图。'});
    if(submissionText.length>REVISION_CHUNK){
     stage='upload';upload={count:Math.ceil(submissionText.length/REVISION_CHUNK),digest:await revisionDigest(submissionText)};
     if(task.upload&&(task.upload.count!==upload.count||task.upload.digest!==upload.digest))throw failure('UPLOAD_INPUT_CHANGED');
     task.upload=upload;task.state='uploading';await save();
     const status=await read('/jobs/'+id+'/upload',requestMs);
     if(status.status!==404&&status.status!==200)throw failure('JOB_HTTP_'+status.status,{...status.data,requestId:status.requestId});
     if(status.data.committed)response=status;
     else{
      if(status.status===200&&(status.data.count!==upload.count||status.data.digest!==upload.digest))throw failure('UPLOAD_INPUT_CHANGED');
      const parts=new Set(status.data.parts||[]);
      for(let index=0;index<upload.count;index++){
       if(parts.has(index))continue;
       // Retrying the identical private chunk is safe: it cannot start generation.
       for(let attempt=0;;attempt++){
        let received;
        try{received=await http('/jobs/'+id+'/upload/'+index,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...upload,data:submissionText.slice(index*REVISION_CHUNK,(index+1)*REVISION_CHUNK)})},requestMs);}
        catch(error){if(attempt>=maxReadFailures)throw failure('JOB_CONNECTION',{...lastReadFailure,error:clean(error.message)});}
        if(received&&!transientStatus(received.status)){
         if(received.status!==200)throw failure('JOB_HTTP_'+received.status,{...received.data,requestId:received.requestId});
         if(received.data.committed){response=received;break;}
         parts.add(index);onProgress({id,state:'uploading',stage,completed:parts.size,total:upload.count});break;
        }
        if(attempt>=maxReadFailures)throw failure('JOB_CONNECTION',lastReadFailure);
        onProgress({id,state:'reconnecting',stage});await wait(Math.min(retryMs*(attempt+1),5000));
       }
       if(response)break;
      }
     }
    }
    const previousState=task.state;task.submitted=true;task.state='submitting';
    try{await save();}catch(error){delete task.submitted;task.state=previousState;throw error;}
   if(!response){
   try{
    // This is the ONLY submission. After an uncertain acknowledgement, only
    // query this same durable ID. Never replay PUT or issue a replacement ID.
    // A full-resolution reference must finish uploading and durably saving before
    // the acknowledgement. Status reads are small; their timeout is not an upload budget.
    stage='submission';
    response=await http('/jobs/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:upload?JSON.stringify({upload}):submissionText},submissionMs);
    if(transientStatus(response.status)){response=null;recovered=true;}
   }catch(error){
    if(error.code?.startsWith('JOB_'))throw error;
    response=null;recovered=true;
   }
   }
   }
   for(;;){
    ensureOpen();
    if(!response){stage='status';response=await read('/jobs/'+id,requestMs);}
    if(response.status===410)throw failure('JOB_EXPIRED',response.data);
    if(![200,202].includes(response.status))throw failure('JOB_HTTP_'+response.status,{...response.data,requestId:response.requestId});
    const state=response.data.state;
    onProgress({id,state});
    if(state==='unknown')throw failure('JOB_RESULT_UNKNOWN',response.data);
    if(state==='succeeded'||state==='rejected'){
     stage='result';
     const result=await read('/jobs/'+id+'/result',resultMs);
     if(result.status!==200)throw failure('JOB_HTTP_'+result.status,{...result.data,requestId:result.requestId});
     const raw={...result.data,job:{id,recovered}};
     task.raw=raw;task.state=raw.ok?'received':'rejected';await save();
     return raw;
    }
    if(!['queued','running','response_received'].includes(state))throw failure('JOB_INVALID_STATE',response.data);
    await wait(pollMs);response=null;
   }
  }
  const expired=new Promise((_,reject)=>{deadline=setTimeout(()=>{closed=true;active?.abort();reject(failure('JOB_CONNECTION',lastReadFailure));},deadlineMs);});
  try{return await Promise.race([run(),expired]);}
  finally{closed=true;clearTimeout(deadline);active?.abort();}
 }};
}
