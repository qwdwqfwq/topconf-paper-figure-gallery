// Private Step 3 negotiation. A rejected capability probe is the ONLY replay gate.
import {imageResultItem} from './step3-image-protocol.mjs';
const PREFIX='figureforge:step3-image-compat:v1:';
const memory=new Map();
async function digest(text){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function imageCompatibilityIdentity(url,body,key){
  const u=new URL(url),native=/\/models\/([^/]+):(?:streamGenerateContent|generateContent)$/.exec(u.pathname);
  const model=native?decodeURIComponent(native[1]):body instanceof FormData?body.get('model'):body?.model;
  u.pathname=u.pathname.replace(/:streamGenerateContent$/,':generateContent');u.searchParams.delete('alt');
  return digest(JSON.stringify([u.href,model||'',await digest(key||'')]));
}
export function explicitlyRejectsImageStreaming(result){
  if(result.ok||![400,404,405,422,501].includes(result.status))return false;
  let data;try{data=JSON.parse(result.text);}catch{return false;}
  // Never interpret an accepted task, usage record, image, or event as rejection.
  if(data.id||data.task_id||data.job_id||data.usage||data.data||data.candidates)return false;
  const error=data.error;if(!error||typeof error.message!=='string')return false;
  const message=error.message;
  return /(?:streamGenerateContent|\bstream(?:ing)?\b)/i.test(message)&&
    /(?:not\s+support(?:ed)?|unsupported|does\s+not\s+support|不支持|暂不支持|不接受|不允许)/i.test(message);
}
function browserStore(){try{return globalThis.localStorage;}catch{return null;}}
export const defaultImageCompatibilityStore={
  async get(id){const value=memory.get(id)||JSON.parse(browserStore()?.getItem(PREFIX+id)||'null');return value?.version===1?value:null;},
  async set(id,value){const record={...value,version:1};memory.set(id,record);const storage=browserStore();if(typeof window!=='undefined'&&!storage)throw Error('无法保存生图任务状态，尚未发送请求。请允许本地存储后重试。');storage?.setItem(PREFIX+id,JSON.stringify(record));},
};
export async function negotiateStep3Image(options,requestOnce){
  const {compatibilityStore=defaultImageCompatibilityStore,beforeAttempt=async()=>{}}=options;
  const identity=await imageCompatibilityIdentity(options.url,options.body,options.key);
  const cached=await compatibilityStore.get(identity);
  if(cached?.uncertain)throw Object.assign(Error('上次生图结果未确认，已阻止重复提交。请先取回原任务，或凭请求编号向服务商核查。'),{code:'IMAGE_RESULT_UNCONFIRMED',requestId:cached.requestId});
  let mode=cached?.mode==='ordinary'?'ordinary':'stream',attempts=0;
  const run=async()=>{
    await beforeAttempt({mode,attempt:++attempts});
    // Persist uncertainty BEFORE sending. Refresh/crash cannot silently replay.
    await compatibilityStore.set(identity,{mode,uncertain:true,requestId:''});
    return requestOnce({...options,stream:mode==='stream'});
  };
  try{
    let result=await run();let rejection;
    if(mode==='stream'&&explicitlyRejectsImageStreaming(result)){
      rejection={status:result.status,requestId:result.requestId};mode='ordinary';
      await compatibilityStore.set(identity,{mode,uncertain:false});
      result=await run();
    }
    // HTTP 5xx may conceal accepted work. Do not let the next click replay it.
    let image=false;try{image=!!imageResultItem(JSON.parse(result.text));}catch{}
    const uncertain=result.ok?!image:result.status>=500||result.status===408;
    await compatibilityStore.set(identity,{mode,uncertain,requestId:result.requestId||''});
    return {...result,compatibility:{mode,cached:!!cached,attempts,...(rejection?{streamRejection:rejection}:{})}};
  }catch(error){
    await compatibilityStore.set(identity,{mode,uncertain:true,requestId:error.imageDiagnostics?.requestId||''});
    throw error;
  }
}
