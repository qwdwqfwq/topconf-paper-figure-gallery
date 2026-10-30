// Scoped Step 4 transport. All other providers retain the existing caller.
export const usesReconstructionStream=provider=>provider==='infistar';

export async function fetchReconstructionStream(url,options={},timeoutMs=Infinity,fetchImpl=fetch){
  const controller=new AbortController(),started=performance.now();
  const cancel=()=>controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort',cancel,{once:true});
  if(options.signal?.aborted)cancel();
  const timer=Number.isFinite(timeoutMs)?setTimeout(()=>controller.abort(),timeoutMs):null;
  let reader;
  try{
    // Change only delivery mode, after the original parameter/image preparation.
    const body=JSON.stringify({...JSON.parse(options.body),stream:true});
    const response=await fetchImpl(url,{...options,body,signal:controller.signal});
    const transport={headersMs:performance.now()-started,firstBodyChunkMs:null,responseBytes:0,events:0,stream:true};
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
          if(terminal){pending='';await reader.cancel();break;}
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
    transport.elapsedMs=performance.now()-started;
    return {ok:response.ok,status:response.status,retryAfter:response.headers.get('retry-after'),text,transport};
  }catch(error){
    if(reader)await reader.cancel().catch(()=>{});
    if(options.signal?.aborted)throw new DOMException('Reconstruction stopped','AbortError');
    if(controller.signal.aborted)throw Object.assign(new Error('Vision API timed out after '+Math.round(timeoutMs/1000)+' seconds'),{visionTimeout:true});
    throw error;
  }finally{reader?.releaseLock();clearTimeout(timer);options.signal?.removeEventListener('abort',cancel);}
}
