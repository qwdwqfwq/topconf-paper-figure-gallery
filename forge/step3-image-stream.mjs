// Step 3 only. Do not use this transport in the frozen Step 4 reconstruction.
import {imageRequestDiagnostics} from './image-api.mjs';

export function step3StreamingRequest(url,body){
  const target=new URL(url);
  if(/:(?:streamGenerateContent|generateContent)$/.test(target.pathname)){
    target.pathname=target.pathname.replace(/:generateContent$/,':streamGenerateContent');
    target.searchParams.set('alt','sse');
    return {url:target.href,body,nativeGemini:true};
  }
  if(body instanceof FormData){
    const form=new FormData();
    for(const [name,value] of body) form.append(name,value);
    form.set('stream','true');
    return {url:target.href,body:form,nativeGemini:false};
  }
  return {url:target.href,body:{...body,stream:true},nativeGemini:false};
}

function streamFailure(code){
  const messages={
    IMAGE_STREAM_INVALID_EVENT:'Invalid image stream event. No complete image was accepted.',
    IMAGE_STREAM_UPSTREAM_ERROR:'The provider reported an error inside the image stream. No complete image was accepted.',
    IMAGE_STREAM_INCOMPLETE:'The image stream ended without a complete final image. The request was not automatically repeated.',
  };
  return Object.assign(new Error(messages[code]),{code});
}

// Parse lines across arbitrary byte/chunk boundaries, including CRLF, UTF-8,
// multiline data, comments and the last event without a trailing blank line.
function eventDecoder(onEvent){
  let line='',data=[],event='',afterCR=false;
  const dispatch=()=>{
    if(data.length) onEvent(data.join('\n'),event);
    data=[];event='';
  };
  const consume=()=>{
    if(!line) dispatch();
    else if(!line.startsWith(':')){
      const colon=line.indexOf(':');
      const field=colon<0?line:line.slice(0,colon);
      let value=colon<0?'':line.slice(colon+1);
      if(value.startsWith(' ')) value=value.slice(1);
      if(field==='data') data.push(value);
      else if(field==='event') event=value;
    }
    line='';
  };
  return {
    push(text){
      let start=0;
      if(afterCR && text.startsWith('\n')) start=1;
      afterCR=false;
      for(let i=start;i<text.length;i++){
        if(text[i]!=='\r' && text[i]!=='\n') continue;
        line+=text.slice(start,i);consume();
        if(text[i]==='\r'){
          if(text[i+1]==='\n') i++;
          else if(i===text.length-1) afterCR=true;
        }
        start=i+1;
      }
      line+=text.slice(start);
    },
    finish(){if(line) consume();dispatch();}
  };
}

function imageEvents(nativeGemini){
  let image=null,completed=false,events=0,latest={};
  const candidates=new Map();
  return {
    accept(raw,event){
      if(raw.trim()==='[DONE]') return;
      let value;
      try{value=JSON.parse(raw);}catch{throw streamFailure('IMAGE_STREAM_INVALID_EVENT');}
      if(!value || typeof value!=='object') throw streamFailure('IMAGE_STREAM_INVALID_EVENT');
      events++;
      const type=value.type||event;
      if(value.error || /(?:^|[._])(?:error|failed)$/.test(type||''))
        throw streamFailure('IMAGE_STREAM_UPSTREAM_ERROR');
      if(nativeGemini){
        latest={...latest,...value};
        if(value.promptFeedback?.blockReason) throw streamFailure('IMAGE_STREAM_UPSTREAM_ERROR');
        for(const [position,candidate] of (value.candidates||[]).entries()){
          const index=candidate.index??position,previous=candidates.get(index);
          const parts=[...(previous?.content?.parts||[]),...(candidate.content?.parts||[])].filter(part=>!part?.thought);
          candidates.set(index,{...previous,...candidate,content:{...candidate.content,parts}});
          if(candidate.finishReason && candidate.finishReason!=='STOP')
            throw streamFailure('IMAGE_STREAM_UPSTREAM_ERROR');
        }
        return;
      }
      // Preview pixels are never passed off as the final generated image.
      if(/(?:^|[._])partial_image$/.test(type||'')) return;
      if(type==='image_generation.completed' || type==='image_edit.completed'){
        image=value.b64_json?{b64_json:value.b64_json,
          mimeType:'image/'+(value.output_format==='jpg'?'jpeg':value.output_format||'png')}:null;
        completed=true;
      }else if(!type || type==='message'){
        const item=value.data?.[0]||value.images?.[0];
        if(item?.b64_json || item?.url){image=item;completed=true;}
      }
    },
    finish(){
      if(nativeGemini){
        const all=[...candidates.values()];
        const finished=all.some(candidate=>candidate.finishReason==='STOP');
        if(!finished) throw streamFailure('IMAGE_STREAM_INCOMPLETE');
        // Existing Gemini validation provides the detailed no-image diagnosis.
        return {text:JSON.stringify({...latest,candidates:all}),events};
      }
      if(!completed || !image) throw streamFailure('IMAGE_STREAM_INCOMPLETE');
      return {text:JSON.stringify({data:[image]}),events};
    }
  };
}

function safeId(value,key){
  return String(value||'').split(key||'\0').join('[redacted]')
    .replace(/Bearer\s+\S+|sk-[A-Za-z0-9_-]+/gi,'[redacted]')
    .replace(/[\x00-\x1f\x7f]/g,'').slice(0,160);
}

const transportNames=new Set(['Error','TypeError','AbortError','TimeoutError']);
const transportCodes=new Set(['UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT','ECONNRESET','ETIMEDOUT','ENOTFOUND','ECONNREFUSED']);

// One request and one body reader for every Step 3 image provider. Providers
// that ignore stream:true may still return JSON; receive that through the same
// reader without resubmitting the generation or altering image parameters.
export async function requestStep3ImageStream({url,body,key,usedReferences=false,
  timeoutMs=Infinity,fetchImpl=fetch,onProgress=()=>{}}){
  const request=step3StreamingRequest(url,body),controller=new AbortController();
  const started=performance.now();
  let progress={stage:'waiting_response'},timer;
  const snapshot=()=>({...progress,elapsedMs:Math.round(performance.now()-started)});
  const timeout=Object.assign(new Error('Image generation deadline exceeded'),{name:'TimeoutError'});
  const deadline=new Promise((_,reject)=>{
    if(Number.isFinite(timeoutMs)) timer=setTimeout(()=>{controller.abort();reject(timeout);},timeoutMs);
  });
  try{
    return await Promise.race([deadline,(async()=>{
      const multipart=request.body instanceof FormData;
      const response=await fetchImpl(request.url,{method:'POST',
        headers:{...(multipart?{}:{'Content-Type':'application/json'}),Authorization:'Bearer '+key},
        body:multipart?request.body:JSON.stringify(request.body),signal:controller.signal});
      const requestId=safeId(response.headers.get('x-request-id')||response.headers.get('request-id'),key);
      progress={stage:'reading_response',headersMs:Math.round(performance.now()-started),status:response.status,requestId,responseBytes:0};
      let mode=response.ok && /text\/event-stream/i.test(response.headers.get('content-type')||'')?'sse':null;
      const collector=imageEvents(request.nativeGemini),parser=eventDecoder((data,event)=>collector.accept(data,event));
      let pending='',text='';
      const consume=chunk=>{
        if(!response.ok){text+=chunk;return;}
        if(mode==='sse'){parser.push(chunk);return;}
        if(mode==='json'){text+=chunk;return;}
        pending+=chunk;
        const prefix=pending.replace(/^\uFEFF/,'').trimStart();
        if(!prefix) return;
        if(/^(?:data:|event:|id:|retry:|:)/.test(prefix)){
          mode='sse';parser.push(prefix);pending='';
        }else if(/^[{[]/.test(prefix)){
          mode='json';text=pending;pending='';
        }else if(prefix.length>=6){
          mode='json';text=pending;pending='';
        }
      };
      const reader=response.body?.getReader(),decoder=new TextDecoder();
      if(reader){
        try{
          for(;;){
            const {done,value}=await reader.read();if(done) break;
            progress.responseBytes+=value.byteLength;
            if(progress.firstBodyChunkMs===undefined) progress.firstBodyChunkMs=Math.round(performance.now()-started);
            consume(decoder.decode(value,{stream:true}));onProgress(snapshot());
          }
          consume(decoder.decode());
        }catch(error){
          await reader.cancel().catch(()=>{});throw error;
        }finally{reader.releaseLock();}
      }
      let events=0;
      if(mode==='sse'){
        parser.finish();({text,events}=collector.finish());
      }else text+=pending;
      progress={...progress,stage:'response_received'};
      return {ok:response.ok,status:response.status,text,requestId,transport:snapshot(),
        usedReferences,referenceFallback:false,streaming:mode==='sse',events,
        request:imageRequestDiagnostics(request.url,request.body)};
    })()]);
  }catch(error){
    const failure=controller.signal.aborted?timeout:(error instanceof Error?error:new Error('Image request failed'));
    const code=failure.cause?.code||failure.code;
    failure.imageDiagnostics={...snapshot(),errorName:transportNames.has(failure.name)?failure.name:'Error',
      ...(transportCodes.has(code)?{errorCode:code}:{})};
    throw failure;
  }finally{clearTimeout(timer);}
}
