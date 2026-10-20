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
  let payload=body, transientRetried=false, referenceFallback=false;
  try{
    for(;;){
      const result=await Promise.race([deadline,(async()=>{
        const multipart=payload instanceof FormData;
        const response=await fetchImpl(url,{method:'POST',
          headers:{...(multipart?{}:{'Content-Type':'application/json'}),Authorization:'Bearer '+key},
          body:multipart?payload:JSON.stringify(payload),signal:controller.signal});
        return {ok:response.ok,status:response.status,text:await response.text()};
      })()]);
      const kind=result.ok?'':imageFailureKind(result.status,result.text);
      if(kind==='reference' && usedReferences && allowReferenceFallback && !(payload instanceof FormData) && !referenceFallback){
        payload={...payload};delete payload.image;
        usedReferences=false;referenceFallback=true;
        onRecovery('reference');
        continue;
      }
      if(kind==='upstream' && !transientRetried){
        transientRetried=true;onRecovery('upstream');
        await Promise.race([deadline,sleep(1500)]);
        continue;
      }
      return {...result,usedReferences,referenceFallback};
    }
  }catch(error){
    if(controller.signal.aborted) throw timeout;
    throw error;
  }finally{clearTimeout(timer);}
}

// GPT image edits use multipart files, not the provider-specific JSON `image`
// extension accepted by Seedream and some other generation APIs.
export function compatibleImageRequest(body){
  const references=Array.isArray(body.image)?body.image:body.image?[body.image]:[];
  if(!/^gpt-image-/i.test(body.model)||!references.length)
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

export function geminiImageResult(data){
  for(const candidate of data.candidates||[]){
    for(const part of candidate.content?.parts||[]){
      if(part.thought) continue;
      const image=part.inlineData||part.inline_data;
      const mime=image?.mimeType||image?.mime_type||'image/png';
      if(image?.data && /^image\//.test(mime)) return {b64_json:image.data,mimeType:mime};
    }
  }
  const reason=data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || 'NO_IMAGE';
  throw new Error('Gemini returned no image ('+reason+').');
}
