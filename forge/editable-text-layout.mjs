// Keep source line breaks and words intact. Only modest font correction is allowed.
let context;
export function layoutEditableText(value, options={}){
  const text=String(value??'').replace(/\r\n?/g,'\n');
  const originalSize=Math.max(6,Number(options.fontSize)||18);
  const lines=text.split('\n');
  if(!context&&globalThis.document){try{context=document.createElement('canvas').getContext('2d');}catch{}}
  const measure=options.measureText||(context?.measureText?line=>context.measureText(line):null);
  if(context)context.font=`${options.italic?'italic ':''}${options.bold?'bold ':''}${originalSize}px ${options.fontFamily||'Arial'}`;
  const metrics=measure?lines.map(line=>measure(line)):null;
  const lineWidths=metrics?metrics.map(metric=>typeof metric==='number'?metric:metric.width):null;
  const width=lineWidths?Math.max(0,...lineWidths):null;
  // Scene boxes describe visible lettering, which is often shorter than the
  // font's em square. Comparing that box with fontSize shrinks fitting text.
  const inkHeights=metrics?.map(metric=>typeof metric==='object'&&metric!==null
    ?Number(metric.actualBoundingBoxAscent)+Number(metric.actualBoundingBoxDescent):NaN);
  const inkHeight=inkHeights?.every(Number.isFinite)?Math.max(0,...inkHeights):originalSize;
  const height=inkHeight+originalSize*Math.max(0,lines.length-1)*1.14;
  const ratio=Math.min(1,Number(options.w)>0&&width?options.w/width:1,Number(options.h)>0?options.h/height:1);
  const scale=Math.max(.85,ratio);
  return {text,fontSize:Math.max(6,originalSize*scale),overflow:ratio<.85,measuredWidth:width,measuredHeight:height,lineWidths};
}
