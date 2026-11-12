import {retainedReflow} from './revision-layout.mjs';
// Used only by Continue modifying. No reconstruction/export state or shared adapters.
export function revisionMode(value='local'){
  if(!['local','reflow'].includes(value))throw new Error('修改模式无效，请重新选择。');
  return value;
}
export function modeInstruction(value){
  return revisionMode(value)==='reflow'
    ?'区域重排模式：允许在选定区域内增加、删除、移动元素并调整间距和大小，重新排版以避免空洞或重叠。先清点原有元素，再按用户要求增删，核对最终数量；每个保留元素只出现原有次数，禁止复制其他元素填补删除位置。仅删除用户明确指定的元素及其失效连线；其余元素必须保留。所有保留的文字、数据和公式逐字照录，不得重新计算、概括、纠错或补全。'
    :'局部修改模式：只替换、增加或删除用户明确指定的元素，保留其他元素的位置与大小，不要自行重排。新增内容放进用户指定的空位；文字必须完整放进指定边界，可缩小适应，不得裁切。';
}
export function validateRegions(regions,width,height){
  if(!Array.isArray(regions)||!regions.length||regions.length>8)throw new Error('请先框选 1–8 个要修改的区域；框外内容将保持原样。');
  const checked=regions.map(r=>{
    if(!r||![r.x,r.y,r.width,r.height].every(Number.isInteger)||r.x<0||r.y<0||r.width<2||r.height<2||r.x+r.width>width||r.y+r.height>height)throw new Error('修改区域无效，请重新框选。');
    return {x:r.x,y:r.y,width:r.width,height:r.height};
  });
  for(let i=0;i<checked.length;i++)for(let j=0;j<i;j++){
    const a=checked[i],b=checked[j];
    if(a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height)throw new Error('修改区域不能重叠，请重新框选。');
  }
  return checked;
}

export async function scopedRevision(parent,prompt,options,generate){
  const mode=revisionMode(parent.revisionMode);
  if(mode==='reflow'&&parent.route?.p==='nonelinear'&&(parent.attachments||[]).length>3)
    throw new Error('非线智能区域重排最多添加 3 张截图（另需区域特写和完整原图）；请移除多余截图，本次未发送请求。');
  const original=await options.loadImage(await options.toDataURL(parent.image));
  const width=original.naturalWidth||original.width,height=original.naturalHeight||original.height;
  const regions=validateRegions(parent.editRegions,width,height);
  // Copy the original once. Only explicit rectangles are ever written below.
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(original,0,0);
  const originalPixels=ctx.getImageData(0,0,width,height);
  const audits=[];
  for(const [index,r] of regions.entries()){
    options.onProgress?.('正在修改区域 '+(index+1)+' / '+regions.length);
    // Reflow receives a focused working canvas plus the complete original as context.
    // Local edits retain full-image coordinates. Neither path writes outside the rectangle.
    let request={...parent,revisionMode:mode,editRegions:undefined};
    if(mode==='reflow'){
      const crop=document.createElement('canvas');crop.width=r.width;crop.height=r.height;
      crop.getContext('2d').drawImage(original,r.x,r.y,r.width,r.height,0,0,r.width,r.height);
      const ratios=['1:1','4:3','3:4','16:9','9:16'];
      const distance=v=>Math.abs(Math.log((+v.split(':')[0]/+v.split(':')[1])/(r.width/r.height)));
      const ratio=ratios.sort((a,b)=>distance(a)-distance(b))[0];
      request={...request,image:crop.toDataURL('image/png'),focusedRegion:true,route:{...parent.route,ratio},attachments:[...(parent.attachments||[]),{data:await options.toDataURL(parent.image),name:'完整原图（仅供上下文参考）'}]};
    }
    const outputInstruction=mode==='reflow'
      ?'第一张图是唯一需要输出的区域特写，最后一张是完整原图，仅用于理解上下文；中间图片是用户上传截图。只输出第一张图对应的区域新布局，不要输出整张主图或重复原来的网格。'
      :'第一张是完整原图。输出完整画布，尺寸及区域外内容保持原样。';
    const run=mode==='reflow'&&parent.retainElements?retainedReflow:generate;
    const result=await run(request,
      `修改第 ${index+1}/${regions.length} 个区域。完整原图尺寸 ${width}×${height}，区域在原图的像素坐标为 ${JSON.stringify(r)}（左上角为原点）。${outputInstruction}${modeInstruction(mode)} 上传截图用于提供待添加的元素或定位待删除的原图元素，具体操作以用户要求为准；不要把截图界面和标注画入结果。区域内未被明确删除或替换的文字、数字、公式、符号逐字保留。\n用户要求：${prompt}`,options);
    const edited=await options.loadImage(result.image);
    const ew=edited.naturalWidth||edited.width,eh=edited.naturalHeight||edited.height;
    if(mode==='reflow')ctx.drawImage(edited,0,0,ew,eh,r.x,r.y,r.width,r.height);
    else ctx.drawImage(edited,r.x*ew/width,r.y*eh/height,r.width*ew/width,r.height*eh/height,r.x,r.y,r.width,r.height);
    audits.push(result.revisionAudit);
  }
  const pixels=ctx.getImageData(0,0,width,height).data;
  let changedInside=0,changedOutside=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const offset=(y*width+x)*4;
    const changed=[0,1,2,3].some(c=>pixels[offset+c]!==originalPixels.data[offset+c]);
    if(changed){if(regions.some(r=>x>=r.x&&x<r.x+r.width&&y>=r.y&&y<r.y+r.height))changedInside++;else changedOutside++;}
  }
  if(changedOutside)throw new Error('区域外像素校验失败，未保存新版本。');
  if(!changedInside)throw new Error('框选区域未发生变化，未保存新版本。');
  return {image:canvas.toDataURL('image/png'),width,height,route:{...parent.route},revisionMode:mode,revisionAudit:{mode,provider:parent.route.p,model:audits[0]?.plannerModel||parent.route.model,status:200,referenceCount:1+(parent.attachments||[]).length+(mode==='reflow'?1:0),apiRequestCount:audits.reduce((sum,a)=>sum+(a?.apiRequestCount||1),0),regions,regionAudits:audits,pixelCheck:'changed',changedInside,changedOutside,outsidePreservation:'exact-pixels',review:'pending'}};
}

export async function selectRevisionRegions(src,initial=[]){
  const image=new Image();image.src=src;await image.decode();
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.style.cssText='max-width:95vw;width:1200px';
    const text=document.createElement('p');text.textContent='拖动框选要修改的内容，可画多个框。框外逐像素保留；请把不需要改的文字、数据和公式留在框外。';
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;canvas.dataset.scopeCanvas='true';canvas.style.cssText='display:block;width:100%;touch-action:none;cursor:crosshair';
    let regions=initial.map(r=>({...r})),start=null,preview=null;
    const draw=()=>{const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);ctx.strokeStyle='#7c3aed';ctx.lineWidth=3;for(const r of [...regions,...(preview?[preview]:[])])ctx.strokeRect(r.x,r.y,r.width,r.height);};
    const point=e=>{const box=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(canvas.width,Math.round((e.clientX-box.left)*canvas.width/box.width))),y:Math.max(0,Math.min(canvas.height,Math.round((e.clientY-box.top)*canvas.height/box.height)))};};
    canvas.onpointerdown=e=>{start=point(e);canvas.setPointerCapture(e.pointerId);};
    canvas.onpointermove=e=>{if(!start)return;const p=point(e);preview={x:Math.min(start.x,p.x),y:Math.min(start.y,p.y),width:Math.abs(p.x-start.x),height:Math.abs(p.y-start.y)};draw();};
    canvas.onpointerup=e=>{if(!start)return;canvas.onpointermove(e);if(preview.width>=2&&preview.height>=2&&regions.length<8)regions.push(preview);start=null;preview=null;draw();};
    canvas.onpointercancel=()=>{start=null;preview=null;draw();};
    const actions=document.createElement('div');
    for(const [label,handler] of [['撤销上一个框',()=>{regions.pop();draw();}],['清空框选',()=>{regions=[];draw();}],['取消',()=>dialog.close()],['使用这些区域',()=>{try{validateRegions(regions,canvas.width,canvas.height);resolve(regions);dialog.close();}catch(e){text.textContent=e.message;}}]]){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=handler;button.style.margin='10px';actions.append(button);}
    dialog.append(text,canvas,actions);dialog.onclose=()=>{resolve(null);dialog.remove();};document.body.append(dialog);dialog.showModal();draw();
  });
}
