// Isolated long-running Infistar GPT transport. Chrome owns the single paid
// request; the Durable Object owns its lifetime and persists the response.
import {explicitlyRejectsImageStreaming} from '../forge/step3-image-compat.mjs';
const MAX_RESPONSE=32*1024*1024;
export function usesBrowserImageTransport(value){
  const u=new URL(value);
  return ['infistar.cc','www.infistar.cc','infistar.ai','www.infistar.ai'].includes(u.hostname)&&u.pathname==='/v1/images/generations';
}
export async function openBrowserImageFetch(binding,url,{timeoutMs=12*60*1000}={}){
  if(!usesBrowserImageTransport(url)||!binding)throw Error('BROWSER_TRANSPORT_UNAVAILABLE');
  let session,ws,closed=false,nextId=0,heartbeat;
  const pending=new Map();
  function rejectPending(){for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('BROWSER_CONNECTION_CLOSED'));}pending.clear();}
  async function close(){
    if(closed)return;closed=true;clearInterval(heartbeat);rejectPending();
    try{ws?.close();}catch{}
    if(session)try{await binding.closeSession(session.sessionId);}catch{}
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
    session=await binding.acquire({targets:true,keepAlive:30000});
    const targets=await binding.devtools.listTargets(session.sessionId);
    const target=targets.find(t=>t.type==='page')||await binding.devtools.newTarget(session.sessionId,'about:blank');
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
    const navigation=await command('Page.navigate',{url:origin+'/v1/models'});
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
      close,
      async fetch(target,init){
        if(target!==url||init?.method!=='POST'||typeof init.body!=='string'||issued&&(!allowOrdinary||JSON.parse(init.body).stream!==undefined))throw Error('BROWSER_REQUEST_ALREADY_CLAIMED');
        if(init.signal?.aborted)throw Error('BROWSER_REQUEST_ABORTED');
        issued=true;allowOrdinary=false; // A lost reply never opens the replay gate.
        const headers=new Headers(init.headers);
        const payload={url,headers:{Authorization:headers.get('Authorization'),'Content-Type':'application/json'},body:init.body,timeoutMs,maxBytes:MAX_RESPONSE};
        const expression='('+browserRequest.toString()+')('+JSON.stringify(payload)+')';
        const abort=()=>{void close();};init.signal?.addEventListener('abort',abort,{once:true});
        try{
          const reply=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},timeoutMs+1000);
          const result=reply.result?.value;
          if(reply.exceptionDetails||!result||!Number.isInteger(result.status)||typeof result.text!=='string')throw Error('BROWSER_RESPONSE_UNCONFIRMED');
          allowOrdinary=JSON.parse(init.body).stream===true&&explicitlyRejectsImageStreaming({...result,ok:result.status>=200&&result.status<300});
          return new Response(result.text,{status:result.status,headers:result.headers});
        }finally{init.signal?.removeEventListener('abort',abort);}
      }
    };
  }catch(error){await close();throw error;}
}

// This function is serialized into the remote Chrome target. It performs one
// same-origin POST, refuses redirects, and bounds the response before returning.
async function browserRequest({url,headers,body,timeoutMs,maxBytes}){
  const response=await fetch(url,{method:'POST',headers,body,credentials:'omit',redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
  const reader=response.body.getReader(),decoder=new TextDecoder();let text='',size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes)throw Error('IMAGE_RESPONSE_TOO_LARGE');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}
  catch(error){await reader.cancel().catch(()=>{});throw error;}
  finally{reader.releaseLock();}
  return {status:response.status,headers:[...response.headers],text};
}
