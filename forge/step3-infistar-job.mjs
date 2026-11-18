// Step 3 only. Each explicit generation starts once; transport errors stop immediately.
import {imageJobRoute,packImageBody} from './step3-image-protocol.mjs';
export const INFISTAR_JOBS='https://analysis.topconf-paper-figure-gallery.cn/initial';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function usesInfistarImageJob(url){const route=imageJobRoute(url);return !!route;}
function jobError(code,id,meta={}){
  const messages={JOB_RESULT_UNKNOWN:'本次生图未完成，后台报告：',JOB_EXPIRED:'本次任务已过期。',JOB_CONNECTION:'本次生图连接中断或超时。'};
  const d=meta.diagnostic||{},details=[];
  if(meta.error)details.push(meta.error);
  if(Number.isInteger(d.upstreamStatus))details.push('上游 HTTP '+d.upstreamStatus);
  if(d.resultError)details.push('结果处理：'+d.resultError);
  if(d.upstreamMessage||d.message)details.push(d.upstreamMessage||d.message);
  if(d.errorCode)details.push('连接错误：'+d.errorCode);
  if(d.stage)details.push('阶段：'+d.stage);
  if(meta.requestId||d.requestId)details.push('request-id: '+(meta.requestId||d.requestId));
  if(code==='JOB_RESULT_UNKNOWN'&&!details.length)details.push('后台未保存具体异常，请凭任务 ID 查询；不会自动重新提交。');
  return Object.assign(new Error((messages[code]||code)+(details.length?' '+details.join('；'):'')+(id?' [task: '+id+']':'')),{code,jobId:id,diagnostic:meta});
}
export function createInfistarJobClient({fetchImpl=globalThis.fetch.bind(globalThis),endpoint=INFISTAR_JOBS,wait=sleep,pollMs=1500,deadlineMs=15*60*1000}={}){
  async function track(record,key,{submission,onProgress=()=>{}}){
    const controller=new AbortController();
    const timeout=jobError('JOB_CONNECTION',record.id);
    let deadline;
    const expired=new Promise((_,reject)=>{deadline=setTimeout(()=>{controller.abort();reject(timeout);},deadlineMs);});
    async function http(path,init={}){
      let timer;
      const timedOut=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(timeout);},Math.min(15000,deadlineMs));});
      try{
        return await Promise.race([timedOut,(async()=>{
          const response=await fetchImpl(endpoint+path,{...init,headers:{Authorization:'Bearer '+key,...init.headers},signal:controller.signal,cache:'no-store'});
          return {status:response.status,data:await response.json()};
        })()]);
      }finally{clearTimeout(timer);}
    }
    async function run(){
      let response=await http('/jobs/'+record.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(submission)});
      for(;;){
        if(response.status===410)throw jobError('JOB_EXPIRED',record.id,response.data);
        if(![200,202].includes(response.status))throw jobError('JOB_HTTP_'+response.status,record.id,response.data);
        const state=response.data.state;onProgress({id:record.id,state});
        if(state==='unknown')throw jobError('JOB_RESULT_UNKNOWN',record.id,response.data);
        if(state==='succeeded'||state==='rejected'){
          const result=await http('/jobs/'+record.id+'/result');
          if(result.status!==200)throw jobError('JOB_HTTP_'+result.status,record.id,result.data);
          return {...result.data,job:{id:record.id,recovered:false}};
        }
        if(!['queued','running','response_received'].includes(state))throw jobError('JOB_INVALID_STATE',record.id);
        // Normal waiting for this invocation only; never reconnect or resubmit.
        await wait(pollMs);
        if(controller.signal.aborted)throw timeout;
        response=await http('/jobs/'+record.id);
      }
    }
    try{return await Promise.race([run(),expired]);}
    catch(error){if(error.code?.startsWith('JOB_'))throw error;throw jobError('JOB_CONNECTION',record.id);}
    finally{clearTimeout(deadline);controller.abort();}
  }
  return {
    async request({url,body,key,usedReferences=false,onProgress}){
      if(!imageJobRoute(url))throw Error('Unsupported image job route');
      const submission={url,body:await packImageBody(body),usedReferences};
      return track({id:crypto.randomUUID()},key,{submission,onProgress});
    }
  };
}
let defaultClient;
const client=()=>defaultClient||=(createInfistarJobClient());
export const requestInfistarImageJob=options=>client().request(options);
// Preserve the frozen entry point's imports without storing completed tasks or
// installing a recovery panel. Old local records are ignored, never consulted.
export const acknowledgeInfistarImageJob=async()=>{};
export function showInfistarJobProgress(){}
