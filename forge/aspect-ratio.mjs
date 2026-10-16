export const FIGURE_RATIOS = Object.freeze({
  '16:9':[16,9], '3:2':[3,2], '4:3':[4,3], '1:1':[1,1]
});

export function figureCanvas(ratio){
  const pair=FIGURE_RATIOS[ratio];
  if(!pair) throw new Error(`Unsupported figure ratio: ${ratio}`);
  return {width:1600,height:Math.round(1600*pair[1]/pair[0])};
}

export function imageRequestDimensions(provider,model,ratio,resolution='2K',nativeGemini=false){
  if(!FIGURE_RATIOS[ratio]) throw new Error(`Unsupported figure ratio: ${ratio}`);
  if(!['1K','2K','4K'].includes(resolution)) throw new Error(`Unsupported resolution: ${resolution}`);
  if(nativeGemini) return {field:'gemini',aspectRatio:ratio,imageSize:resolution};
  if(provider==='ark' && /seedream/i.test(model) && resolution==='2K'){
    const sizes={'16:9':'2848x1600','3:2':'2496x1664','4:3':'2304x1728','1:1':'2048x2048'};
    return {field:'size',value:sizes[ratio]};
  }
  if(provider==='ark' && /seedream-5-0-lite/i.test(model) && resolution==='4K'){
    const sizes={'16:9':'4096x2304','3:2':'4992x3328','4:3':'4704x3520','1:1':'4096x4096'};
    return {field:'size',value:sizes[ratio]};
  }
  // These endpoints publish a limited set of exact output sizes. Never ask for
  // a different size and silently stretch or crop the response.
  if(provider==='oai' && /^gpt-image/i.test(model)){
    if(resolution==='1K' && ratio==='3:2') return {field:'size',value:'1536x1024'};
    if(resolution==='1K' && ratio==='1:1') return {field:'size',value:'1024x1024'};
  }
  if(provider==='sf' && ratio==='1:1' && resolution==='1K') return {field:'image_size',value:'1024x1024'};
  if(provider==='glm' && ratio==='1:1' && resolution==='1K') return {field:'size',value:'1024x1024'};
  throw new Error(`Model ${model} has no verified ${ratio} ${resolution} output size. Select a supported model, ratio, or resolution.`);
}

export function verifyImageRatio(width,height,ratio){
  const pair=FIGURE_RATIOS[ratio];
  if(!pair || !Number.isFinite(width) || !Number.isFinite(height) || width<=0 || height<=0) return false;
  return Math.abs(width/height-pair[0]/pair[1])/(pair[0]/pair[1])<=0.012;
}

export function verifyImageResolution(width,height,resolution){
  const minLongSide={'1K':1024,'2K':2000,'4K':4000}[resolution];
  return !!minLongSide && Number.isFinite(width) && Number.isFinite(height) && Math.max(width,height)>=minLongSide;
}
