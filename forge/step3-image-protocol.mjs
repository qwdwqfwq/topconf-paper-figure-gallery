// Private Step 3 adapters; shared Step 4 protocol modules stay unchanged.
import {uploadStep3References} from './step3-reference-upload.mjs';
export function imageJobRoute(url){
  try{
    const u=new URL(url);if(u.protocol!=='https:'||u.port||u.username||u.password||u.hash)return null;
    if(['infistar.cc','www.infistar.cc','infistar.ai','www.infistar.ai'].includes(u.hostname)&&((u.pathname==='/v1/images/generations'&&!u.search)||(/^\/v1beta\/models\/[^/]+:(?:streamGenerateContent|generateContent)$/.test(u.pathname)&&(!u.search||u.search==='?alt=sse'))))return 'infistar';
    if(['api.nonelinear.com.cn','gallery-nonelinear-relay.lixiao-gallery.workers.dev','analysis.topconf-paper-figure-gallery.cn'].includes(u.hostname)&&u.pathname==='/v1/images/generations'&&!u.search)return 'nonelinear';
    if(u.hostname==='api.openai.com'&&/^\/v1\/images\/(generations|edits)$/.test(u.pathname)&&!u.search)return 'oai';
  }catch{}return null;
}
function bytes64(bytes){let result='';for(let i=0;i<bytes.length;i+=16384)result+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(result);}
export async function packImageBody(body){
  if(!(body instanceof FormData))return body;
  const entries=[];for(const [name,value]of body){
    entries.push(typeof value==='string'?{name,value}:{name,file:{name:value.name,type:value.type,b64:bytes64(new Uint8Array(await value.arrayBuffer()))}});
  }return {multipart:entries};
}
export function unpackImageBody(body){
  if(!body?.multipart)return body;
  const form=new FormData();for(const entry of body.multipart){
    if(entry.file)form.append(entry.name,new Blob([Uint8Array.from(atob(entry.file.b64),c=>c.charCodeAt(0))],{type:entry.file.type}),entry.file.name);
    else form.append(entry.name,entry.value);
  }return form;
}
export function prepareStep3ImageBody(body,model,nativeGemini=false){
  if(nativeGemini){
    if(/^gemini-2\.5-flash-image(?:$|-)/i.test(model))delete body.generationConfig?.imageConfig?.imageSize;
    return body;
  }
  if(body instanceof FormData)return body;
  if(/^gpt-image-/i.test(model))delete body.aspect_ratio;
  if(/^imagen-/i.test(model))body.n=1;
  return body;
}
export function protocolFetch(fetchImpl=fetch){
  return async (url,init)=>{
    const route=imageJobRoute(url);let body=init.body;
    if(route==='nonelinear'&&new URL(url).hostname==='api.nonelinear.com.cn'&&!(body instanceof FormData)){
      body=JSON.stringify(await uploadStep3References(JSON.parse(body),init,fetchImpl));
    }
    return fetchImpl(url,{...init,body});
  };
}
export function imageResultItem(data){
  const item=data?.data?.[0]||data?.images?.[0];if(item?.b64_json||item?.url)return item;
  for(const c of data?.candidates||[])for(const p of c.content?.parts||[]){
    const image=p.inlineData||p.inline_data;
    if(!p.thought&&image?.data)return {b64_json:image.data,mimeType:image.mimeType||image.mime_type||'image/png'};
  }return null;
}
