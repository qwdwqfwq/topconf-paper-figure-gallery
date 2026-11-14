// Step 3 only: keep model capability checks out of the frozen Step 4 modules.
import {imageRequestDimensions} from './aspect-ratio.mjs';
import {nonelinearImageDimensions} from './nonelinear-image.mjs';

const resolutions=['1K','2K','4K'];
export function step3ImageResolutions(provider,model,ratio,nativeGemini=false){
  // Flash Lite Image accepts 1K only, even though the gateway accepts the
  // generic 2K/4K parameter syntax before the request reaches this model.
  const gemini=/^gemini-(?:2\.5-flash|3-pro|3\.1-flash(?:-lite)?)-image(?:-preview|-\d{4}-\d{2}-\d{2})?$/i.test(model);
  const gpt=/^gpt-image-(?:1(?:\.5)?|1-mini|2(?:\.5-(?:sunburst|flare))?)(?:-(?:high|medium|low)|-\d{4}-\d{2}-\d{2})?$/i.test(model);
  const seedream=/^doubao-seedream-/i.test(model);
  // Unknown dynamic model IDs have no declared capabilities. Do not advertise
  // arbitrary sizes merely because a gateway accepts a generic size field.
  if(!gemini&&!gpt&&!seedream&&!['sf','glm'].includes(provider)&&provider!=='nonelinear')return [];
  const candidates=gemini&&/2\.5-flash|flash-lite/i.test(model)?['1K']:resolutions;
  return candidates.filter(resolution=>{
    try{step3ImageDimensions(provider,model,ratio,resolution,nativeGemini);return true;}
    catch{return false;}
  });
}

export function step3ImageDimensions(provider,model,ratio,resolution,nativeGemini=false){
  if(!['16:9','3:2','4:3','1:1'].includes(ratio))throw Error('Unsupported ratio');
  if(/^gemini-2\.5-flash-image(?:$|-)/i.test(model)){
    if(resolution!=='1K')throw Error('1K only');
    return nativeGemini?{field:'gemini',aspectRatio:ratio}: {field:'aspect_ratio',value:ratio};
  }
  if(/^gemini-(?:3-pro|3\.1-flash(?:-lite)?)-image(?:$|-)/i.test(model)){
    if(/flash-lite/i.test(model)&&resolution!=='1K')throw Error('1K only');
    return nativeGemini?{field:'gemini',aspectRatio:ratio,imageSize:resolution}:{field:'size',value:resolution,aspectRatio:ratio};
  }
  if(/^gpt-image-(?:1(?:\.5)?|1-mini)(?:$|-)/i.test(model)){
    if(resolution!=='1K'||!['1:1','3:2'].includes(ratio))throw Error('Unsupported GPT Image 1 size');
    return {field:'size',value:ratio==='1:1'?'1024x1024':'1536x1024'};
  }
  if(provider==='nonelinear'&&!/^gpt-image-2(?:$|[.-])/i.test(model)){
    const value=nonelinearImageDimensions(model,ratio,resolution);if(!value)throw Error('Undeclared model size');return value;
  }
  if(/seedream-4[.-]5/i.test(model)&&resolution==='1K')throw Error('2K minimum');
  if(/seedream-5/i.test(model)&&resolution!=='2K'&&!(provider==='ark'&&/lite/i.test(model)&&resolution==='4K'))throw Error('Unsupported Seedream size');
  const value=imageRequestDimensions(provider,model,ratio,resolution,nativeGemini);
  if(provider!=='infistar'&&/^gpt-image-2\.5-/i.test(model)&&resolution==='1K')return {field:'size',value:({'4:3':'1024x768','1:1':'1024x1024'})[ratio]||value.value};
  return value;
}

// Gemini 2.5 uses native discrete pixel sizes rather than mathematically exact
// aspect ratios. Accept those documented pixels without relaxing other models.
export function step3NativePixelsMatch(model,ratio,width,height){
  if(!/^gemini-2\.5-flash-image(?:$|-)/i.test(model))return false;
  const pixels={'1:1':[1024,1024],'3:2':[1248,832],'4:3':[1184,864],'16:9':[1344,768]}[ratio];
  return !!pixels&&pixels[0]===width&&pixels[1]===height;
}

export function assertStep3ImageResolution(provider,model,ratio,resolution,nativeGemini=false,english=false){
  const supported=step3ImageResolutions(provider,model,ratio,nativeGemini);
  if(supported.includes(resolution))return;
  throw new Error(english
    ?`${model} does not support ${ratio} / ${resolution}. Available resolutions: ${supported.join(', ')||'none'}. Please choose an available configuration.`
    :`${model} 不支持 ${ratio} / ${resolution}。可用分辨率：${supported.join('、')||'无'}。请选择可用配置。`);
}
