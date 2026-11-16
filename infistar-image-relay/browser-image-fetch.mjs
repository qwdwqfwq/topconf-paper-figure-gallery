// Isolated long-running synchronous image transport. Chrome owns the single paid
// request; the Durable Object owns its lifetime and persists the response.
import {explicitlyRejectsImageStreaming} from '../forge/step3-image-compat.mjs';
// Provider JSON can contain duplicate image fields and base64 overhead. This
// bound belongs to remote Chrome; the Worker never receives the raw envelope.
const MAX_RESPONSE=128*1024*1024,RESPONSE_CHUNK=48*1024;
export function usesBrowserImageTransport(value){
  const u=new URL(value);
  if(u.protocol!=='https:'||u.port||u.search||u.hash)return false;
  if(['infistar.cc','www.infistar.cc','infistar.ai','www.infistar.ai'].includes(u.hostname))
    return u.pathname==='/v1/images/generations'||u.pathname==='/v1beta/models/gemini-nano-banana-2.1:generateContent';
  return u.hostname==='api.nonelinear.com.cn'&&u.pathname==='/v1/images/generations';
}
export async function openBrowserImageFetch(binding,url,{timeoutMs=12*60*1000,resume}={}){
  if(!usesBrowserImageTransport(url)||!binding)throw Error('BROWSER_TRANSPORT_UNAVAILABLE');
  let session,ws,closed=false,nextId=0,heartbeat;
  const pending=new Map();
  function rejectPending(){for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('BROWSER_CONNECTION_CLOSED'));}pending.clear();}
  async function close({retain=false}={}){
    if(closed)return;closed=true;clearInterval(heartbeat);rejectPending();
    try{ws?.close();}catch{}
    if(session&&!retain)try{await binding.closeSession(session.sessionId);}catch{}
  }
  function command(method,params={},deadline=20000){
    if(closed)return Promise.reject(Error('BROWSER_CONNECTION_CLOSED'));
    return new Promise((resolve,reject)=>{
      const id=++nextId,timer=setTimeout(()=>{pending.delete(id);reject(Error('BROWSER_COMMAND_TIMEOUT'));},deadline);
      pending.set(id,{resolve,reject,timer});
      try{ws.send(JSON.stringify({id,method,params}));}catch{clearTimeout(timer);pending.delete(id);reject(Error('BROWSER_CONNECTION_CLOSED'));}
    });
  }
  try{
    session=resume?{sessionId:resume.sessionId}:await binding.acquire({targets:true,keepAlive:20*60*1000});
    const targets=await binding.devtools.listTargets(session.sessionId);
    const target=resume?targets.find(t=>t.id===resume.targetId):targets.find(t=>t.type==='page')||await binding.devtools.newTarget(session.sessionId,'about:blank');
    if(!target)throw Error('BROWSER_RECOVERY_SESSION_LOST');
    const descriptor=resume||{sessionId:session.sessionId,targetId:target.id,slot:'__galleryImage_'+crypto.randomUUID().replaceAll('-','')};
    const connection=await binding.connectSession(session.sessionId,{targetId:target.id});
    const upgrade=await connection.webSocket.fetch('https://browser-binding.invalid',{headers:{Upgrade:'websocket'}});
    ws=upgrade.webSocket;if(!ws)throw Error('BROWSER_CONNECTION_UNAVAILABLE');ws.accept();
    ws.addEventListener('message',event=>{
      let message;try{message=JSON.parse(event.data);}catch{return;}
      const item=pending.get(message.id);if(!item)return;
      pending.delete(message.id);clearTimeout(item.timer);
      if(message.error)item.reject(Error('BROWSER_COMMAND_FAILED'));else item.resolve(message.result);
    });
    ws.addEventListener('close',rejectPending);ws.addEventListener('error',rejectPending);
    heartbeat=setInterval(()=>{command('Runtime.evaluate',{expression:'Date.now()',returnByValue:true}).catch(()=>{});},10000);
    const origin=new URL(url).origin;
    const navigation=resume?{}:await command('Page.navigate',{url:origin+'/v1/models'});
    if(navigation.errorText)throw Error('BROWSER_NAVIGATION_FAILED');
    const start=Date.now();
    for(;;){
      const page=await command('Runtime.evaluate',{expression:'location.origin',returnByValue:true});
      if(page.result?.value===origin)break;
      if(Date.now()-start>20000)throw Error('BROWSER_NAVIGATION_TIMEOUT');
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    let issued=false,allowOrdinary=false;
    return {
      close,descriptor,
      async fetch(target,init){
        if(target!==url||init?.method!=='POST'||typeof init.body!=='string'||issued&&(!allowOrdinary||JSON.parse(init.body).stream!==undefined))throw Error('BROWSER_REQUEST_ALREADY_CLAIMED');
        if(init.signal?.aborted)throw Error('BROWSER_REQUEST_ABORTED');
        issued=true;allowOrdinary=false; // A lost reply never opens the replay gate.
        const headers=new Headers(init.headers);
        const payload={url,headers:{Authorization:headers.get('Authorization'),'Content-Type':'application/json'},body:init.body,timeoutMs,maxBytes:MAX_RESPONSE};
        // Chrome retains the promise and completed response independently of
        // the DO/CDP connection. Reattachment only reads this exact slot.
        const slot=JSON.stringify(descriptor.slot);
        const expression=resume?'globalThis['+slot+']':
          '(globalThis['+slot+'] ||= ('+browserRequest.toString()+')('+JSON.stringify(payload)+'))';
        const abort=()=>{void close();};init.signal?.addEventListener('abort',abort,{once:true});
        let objectId,streaming=false,result;
        const release=async()=>{
          init.signal?.removeEventListener('abort',abort);
          if(objectId){const id=objectId;objectId=null;await command('Runtime.releaseObject',{objectId:id}).catch(()=>{});}
        };
        try{
          // A remote handle avoids serializing a 4K image into one enormous CDP
          // message (and several concurrent copies in the 128 MiB Worker).
          const reply=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:false},timeoutMs+1000);
          objectId=reply.result?.objectId;
          if(reply.exceptionDetails||!objectId)throw Error(resume?'BROWSER_RECOVERY_RESULT_MISSING':'BROWSER_RESPONSE_UNCONFIRMED');
          const metadata=await command('Runtime.callFunctionOn',{objectId,returnByValue:true,functionDeclaration:"function(){return {status:this.status,headers:this.headers,textLength:this.text?.length,text:this.status>=200&&this.status<300?'':this.text?.slice(0,16000),diagnostic:this.diagnostic||this.transport};}"});
          result=metadata.result?.value;
          if(metadata.exceptionDetails||!result||!Number.isInteger(result.status)||!Number.isInteger(result.textLength))throw Object.assign(Error('BROWSER_RESPONSE_UNCONFIRMED'),{transportDiagnostics:result?.diagnostic||{stage:'browser_reply_unconfirmed'}});
          allowOrdinary=JSON.parse(init.body).stream===true&&explicitlyRejectsImageStreaming({...result,ok:result.status>=200&&result.status<300});
          if(allowOrdinary){
            // Only a received, explicit protocol rejection permits the existing
            // ordinary compatibility attempt. It receives a separate slot.
            await command('Runtime.evaluate',{expression:'delete globalThis['+slot+']',returnByValue:true});
            resume=null;
          }
          let offset=0;const encoder=new TextEncoder();
          const body=new ReadableStream({
            async pull(controller){
              try{
                if(offset>=result.textLength){await release();controller.close();return;}
                const chunk=await command('Runtime.callFunctionOn',{objectId,returnByValue:true,functionDeclaration:'function(offset,length){let end=Math.min(offset+length,this.text.length);const last=this.text.charCodeAt(end-1);if(end<this.text.length&&last>=0xd800&&last<=0xdbff)end--;return this.text.slice(offset,end);}',arguments:[{value:offset},{value:RESPONSE_CHUNK}]});
                const text=chunk.result?.value;
                if(chunk.exceptionDetails||typeof text!=='string'||!text.length)throw Error('BROWSER_RESPONSE_CHUNK_LOST');
                offset+=text.length;controller.enqueue(encoder.encode(text));
              }catch(error){error.browserRecoverable=true;error.transportDiagnostics||=result.diagnostic;await release();controller.error(error);}
            },
            async cancel(){await release();}
          });
          const responseHeaders=new Headers(result.headers);
          responseHeaders.delete('content-length');responseHeaders.delete('content-encoding');
          const response=new Response(body,{status:result.status,headers:responseHeaders});
          response.imageTransport=result.diagnostic;
          streaming=true;
          return response;
        }catch(error){
          error.browserRecoverable=/^BROWSER_(CONNECTION_|COMMAND_|RESPONSE_CHUNK_)/.test(error.message);
          error.transportDiagnostics||=result?.diagnostic||{stage:'browser_reply_unconfirmed',errorCode:error.message};
          throw error;
        }finally{if(!streaming)await release();}
      }
    };
  }catch(error){await close({retain:!!resume});throw error;}
}

// This function is serialized into the remote Chrome target. It performs one
// same-origin POST, refuses redirects, and bounds the response before returning.
async function browserRequest({url,headers,body,timeoutMs,maxBytes}){
  const started=performance.now(),diagnostic={stage:'waiting_response',responseBytes:0};let response,reader;
  // Keep this serialized function free of named nested functions: Wrangler's
  // keepNames transform otherwise inserts a worker-only __name helper here.
  try{
  response=await fetch(url,{method:'POST',headers,body,credentials:'omit',redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
  Object.assign(diagnostic,{stage:'reading_response',headersMs:Math.round(performance.now()-started),status:response.status,headers:[...response.headers]});
  reader=response.body.getReader();const decoder=new TextDecoder();let text='',size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;diagnostic.responseBytes=size;diagnostic.firstBodyChunkMs??=Math.round(performance.now()-started);if(size>maxBytes)throw Error('IMAGE_RESPONSE_TOO_LARGE');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}
  catch(error){await reader.cancel().catch(()=>{});throw error;}
  finally{reader.releaseLock();}
  if(response.ok){
    // Match Step 3's existing first-image extraction. Keep image bytes intact,
    // discard duplicate envelopes in Chrome, and bound the actual image rather
    // than confusing its binary size with the raw JSON response size.
    let data;try{data=JSON.parse(text);}catch{}
    let item=data?.data?.[0]||data?.images?.[0];
    if(!item?.b64_json&&!item?.url){
      item=null;
      for(const candidate of data?.candidates||[]){
        for(const part of candidate.content?.parts||[]){const image=part.inlineData||part.inline_data;if(!part.thought&&image?.data){item={b64_json:image.data,mimeType:image.mimeType||image.mime_type||'image/png'};break;}}
        if(item)break;
      }
    }
    if(item?.b64_json||item?.url){
      if(item.b64_json?.length>Math.ceil(32*1024*1024*4/3))throw Error('IMAGE_TOO_LARGE');
      text=JSON.stringify({data:[item.b64_json?{b64_json:item.b64_json,...(item.mimeType?{mimeType:item.mimeType}:{})}:{url:item.url}]});
      diagnostic.normalizedResponseChars=text.length;
    }
  }
  // Large non-image/error envelopes must not reintroduce an unbounded Worker
  // copy. Preserve timing/error diagnostics and fail closed without another POST.
  if(text.length>Math.ceil(32*1024*1024*4/3)+4096)throw Error('IMAGE_RESPONSE_TOO_LARGE');
  diagnostic.stage='response_received';return {status:response.status,headers:[...response.headers],text,diagnostic:{...diagnostic,elapsedMs:Math.round(performance.now()-started)}};
  }catch(error){diagnostic.errorCode=error.name==='TimeoutError'?'BROWSER_REQUEST_TIMEOUT':['IMAGE_RESPONSE_TOO_LARGE','IMAGE_TOO_LARGE'].includes(error.message)?error.message:'BROWSER_FETCH_FAILED';return {diagnostic:{...diagnostic,elapsedMs:Math.round(performance.now()-started)}};}
}
