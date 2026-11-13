// Only the explicitly authorized Infistar GPT whole-image request uses this transport.
export const usesReconstructionResponses=(provider,model,wholeImage)=>provider==='infistar'&&!!wholeImage&&/^gpt-/i.test(model);

export function reconstructionResponsesBody(body){
  const {messages,max_completion_tokens,max_tokens,reasoning_effort,stream,...rest}=body;
  return {...rest,stream:true,max_output_tokens:max_completion_tokens??max_tokens,
    ...(reasoning_effort?{reasoning:{...rest.reasoning,effort:reasoning_effort}}:{}),
    instructions:messages.filter(m=>m.role==='system').map(m=>m.content).join('\n'),
    input:messages.filter(m=>m.role!=='system').map(m=>({role:m.role,content:
      typeof m.content==='string'?[{type:'input_text',text:m.content}]:m.content.map(p=>{
        if(p.type==='text')return {type:'input_text',text:p.text};
        if(p.type==='image_url')return {type:'input_image',image_url:p.image_url.url,detail:p.image_url.detail};
        throw new Error('Unsupported reconstruction input: '+p.type);
      })}))};
}

function completionEnvelope(response,deltas){
  if(response?.status!=='completed')throw new Error('Responses 重建未完成：'+String(response?.error?.message||response?.incomplete_details?.reason||response?.status||'missing completion'));
  let text='';
  for(const [i,item] of (response.output||[]).entries()){
    if(item.type!=='message')continue;
    if(item.status&&item.status!=='completed')throw new Error('Responses 重建消息未完成');
    for(const [j,part] of (item.content||[]).entries()){
      if(part.type!=='output_text')continue;
      const delta=deltas.get(i+':'+j);
      if(delta!==undefined&&delta!==part.text)throw new Error('Responses 重建流与完成结果不一致');
      text+=part.text;
    }
  }
  if(!text.trim())throw new Error('Responses 重建完成但未返回文本');
  return JSON.stringify({id:response.id,model:response.model,object:'chat.completion',
    usage:response.usage?{...response.usage,prompt_tokens:response.usage.input_tokens,completion_tokens:response.usage.output_tokens}:undefined,
    choices:[{index:0,message:{role:'assistant',content:text},finish_reason:'stop'}]});
}

export async function fetchReconstructionResponses(url,options={},timeoutMs=Infinity,fetchImpl=fetch){
  const controller=new AbortController(),started=performance.now();
  const cancel=()=>controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort',cancel,{once:true});
  if(options.signal?.aborted)cancel();
  const timer=Number.isFinite(timeoutMs)?setTimeout(()=>controller.abort(),timeoutMs):null;
  let reader;
  try{
    const body=JSON.stringify(reconstructionResponsesBody(JSON.parse(options.body)));
    const response=await fetchImpl(url,{...options,body,signal:controller.signal});
    const transport={headersMs:performance.now()-started,firstBodyChunkMs:null,responseBytes:0,events:0,stream:true,protocol:'responses'};
    const sse=response.ok&&/text\/event-stream/i.test(response.headers.get('content-type')||'');
    let pending='',text='',completed=null;
    const deltas=new Map();
    function event(block){
      const data=block.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).replace(/^ /,'')).join('\n');
      if(!data.trim()||data.trim()==='[DONE]')return;
      const item=JSON.parse(data);transport.events++;
      if(item.type==='error'||item.type==='response.failed'||item.type==='response.incomplete')throw new Error('Responses 重建失败：'+String(item.response?.error?.message||item.error?.message||item.message||item.response?.incomplete_details?.reason||item.type));
      if(item.type==='response.output_text.delta'){
        const key=item.output_index+':'+item.content_index;
        deltas.set(key,(deltas.get(key)||'')+item.delta);
      }
      if(item.type==='response.completed')completed=item.response;
    }
    reader=response.body?.getReader();
    const decoder=new TextDecoder();
    if(reader){
      for(;;){
        const {done,value}=await reader.read();
        if(value){transport.firstBodyChunkMs??=performance.now()-started;transport.responseBytes+=value.byteLength;}
        const decoded=done?decoder.decode():decoder.decode(value,{stream:true});
        if(sse){
          pending=(pending+decoded).replace(/\r\n/g,'\n');
          let end;
          while(!completed&&(end=pending.indexOf('\n\n'))!==-1){event(pending.slice(0,end));pending=pending.slice(end+2);}
          if(completed){await reader.cancel();break;}
        }else text+=decoded;
        if(done)break;
      }
    }else text=await response.text();
    if(sse){
      if(!completed&&pending.trim())event(pending);
      if(!completed)throw new Error('Responses 流式响应提前中断，未将不完整内容交给重建流程');
      text=completionEnvelope(completed,deltas);
    }else if(response.ok)text=completionEnvelope(JSON.parse(text),deltas);
    transport.elapsedMs=performance.now()-started;
    return {ok:response.ok,status:response.status,retryAfter:response.headers.get('retry-after'),text,transport};
  }catch(error){
    if(reader)await reader.cancel().catch(()=>{});
    if(options.signal?.aborted)throw new DOMException('Reconstruction stopped','AbortError');
    if(controller.signal.aborted)throw Object.assign(new Error('Vision API timed out after '+Math.round(timeoutMs/1000)+' seconds'),{visionTimeout:true});
    throw error;
  }finally{reader?.releaseLock();clearTimeout(timer);options.signal?.removeEventListener('abort',cancel);}
}
