import {fetchBufferedWithTimeout} from './image-api.mjs';

// Retry only explicit transient HTTP failures, preserving images and settings.
// One wall-clock budget includes both responses and backoff.
export async function requestChat(url, options, timeoutMs=Infinity, fetchImpl=fetch){
  const end=Date.now()+timeoutMs;
  let response;
  for(let attempt=0;attempt<2;attempt++){
    const remaining=end-Date.now();
    if(remaining<=0) throw new DOMException('timeout','TimeoutError');
    response=await fetchBufferedWithTimeout(url,options,remaining,fetchImpl);
    if(attempt || ![502,503,504].includes(response.status)) return response;
    const delay=Math.min(1000,Math.max(0,end-Date.now()));
    await new Promise(resolve=>setTimeout(resolve,delay));
  }
  return response;
}

export function pdfResponseJSON(data){
  const content=data?.output_text ??
    (Array.isArray(data?.output)?data.output.flatMap(x=>x.content||[]).map(x=>x.text||'').join(''):undefined) ??
    (Array.isArray(data?.content)?data.content.filter(x=>x.type==='text').map(x=>x.text||'').join(''):undefined) ??
    data?.choices?.[0]?.message?.content;
  const text=Array.isArray(content)?content.map(x=>x.text||'').join(''):String(content||'');
  const finish=data?.choices?.[0]?.finish_reason||data?.stop_reason||data?.status;
  const truncated=['length','max_tokens','incomplete'].includes(finish);
  try{
    if(truncated) throw new Error('输出额度耗尽（包含推理 token）');
    if(!text.trim()) throw new Error('模型正文为空');
    // Never parse reasoning_content as the final paper summary.
    const clean=text.replace(/<think>[\s\S]*?<\/think>/gi,'').replace(/```(?:json)?/gi,'').trim();
    const first=clean.indexOf('{'),last=clean.lastIndexOf('}');
    if(first<0||last<first) throw new Error('模型未返回 JSON');
    const result=JSON.parse(clean.slice(first,last+1));
    if(!Array.isArray(result.selectedSections)||!result.selectedSections.some(x=>typeof x?.summary==='string'&&x.summary.trim()))
      throw new Error('JSON 缺少相关章节摘要 selectedSections');
    return result;
  }catch(e){
    throw Object.assign(new Error(`PDF 解析：${e.message}；finish_reason=${finish||'unknown'}，正文 ${text.length} 字符`),
      {pdfFormatFailure:true,truncated});
  }
}

export function pdfRepairBody(body){
  const next=structuredClone(body);
  const field='max_completion_tokens' in next?'max_completion_tokens':'max_tokens';
  next[field]=Math.min(24000,Math.max(12000,(next[field]||5000)*2));
  next.messages=[...next.messages,{role:'user',content:'上次输出未通过 JSON 验证。请简洁地输出完整 JSON 对象，必须包含 selectedSections 数组，每项含 summary 字符串。不要输出推理过程、Markdown 或解释。'}];
  return next;
}
