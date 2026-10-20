// Buffer API responses under one deadline: fetch alone resolves at headers.
export async function fetchBufferedWithTimeout(url,options={},timeoutMs=900000,fetchImpl=fetch){
  const controller=new AbortController();
  const timeout=new DOMException('timeout','TimeoutError');
  let timer;
  const deadline=new Promise((_,reject)=>{
    timer=setTimeout(()=>{controller.abort(timeout);reject(timeout);},timeoutMs);
  });
  try{
    return await Promise.race([deadline,(async()=>{
      const response=await fetchImpl(url,{...options,signal:controller.signal});
      const body=await response.arrayBuffer();
      return new Response([204,205,304].includes(response.status)?null:body,{
        status:response.status,statusText:response.statusText,headers:response.headers
      });
    })()]);
  }finally{clearTimeout(timer);}
}

// Infistar exposes Gemini image models through the native Gemini endpoint.
export function imageFailureKind(status, text){
  if(status===422 && /(?:参考图|reference|image input|image-to-image)/i.test(text) &&
     /(?:没有线路支持|不支持|unsupported|not support|no.*(?:route|channel))/i.test(text)) return 'reference';
  if(status>=500 && status<=504 && /read_response_body_failed|context cancel(?:ed|led)/i.test(text)) return 'upstream';
  return '';
}

// Allowlisted transport metadata only: never include credentials, prompts or pixels.
export function imageRequestDiagnostics(url,payload){
  const multipart=payload instanceof FormData;
  const refs=multipart?[...payload.getAll('image'),...payload.getAll('image[]')]:
    (Array.isArray(payload.image)?payload.image:payload.image?[payload.image]:[]);
  const nativeRefs=Array.isArray(payload.contents)?payload.contents.flatMap(content=>
    Array.isArray(content?.parts)?content.parts.filter(part=>
      part?.inlineData||part?.inline_data||part?.fileData||part?.file_data):[]):[];
  return {endpoint:new URL(url).pathname,format:multipart?'multipart/form-data':'application/json',
    referenceCount:refs.length+nativeRefs.length,
    size:multipart?payload.get('size'):payload.size||payload.generationConfig?.imageConfig?.imageSize||''};
}

// One shared deadline includes response bodies and recovery. Never retry an
// ambiguous network failure: the upstream may already have billed that request.
export async function requestImageWithRecovery({url,body,key,usedReferences=false,
  allowReferenceFallback=false,timeoutMs=1200000,fetchImpl=fetch,
  sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),onRecovery=()=>{}}){
  const controller=new AbortController();
  const timeout=Object.assign(new Error('Image generation deadline exceeded'),{name:'TimeoutError'});
  let timer;
  const deadline=new Promise((_,reject)=>{
    timer=setTimeout(()=>{controller.abort();reject(timeout);},timeoutMs);
  });
  let payload=body, referenceFallback=false;
  try{
    for(;;){
      const result=await Promise.race([deadline,(async()=>{
        const multipart=payload instanceof FormData;
        const response=await fetchImpl(url,{method:'POST',
          headers:{...(multipart?{}:{'Content-Type':'application/json'}),Authorization:'Bearer '+key},
          body:multipart?payload:JSON.stringify(payload),signal:controller.signal});
        return {ok:response.ok,status:response.status,text:await response.text(),
          requestId:response.headers.get('x-request-id')||response.headers.get('request-id')||''};
      })()]);
      const kind=result.ok?'':imageFailureKind(result.status,result.text);
      if(kind==='reference' && usedReferences && allowReferenceFallback && !referenceFallback){
        if(payload instanceof FormData){
          payload=Object.fromEntries([...payload.entries()].filter(([name,value])=>
            name!=='image' && name!=='image[]' && typeof value==='string'));
          url=url.replace(/\/images\/edits$/, '/images/generations');
        }else{
          payload={...payload};delete payload.image;
          // Native Gemini carries reference pixels in contents, not `image`.
          if(Array.isArray(payload.contents)) payload.contents=payload.contents.map(content=>({
            ...content,parts:(Array.isArray(content?.parts)?content.parts:[]).filter(part=>part && !part.inlineData && !part.inline_data &&
              !part.fileData && !part.file_data)
          }));
        }
        usedReferences=false;referenceFallback=true;
        onRecovery('reference');
        continue;
      }
      return {...result,usedReferences,referenceFallback,request:imageRequestDiagnostics(url,payload)};
    }
  }catch(error){
    if(controller.signal.aborted) throw timeout;
    throw error;
  }finally{clearTimeout(timer);}
}

// Preserve Infistar's historical JSON image extension. A GPT model name alone
// does not establish which input protocol a relay accepts.
// Direct OpenAI-compatible GPT edits continue to upload multipart files.
export function compatibleImageRequest(body,base=''){
  const references=Array.isArray(body.image)?body.image:body.image?[body.image]:[];
  let infistar=false;
  try{infistar=/^(?:www\.)?infistar\.(?:cc|ai)$/.test(new URL(base).hostname);}catch{}
  if(infistar || !/^gpt-image-/i.test(body.model)||!references.length)
    return {endpoint:'/images/generations',body};
  const form=new FormData();
  for(const [key,value] of Object.entries(body)){
    if(key!=='image' && value!=null) form.append(key,String(value));
  }
  references.forEach((uri,index)=>{
    const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(uri);
    if(!match) throw new Error('GPT image references must be PNG, JPEG or WebP base64 images');
    const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));
    if(!bytes.length) throw new Error('Reference image is empty');
    form.append('image[]',new Blob([bytes],{type:match[1]}),
      `reference-${index+1}.${match[1].split('/')[1]}`);
  });
  return {endpoint:'/images/edits',body:form};
}

export function usesInfistarGemini(base, model){
  try { return /^(?:www\.)?infistar\.(?:cc|ai)$/.test(new URL(base).hostname) && /^gemini-/i.test(model); }
  catch { return false; }
}

export function geminiImageRequest(base, model, prompt, references=[], options={}){
  const parts=[{text:prompt}];
  for(const uri of references){
    const match=/^data:(image\/[\w.+-]+);base64,([\s\S]+)$/.exec(uri);
    if(!match) throw new Error('Reference image must be a base64 image');
    parts.push({inlineData:{mimeType:match[1],data:match[2]}});
  }
  return {base:base.replace(/\/+$/,'').replace(/\/v1(?:beta)?$/,''),
    endpoint:'/v1beta/models/'+encodeURIComponent(model)+':generateContent',
    body:{contents:[{role:'user',parts}],generationConfig:{
      responseModalities:['TEXT','IMAGE'],imageConfig:{aspectRatio:options.aspectRatio||'16:9',imageSize:options.imageSize||'2K'}
    }}};
}

export function geminiImageResult(data, {requestId='',locale='en'}={}){
  const candidates=Array.isArray(data?.candidates)?data.candidates:[];
  const partsOf=candidate=>Array.isArray(candidate?.content?.parts)?candidate.content.parts:[];
  for(const candidate of candidates){
    for(const part of partsOf(candidate)){
      if(!part || typeof part!=='object') continue;
      if(part.thought) continue;
      const image=part.inlineData||part.inline_data;
      const mime=image?.mimeType||image?.mime_type||'image/png';
      if(typeof image?.data==='string' && image.data.trim() && /^image\//i.test(mime)) return {b64_json:image.data,mimeType:mime};
    }
  }
  const reason=data?.promptFeedback?.blockReason || candidates[0]?.finishReason || 'NO_IMAGE';
  const detail=candidates.flatMap(candidate=>[
    candidate?.finishMessage,...partsOf(candidate).filter(part=>!part?.thought).map(part=>part?.text)
  ]).filter(value=>typeof value==='string' && value.trim()).join(' ').replace(/\s+/g,' ').slice(0,700);
  const id=String(data?.responseId||requestId||'').slice(0,160);
  const zh=locale==='zh';
  const message=(zh?`Gemini 响应中没有可用图片（${reason}）。`:`Gemini returned no image (${reason}). `)
    +(reason==='STOP'?(zh?'STOP 表示响应正常结束，不代表已生成图片。':'STOP means the response ended, not that an image was generated. '):'')
    +(detail?(zh?' 模型说明：':' Model message: ')+detail:(zh?' 未返回模型文字说明。':' No model explanation returned.'))
    +(id?' Request ID: '+id:'')
    +(zh?' 未自动重试，以免重复计费。':' Not automatically retried to avoid duplicate charges.');
  throw Object.assign(new Error(message),{code:'GEMINI_NO_IMAGE',reason,requestId:id});
}
