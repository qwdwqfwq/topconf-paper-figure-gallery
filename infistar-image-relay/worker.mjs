// Isolated Step 3 jobs. Never re-submit a claimed upstream request, including
// after an alarm retry, process restart, lost acknowledgement or expired result.
import {requestStep3ImageStream} from '../forge/step3-image-stream.mjs';
import {imageJobRoute,unpackImageBody,protocolFetch} from '../forge/step3-image-protocol.mjs';
import {preserveImageResult} from './image-result.mjs';
import {resultDiagnostics,exceptionDiagnostics} from './job-diagnostics.mjs';
import {usesBrowserImageTransport,openBrowserImageFetch} from './browser-image-fetch.mjs';
const RETENTION=24*60*60*1000, EXECUTION=12*60*1000, MAX_REQUEST=16*1024*1024;
const encoder=new TextEncoder();
// This Worker runs outside mainland China. Select the documented international
// image gateway BEFORE the sole POST; never fail over by replaying a paid call.
export function backgroundTarget(value){
  const url=new URL(value);
  if(['infistar.cc','www.infistar.cc'].includes(url.hostname)&&url.pathname==='/v1/images/generations')url.hostname='infistar.ai';
  return url.href;
}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function cipher(secret){return crypto.subtle.importKey('raw',Uint8Array.from(atob(secret),c=>c.charCodeAt(0)),'AES-GCM',false,['encrypt','decrypt']);}
async function encrypt(secret,value){const iv=crypto.getRandomValues(new Uint8Array(12)),bytes=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await cipher(secret),encoder.encode(value)));return {iv:[...iv],bytes:[...bytes]};}
async function decrypt(secret,value){return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(value.iv)},await cipher(secret),new Uint8Array(value.bytes)));}
function publicMeta(meta){return {id:meta.id,state:meta.state,created:meta.created,expires:meta.expires,upstreamAttempts:meta.upstreamAttempts||0,requestId:meta.requestId||'',error:meta.error||null,...(meta.diagnostic?{diagnostic:meta.diagnostic}:{})};}
async function putText(storage,prefix,text){const count=Math.ceil(text.length/16000);for(let i=0;i<count;i++)await storage.put(prefix+i,text.slice(i*16000,(i+1)*16000));return count;}
async function getText(storage,prefix,count){let text='';for(let i=0;i<count;i++)text+=await storage.get(prefix+i);return text;}
async function clearText(storage,prefix,count){for(let i=0;i<count;i++)await storage.delete(prefix+i);}
async function boundedBody(request){const reader=request.body?.getReader();let text='',size=0;const decoder=new TextDecoder();if(reader)for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_REQUEST){await reader.cancel();throw Error('REQUEST_TOO_LARGE');}text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}
export function validateSubmission(value){
  const target=new URL(value.url);
  if(!imageJobRoute(target.href))throw Error('INVALID_TARGET');
  if(!value.body||typeof value.body!=='object'||Array.isArray(value.body))throw Error('INVALID_IMAGE_REQUEST');
  let body;try{body=unpackImageBody(value.body);}catch{throw Error('INVALID_MULTIPART');}
  const form=body instanceof FormData,native=target.pathname.includes('/models/');
  if(form&&(!Array.isArray(value.body.multipart)||value.body.multipart.length>50||target.hostname!=='api.openai.com'||!target.pathname.endsWith('/edits')))throw Error('INVALID_MULTIPART');
  const model=form?body.get('model'):native?decodeURIComponent(target.pathname.split('/models/')[1].split(':')[0]):body.model;
  const prompt=form?body.get('prompt'):native?body.contents?.[0]?.parts?.find(p=>typeof p.text==='string')?.text:body.prompt;
  if(!/^[a-z0-9][a-z0-9._-]{0,160}$/i.test(model||'')||typeof prompt!=='string'||!prompt.trim())throw Error('INVALID_IMAGE_REQUEST');
  const refs=form?[...body].filter(([name])=>/^image(?:\[\])?$/.test(name)).length:native?body.contents?.flatMap(c=>c.parts||[]).filter(p=>p.inlineData||p.inline_data||p.fileData).length:(Array.isArray(body.image)?body.image.length:!!body.image);
  if(value.usedReferences!==!!refs)throw Error('INVALID_REFERENCES');
  return {url:target.href,body:value.body,usedReferences:!!value.usedReferences};
}
export default {
  async fetch(request,env){
    const origin=request.headers.get('Origin'),allowed=(env.ALLOWED_ORIGINS||'https://qwdwqfwq.github.io').split(',');
    if(!origin||!allowed.includes(origin))return json({error:'GALLERY_ORIGIN_REQUIRED'},403);
    const headers={'Access-Control-Allow-Origin':origin,'Vary':'Origin','Cache-Control':'no-store'};
    const reply=response=>{const h=new Headers(response.headers);for(const [k,v]of Object.entries(headers))h.set(k,v);return new Response(response.body,{status:response.status,headers:h});};
    const url=new URL(request.url),match=/^\/jobs\/([0-9a-f-]{36})(\/result)?$/.exec(url.pathname);
    if(!match||url.search||!['PUT','GET','OPTIONS'].includes(request.method)||match[2]&&request.method==='PUT')return reply(json({error:'UNKNOWN_ENDPOINT'},404));
    if(request.method==='OPTIONS'){
      const names=(request.headers.get('Access-Control-Request-Headers')||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
      if(!['PUT','GET'].includes(request.headers.get('Access-Control-Request-Method'))||names.some(x=>!['authorization','content-type'].includes(x)))return reply(json({error:'INVALID_PREFLIGHT'},403));
      return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'PUT, GET','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'}});
    }
    const auth=request.headers.get('Authorization')||'';
    if(!/^Bearer [A-Za-z0-9_.=\-]+$/.test(auth))return reply(json({error:'API_KEY_REQUIRED'},401));
    const owner=await digest(auth),id=env.IMAGE_JOBS.idFromName(owner+':'+match[1]);
    return reply(await env.IMAGE_JOBS.get(id).fetch(request));
  }
};
export class ImageJob {
  constructor(ctx,env){this.ctx=ctx;this.storage=ctx.storage;this.env=env;}
  async fetch(request){
    // Namespace-internal capability records; the public router has no such route.
    if(new URL(request.url).pathname==='/compat'){
      if(request.method==='GET')return json(await this.storage.get('compat')||null);
      if(request.method!=='PUT')return json({error:'METHOD_NOT_ALLOWED'},405);
      const value=await request.json();
      if(!['stream','ordinary'].includes(value.mode))return json({error:'INVALID_MODE'},400);
      await this.storage.put('compat',{version:1,mode:value.mode});return json({ok:true});
    }
    const authorization=request.headers.get('Authorization')||'',owner=await digest(authorization),url=new URL(request.url);
    const id=url.pathname.split('/')[2];let meta=await this.storage.get('meta');
    if(meta&&meta.owner!==owner)return json({error:'NOT_FOUND'},404);
    if(meta&&Date.now()>=meta.expires){await this.expire(meta);meta=await this.storage.get('meta');}
    if(request.method==='PUT'){
      let value;try{value=validateSubmission(JSON.parse(await boundedBody(request)));}catch(error){return json({error:error.message==='REQUEST_TOO_LARGE'?'REQUEST_TOO_LARGE':'INVALID_SUBMISSION'},400);}
      const text=JSON.stringify(value),fingerprint=await digest(text);
      // Serialize first submission; concurrent identical PUTs schedule one alarm.
      await this.ctx.blockConcurrencyWhile(async()=>{
        meta=await this.storage.get('meta');
        if(meta)return;
        const encrypted=await encrypt(this.env.JOB_ENCRYPTION_KEY,authorization.slice(7));
        await this.storage.transaction(async storage=>{
          const count=await putText(storage,'input:',text);
          meta={id,owner,fingerprint,state:'queued',created:Date.now(),expires:Date.now()+RETENTION,inputCount:count,encrypted,upstreamAttempts:0};
          await storage.put('meta',meta);await storage.setAlarm(Date.now()+100);
        });
      });
      if(meta.fingerprint!==fingerprint)return json({error:'JOB_ID_CONFLICT'},409);
      return json(publicMeta(meta),meta.state==='expired'?410:202);
    }
    if(!meta)return json({error:'NOT_FOUND'},404);
    if(meta.state==='expired')return json(publicMeta(meta),410);
    if(url.pathname.endsWith('/result')){
      if(meta.state!=='succeeded'&&meta.state!=='rejected')return json(await this.diagnosticMeta(meta,authorization.slice(7)),409);
      const result=JSON.parse(await getText(this.storage,'result:',meta.resultCount));
      return json(result);
    }
    return json(await this.diagnosticMeta(meta,authorization.slice(7)));
  }
  async diagnosticMeta(meta,key){
    const result=publicMeta(meta);
    if(['unknown','rejected'].includes(meta.state)&&meta.resultCount){
      try{
        // Read legacy records as well; never mutate or restart the old task.
        const stored=JSON.parse(await getText(this.storage,'result:',meta.resultCount));
        result.diagnostic={...resultDiagnostics(stored,key),...meta.diagnostic};
      }catch{result.diagnostic={...meta.diagnostic,recordError:'DIAGNOSTIC_RECORD_UNREADABLE'};}
    }
    return result;
  }
  async expire(meta){
    for(const prefix of ['input:','result:'])for(;;){const keys=[...(await this.storage.list({prefix,limit:128})).keys()];if(!keys.length)break;await this.storage.delete(keys);}
    // Small tombstone is intentionally retained. Replaying an expired ID must
    // never silently create a second chargeable upstream generation.
    const {encrypted,inputCount,resultCount,...tombstone}=meta;
    await this.storage.put('meta',{...tombstone,state:'expired'});await this.storage.deleteAlarm();
  }
  async alarm(){
    let meta=await this.storage.get('meta');if(!meta)return;
    if(Date.now()>=meta.expires){await this.expire(meta);return;}
    if(meta.state==='running'||meta.state==='response_received'){
      // At-least-once alarm delivery or a restart after claim. The upstream may
      // have charged; there is no documented upstream image-result lookup API.
      const {encrypted,inputCount,...interrupted}=meta;
      await this.storage.put('meta',{...interrupted,state:'unknown',error:'EXECUTION_INTERRUPTED_NO_RESUBMIT'});
      await clearText(this.storage,'input:',inputCount||0);await this.storage.setAlarm(meta.expires);return;
    }
    if(meta.state!=='queued'){await this.storage.setAlarm(meta.expires);return;}
    await this.storage.setAlarm(Date.now()+EXECUTION+30000);
    let browser;
    let input,target;
    try{
      input=JSON.parse(await getText(this.storage,'input:',meta.inputCount));
      target=backgroundTarget(input.url);
      if(usesBrowserImageTransport(target))browser=await openBrowserImageFetch(this.env.BROWSER,target,{timeoutMs:EXECUTION});
    }catch(error){
      const {encrypted,inputCount,...failed}=meta;
      await this.storage.put('meta',{...failed,state:'unknown',error:'IMAGE_PREPARATION_FAILED',diagnostic:exceptionDiagnostics(error)});
      await clearText(this.storage,'input:',inputCount||0);
      await this.storage.setAlarm(meta.expires);
      return;
    }
    meta={...meta,state:'running',upstreamAttempts:1};
    await this.storage.put('meta',meta); // Durable claim BEFORE the only POST.
    let executionKey='';
    try{
      const key=executionKey=await decrypt(this.env.JOB_ENCRYPTION_KEY,meta.encrypted);
      const compatibilityStore={
        get:async identity=>{
          const object=this.env.IMAGE_JOBS.get(this.env.IMAGE_JOBS.idFromName('compat:'+identity));
          return (await object.fetch(new Request('https://internal/compat'))).json();
        },
        set:async(identity,value)=>{
          const object=this.env.IMAGE_JOBS.get(this.env.IMAGE_JOBS.idFromName('compat:'+identity));
          const response=await object.fetch(new Request('https://internal/compat',{method:'PUT',body:JSON.stringify({mode:value.mode})}));
          if(!response.ok)throw Error('COMPATIBILITY_STORAGE_FAILED');
        }
      };
      const raw=await requestStep3ImageStream({...input,url:target,body:unpackImageBody(input.body),key,timeoutMs:EXECUTION,compatibilityStore,
        beforeAttempt:async({attempt,mode})=>{meta={...meta,upstreamAttempts:attempt,mode};await this.storage.put('meta',meta);},
        fetchImpl:browser?browser.fetch:protocolFetch()});
      raw.backgroundTarget=target;
      // Scrub the actual key even if an upstream error echoes the credential.
      const safe=JSON.stringify(raw).split(key).join('[redacted]').replace(/Bearer\s+[^"\s]+/gi,'Bearer [redacted]');
      await this.storage.transaction(async storage=>{
        const count=await putText(storage,'result:',safe);
        const {encrypted,inputCount,...finished}=meta;
        meta={...finished,state:'response_received',requestId:raw.requestId,resultCount:count};
        await storage.put('meta',meta);
        await clearText(storage,'input:',inputCount);
      });
      await this.finish(meta,JSON.parse(safe));
    }catch(error){
      const {encrypted,inputCount,...finished}=meta;
      const diagnostic=exceptionDiagnostics(error,executionKey);
      await this.storage.put('meta',{...finished,state:'unknown',requestId:diagnostic.requestId||'',error:'UPSTREAM_RESULT_UNCONFIRMED_NO_RESUBMIT',diagnostic});
      await clearText(this.storage,'input:',inputCount||0);
    }finally{await browser?.close();}
    await this.storage.setAlarm(meta.expires);
  }
  async finish(meta,raw){
    const preserved=await preserveImageResult(raw);
    const result=preserved.downloadError?{...preserved,ok:false,resultError:preserved.downloadError}:preserved;
    // A gateway 5xx does not prove that generation was never accepted. Keep the
    // task unresolved and block automatic replacement instead of calling it a
    // definite rejection. Its received response remains stored for diagnosis.
    const uncertain=!result.ok&&(result.status>=500||result.status===408||raw.ok);
    await this.storage.transaction(async storage=>{
      const count=await putText(storage,'result:',JSON.stringify(result));
      if(meta.resultCount>count)for(let i=count;i<meta.resultCount;i++)await storage.delete('result:'+i);
      await storage.put('meta',{...meta,state:uncertain?'unknown':result.ok?'succeeded':'rejected',requestId:result.requestId,error:uncertain?'UPSTREAM_HTTP_'+result.status+'_NO_RESUBMIT':result.resultError||result.downloadError||null,resultCount:count});
    });
  }
}
