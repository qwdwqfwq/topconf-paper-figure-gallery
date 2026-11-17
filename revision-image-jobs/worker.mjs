// Isolated bitmap modification jobs. Never re-submit a claimed upstream request, including
// after an alarm retry, process restart, lost acknowledgement or expired result.
import {revisionImageJobRoute as imageJobRoute} from '../forge/revision-image-protocol.mjs';
import {requestStep3ImageStream} from '../forge/step3-image-stream.mjs';
import {unpackImageBody,protocolFetch} from '../forge/step3-image-protocol.mjs';
import {preserveImageResult} from '../infistar-image-relay/image-result.mjs';
import {resultDiagnostics,exceptionDiagnostics,responseDiagnostics} from '../infistar-image-relay/job-diagnostics.mjs';
import {usesBrowserImageTransport,openBrowserImageFetch} from './browser-image-fetch.mjs';
import {PAYLOAD_STORE,SQLITE_PAYLOAD_STORE,hasPayloadStore,putPayload,getPayload,deletePayloads,payloadObject} from '../infistar-image-relay/job-payloads.mjs';
import {extractImage,storeImage,streamedResult} from '../infistar-image-relay/streamed-image-result.mjs';
import {sqliteImagePayloads} from '../infistar-image-relay/sqlite-image-payloads.mjs';
import {validUpload} from '../forge/revision-upload.mjs';
import {receiveUpload,readUpload,clearUpload,sameUpload} from './upload-store.mjs';
const RETENTION=24*60*60*1000, EXECUTION=12*60*1000, MAX_REQUEST=16*1024*1024;
const encoder=new TextEncoder();
// Modification jobs preserve the exact selected service address.
export function backgroundTarget(value){return new URL(value).href;}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function cipher(secret){return crypto.subtle.importKey('raw',Uint8Array.from(atob(secret),c=>c.charCodeAt(0)),'AES-GCM',false,['encrypt','decrypt']);}
async function encrypt(secret,value){const iv=crypto.getRandomValues(new Uint8Array(12)),bytes=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await cipher(secret),encoder.encode(value)));return {iv:[...iv],bytes:[...bytes]};}
async function decrypt(secret,value){return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(value.iv)},await cipher(secret),new Uint8Array(value.bytes)));}
function publicMeta(meta){return {id:meta.id,state:meta.state,created:meta.created,expires:meta.expires,upstreamAttempts:meta.upstreamAttempts||0,requestId:meta.requestId||'',error:meta.error||null,...(meta.diagnostic?{diagnostic:meta.diagnostic}:{})};}
function jobLog(event,meta){console.log(JSON.stringify({event,...publicMeta(meta)}));}
async function putText(storage,prefix,text){const count=Math.ceil(text.length/16000);for(let i=0;i<count;i++)await storage.put(prefix+i,text.slice(i*16000,(i+1)*16000));return count;}
async function getText(storage,prefix,count){let text='';for(let i=0;i<count;i++)text+=await storage.get(prefix+i);return text;}
async function clearText(storage,prefix,count){for(let i=0;i<count;i++)await storage.delete(prefix+i);}
async function boundedBody(request,limit=MAX_REQUEST){const reader=request.body?.getReader();let text='',size=0;const decoder=new TextDecoder();if(reader)for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('REQUEST_TOO_LARGE');}text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}
export function validateSubmission(value){
  const target=new URL(value.url);
  if(!imageJobRoute(target.href))throw Error('INVALID_TARGET');
  if(!value.body||typeof value.body!=='object'||Array.isArray(value.body))throw Error('INVALID_IMAGE_REQUEST');
  let body;try{body=unpackImageBody(value.body);}catch{throw Error('INVALID_MULTIPART');}
  const form=body instanceof FormData,native=target.pathname.includes('/models/');
  if(form&&(!Array.isArray(value.body.multipart)||value.body.multipart.length>50||!['api.openai.com','infistar.cc','www.infistar.cc','infistar.ai','www.infistar.ai'].includes(target.hostname)||!target.pathname.endsWith('/edits')))throw Error('INVALID_MULTIPART');
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
    const url=new URL(request.url),match=/^\/jobs\/([0-9a-f-]{36})(\/result|\/upload(?:\/\d{1,2})?)?$/.exec(url.pathname);
    if(!match||url.search||!['PUT','GET','OPTIONS'].includes(request.method)||match[2]==='/result'&&request.method==='PUT'||match[2]==='/upload'&&request.method==='PUT'||/\/upload\/\d+$/.test(url.pathname)&&request.method==='GET')return reply(json({error:'UNKNOWN_ENDPOINT'},404));
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
  constructor(ctx,env){this.ctx=ctx;this.storage=ctx.storage;this.env=Object.create(env);this.env.DO_IMAGE_PAYLOADS=sqliteImagePayloads(ctx.storage);}
  async readText(meta,kind){
    if(kind==='input'&&meta.upload)return readUpload(this.storage,meta.upload);
    return hasPayloadStore(meta)?getPayload(this.env,meta,kind==='result'?(meta.resultStage||'result'):kind):getText(this.storage,kind+':',meta[kind+'Count']);
  }
  async clearInput(storage,meta){
    // Payload stages remain private until the existing 24-hour expiry. Retaining
    // their known keys also makes cleanup after an interrupted commit safe.
    if(!hasPayloadStore(meta))await clearText(storage,'input:',meta.inputCount||0);
  }
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
    if(meta&&meta.state!=='expired'&&Date.now()>=meta.expires){await this.expire(meta);meta=await this.storage.get('meta');}
    if(url.pathname.includes('/upload')){
      if(meta)return json({...publicMeta(meta),committed:true},meta.state==='expired'?410:200);
      if(request.method==='GET'){
        const manifest=await this.storage.get('upload:manifest');
        if(!manifest)return json({error:'NOT_FOUND'},404);
        if(Date.now()>=manifest.expires){await clearUpload(this.storage);return json({error:'UPLOAD_EXPIRED'},410);}
        return json({count:manifest.count,digest:manifest.digest,parts:Object.keys(manifest.parts).map(Number),expires:manifest.expires});
      }
      try{
        // Bounded chunk body. The original full-resolution image is never resized.
        if(Number(request.headers.get('Content-Length'))>3*1024*1024)return json({error:'INVALID_UPLOAD'},400);
        const value=JSON.parse(await boundedBody(request,3*1024*1024));
        if(typeof value.data!=='string'||value.data.length>512*1024)throw Error('INVALID_UPLOAD');
        let manifest;
        await this.ctx.blockConcurrencyWhile(async()=>{
          meta=await this.storage.get('meta');
          if(!meta)manifest=await receiveUpload(this.storage,{count:value.count,digest:value.digest},Number(url.pathname.split('/')[4]),value.data);
        });
        if(meta)return json({...publicMeta(meta),committed:true},meta.state==='expired'?410:200);
        return json({count:manifest.count,digest:manifest.digest,parts:Object.keys(manifest.parts).map(Number)});
      }catch(error){return json({error:error.message},error.message==='UPLOAD_EXPIRED'?410:error.message==='UPLOAD_CONFLICT'?409:400);}
    }
    if(request.method==='PUT'){
      let value,upload;
      try{
        const received=JSON.parse(await boundedBody(request));
        if(received.upload){
          upload=received.upload;if(!validUpload(upload))throw Error('INVALID_UPLOAD');
          if(meta){if(!sameUpload(meta.upload,upload))return json({error:'JOB_ID_CONFLICT'},409);return json(publicMeta(meta),meta.state==='expired'?410:202);}
          const manifest=await this.storage.get('upload:manifest');
          if(manifest&&Date.now()>=manifest.expires)return json({error:'UPLOAD_EXPIRED'},410);
          value=validateSubmission(JSON.parse(await readUpload(this.storage,upload)));
        }else value=validateSubmission(received);
      }catch(error){return json({error:error.message.startsWith('UPLOAD_')?error.message:error.message==='REQUEST_TOO_LARGE'?'REQUEST_TOO_LARGE':'INVALID_SUBMISSION'},400);}
      const text=JSON.stringify(value),fingerprint=await digest(text);
      // Serialize first submission; concurrent identical PUTs schedule one alarm.
      await this.ctx.blockConcurrencyWhile(async()=>{
        meta=await this.storage.get('meta');
        if(meta)return;
        const encrypted=await encrypt(this.env.JOB_ENCRYPTION_KEY,authorization.slice(7));
        const queued={id,owner,fingerprint,state:'queued',created:Date.now(),expires:Date.now()+RETENTION,encrypted,upstreamAttempts:0,...(upload?{upload}:{}),...((this.env.IMAGE_PAYLOADS||this.env.STREAM_IMAGE_RESULTS==='true')?{payloadStore:this.env.IMAGE_PAYLOADS?PAYLOAD_STORE:SQLITE_PAYLOAD_STORE,streamImageResults:this.env.STREAM_IMAGE_RESULTS==='true'}:{})};
        // Finish the payload write BEFORE acknowledging/scheduling the task. Keep
        // external I/O outside the retryable SQLite transaction callback.
        if(!upload&&hasPayloadStore(queued))await putPayload(this.env,queued,'input',text);
        await this.storage.transaction(async storage=>{
          const count=upload||hasPayloadStore(queued)?0:await putText(storage,'input:',text);
          meta={...queued,inputCount:count};
          await storage.put('meta',meta);await storage.setAlarm(Date.now()+100);
        });
        jobLog('queued',meta);
      });
      if(meta.fingerprint!==fingerprint)return json({error:'JOB_ID_CONFLICT'},409);
      return json(publicMeta(meta),meta.state==='expired'?410:202);
    }
    if(!meta)return json({error:'NOT_FOUND'},404);
    if(meta.state==='expired')return json(publicMeta(meta),410);
    if(url.pathname.endsWith('/result')){
      if(meta.state!=='succeeded'&&meta.state!=='rejected')return json(await this.diagnosticMeta(meta,authorization.slice(7)),409);
      if(meta.resultFormat==='image-v2')return streamedResult(this.env,meta);
      if(hasPayloadStore(meta))return new Response((await payloadObject(this.env,meta,meta.resultStage||'result')).body,{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
      const result=JSON.parse(await this.readText(meta,'result'));
      return json(result);
    }
    return json(await this.diagnosticMeta(meta,authorization.slice(7)));
  }
  async diagnosticMeta(meta,key){
    const result=publicMeta(meta);
    if(['unknown','rejected'].includes(meta.state)&&meta.resultCount&&!meta.diagnostic){
      try{
        // Read legacy records as well; never mutate or restart the old task.
        const stored=JSON.parse(await this.readText(meta,'result'));
        result.diagnostic={...resultDiagnostics(stored,key),...meta.diagnostic};
      }catch{result.diagnostic={...meta.diagnostic,recordError:'DIAGNOSTIC_RECORD_UNREADABLE'};}
    }
    return result;
  }
  async expire(meta){
    if(meta.state==='expired')return;
    if(hasPayloadStore(meta))await deletePayloads(this.env,meta);
    await clearUpload(this.storage);
    for(const prefix of ['input:','result:'])for(;;){const keys=[...(await this.storage.list({prefix,limit:128})).keys()];if(!keys.length)break;await this.storage.delete(keys);}
    // Small tombstone is intentionally retained. Replaying an expired ID must
    // never silently create a second chargeable upstream generation.
    const {encrypted,inputCount,resultCount,payloadStore,resultStage,...tombstone}=meta;
    await this.storage.put('meta',{...tombstone,state:'expired'});await this.storage.deleteAlarm();
  }
  async alarm(){
    if(this.active)return;
    this.active=true;
    try{return await this.executeAlarm();}finally{this.active=false;}
  }
  async executeAlarm(){
    let meta=await this.storage.get('meta');if(!meta){const upload=await this.storage.get('upload:manifest');if(upload){if(Date.now()>=upload.expires)await clearUpload(this.storage);else await this.storage.setAlarm(upload.expires);}return;}
    if(Date.now()>=meta.expires){await this.expire(meta);return;}
    const recovering=['running','response_received'].includes(meta.state)&&!!meta.browserSession&&!!meta.encrypted;
    if((meta.state==='running'||meta.state==='response_received')&&!recovering){
      // At-least-once alarm delivery or a restart after claim. The upstream may
      // have charged; there is no documented upstream image-result lookup API.
      const {encrypted,inputCount,...interrupted}=meta;
      const stopped={...interrupted,state:'unknown',error:'EXECUTION_INTERRUPTED_NO_RESUBMIT'};
      await this.storage.put('meta',stopped);jobLog('interrupted',stopped);
      await this.clearInput(this.storage,meta);await this.storage.setAlarm(meta.expires);return;
    }
    if(meta.state!=='queued'&&!recovering){await this.storage.setAlarm(meta.expires);return;}
    await this.storage.setAlarm(Date.now()+15000);
    let browser;
    let input,target;
    try{
      input=JSON.parse(await this.readText(meta,'input'));
      target=backgroundTarget(input.url);
      if(usesBrowserImageTransport(target))browser=await openBrowserImageFetch(this.env.BROWSER,target,{timeoutMs:EXECUTION,resume:recovering?meta.browserSession:undefined});
    }catch(error){
      if(recovering&&Date.now()-meta.created<EXECUTION+60000){
        await this.storage.put('meta',{...meta,diagnostic:{...meta.diagnostic,recoveryError:error.message}});
        await this.storage.setAlarm(Date.now()+15000);return;
      }
      const {encrypted,inputCount,...failed}=meta;
      const stopped={...failed,state:'unknown',error:'IMAGE_PREPARATION_FAILED',diagnostic:exceptionDiagnostics(error)};
      await this.storage.put('meta',stopped);jobLog('preparation_failed',stopped);
      await this.clearInput(this.storage,meta);
      await this.storage.setAlarm(meta.expires);
      return;
    }
    meta={...meta,state:'running',upstreamAttempts:meta.upstreamAttempts||1,...(browser?{browserSession:browser.descriptor}:{}),diagnostic:{...meta.diagnostic,targetHost:new URL(target).hostname,transport:browser?'browser':'worker-fetch',...(recovering?{recoveries:(meta.diagnostic?.recoveries||0)+1}:{})}};
    await this.storage.put('meta',meta); // Durable claim BEFORE the only POST.
    jobLog('started',meta);
    let executionKey='';
    try{
      const key=executionKey=await decrypt(this.env.JOB_ENCRYPTION_KEY,meta.encrypted);
      const compatibilityStore={
        get:async identity=>{
          const object=this.env.IMAGE_JOBS.get(this.env.IMAGE_JOBS.idFromName('compat:'+identity));
          return recovering&&meta.mode?{version:1,mode:meta.mode}:(await object.fetch(new Request('https://internal/compat'))).json();
        },
        set:async(identity,value)=>{
          const object=this.env.IMAGE_JOBS.get(this.env.IMAGE_JOBS.idFromName('compat:'+identity));
          const response=await object.fetch(new Request('https://internal/compat',{method:'PUT',body:JSON.stringify({mode:value.mode})}));
          if(!response.ok)throw Error('COMPATIBILITY_STORAGE_FAILED');
        }
      };
      let browserTransport;
      const observedFetch=async(url,init)=>{
        const started=Date.now();
        const response=await (browser&&url===target?browser.fetch(url,init):globalThis.fetch(url,init));
        if(response.imageTransport)browserTransport=response.imageTransport;
        if(new URL(url).pathname.includes('/images/')||new URL(url).pathname.includes('/models/')){
          meta={...meta,diagnostic:{...meta.diagnostic,headersMs:browserTransport?.headersMs??Date.now()-started,...responseDiagnostics(response,key)}};
          await this.storage.put('meta',meta);jobLog('headers_received',meta);
        }
        return response;
      };
      const requestInput={...input,url:target,body:unpackImageBody(input.body),key,timeoutMs:EXECUTION,compatibilityStore,
        beforeAttempt:async({attempt,mode})=>{meta={...meta,upstreamAttempts:Math.max(meta.upstreamAttempts||0,attempt),mode};await this.storage.put('meta',meta);},
        fetchImpl:protocolFetch(observedFetch)};
      input=null;
      const raw=await requestStep3ImageStream(requestInput);
      if(browserTransport)raw.transport={...raw.transport,...browserTransport};
      requestInput.body=null;
      raw.backgroundTarget=target;
      meta={...meta,diagnostic:{...meta.diagnostic,...resultDiagnostics(raw,key)}};
      if(meta.streamImageResults){meta=await this.finishStreamed(meta,raw,key);}
      else {
      // Scrub the actual key even if an upstream error echoes the credential.
      const safe=JSON.stringify(raw).split(key).join('[redacted]').replace(/Bearer\s+[^"\s]+/gi,'Bearer [redacted]');
      if(hasPayloadStore(meta))await putPayload(this.env,meta,'raw',safe);
      await this.storage.transaction(async storage=>{
        const count=hasPayloadStore(meta)?1:await putText(storage,'result:',safe);
        const previous=meta;
        meta={...meta,state:'response_received',requestId:raw.requestId,resultCount:count,...(hasPayloadStore(meta)?{resultStage:'raw'}:{})};
        await storage.put('meta',meta);
      });
      await this.finish(meta,JSON.parse(safe));
      }
    }catch(error){
      meta=await this.storage.get('meta')||meta;
      if(browser&&(error.browserRecoverable||!/^BROWSER_|^IMAGE_/.test(error.message))&&Date.now()-meta.created<EXECUTION+60000){
        meta={...meta,diagnostic:{...meta.diagnostic,recoveryError:error.message}};
        await this.storage.put('meta',meta);await browser.close({retain:true});browser=null;
        await this.storage.setAlarm(Date.now()+15000);return;
      }
      const {encrypted,inputCount,...finished}=meta;
      const diagnostic={...meta.diagnostic,...exceptionDiagnostics(error,executionKey)};
      const failed={...finished,state:'unknown',requestId:diagnostic.requestId||meta.requestId||'',error:'UPSTREAM_RESULT_UNCONFIRMED_NO_RESUBMIT',diagnostic};
      await this.storage.put('meta',failed);jobLog('failed',failed);
      await this.clearInput(this.storage,meta);
    }finally{await browser?.close();}
    await this.storage.setAlarm(meta.expires);
  }
  async finishStreamed(meta,raw,key){
    let item,extractError;
    try{item=extractImage(raw);}catch(error){extractError=error.message;}
    const diagnostic={...meta.diagnostic,...resultDiagnostics(raw,key)};
    // Preserve a small provider response/URL for diagnosis. Inline image bytes
    // are stored separately and never re-serialized into another huge JSON.
    const saved={...raw,text:raw.ok?(item?.url?JSON.stringify({data:[{url:item.url}]}):''):raw.text?.slice(0,16000)};
    raw.text='';
    const safe=JSON.stringify(saved).split(key).join('[redacted]').replace(/Bearer\s+[^"\s]+/gi,'Bearer [redacted]');
    await putPayload(this.env,meta,'raw',safe);
    meta={...meta,state:'response_received',requestId:raw.requestId,resultCount:1,resultStage:'raw',diagnostic};
    await this.storage.put('meta',meta);
    jobLog('response_received',meta);
    if(!raw.ok||extractError){
      const result={...JSON.parse(safe),...(extractError?{ok:false,resultError:extractError}:{})};
      return this.finish(meta,result,raw.ok);
    }
    const image=await storeImage(this.env,meta,item);item=null;
    const result={...raw};delete result.text;
    await putPayload(this.env,meta,'result',JSON.stringify({image,result}));
    const {encrypted,inputCount,browserSession,...finished}=meta;
    const complete={...finished,state:'succeeded',resultFormat:'image-v2',resultStage:'result',error:null,diagnostic:{...diagnostic,imageBytes:image.bytes,totalMs:Date.now()-meta.created}};
    await this.storage.put('meta',complete);await this.clearInput(this.storage,meta);jobLog('completed',complete);return complete;
  }
  async finish(meta,raw,accepted=raw.ok){
    const preserved=await preserveImageResult(raw);
    const result=preserved.downloadError?{...preserved,ok:false,resultError:preserved.downloadError}:preserved;
    // A gateway 5xx does not prove that generation was never accepted. Keep the
    // task unresolved and block automatic replacement instead of calling it a
    // definite rejection. Its received response remains stored for diagnosis.
    const uncertain=!result.ok&&(result.status>=500||result.status===408||accepted);
    if(hasPayloadStore(meta))await putPayload(this.env,meta,'result',JSON.stringify(result));
    await this.storage.transaction(async storage=>{
      const count=hasPayloadStore(meta)?1:await putText(storage,'result:',JSON.stringify(result));
      if(meta.resultCount>count)for(let i=count;i<meta.resultCount;i++)await storage.delete('result:'+i);
      const previous=meta,{encrypted,inputCount,browserSession,...finished}=meta;
      meta={...finished,state:uncertain?'unknown':result.ok?'succeeded':'rejected',requestId:result.requestId,error:uncertain?'UPSTREAM_HTTP_'+result.status+'_NO_RESUBMIT':result.resultError||result.downloadError||null,resultCount:count,diagnostic:{...meta.diagnostic,...resultDiagnostics(result)},...(hasPayloadStore(meta)?{resultStage:'result'}:{})};
      await storage.put('meta',meta);
      await this.clearInput(storage,previous);
    });
    jobLog('completed',meta);return meta;
  }
}
