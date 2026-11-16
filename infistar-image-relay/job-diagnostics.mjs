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
export function responseDiagnostics(response,key=''){
  const diagnostic={upstreamStatus:response.status};
  for(const [name,header] of Object.entries({cfRay:'cf-ray',cfErrorOrigin:'cf-error-origin',cfErrorType:'cf-error-type',server:'server',upstreamDate:'date',requestId:'x-request-id'})){
    const value=safeDiagnosticText(response.headers.get(header),key);if(value)diagnostic[name]=value;
  }
  if(!diagnostic.requestId){const value=safeDiagnosticText(response.headers.get('request-id')||response.headers.get('x-oneapi-request-id'),key);if(value)diagnostic.requestId=value;}
  // An upstream HTTP status alone cannot identify which Cloudflare hop made it.
  if(response.status===524)diagnostic.errorSource=diagnostic.cfErrorOrigin?'cloudflare:'+diagnostic.cfErrorOrigin:'unattributed-upstream';
  const timing=response.imageTransport;
  for(const name of ['headersMs','firstBodyChunkMs','responseBytes','normalizedResponseChars','elapsedMs'])if(Number.isFinite(timing?.[name])&&timing[name]>=0)diagnostic['remote'+name[0].toUpperCase()+name.slice(1)]=timing[name];
  return diagnostic;
}
export function resultDiagnostics(result,key=''){
  const diagnostic={};
  for(const name of ['headersMs','responseBytes','firstBodyChunkMs','elapsedMs']){
    const value=result?.transport?.[name];if(Number.isFinite(value)&&value>=0)diagnostic[name]=value;
  }
  if(Number.isInteger(result?.status))diagnostic.upstreamStatus=result.status;
  for(const [name,value] of Object.entries({
    resultError:result?.resultError||result?.downloadError,
    upstreamMessage:!result?.ok||result?.resultError?providerMessage(result?.text):'',requestId:result?.requestId,
    stage:result?.transport?.stage,errorCode:result?.transport?.errorCode
  })){const safe=safeDiagnosticText(value,key);if(safe)diagnostic[name]=safe;}
  return diagnostic;
}
export function exceptionDiagnostics(error,key=''){
  const diagnostic={};
  for(const name of ['headersMs','responseBytes','firstBodyChunkMs','elapsedMs']){
    const value=error?.imageDiagnostics?.[name];if(Number.isFinite(value)&&value>=0)diagnostic[name]=value;
  }
  for(const [name,value] of Object.entries({
    message:error?.message,errorCode:error?.imageDiagnostics?.errorCode||error?.code,
    stage:error?.imageDiagnostics?.stage,requestId:error?.imageDiagnostics?.requestId
  })){const safe=safeDiagnosticText(value,key);if(safe)diagnostic[name]=safe;}
  const status=error?.imageDiagnostics?.status;
  if(Number.isInteger(status))diagnostic.upstreamStatus=status;
  const transport=error?.transportDiagnostics;
  if(transport){
    for(const name of ['headersMs','firstBodyChunkMs','responseBytes','elapsedMs'])if(Number.isFinite(transport[name])&&transport[name]>=0)diagnostic['remote'+name[0].toUpperCase()+name.slice(1)]=transport[name];
    for(const name of ['stage','errorCode']){const value=safeDiagnosticText(transport[name],key);if(value)diagnostic['remote'+name[0].toUpperCase()+name.slice(1)]=value;}
    if(Number.isInteger(transport.status))diagnostic.upstreamStatus=transport.status;
    if(transport.headers)Object.assign(diagnostic,responseDiagnostics({status:transport.status,headers:new Headers(transport.headers)},key));
  }
  return diagnostic;
}
