// Scoped Step 4 transport. All other providers retain the existing caller.
export const usesReconstructionStream=provider=>provider==='infistar'||provider==='nonelinear';

export async function fetchReconstructionStream(url,options={},timeoutMs=Infinity,fetchImpl=fetch){
  const controller=new AbortController(),started=performance.now();
  const cancel=()=>controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort',cancel,{once:true});
  if(options.signal?.aborted)cancel();
  const timer=Number.isFinite(timeoutMs)?setTimeout(()=>controller.abort(),timeoutMs):null;
  let reader;
  const credential=new Headers(options.headers).get('authorization')?.replace(/^Bearer\s+/i,'')||'\0';
  const safe=value=>String(value||'').split(credential).join('[redacted]').replace(/Bearer\s+\S+|sk-[A-Za-z0-9_-]+/gi,'[redacted]').replace(/[\x00-\x1f\x7f]/g,'').slice(0,300);
  const transport={stage:'waiting_response',headersMs:null,firstBodyChunkMs:null,responseBytes:0,events:0,stream:true};
  try{
    // Change only delivery mode, after the original parameter/image preparation.
    const body=JSON.stringify({...JSON.parse(options.body),stream:true});
    const response=await fetchImpl(url,{...options,body,signal:controller.signal});
    Object.assign(transport,{stage:'reading_response',headersMs:performance.now()-started,status:response.status,requestId:safe(response.headers.get('x-request-id')||response.headers.get('request-id')||response.headers.get('x-oneapi-request-id'))});
    const sse=response.ok&&/text\/event-stream/i.test(response.headers.get('content-type')||'');
    let pending='',text='',terminal=false;
    const result={object:'chat.completion',choices:[]},choices=new Map();
    function event(block){
      const data=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).replace(/^ /,'')).join('\n');
      if(!data.trim())return;
      if(data.trim()==='[DONE]'){terminal=true;return;}
      let chunk;
      try{chunk=JSON.parse(data);}catch{throw new Error('模型流式响应格式错误，未将不完整内容交给重建流程');}
      if(chunk.error)throw new Error('模型流式响应报错：'+String(chunk.error.message||chunk.error.type||'unknown error'));
      transport.events++;
      for(const field of ['id','created','model','system_fingerprint','usage'])if(chunk[field]!=null)result[field]=chunk[field];
      for(const item of chunk.choices||[]){
        const index=item.index??0;
        if(!choices.has(index))choices.set(index,{index,message:{role:'assistant',content:''},finish_reason:null});
        const choice=choices.get(index),delta=item.delta||item.message||{};
        for(const field of ['content','reasoning_content','refusal'])if(typeof delta[field]==='string')choice.message[field]=(choice.message[field]||'')+delta[field];
        if(delta.role)choice.message.role=delta.role;
        if(item.finish_reason!=null)choice.finish_reason=item.finish_reason;
      }
      // A finish reason is the per-choice terminal event. Some gateways keep
      // the socket open or omit DONE after it; neither invalidates that result.
      if(choices.size&&[...choices.values()].every(choice=>choice.finish_reason))terminal=true;
    }
    reader=response.body?.getReader();
    const decoder=new TextDecoder();
    if(reader){
      for(;;){
        const {done,value}=await reader.read();
        if(value){
          if(transport.firstBodyChunkMs===null)transport.firstBodyChunkMs=performance.now()-started;
          transport.responseBytes+=value.byteLength;
        }
        const decoded=done?decoder.decode():decoder.decode(value,{stream:true});
        if(sse){
          pending+=decoded;
          // Normalize only complete CRLF pairs; a trailing CR may span chunks.
          pending=pending.replace(/\r\n/g,'\n');
          let end;
          while(!terminal&&(end=pending.indexOf('\n\n'))!==-1){event(pending.slice(0,end));pending=pending.slice(end+2);}
          if(terminal){pending='';void reader.cancel().catch(()=>{});break;}
        }else text+=decoded;
        if(done)break;
      }
    }else text=await response.text();
    if(sse){
      if(pending.trim())event(pending);
      if(!choices.size||[...choices.values()].some(choice=>!choice.finish_reason))
        throw new Error('模型流式响应提前中断，未将不完整内容交给重建流程');
      result.choices=[...choices.values()].sort((a,b)=>a.index-b.index);
      text=JSON.stringify(result);
    }
    transport.stage='response_received';
    transport.elapsedMs=performance.now()-started;
    return {ok:response.ok,status:response.status,retryAfter:response.headers.get('retry-after'),text,transport};
  }catch(error){
    if(reader)void reader.cancel().catch(()=>{});
    const failure=options.signal?.aborted?new DOMException('Reconstruction stopped','AbortError'):controller.signal.aborted?Object.assign(new Error('Vision API timed out after '+Math.round(timeoutMs/1000)+' seconds'),{visionTimeout:true}):error;
    failure.reconstructionTransport={...transport,elapsedMs:performance.now()-started};
    if(failure.name!=='AbortError')failure.message=safe(failure.message)+(transport.requestId?' [request-id: '+transport.requestId+']':'');
    throw failure;
  }finally{reader?.releaseLock();clearTimeout(timer);options.signal?.removeEventListener('abort',cancel);}
}
