// NoneLinear transport only: retain request parameters, consume upstream SSE,
// and expose ordinary JSON to existing gallery callers. JSON whitespace keeps
// long-running responses active without changing the frontend API contract.
export function prepareChat(body) {
  const data = JSON.parse(body);
  if (data.stream === true || !data.messages?.length) return {body, aggregate:false};
  return {body:JSON.stringify({...data,stream:true}),aggregate:true};
}

// Send headers before the upstream has produced its first token. Otherwise a
// slow model can exhaust the edge idle timeout before bufferedChat even starts.
export function waitingChat(source, headers, heartbeatMs=10000) {
  const encoder=new TextEncoder(), abort=new AbortController();
  let timer, reader, cancelled=false;
  const stream=new ReadableStream({
    async start(controller) {
      const emit=value=>{if(!cancelled)controller.enqueue(encoder.encode(value));};
      emit(' ');timer=setInterval(()=>emit(' '),heartbeatMs);
      try {
        // Only a factory is replayable. Retry the exact request at most twice,
        // and only when upstream falsely reports a completed but unusable stream.
        const limit=typeof source==='function'?3:1;
        for(let attempt=1;attempt<=limit&&!cancelled;attempt++) {
          const upstream=await (typeof source==='function'?source(abort.signal):source);
          if(cancelled){await upstream.body?.cancel();return;}
          if(!upstream.ok) {
            await upstream.body?.cancel();
            emit(JSON.stringify({error:{message:`NoneLinear upstream HTTP ${upstream.status}`,type:'upstream_http_error',code:upstream.status,attempts:attempt}}));
            return;
          }
          reader=bufferedChat(upstream,headers,heartbeatMs).body.getReader();
          const decoder=new TextDecoder();let text='';
          try {
            for(;;){const {done,value}=await reader.read();if(done)break;text+=decoder.decode(value,{stream:true});}
            text+=decoder.decode();
          } finally {reader.releaseLock();reader=null;}
          if(cancelled)return;
          let result;try{result=JSON.parse(text);}catch{result={error:{message:'Invalid NoneLinear completion JSON',type:'upstream_stream_error',code:'invalid_json'}};}
          const retryable=['incomplete_stream','empty_completion','upstream_timeout'].includes(result.error?.code);
          if(retryable&&attempt<limit)continue;
          if(result.error){
            result.error.attempts=attempt;
            const requestId=upstream.headers.get('x-request-id');
            if(requestId)result.error.request_id=requestId;
          }else result.relay={attempts:attempt};
          emit(JSON.stringify(result));return;
        }
      }catch {
        emit(JSON.stringify({error:{message:'NoneLinear upstream connection failed',type:'upstream_connection_error'}}));
      }finally{clearInterval(timer);reader?.releaseLock();if(!cancelled)controller.close();}
    },
    cancel(reason){cancelled=true;clearInterval(timer);abort.abort(reason);return reader?.cancel(reason);}
  });
  const outgoing=new Headers(headers);outgoing.set('Content-Type','application/json; charset=utf-8');
  return new Response(stream,{headers:outgoing});
}

export function bufferedChat(response, headers, heartbeatMs=10000) {
  if (!response.ok || !response.headers.get('Content-Type')?.includes('text/event-stream'))
    return new Response(response.body,{status:response.status,headers});
  const reader=response.body.getReader(), encoder=new TextEncoder();
  let timer, cancelled=false;
  const stream=new ReadableStream({
    async start(controller) {
      const emit=value=>{if(!cancelled)controller.enqueue(encoder.encode(value));};
      emit(' ');
      timer=setInterval(()=>emit(' '),heartbeatMs);
      try {
        const decoder=new TextDecoder(); let pending='', terminal=false, count=0;
        const result={object:'chat.completion',choices:[]}, choices=new Map();
        function event(block) {
          const raw=block.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
          if(!raw)return;
          if(raw==='[DONE]'){terminal=true;return;}
          let chunk;try{chunk=JSON.parse(raw);}catch{throw new Error('Malformed SSE event');}count++;
          if(chunk.type==='error'&&/timed?\s*out|timeout/i.test(chunk.message||''))throw new Error('NoneLinear upstream timed out');
          if(chunk.error||chunk.type==='error')throw new Error('NoneLinear stream returned an error');
          for(const field of ['id','created','model','system_fingerprint','usage'])if(chunk[field]!=null)result[field]=chunk[field];
          for(const item of chunk.choices||[]){
            const index=item.index??0;
            if(!choices.has(index))choices.set(index,{index,message:{role:'assistant',content:''},finish_reason:null});
            const choice=choices.get(index), delta=item.delta||{};
            for(const [field,value] of Object.entries(delta)){
              // Compatible providers emit null for inactive optional delta fields.
              if(value == null)continue;
              if(field==='tool_calls'){
                choice.message.tool_calls??=[];
                for(const tool of value){
                  const i=tool.index??0, target=choice.message.tool_calls[i]??={};
                  for(const [k,v]of Object.entries(tool))if(k!=='index'){
                    if(k==='function'){target.function??={};for(const [fk,fv]of Object.entries(v))target.function[fk]=(target.function[fk]||'')+fv;}
                    else target[k]=v;
                  }
                }
              }else if(field==='function_call'){
                choice.message.function_call??={};for(const [k,v]of Object.entries(value))choice.message.function_call[k]=(choice.message.function_call[k]||'')+v;
              }else if(typeof value==='string'&&field!=='role')choice.message[field]=(choice.message[field]||'')+value;
              else if(value!=null)choice.message[field]=value;
            }
            if(item.finish_reason!=null)choice.finish_reason=item.finish_reason;
          }
        }
        for(;;){
          const {done,value}=await reader.read();
          pending+=done?decoder.decode():decoder.decode(value,{stream:true});
          pending=pending.replace(/\r\n/g,'\n');
          let boundary;while((boundary=pending.indexOf('\n\n'))>=0){event(pending.slice(0,boundary));pending=pending.slice(boundary+2);}
          if(done)break;
        }
        if(pending.trim())event(pending);
        if(!count||!choices.size||[...choices.values()].some(c=>!c.finish_reason))throw new Error('Incomplete NoneLinear stream');
        if([...choices.values()].some(c=>c.finish_reason==='stop'&&!c.message.content?.trim()&&!c.message.tool_calls?.length&&!c.message.function_call&&!c.message.refusal?.trim()))throw new Error('Empty NoneLinear completion');
        result.choices=[...choices.values()].sort((a,b)=>a.index-b.index);
        emit(JSON.stringify(result));
      }catch(error){
        const reason=['Malformed SSE event','NoneLinear stream returned an error','Incomplete NoneLinear stream','Empty NoneLinear completion','NoneLinear upstream timed out'].includes(error.message)?error.message:'Upstream body read failed';
        emit(JSON.stringify({error:{message:reason,type:'upstream_stream_error',code:reason==='NoneLinear upstream timed out'?'upstream_timeout':reason==='Incomplete NoneLinear stream'?'incomplete_stream':reason==='Empty NoneLinear completion'?'empty_completion':'invalid_stream'}}));
      }finally{
        clearInterval(timer);if(!cancelled)controller.close();reader.releaseLock();
      }
    },
    cancel(reason){cancelled=true;clearInterval(timer);return reader.cancel(reason);}
  });
  const outgoing=new Headers(headers);outgoing.set('Content-Type','application/json; charset=utf-8');
  return new Response(stream,{status:response.status,headers:outgoing});
}
