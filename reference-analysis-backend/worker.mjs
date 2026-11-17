// Independent reference-analysis jobs. A claimed paid call is never replayed.
import {prepareChat,waitingChat} from '../nonelinear-relay/chat-stream.mjs';
const RETENTION=86400000, EXECUTION=720000, MAX_INPUT=32*1024*1024;
// This service executes overseas. Keep the regional choice confined to reference
// analysis; the shared relay, image generation and editable exports are unchanged.
const UPSTREAMS=Object.freeze({nonelinear:'https://api.nonelinear.com/v1/chat/completions','infistar-cc':'https://infistar.cc/v1/chat/completions','infistar-ai':'https://infistar.ai/v1/chat/completions'});
const upstreamFor=request=>request.headers.get('X-Analysis-Upstream')||'nonelinear';
const encoder=new TextEncoder();
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export async function digest(text){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function cipher(secret){return crypto.subtle.importKey('raw',Uint8Array.from(atob(secret),c=>c.charCodeAt(0)),'AES-GCM',false,['encrypt','decrypt']);}
async function encrypt(secret,text){const iv=crypto.getRandomValues(new Uint8Array(12));return {iv:[...iv],bytes:[...new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await cipher(secret),encoder.encode(text)))]};}
async function decrypt(secret,value){return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(value.iv)},await cipher(secret),new Uint8Array(value.bytes)));}
async function putText(storage,prefix,text){const n=Math.ceil(text.length/16000);for(let i=0;i<n;i++)await storage.put(prefix+i,text.slice(i*16000,(i+1)*16000));return n;}
async function getText(storage,prefix,n){let text='';for(let i=0;i<n;i++){const part=await storage.get(prefix+i);if(typeof part!=='string')throw Error('MISSING_PAYLOAD');text+=part;}return text;}
async function clearText(storage,prefix,n){for(let i=0;i<n;i++)await storage.delete(prefix+i);}
async function boundedBody(request){const reader=request.body?.getReader(),decoder=new TextDecoder();let text='',size=0;try{if(reader)for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_INPUT){await reader.cancel();throw Error('REQUEST_TOO_LARGE');}text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}finally{reader?.releaseLock();}}
const metaView=m=>({id:m.id,state:m.state,created:m.created,expires:m.expires,upstreamAttempts:m.upstreamAttempts});
const unknown=()=>({error:{message:'归纳后台与模型的连接中断，无法确认模型是否已完成；为避免重复扣费，没有重新提交。请保留任务编号联系画廊。',type:'upstream_connection_error',code:'analysis_outcome_unknown',attempts:1}});
export default {
 async fetch(request,env){
  const url=new URL(request.url),origin=request.headers.get('Origin');
  if(url.pathname==='/health'&&request.method==='GET')return new Response(JSON.stringify({service:'gallery-reference-analysis',version:'20261117-durable-v3-overseas',providers:Object.keys(UPSTREAMS),nonelinearAnalysisOrigin:new URL(UPSTREAMS.nonelinear).origin,ready:!!env.ANALYSIS_JOBS&&!!env.JOB_ENCRYPTION_KEY}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'https://qwdwqfwq.github.io'}});
  if(origin!=='https://qwdwqfwq.github.io')return json({error:'GALLERY_ORIGIN_REQUIRED'},403);
  const headers={'Access-Control-Allow-Origin':origin,'Vary':'Origin','Cache-Control':'no-store','Access-Control-Expose-Headers':'X-Analysis-Job-Id'};
  const reply=r=>{const h=new Headers(r.headers);for(const [k,v]of Object.entries(headers))h.set(k,v);return new Response(r.body,{status:r.status,headers:h});};
  const match=/^\/jobs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/result)?$/.exec(url.pathname);
  if(!match||url.search||!['GET','PUT','OPTIONS'].includes(request.method)||match[2]&&request.method==='PUT')return reply(json({error:'UNKNOWN_ENDPOINT'},404));
  if(request.method==='OPTIONS'){
   const names=(request.headers.get('Access-Control-Request-Headers')||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
   if(!['GET','PUT'].includes(request.headers.get('Access-Control-Request-Method'))||names.some(x=>!['authorization','content-type','x-analysis-upstream'].includes(x)))return reply(json({error:'INVALID_PREFLIGHT'},403));
   return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'PUT, GET','Access-Control-Allow-Headers':'Authorization, Content-Type, X-Analysis-Upstream','Access-Control-Max-Age':'600'}});
  }
  const auth=request.headers.get('Authorization')||'';
  if(!/^Bearer [A-Za-z0-9_.=\-]{1,512}$/.test(auth))return reply(json({error:'API_KEY_REQUIRED'},401));
  const upstream=upstreamFor(request);
  if(!Object.hasOwn(UPSTREAMS,upstream))return reply(json({error:'UNSUPPORTED_ANALYSIS_UPSTREAM'},400));
  // Preserve existing NoneLinear jobs; separate Infistar keys and environments.
  const id=env.ANALYSIS_JOBS.idFromName(await digest(auth)+':'+(upstream==='nonelinear'?'':upstream+':')+match[1]);
  try{return reply(await env.ANALYSIS_JOBS.get(id).fetch(request));}catch{return reply(json({error:{message:'归纳任务暂时无法读取，请稍后重试读取同一任务。',code:'job_storage_unavailable'}},503));}
 }
};
export class ReferenceAnalysisJob {
 constructor(ctx,env){this.ctx=ctx;this.storage=ctx.storage;this.env=env;this.active=false;}
 async fetch(request){
  const auth=request.headers.get('Authorization')||'',owner=await digest(auth),upstream=upstreamFor(request),url=new URL(request.url);let meta=await this.storage.get('meta');
  if(!Object.hasOwn(UPSTREAMS,upstream))return json({error:'UNSUPPORTED_ANALYSIS_UPSTREAM'},400);
  if(meta&&(meta.owner!==owner||(meta.upstream||'nonelinear')!==upstream))return json({error:'NOT_FOUND'},404);
  if(meta&&meta.state!=='expired'&&Date.now()>=meta.expires){await this.expire(meta);meta=await this.storage.get('meta');}
  if(request.method==='PUT'){
   let text;try{text=await boundedBody(request);const b=JSON.parse(text);if(!b||typeof b.model!=='string'||!Array.isArray(b.messages)||!b.messages.length||b.stream===true)throw Error('INVALID');}catch(e){return json({error:e.message==='REQUEST_TOO_LARGE'?'REQUEST_TOO_LARGE':'INVALID_ANALYSIS_REQUEST'},400);}
   const fingerprint=await digest(text);
   await this.ctx.blockConcurrencyWhile(async()=>{
    meta=await this.storage.get('meta');if(meta)return;
    const encrypted=await encrypt(this.env.JOB_ENCRYPTION_KEY,auth.slice(7));
    await this.storage.transaction(async storage=>{
     const inputCount=await putText(storage,'input:',text);
     meta={id:url.pathname.split('/')[2],owner,upstream,fingerprint,encrypted,inputCount,state:'queued',created:Date.now(),expires:Date.now()+RETENTION,upstreamAttempts:0};
     await storage.put('meta',meta);await storage.setAlarm(Date.now()+100);
    });
   });
   if(meta.fingerprint!==fingerprint)return json({error:'JOB_ID_CONFLICT'},409);
   return json(metaView(meta),meta.state==='expired'?410:202);
  }
  if(!meta)return json({error:'NOT_FOUND'},404);
  if(meta.state==='expired')return json(metaView(meta),410);
  if(!url.pathname.endsWith('/result'))return json(metaView(meta));
  if(['queued','running'].includes(meta.state))return json(metaView(meta),202);
  const text=await getText(this.storage,'result:',meta.resultCount);
  return new Response(text,{status:meta.resultStatus||200,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Analysis-Job-Id':meta.id}});
 }
 async finish(meta,value){
  // Persist result before deleting the credentials and original reference images.
  const text=JSON.stringify(value);
  await this.storage.transaction(async storage=>{
   const resultCount=await putText(storage,'result:',text);
   const {encrypted,...clean}=meta;
   await storage.put('meta',{...clean,state:value.error?'rejected':'succeeded',resultCount});
   await clearText(storage,'input:',meta.inputCount);await storage.setAlarm(meta.expires);
  });
 }
 async expire(meta){await this.storage.transaction(async storage=>{await clearText(storage,'input:',meta.inputCount||0);await clearText(storage,'result:',meta.resultCount||0);const {encrypted,...clean}=meta;await storage.put('meta',{...clean,state:'expired',inputCount:0,resultCount:0});await storage.deleteAlarm();});}
 async alarm(){
  if(this.active)return;
  this.active=true;
  try{
   let meta=await this.storage.get('meta');if(!meta||meta.state==='expired')return;
   if(Date.now()>=meta.expires){await this.expire(meta);return;}
   if(meta.state==='running'){await this.finish(meta,unknown());return;}
   if(meta.state!=='queued'){await this.storage.setAlarm(meta.expires);return;}
   // Claim durably BEFORE the only upstream POST. A restart cannot resubmit it.
   meta={...meta,state:'running',upstreamAttempts:1};await this.storage.put('meta',meta);
   await this.storage.setAlarm(Date.now()+EXECUTION+30000);
   let key;
   try{
    key=await decrypt(this.env.JOB_ENCRYPTION_KEY,meta.encrypted);
    const input=await getText(this.storage,'input:',meta.inputCount),prepared=prepareChat(input),timeout=AbortSignal.timeout(EXECUTION);
    const response=waitingChat(signal=>(this.env.UPSTREAM_FETCH||fetch)(UPSTREAMS[meta.upstream||'nonelinear'],{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:prepared.body,signal:AbortSignal.any([signal,timeout])}),{});
    const result=JSON.parse(await response.text());
    // Error diagnostics from an upstream must never expose this user's credential.
    const safe=JSON.parse(JSON.stringify(result).split(key).join('[REDACTED]'));
    await this.finish(meta,safe);
   }catch{await this.finish(meta,unknown());}
  }finally{this.active=false;}
 }
}
