// Private Step 3 negotiation. A rejected capability probe is the ONLY replay gate.
const PREFIX='figureforge:step3-image-compat:v1:';
const memory=new Map();
// Positive endpoint policy, private to Step 3. Unknown gateways/models still
// negotiate streaming. Never apply the exception to lookalike hosts or chat.
export function requiresOrdinaryStep3Image(url){
  const u=new URL(url);
  if(u.username||u.password)return false;
  // Infistar Nano Banana 2.1 requires the ordinary Gemini native endpoint.
  // This positive policy overrides stale streaming capability records in both
  // the browser and durable Worker. Keep other Gemini models negotiating.
  if(u.protocol==='https:'&&!u.port&&['infistar.cc','www.infistar.cc','infistar.ai','www.infistar.ai'].includes(u.hostname)&&/^\/v1beta\/models\/gemini-nano-banana-2\.1:(?:streamGenerateContent|generateContent)$/.test(u.pathname))return true;
  if(u.protocol==='https:'&&!u.port&&['api.nonelinear.com.cn','gallery-nonelinear-relay.lixiao-gallery.workers.dev','gallery-revision-images.lixiao-gallery.workers.dev'].includes(u.hostname))
    return /^\/v1\/images\/(?:generations|edits)$/.test(u.pathname);
  return u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&/^\/api\/nonelinear\/v1\/images\/(?:generations|edits)$/.test(u.pathname);
}
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
  async get(id){let value=memory.get(id);try{value||=JSON.parse(browserStore()?.getItem(PREFIX+id)||'null');}catch{}return value?.version===1?value:null;},
  async set(id,value){const record={mode:value.mode,version:1};memory.set(id,record);try{browserStore()?.setItem(PREFIX+id,JSON.stringify(record));}catch{}},
};
export async function negotiateStep3Image(options,requestOnce){
  const {compatibilityStore=defaultImageCompatibilityStore,beforeAttempt=async()=>{}}=options;
  const identity=await imageCompatibilityIdentity(options.url,options.body,options.key);
  const cached=await compatibilityStore.get(identity);
  let mode=requiresOrdinaryStep3Image(options.url)||cached?.mode==='ordinary'?'ordinary':'stream',attempts=0;
  const run=async()=>{
    await beforeAttempt({mode,attempt:++attempts});
    return requestOnce({...options,stream:mode==='stream'});
  };
  let result=await run();let rejection;
  if(mode==='stream'&&explicitlyRejectsImageStreaming(result)){
    rejection={status:result.status,requestId:result.requestId};mode='ordinary';
    await compatibilityStore.set(identity,{mode});
    result=await run();
  }
  // Remember interface compatibility only. Failures never trigger a replay,
  // recovery lookup, or a persistent lock on a later explicit user request.
  if(result.ok)await compatibilityStore.set(identity,{mode});
  return {...result,compatibility:{mode,cached:!!cached,attempts,...(rejection?{streamRejection:rejection}:{})}};
}
