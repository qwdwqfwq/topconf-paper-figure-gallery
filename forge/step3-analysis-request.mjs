// Step 3 reference analysis only. Never probe another model after a failed request.
function safeDetail(value, key){
  let text=String(value??'');
  if(key)text=text.split(key).join('[redacted]');
  return text.replace(/Bearer\s+[^\s"'<>]+/gi,'Bearer [redacted]')
    .replace(/\bsk-[\w-]+/g,'[redacted]')
    .replace(/data:[^\s"'<>]+/gi,'[image omitted]')
    .replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,700);
}

export async function requestStep3Analysis({request,model,url,key='',english=false}){
  const words=(zh,en)=>english?en:zh;
  let endpoint='';
  try{const u=new URL(url);endpoint=safeDetail(u.origin+u.pathname,key);}catch{}
  const context=`${safeDetail(model,key)} · ${safeDetail(endpoint,key)}`;
  function failure(kind,detail,cause,metadata={}){
    const message=words('步骤三参考图归纳失败','Step 3 reference analysis failed')+
      ` [${kind}] (${context})：${safeDetail(detail,key)}`;
    return Object.assign(new Error(message,{cause}),{name:'Step3AnalysisError',analysisDiagnostic:{stage:'reference-analysis',kind,model:safeDetail(model,key),endpoint,...metadata}});
  }
  let response,text;
  try{response=await request();}
  catch(cause){
    const kind=cause?.name==='TimeoutError'?'timeout':cause?.name==='AbortError'?'cancelled':'transport';
    const hint=kind==='transport'?words('未取得 HTTP 响应；网络、代理或跨域原因尚无法区分。','No HTTP response; network, proxy and CORS causes cannot yet be distinguished.'):'';
    throw failure(kind,`${cause?.name||'Error'}: ${cause?.message||cause} ${hint}`,cause);
  }
  try{text=await response.text();}
  catch(cause){throw failure('response-read',cause?.message||cause,cause,{httpStatus:response.status});}
  let data;try{data=JSON.parse(text);}catch{}
  const upstream=data?.error;
  const requestId=safeDetail(upstream?.request_id||data?.request_id||response.headers?.get('x-request-id')||'',key);
  const metadata={httpStatus:response.status,...(requestId?{requestId}:{})};
  if(!response.ok||upstream){
    const code=typeof upstream==='object'?upstream?.code:undefined;
    const type=typeof upstream==='object'?upstream?.type:undefined;
    const detail=typeof upstream==='string'?upstream:upstream?.message;
    const tags=[`HTTP ${response.status}`,code!=null?`upstream=${safeDetail(code,key)}`:'',type?safeDetail(type,key):'',requestId?`request_id=${requestId}`:''].filter(Boolean).join(', ');
    throw failure('upstream',`${tags}; ${detail||text||response.statusText}`,undefined,{...metadata,...(code!=null?{upstreamCode:safeDetail(code,key)}:{}),...(type?{upstreamType:safeDetail(type,key)}:{})});
  }
  if(!data||typeof data!=='object'||Array.isArray(data))throw failure('invalid-response',words('服务未返回有效 JSON。','The service did not return valid JSON.')+' '+text,undefined,metadata);
  const content=data.choices?.[0]?.message?.content??(Array.isArray(data.content)?data.content.filter(x=>x.type==='text').map(x=>x.text||'').join(''):undefined);
  if(data.choices?.[0]?.finish_reason!=='length'&&(typeof content!=='string'||!content.trim()))throw failure('empty-response',words('服务返回成功状态，但归纳正文为空。','The service returned success but no analysis text.'),undefined,metadata);
  return data;
}
