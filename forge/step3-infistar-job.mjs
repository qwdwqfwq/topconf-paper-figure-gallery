// Step 3 only. Short, repeatable queries replace the browser's long image POST.
import {imageJobRoute,packImageBody,imageResultItem} from './step3-image-protocol.mjs';
export const INFISTAR_JOBS='https://gallery-infistar-image-jobs.lixiao-gallery.workers.dev';
const PREFIX='figureforge:infistar-image-job:v1:';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function hash(text){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
// Keep the existing export name for saved clients; the allowlist now covers
// all three providers and native Gemini, not only Infistar GPT.
export function usesInfistarImageJob(url){return !!imageJobRoute(url);}
function jobError(code,id){
  const messages={JOB_PENDING_DIFFERENT_INPUT:'上次生图任务尚未取回，已阻止新建任务以避免重复扣费。请先点击“取回上次图片”。',JOB_RESULT_UNKNOWN:'后台未能确认上游任务结果，已停止自动提交，避免重复扣费。请凭任务编号核查，不要直接重新生图。',JOB_EXPIRED:'此任务的图片保存期已结束（24 小时）。旧任务不会被重新提交。',JOB_CONNECTION:'任务记录已保留。连接恢复后点击“取回上次图片”，或保持原参数再次生成，将查询同一任务，不会重新生图。',JOB_STORAGE:'无法保存任务记录，已停止提交。请允许此站点使用本地存储。'};
  return Object.assign(new Error((messages[code]||code)+(id?' [task: '+id+']':'')),{code,jobId:id});
}
export function createInfistarJobClient({fetchImpl=globalThis.fetch.bind(globalThis),storage=globalThis.localStorage,endpoint=INFISTAR_JOBS,wait=sleep,pollMs=1500,deadlineMs=15*60*1000,withLock=async(name,fn)=>{
  if(!globalThis.navigator?.locks)throw jobError('JOB_STORAGE');
  return navigator.locks.request(name,fn);
}}={}){
  async function slot(key){return PREFIX+await hash(key);}
  function read(name){try{return JSON.parse(storage.getItem(name)||'null');}catch{throw jobError('JOB_STORAGE');}}
  function save(name,value){try{storage.setItem(name,JSON.stringify(value));if(storage.getItem(name)!==JSON.stringify(value))throw Error();}catch{throw jobError('JOB_STORAGE');}}
  async function http(path,key,init={}){
    const response=await fetchImpl(endpoint+path,{...init,headers:{Authorization:'Bearer '+key,...init.headers},signal:AbortSignal.timeout(15000),cache:'no-store'});
    const data=await response.json();return {status:response.status,data};
  }
  async function track(record,key,{submission,onProgress=()=>{}}={}){
    const start=Date.now();let acknowledged=record.acknowledged,failures=0;
    while(Date.now()-start<deadlineMs){
      try{
        let response;
        if(!acknowledged&&submission){
          response=await http('/jobs/'+record.id,key,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(submission)});
        }else response=await http('/jobs/'+record.id,key);
        if(response.status===404&&submission){acknowledged=false;await wait(pollMs);continue;}
        if(response.status===410)throw jobError('JOB_EXPIRED',record.id);
        if(![200,202].includes(response.status))throw jobError('JOB_HTTP_'+response.status,record.id);
        acknowledged=true;record.acknowledged=true;
        // A late response in another tab must not resurrect a cleared task or
        // replace the next generation's recovery record.
        if(!record.saved){const name=await slot(key);await withLock(name,async()=>{
          const current=read(name);
          if(current?.id===record.id)save(name,{...current,acknowledged:true});
        });}
        const state=response.data.state;onProgress({id:record.id,state,failures});
        if(state==='unknown')throw jobError('JOB_RESULT_UNKNOWN',record.id);
        if(state==='succeeded'||state==='rejected'){
          const result=await http('/jobs/'+record.id+'/result',key);
          if(result.status!==200)throw Error('Result not yet available');
          return {...result.data,job:{id:record.id,recovered:!submission||record.recovered}};
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
      const name=await slot(key),submission={url,body:await packImageBody(body),usedReferences},fingerprint=await hash(JSON.stringify(submission));
      const record=await withLock(name,async()=>{
        let record=read(name);
        if(record&&record.fingerprint!==fingerprint)throw jobError('JOB_PENDING_DIFFERENT_INPUT',record.id);
        if(record)record.recovered=true;
        else {record={id:crypto.randomUUID(),fingerprint,created:Date.now(),acknowledged:false};save(name,record);}
        return record;
      });
      return track(record,key,{submission,onProgress});
    },
    async recover({key,onProgress}){const name=await slot(key);const record=await withLock(name,async()=>read(name)||read(name+':saved'));if(!record)throw Error('此 API Key 没有待取回的任务。');return track(record,key,{onProgress});},
    async acknowledge(key,id){const name=await slot(key);await withLock(name,async()=>{const record=read(name);if(record?.id===id){save(name+':saved',{...record,saved:true});storage.removeItem(name);}});},
    async forget(key,id){const name=await slot(key);await withLock(name,async()=>{for(const slot of [name,name+':saved'])if(read(slot)?.id===id)storage.removeItem(slot);});},
    async pending(key){return read(await slot(key));}
  };
}
let defaultClient;
const client=()=>defaultClient||=(createInfistarJobClient());
export const requestInfistarImageJob=options=>client().request(options);
export const acknowledgeInfistarImageJob=(key,id)=>client().acknowledge(key,id);

// Recovery remains usable after refresh even if the original form/refs changed.
// It only retrieves the original task and never initiates another generation.
function installRecovery(){
  const button=document.querySelector('#genBtn');if(!button)return;
  let pending=false;try{for(let i=0;i<localStorage.length;i++)if(localStorage.key(i).startsWith(PREFIX))pending=true;}catch{}
  if(!pending||document.querySelector('#infistarJobRecovery'))return;
  const panel=document.createElement('div');panel.id='infistarJobRecovery';panel.style.cssText='margin:12px 0;padding:12px;border:1px solid #93a2d7;border-radius:10px;overflow-wrap:anywhere';
  const note=document.createElement('p');note.textContent='有已保存的生图任务。请在步骤一填写原服务商 API Key，然后取回；此操作不会重新生图。图片保存 24 小时。';
  const recover=document.createElement('button');recover.type='button';recover.className='btn-primary';recover.textContent='取回上次图片';
  panel.append(note,recover);button.parentElement.after(panel);
  recover.onclick=async()=>{
    recover.disabled=true;
    try{
      const key=(document.querySelector('#key')?.value||'').trim().replace(/^Bearer\s+/i,'');
      if(!key)throw Error('请先填写原 API Key。');
      const result=await client().recover({key,onProgress:({id,state})=>{note.textContent=`任务 ${id}：${state==='reconnecting'?'正在恢复查询连接':state==='running'?'后台正在生图':state==='queued'?'已排队':'正在取回'}。不会重复提交。`;}});
      if(!result.ok)throw Object.assign(Error('该任务被拒绝（HTTP '+result.status+'）。请核查任务记录后再决定是否重新生成。'),{code:'JOB_REJECTED',jobId:result.job.id});
      const data=JSON.parse(result.text),item=imageResultItem(data);
      const src=item?.b64_json?'data:'+(item.mimeType||'image/png')+';base64,'+item.b64_json:item?.url;
      if(!src||(!src.startsWith('data:image/')&&!/^https:\/\//.test(src)))throw Error('任务未包含可取回的图片。');
      const img=document.createElement('img');img.src=src;img.style.cssText='display:block;max-width:100%;margin:12px 0';
      const link=document.createElement('a');link.href=src;link.download='recovered-image.'+({'image/jpeg':'jpg','image/webp':'webp'}[item.mimeType]||'png');link.textContent='下载已生成图片';link.target='_blank';link.rel='noopener';
      const clear=document.createElement('button');clear.type='button';clear.textContent='已保存图片，清除此任务记录';clear.onclick=async()=>{await client().forget(key,result.job.id);panel.remove();};
      note.textContent='已取回原任务图片。下载后也可使用下方“上传自己的图片进行修改”继续编辑。';panel.append(img,link,clear);recover.remove();
     }catch(error){
      note.textContent=error.message;
      if(['JOB_REJECTED','JOB_EXPIRED','JOB_RESULT_UNKNOWN'].includes(error.code)&&!panel.querySelector('[data-release]')){
        const clear=document.createElement('button');clear.type='button';clear.dataset.release='true';
        clear.textContent='已核查任务，清除本地记录';
        clear.onclick=async()=>{if(!confirm('清除记录后，再次点击生成会创建新任务并可能再次扣费。确认已核查原任务？'))return;const originalKey=(document.querySelector('#key')?.value||'').trim().replace(/^Bearer\s+/i,'');await client().forget(originalKey,error.jobId);panel.remove();};
        panel.append(clear);
      }
    }finally{recover.disabled=false;}
  };
}
if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installRecovery,{once:true});else installRecovery();
  globalThis.addEventListener('storage',installRecovery);
}
export function showInfistarJobProgress({id,state}){
  installRecovery();const note=document.querySelector('#infistarJobRecovery p');
  if(note)note.textContent=`任务 ${id}：${state==='reconnecting'?'连接中断，正在查询同一任务':state==='running'?'后台正在生图':state==='queued'?'已排队':'正在取回'}。刷新后可取回，不会重复提交。`;
}
