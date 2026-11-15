// Step 3 only. Each explicit generation starts a fresh task; reconnects reuse it.
import {imageJobRoute,packImageBody} from './step3-image-protocol.mjs';
export const INFISTAR_JOBS='https://gallery-infistar-image-jobs.lixiao-gallery.workers.dev';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function usesInfistarImageJob(url){return !!imageJobRoute(url);}
function jobError(code,id){
  const messages={JOB_RESULT_UNKNOWN:'后台未能确认本次生图结果，已停止自动提交。请凭任务编号向服务商核查。',JOB_EXPIRED:'本次任务已过期。',JOB_CONNECTION:'本次生图连接超时。请凭任务编号向服务商核查结果。'};
  return Object.assign(new Error((messages[code]||code)+(id?' [task: '+id+']':'')),{code,jobId:id});
}
export function createInfistarJobClient({fetchImpl=globalThis.fetch.bind(globalThis),endpoint=INFISTAR_JOBS,wait=sleep,pollMs=1500,deadlineMs=15*60*1000}={}){
  async function http(path,key,init={}){
    const response=await fetchImpl(endpoint+path,{...init,headers:{Authorization:'Bearer '+key,...init.headers},signal:AbortSignal.timeout(15000),cache:'no-store'});
    const data=await response.json();return {status:response.status,data};
  }
  async function track(record,key,{submission,onProgress=()=>{}}){
    const start=Date.now();let acknowledged=false,failures=0;
    while(Date.now()-start<deadlineMs){
      try{
        const response=!acknowledged
          ? await http('/jobs/'+record.id,key,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(submission)})
          : await http('/jobs/'+record.id,key);
        if(response.status===404){acknowledged=false;await wait(pollMs);continue;}
        if(response.status===410)throw jobError('JOB_EXPIRED',record.id);
        if(![200,202].includes(response.status))throw jobError('JOB_HTTP_'+response.status,record.id);
        acknowledged=true;
        const state=response.data.state;onProgress({id:record.id,state,failures});
        if(state==='unknown')throw jobError('JOB_RESULT_UNKNOWN',record.id);
        if(state==='succeeded'||state==='rejected'){
          const result=await http('/jobs/'+record.id+'/result',key);
          if(result.status!==200)throw Error('Result not yet available');
          return {...result.data,job:{id:record.id,recovered:false}};
        }
        if(!['queued','running','response_received'].includes(state))throw jobError('JOB_INVALID_STATE',record.id);
        failures=0;await wait(pollMs);
      }catch(error){
        if(error.code?.startsWith('JOB_'))throw error;
        failures++;onProgress({id:record.id,state:'reconnecting',failures});await wait(Math.min(10000,pollMs*2**Math.min(failures,3)));
      }
    }
    throw jobError('JOB_CONNECTION',record.id);
  }
  return {
    async request({url,body,key,usedReferences=false,onProgress}){
      if(!usesInfistarImageJob(url))throw Error('Unsupported image job route');
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
