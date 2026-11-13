// Revision-only crop refinement. No export/reconstruction dependencies.
// Vision proposes semantic nodes; connected pixels recover their full borders.
const revisionRasters=new WeakMap();
function raster(image){
  if(revisionRasters.has(image))return revisionRasters.get(image);
  const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
  const value={canvas:c,data:ctx.getImageData(0,0,c.width,c.height).data,w:c.width,h:c.height};revisionRasters.set(image,value);return value;
}
export function revisionBackground(ctx,image,band,plan){
  const {data,w}=raster(image);
  // Recover the original light background row by row; exclude ink and node fills.
  let previous=[245,245,245];
  for(let y=band.topEnd;y<band.bottomStart;y++){
    const channels=[[],[],[]];
    for(let x=0;x<w;x+=3){const p=(y*w+x)*4,r=data[p],g=data[p+1],b=data[p+2];if(Math.min(r,g,b)>215&&Math.max(r,g,b)-Math.min(r,g,b)<10){channels[0].push(r);channels[1].push(g);channels[2].push(b);}}
    if(channels[0].length>w/30)previous=channels.map(a=>{a.sort((a,b)=>a-b);return a[Math.floor(a.length/2)];});
    ctx.fillStyle=`rgb(${previous.join(',')})`;ctx.fillRect(0,y-band.topEnd,w,1);
  }
  // Recover enclosing vertical frame columns from their continuity, rather
  // than truncating them at caption crop bounds or a fixed 1.8% margin.
  const frameEnd=(reverse=false)=>{
    let end=0;
    for(let k=0;k<Math.ceil(w*.05);k++){
      const x=reverse?w-1-k:k;let ink=0,total=0;
      for(let y=band.topEnd;y<band.bottomStart;y+=3){const p=(y*w+x)*4,c=[data[p],data[p+1],data[p+2]];total++;if(Math.max(...c)<215&&Math.max(...c)-Math.min(...c)<12)ink++;}
      if(ink>total*.65)end=k+3;
    }
    return end;
  };
  const left=frameEnd(),right=frameEnd(true);
  if(left)ctx.drawImage(image,0,band.topEnd,left,band.bottomStart-band.topEnd,0,0,left,band.bottomStart-band.topEnd);
  if(right)ctx.drawImage(image,w-right,band.topEnd,right,band.bottomStart-band.topEnd,w-right,0,right,band.bottomStart-band.topEnd);
}
export function revisionEdgeColor(image,plan,edge){
  const {data,w,h}=raster(image),a=plan.items.find(i=>i.id===edge.from)?.source,b=plan.items.find(i=>i.id===edge.to)?.source;
  if(!a||!b)return '#526c88';
  const u=w/500,right=b.x>=a.x+a.width,left=b.x+b.width<=a.x;
  const cx=right?b.x-8*u:left?b.x+b.width+8*u:b.x+b.width/2,cy=right||left?b.y+b.height/2:b.y-8*u;
  const bins=new Map();
  for(let y=Math.max(0,Math.floor(cy-6*u));y<Math.min(h,cy+6*u);y++)for(let x=Math.max(0,Math.floor(cx-7*u));x<Math.min(w,cx+7*u);x++){
    if(plan.items.some(i=>x>=i.source.x&&x<i.source.x+i.source.width&&y>=i.source.y&&y<i.source.y+i.source.height))continue;
    const p=(y*w+x)*4,c=[data[p],data[p+1],data[p+2]],max=Math.max(...c),min=Math.min(...c);
    if(max>210||max<60)continue;
    const key=c.map(v=>Math.round(v/24)).join(','),entry=bins.get(key)||{n:0,c:[0,0,0]};entry.n++;c.forEach((v,k)=>entry.c[k]+=v);bins.set(key,entry);
  }
  const best=[...bins.values()].sort((a,b)=>b.n-a.n)[0];return best?`rgb(${best.c.map(v=>Math.round(v/best.n)).join(',')})`:'#526c88';
}
export function refineRevisionPixels(image,plan){
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
  const {width:w,height:h}=canvas,data=ctx.getImageData(0,0,w,h).data;
  const band=plan.preserveBands||{topEnd:0,bottomStart:h},crops=new Map();
  for(const item of plan.items.filter(i=>i.keep&&i.source.y>=band.topEnd&&i.source.y+i.source.height<=band.bottomStart)){
    // Independent vision reviews may describe a fill without naming its shape.
    // Such nodes must retain their entire raster, including white badge text.
    const s=item.source,appearance=item.appearance||'',boxed=/box|rectangle|badge|background|fill|框|矩形|背景|底色/i.test(appearance)&&!/unboxed|no (?:box|border|background|fill)|without (?:box|border|background|fill)|transparent background|无框|无背景/i.test(appearance);
    let r={...s};
    const px=Math.ceil(w*.018),py=Math.ceil(h*.012),left=Math.max(0,s.x-px),top=Math.max(band.topEnd,s.y-py),right=Math.min(w,s.x+s.width+px),bottom=Math.min(band.bottomStart,s.y+s.height+py),rw=right-left,rh=bottom-top;
    if(boxed){
      const mask=new Uint8Array(rw*rh),queue=new Int32Array(rw*rh);let best;
      for(let y=0;y<rh;y++)for(let x=0;x<rw;x++){
        const p=((y+top)*w+x+left)*4,a=data[p],b=data[p+1],c=data[p+2];
        mask[y*rw+x]=(Math.max(a,b,c)-Math.min(a,b,c)>22||Math.max(a,b,c)<215)?1:0;
      }
      for(let k=0;k<mask.length;k++)if(mask[k]===1){
        let start=0,end=1;queue[0]=k;mask[k]=2;
        while(start<end){const n=queue[start++],x=n%rw,y=Math.floor(n/rw);for(const next of [x? n-1:-1,x+1<rw?n+1:-1,y?n-rw:-1,y+1<rh?n+rw:-1])if(next>=0&&mask[next]===1){mask[next]=2;queue[end++]=next;}}
        if(end<s.width+s.height)continue;
        const rows=new Uint32Array(rh),cols=new Uint32Array(rw);for(let q=0;q<end;q++){const n=queue[q];rows[Math.floor(n/rw)]++;cols[n%rw]++;}
        const xs=[],ys=[];cols.forEach((v,x)=>{if(v>s.height*.45)xs.push(x);});rows.forEach((v,y)=>{if(v>s.width*.45)ys.push(y);});
        if(!xs.length||!ys.length)continue;
        const box={x:left+xs[0]-2,y:top+ys[0]-2,width:xs.at(-1)-xs[0]+5,height:ys.at(-1)-ys[0]+5};
        if(box.width<s.width*.75||box.height<s.height*.75||box.width>s.width*1.25||box.height>s.height*1.3)continue;
        if(!best||end>best.count)best={...box,count:end};
      }
      if(best)r={x:Math.max(0,best.x),y:Math.max(band.topEnd,best.y),width:best.width,height:best.height};
    }else{
      // Unboxed black captions: recover complete glyphs, exclude colored arrows.
      let x0=right,y0=bottom,x1=left,y1=top;
      for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){const p=(y*w+x)*4,a=data[p],b=data[p+1],c=data[p+2];if(Math.max(a,b,c)<155&&Math.max(a,b,c)-Math.min(a,b,c)<24){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}}
      if(x1>x0&&y1>y0)r={x:Math.max(0,x0-3),y:Math.max(band.topEnd,y0-3),width:x1-x0+7,height:y1-y0+7};
    }
    if(r.x+r.width>w||r.y+r.height>band.bottomStart)throw Error('节点完整边界越界，未生成修改版。');
    item.source=r;item.target={...r};
    const crop=document.createElement('canvas');crop.width=r.width;crop.height=r.height;
    const cc=crop.getContext('2d');cc.drawImage(canvas,r.x,r.y,r.width,r.height,0,0,r.width,r.height);
    if(!boxed){const pixels=cc.getImageData(0,0,r.width,r.height);for(let p=0;p<pixels.data.length;p+=4){const d=pixels.data,max=Math.max(d[p],d[p+1],d[p+2]),min=Math.min(d[p],d[p+1],d[p+2]);if(max-min>6)d[p+3]=0;}cc.putImageData(pixels,0,0);}
    crops.set(item.id,crop);
  }
  return crops;
}

// Resample at the origin before positioning. Scaling during translated drawing
// can choose different sampling phases across browser raster backends.
export function revisionTargetRaster(crop,target){
  if(target.width===crop.width&&target.height===crop.height)return crop;
  const scaled=document.createElement('canvas');scaled.width=target.width;scaled.height=target.height;
  scaled.getContext('2d').drawImage(crop,0,0,target.width,target.height);
  return scaled;
}
export function drawRevisionPixels(ctx,crop,target){
  ctx.drawImage(revisionTargetRaster(crop,target),target.x,target.y);
}

// Verify the final raster, rather than trusting draw commands or model centers.
export function verifyRevisionPixels(canvas,plan,crops){
  const ctx=canvas.getContext('2d',{willReadFrequently:true});let checkedBytes=0,scaledNodes=0;
  for(const item of plan.items.filter(i=>i.keep)){
    const crop=crops.get(item.id),t=item.target;if(!crop)throw Error('缺少完整节点原像素，未保存修改版。');
    if(!t||!['x','y','width','height'].every(k=>Number.isInteger(t[k]))||t.width<2||t.height<2||t.x<0||t.y<0||t.x+t.width>canvas.width||t.y+t.height>canvas.height)throw Error('节点目标尺寸或位置无效，未保存修改版。');
    if(t.width!==crop.width||t.height!==crop.height)scaledNodes++;
    const reference=revisionTargetRaster(crop,t);
    const expected=reference.getContext('2d').getImageData(0,0,t.width,t.height).data;
    const actual=ctx.getImageData(t.x,t.y,t.width,t.height).data;
    let itemBytes=0;
    for(let p=0;p<expected.length;p+=4)if(expected[p+3]===255){for(let k=0;k<4;k++){if(expected[p+k]!==actual[p+k])throw Error('节点像素覆盖或位置不符，未保存修改版。');checkedBytes++;itemBytes++;}}
    if(!itemBytes)throw Error('节点缩放后没有可验证的内容，请重新规划可读尺寸。');
  }
  if(!checkedBytes)throw Error('没有可验证的节点像素，未保存修改版。');
  return {verified:true,checkedBytes,nodeCount:plan.items.filter(i=>i.keep).length,scaledNodes,method:scaledNodes?'final-raster-resampled-source-pixels-at-confirmed-targets':'final-raster-exact-source-pixels-at-confirmed-targets'};
}
