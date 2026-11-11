// Independent SVG revision path; does not reconstruct or export bitmaps.
export function svgVersion(input,parent){
  const match=String(input).match(/<svg\b[\s\S]*<\/svg\s*>/i);
  if(!match)throw new Error('模型没有返回完整 SVG，请重试。');
  const doc=new DOMParser().parseFromString(match[0],'image/svg+xml'),root=doc.documentElement;
  if(doc.querySelector('parsererror')||root.localName!=='svg')throw new Error('返回的 SVG 格式无效，请重试。');
  const unsafeURL=value=>/@import/i.test(value)||[...value.matchAll(/url\(([^)]*)\)/gi)].some(m=>!/^['"]?#[\w:.-]+['"]?$/.test(m[1].trim()));
  for(const el of doc.querySelectorAll('*')){
    if(['script','foreignObject','iframe','object','embed','image','animate','set','animateTransform'].includes(el.localName))throw new Error('SVG 含不支持的外部或动态内容，请重试。');
    for(const attr of el.attributes){
      if(/^on/i.test(attr.name)||(/href$/i.test(attr.name)&&!/^#[\w:.-]+$/.test(attr.value))||unsafeURL(attr.value))throw new Error('SVG 含不安全引用，请重试。');
    }
    if(el.localName==='style'&&unsafeURL(el.textContent))throw new Error('SVG 含外部样式，请重试。');
  }
  root.setAttribute('xmlns','http://www.w3.org/2000/svg');
  if(parent){
    const original=new DOMParser().parseFromString(parent.svg,'image/svg+xml').documentElement;
    for(const name of ['width','height','viewBox','preserveAspectRatio']){
      if(original.hasAttribute(name))root.setAttribute(name,original.getAttribute(name));else root.removeAttribute(name);
    }
  }
  const box=(root.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(Number);
  const pixels=value=>{const m=(value||'').trim().match(/^([\d.]+)(px|in|cm|mm|pt|pc)?$/i);return m?Number(m[1])*({px:1,in:96,cm:96/2.54,mm:96/25.4,pt:96/72,pc:16}[m[2]?.toLowerCase()||'px']):0;};
  const width=parent?.width||pixels(root.getAttribute('width'))||box[2],height=parent?.height||pixels(root.getAttribute('height'))||box[3];
  if(!(width>0&&height>0&&width*height<=40000000))throw new Error('SVG 画布尺寸无效或过大。');
  const svg=new XMLSerializer().serializeToString(root);
  if(parent&&svgVersion(parent.svg).svg===svg)throw new Error('模型返回了相同的 SVG，未保存新版本，请调整修改要求后重试。');
  const bytes=new TextEncoder().encode(svg);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  return {source:'svg',svg,image:'data:image/svg+xml;base64,'+btoa(binary),width,height};
}

export async function generateSVGRevision(parent,prompt,{route,key,post}){
  const original=svgVersion(parent.svg);
  const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('原始 SVG 读取失败。'));img.src=original.image;});
  const canvas=document.createElement('canvas');canvas.width=parent.width;canvas.height=parent.height;
  canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  const references=[canvas.toDataURL('image/png'),...(parent.attachments||[]).map(x=>x.data)];
  const text='Edit the complete SVG below according to the user instruction. Return only a complete standalone SVG. Preserve the original full canvas dimensions, viewBox and all content not mentioned. Image 1 is the COMPLETE original. Images 2 onward are locator screenshots ONLY, never replacement canvases. Do not crop the output to a screenshot. Use vector elements and text, no scripts, external resources or embedded raster images.\nUser instruction:\n'+prompt+'\nOriginal complete SVG:\n'+parent.svg;
  let body,path;
  if(route.proto==='anthropic'){
    path='/v1/messages';body={model:route.model,max_tokens:32000,messages:[{role:'user',content:[{type:'text',text},...references.map(data=>{const m=data.match(/^data:([^;]+);base64,(.+)$/);return {type:'image',source:{type:'base64',media_type:m[1],data:m[2]}};})]}]};
  }else{
    path='/chat/completions';body={model:route.model,max_tokens:32000,messages:[{role:'user',content:[{type:'text',text},...references.map(url=>({type:'image_url',image_url:{url}}))]}]};
  }
  const response=await post(path,body,key);
  const content=route.proto==='anthropic'?response.content?.filter(x=>x.type==='text').map(x=>x.text).join('\n'):response.choices?.[0]?.message?.content;
  const output=typeof content==='string'?content:Array.isArray(content)?content.map(x=>x.text||'').join('\n'):'';
  return {...svgVersion(output,parent),route,revisionAudit:{status:200,model:route.model,referenceCount:references.length}};
}
