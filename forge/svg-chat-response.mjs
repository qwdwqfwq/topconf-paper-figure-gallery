// Step-three SVG response validation. No bitmap or export dependencies.
export function svgChatResponse(data, {parseXML, chinese=false}={}) {
  const fail=(code,en,zh,detail='')=>{const error=new Error((chinese?zh:en)+(detail?' ('+detail+')':''));error.code=code;throw error;};
  if(data?.error){
    const e=data.error, status=e.code??e.type??'upstream_error';
    const detail=[status,e.attempts?'attempts='+e.attempts:'',e.request_id?'request_id='+e.request_id:''].filter(Boolean).join(', ');
    fail('upstream_error','Model service failed: '+(e.message||'Unknown error'),'模型服务返回错误：'+(e.message||'未知错误'),detail);
  }
  const choice=data?.choices?.[0];
  if(choice?.finish_reason&&choice.finish_reason!=='stop')
    fail('unfinished','Model output did not finish normally; please retry.','模型输出未正常完成，请重试。',choice.finish_reason);
  // Some compatible JSON providers omit finish_reason; structural validation
  // below still applies. An explicit null from a stream aggregate is incomplete.
  if(choice&&Object.hasOwn(choice,'finish_reason')&&choice.finish_reason==null)
    fail('unfinished','Model output is incomplete; please retry.','模型输出中途结束，请重试。');
  const raw=choice?.message?.content;
  if(typeof raw!=='string'||!raw.trim())
    fail('empty','Model returned no SVG content; please retry.','模型未返回 SVG 内容，请重试。');
  let code=raw.match(/<svg\b[\s\S]*?<\/svg\s*>/i)?.[0];
  if(!code)fail('missing_svg','Model returned no complete SVG; please retry.','模型未返回完整 SVG，请重试。');
  // XML forbids double hyphens inside comments. Comments carry no SVG geometry.
  code=code.replace(/<!--[\s\S]*?-->/g,'');
  const doc=parseXML(code);
  if(doc.querySelector('parsererror')||doc.documentElement?.localName!=='svg')
    fail('invalid_svg','Model returned malformed SVG; please retry.','模型返回的 SVG 结构损坏，请重试。');
  return {code,truncated:false,completed:false};
}
