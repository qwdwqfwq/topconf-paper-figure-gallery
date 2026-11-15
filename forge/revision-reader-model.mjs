// Private to Step 3 structure-redraw content reading. No image/export routing.
function strings(value){
  return Array.isArray(value)?value.map(item=>typeof item==='string'?item:item?.type||item?.id||'').map(s=>s.toLowerCase()):null;
}

function candidate(row){
  const id=typeof row==='string'?row:row?.id||row?.model_name;
  if(typeof id!=='string'||id.length>200)return null;
  const match=/^gpt-(\d+)(?:\.(\d+))?(o)?(?=$|-)/i.exec(id);
  if(!match||/(?:^|-)(?:image|audio|realtime|codex|search|transcribe|tts|embedding|instruct|moderation)(?:-|$)/i.test(id))return null;
  const major=Number(match[1]),minor=Number(match[2]||0),omni=Boolean(match[3]);
  // GPT-4.1/4o and subsequent general GPT families accept image inputs.
  // Explicit provider capability/endpoint restrictions take precedence.
  if(major<4||(major===4&&!omni&&minor<1))return null;
  const inputs=strings(row?.input_modalities||row?.supported_input_modalities||row?.modalities?.input||row?.architecture?.input_modalities);
  if(inputs&&!inputs.some(s=>s==='image'||s==='vision'))return null;
  if(row?.vision===false||row?.supports_vision===false||row?.capabilities?.vision===false)return null;
  const endpoints=strings(row?.supported_endpoint_types||row?.supported_endpoints);
  const chat=endpoints?.some(s=>['openai','chat','chat.completions','chat/completions','/chat/completions','/v1/chat/completions'].includes(s));
  if(endpoints&&!chat)return null;
  const suffix=id.slice(match[0].length).replace(/-\d{4}-\d{2}-\d{2}$/,'').replace(/^-\d{4}-\d{2}-\d{2}$/,'').replace(/^-/,'').toLowerCase();
  const flavors=['','sol','astra','chat-latest','latest','terra','luna','mini','nano'];
  const flavor=flavors.indexOf(suffix);
  // Unknown variants need explicit image AND chat support; pro can be Responses-only.
  if(flavor<0&&!(inputs?.some(s=>s==='image'||s==='vision')&&chat))return null;
  const dated=/-\d{4}-\d{2}-\d{2}$/.test(id);
  return {id,version:[major,minor,omni?1:0],flavor:flavor<0?flavors.length:flavor,dated,created:Number(row?.created)||0};
}

export function selectRedrawReaderModel(rows){
  if(!Array.isArray(rows))throw Error('服务商模型列表格式无效；未发起内容提取或生图。');
  const choices=rows.map(candidate).filter(Boolean).sort((a,b)=>{
    for(let i=0;i<a.version.length;i++){if(a.version[i]!==b.version[i])return b.version[i]-a.version[i];}
    return a.flavor-b.flavor||Number(a.dated)-Number(b.dated)||b.created-a.created||a.id.localeCompare(b.id);
  });
  if(!choices.length)throw Error('当前服务商未列出可用于内容提取的 GPT 视觉模型；未发起内容提取或生图。');
  return choices[0].id;
}

export async function discoverRedrawReaderModel({base,key,fetchModels=globalThis.fetch}){
  if(!key)throw Error('请先填写该服务商的 API Key。');
  const url=new URL(base.replace(/\/+$/,'')+'/models');
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('服务商模型查询地址无效。');
  if(url.username||url.password||url.search||url.hash)throw Error('服务商模型查询地址无效。');
  const rows=[],cursors=new Set();
  try{
    for(let page=0;page<10;page++){
      const response=await fetchModels(url.href,{method:'GET',headers:{Authorization:'Bearer '+key},credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error('查询服务商可用模型失败（HTTP '+response.status+'）；未发起内容提取或生图。');
      const data=await response.json(),items=Array.isArray(data)?data:data?.data||data?.models;
      if(!Array.isArray(items))throw Error('服务商模型列表格式无效；未发起内容提取或生图。');
      rows.push(...items);
      if(!data.has_more){
        if(Number.isFinite(data.total)&&data.total>rows.length)throw Error('服务商模型列表不完整；未发起内容提取或生图。');
        return selectRedrawReaderModel(rows);
      }
      const cursor=data.last_id||items.at(-1)?.id;
      if(typeof cursor!=='string'||!cursor||cursors.has(cursor))break;
      cursors.add(cursor);url.searchParams.set('after',cursor);
    }
    throw Error('服务商模型列表不完整；未发起内容提取或生图。');
  }catch(error){
    const message=String(error.message).replaceAll(key,'[redacted]').replace(/sk-[A-Za-z0-9_-]+/gi,'[redacted]');
    throw Error('结构重绘模型自动选择失败：'+message);
  }
}
