// Infistar exposes Gemini image models through the native Gemini endpoint.
export function usesInfistarGemini(base, model){
  try { return /^(?:www\.)?infistar\.(?:cc|ai)$/.test(new URL(base).hostname) && /^gemini-/i.test(model); }
  catch { return false; }
}

export function geminiImageRequest(base, model, prompt, references=[]){
  const parts=[{text:prompt}];
  for(const uri of references){
    const match=/^data:(image\/[\w.+-]+);base64,([\s\S]+)$/.exec(uri);
    if(!match) throw new Error('Reference image must be a base64 image');
    parts.push({inlineData:{mimeType:match[1],data:match[2]}});
  }
  return {base:base.replace(/\/+$/,'').replace(/\/v1(?:beta)?$/,''),
    endpoint:'/v1beta/models/'+encodeURIComponent(model)+':generateContent',
    body:{contents:[{role:'user',parts}],generationConfig:{responseModalities:['TEXT','IMAGE']}}};
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
