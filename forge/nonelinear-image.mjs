// NoneLinear's OpenAI-compatible endpoint has model-specific image parameters.
// Capability declarations are not claims of live/account-specific verification.
// https://docs.nonelinear.com/api/images
export function nonelinearImageDimensions(model,ratio,resolution){
  const aspectSize=value=>({field:'size',value,aspectRatio:ratio});
  const pixels=value=>({field:'size',value});
  if(/^gemini-(?:3-pro|3\.1-flash)-image(?:-preview)?$/i.test(model))
    return aspectSize(resolution);
  if(/^gemini-2\.5-flash-image(?:-preview)?$/i.test(model) && resolution==='1K')
    return {field:'aspect_ratio',value:ratio};
  if(/^imagen-4\.0-(?:generate|ultra)-001$/i.test(model) &&
     resolution!=='4K' && ratio!=='3:2') return aspectSize(resolution);
  if(/^imagen-4\.0-fast-generate-001$/i.test(model) && resolution==='1K' && ratio!=='3:2')
    return {field:'aspect_ratio',value:ratio};
  if(/^kling-(?:image-o1|v2(?:-new|-1)?)$/i.test(model) &&
     (resolution!=='4K' || /^kling-image-o1$/i.test(model))) return aspectSize(resolution.toLowerCase());
  if(/^viduq2$/i.test(model)) return aspectSize(resolution==='1K'?'1080p':resolution);
  if(/^gpt-image-(?:1(?:\.5)?|1-mini)(?:-(?:high|medium|low))?$/i.test(model) && resolution==='1K'){
    if(ratio==='1:1') return pixels('1024x1024');
    if(ratio==='3:2') return pixels('1536x1024');
  }
  // GPT Image 2 uses the upstream custom-size constraints in aspect-ratio.mjs.
  if(/^gpt-image-2(?:\.5-(?:sunburst|flare))?(?:-\d{4}-\d{2}-\d{2})?$/i.test(model)) return null;
  const sizes={
    '1K':{'16:9':'1280x720','3:2':'1152x768','4:3':'1024x768','1:1':'1024x1024'},
    '2K':{'16:9':'2048x1152','3:2':'2040x1360','4:3':'2048x1536','1:1':'2048x2048'},
    '4K':{'16:9':'4096x2304','3:2':'4992x3328','4:3':'4608x3456','1:1':'4096x4096'}
  };
  if(/^qwen-image$/i.test(model) && resolution==='1K'){
    const native={'16:9':'1664x928','3:2':'1584x1056','1:1':'1024x1024'};
    if(native[ratio]) return pixels(native[ratio]);
  }
  if(/^qwen-image-(?:max|plus)$/i.test(model) && resolution==='1K'){
    const native={'16:9':'1664x928','4:3':'1472x1104','1:1':'1328x1328'};
    if(native[ratio]) return pixels(native[ratio].replace('x','*'));
  }
  if(/^(?:qwen-image-[23]\.0(?:-pro)?|qwen-image-edit-(?:max|plus)|z-image-turbo)$/i.test(model) && resolution!=='4K')
    return pixels(sizes[resolution][ratio].replace('x','*'));
  if(/^(?:doubao-seedream-4(?:[.-][05])(?:-.+)?|doubao-seedream-5-0-pro(?:-.+)?)$/i.test(model)){
    const is45=/seedream-4[.-]5/i.test(model),is5=/seedream-5/i.test(model);
    if((!is45 || resolution!=='1K') && (!is5 || resolution!=='4K')) return pixels(sizes[resolution][ratio]);
  }
  if(/^doubao-seedream-5(?:[.-]0)-lite(?:-.+)?$/i.test(model) && resolution==='2K')
    return pixels(sizes['2K'][ratio]);
  return undefined;
}
