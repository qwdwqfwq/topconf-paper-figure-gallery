// Read-only Step 3 diagnostics. Never include request bodies, image data or keys.
export function safeDiagnosticText(value,key=''){
  if(typeof value!=='string'&&typeof value!=='number')return '';
  let text=String(value);
  if(key)text=text.split(key).join('[redacted]');
  return text.replace(/Bearer\s+[^"\s<>]+/gi,'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]+/g,'[redacted]')
    .replace(/https?:\/\/[^\s"<>]+/gi,url=>{try{const u=new URL(url);return u.origin+u.pathname;}catch{return '[url]';}})
    .replace(/[\u0000-\u001f]+/g,' ').trim().slice(0,1000);
}
function providerMessage(text){
  if(typeof text!=='string')return '';
  try{
    const data=JSON.parse(text);
    return [data?.error?.message,data?.error?.msg,typeof data?.error==='string'?data.error:'',data?.message,data?.msg,data?.detail,
      data?.promptFeedback?.blockReason,data?.candidates?.[0]?.finishMessage,data?.candidates?.[0]?.finishReason]
      .find(x=>typeof x==='string'&&x.trim())||'';
  }catch{
    // Prefer the gateway's title over an entire HTML challenge/error page.
    return /<title[^>]*>([^<]+)<\/title>/i.exec(text)?.[1]||(!/<(?:html|script|body)\b/i.test(text)?text:'');
  }
}
export function resultDiagnostics(result,key=''){
  const diagnostic={};
  if(Number.isInteger(result?.status))diagnostic.upstreamStatus=result.status;
  for(const [name,value] of Object.entries({
    resultError:result?.resultError||result?.downloadError,
    upstreamMessage:providerMessage(result?.text),requestId:result?.requestId,
    stage:result?.transport?.stage,errorCode:result?.transport?.errorCode
  })){const safe=safeDiagnosticText(value,key);if(safe)diagnostic[name]=safe;}
  return diagnostic;
}
export function exceptionDiagnostics(error,key=''){
  const diagnostic={};
  for(const [name,value] of Object.entries({
    message:error?.message,errorCode:error?.imageDiagnostics?.errorCode||error?.code,
    stage:error?.imageDiagnostics?.stage,requestId:error?.imageDiagnostics?.requestId
  })){const safe=safeDiagnosticText(value,key);if(safe)diagnostic[name]=safe;}
  const status=error?.imageDiagnostics?.status;
  if(Number.isInteger(status))diagnostic.upstreamStatus=status;
  return diagnostic;
}
