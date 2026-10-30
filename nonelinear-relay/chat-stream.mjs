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
export function waitingChat(pending, headers, heartbeatMs=10000) {
  const encoder=new TextEncoder();let timer, reader, cancelled=false;
  const stream=new ReadableStream({
    async start(controller) {
      const emit=value=>{if(!cancelled)controller.enqueue(encoder.encode(value));};
      emit(' ');timer=setInterval(()=>emit(' '),heartbeatMs);
      try {
        const upstream=await pending;
        if(cancelled){await upstream.body?.cancel();return;}
        if(!upstream.ok) {
          // Status is already sent; retain the upstream status in a JSON error.
          await upstream.body?.cancel();
          emit(JSON.stringify({error:{message:`NoneLinear upstream HTTP ${upstream.status}`,type:'upstream_http_error',code:upstream.status}}));
          return;
        }
        reader=bufferedChat(upstream,headers,heartbeatMs).body.getReader();
        for(;;){const {done,value}=await reader.read();if(done)break;if(!cancelled)controller.enqueue(value);}
      }catch {
        emit(JSON.stringify({error:{message:'NoneLinear upstream connection failed',type:'upstream_connection_error'}}));
      }finally{clearInterval(timer);reader?.releaseLock();if(!cancelled)controller.close();}
    },
    cancel(reason){cancelled=true;clearInterval(timer);return reader?.cancel(reason);}
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
          if(chunk.error)throw new Error('NoneLinear stream returned an error');
          for(const field of ['id','created','model','system_fingerprint','usage'])if(chunk[field]!=null)result[field]=chunk[field];
          for(const item of chunk.choices||[]){
            const index=item.index??0;
            if(!choices.has(index))choices.set(index,{index,message:{role:'assistant',content:''},finish_reason:null});
            const choice=choices.get(index), delta=item.delta||{};
            for(const [field,value] of Object.entries(delta)){
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
        if(!count||!choices.size||(!terminal&&[...choices.values()].some(c=>!c.finish_reason)))throw new Error('Incomplete NoneLinear stream');
        result.choices=[...choices.values()].sort((a,b)=>a.index-b.index);
        emit(JSON.stringify(result));
      }catch(error){
        const reason=['Malformed SSE event','NoneLinear stream returned an error','Incomplete NoneLinear stream'].includes(error.message)?error.message:'Upstream body read failed';
        emit(JSON.stringify({error:{message:reason,type:'upstream_stream_error'}}));
      }finally{
        clearInterval(timer);if(!cancelled)controller.close();reader.releaseLock();
      }
    },
    cancel(reason){cancelled=true;clearInterval(timer);return reader.cancel(reason);}
  });
  const outgoing=new Headers(headers);outgoing.set('Content-Type','application/json; charset=utf-8');
  return new Response(stream,{status:response.status,headers:outgoing});
}
