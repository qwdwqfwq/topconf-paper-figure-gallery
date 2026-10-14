// Refine recognized text against the source pixels. The model supplies the
// wording; this pass measures font metrics and placement without another API call.
export function calibrateEditableText(scene, sourceCanvas, options={}){
  const maxLabels=options.maxLabels??16;
  const width=sourceCanvas.width,height=sourceCanvas.height;
  const src=sourceCanvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,width,height).data;
  const colorCanvas=document.createElement('canvas');colorCanvas.width=colorCanvas.height=1;
  const colorCtx=colorCanvas.getContext('2d',{willReadFrequently:true});
  const rgb=value=>{
    try{colorCtx.fillStyle='#000000';colorCtx.fillStyle=value||'#111827';
      colorCtx.fillRect(0,0,1,1);
      return [...colorCtx.getImageData(0,0,1,1).data].slice(0,3);
    }catch(_){}
    return [17,24,39];
  };
  const labels=(scene.nodes||[]).filter(n=>n.type==='text'&&n.text&&
    Number(n.fontSize)>=13&&Number(n.fontSize)<=130&&n.text.length<=80)
    .sort((a,b)=>Number(b.fontSize)-Number(a.fontSize)).slice(0,maxLabels);
  let adjusted=0;
  for(const node of labels){
    const x=Number(node.x),y=Number(node.y),size=Number(node.fontSize);
    if(![x,y,size].every(Number.isFinite)) continue;
    const text=String(node.text),nominalWidth=Math.max(Number(node.w)||0,size*text.length*.5);
    const margin=Math.min(36,Math.max(10,Math.round(size*.4)));
    const left=Math.max(0,Math.floor(x-margin)),top=Math.max(0,Math.floor(y-margin));
    const right=Math.min(width,Math.ceil(x+nominalWidth+margin));
    const bottom=Math.min(height,Math.ceil(y+Math.max(size*1.35,Number(node.h)||0)+margin));
    const rw=right-left,rh=bottom-top;
    if(rw<8||rh<8||rw*rh>600000) continue;
    const fill=rgb(node.fill),sourceMask=new Uint8Array(rw*rh);
    let sourceCount=0;
    for(let py=0;py<rh;py++) for(let px=0;px<rw;px++){
      const i=((top+py)*width+left+px)*4;
      const dist=Math.abs(src[i]-fill[0])+Math.abs(src[i+1]-fill[1])+Math.abs(src[i+2]-fill[2]);
      if(dist<95){sourceMask[py*rw+px]=1;sourceCount++;}
    }
    if(sourceCount<12||sourceCount>rw*rh*.7) continue;
    const preferredFont=String(node.fontFamily||'Arial').split(',')[0].trim();
    const fonts=[preferredFont,'Arial','Times New Roman','Georgia','Calibri'];
    const uniqueFonts=[...new Set(fonts)];
    const candidate=document.createElement('canvas');candidate.width=rw;candidate.height=rh;
    const ctx=candidate.getContext('2d',{willReadFrequently:true});
    const initialX=x-left,initialY=y-top;
    const shift=Math.min(32,Math.max(8,Math.round(size*.35)));
    const shifts=[0,-1,1,-2,2].map(v=>v*shift/2);
    let best=null;
    for(const font of uniqueFonts) for(const ratio of [.9,1,1.1]){
      const fontSize=Math.max(6,Math.round(size*ratio));
      ctx.font=`${node.bold?'bold ':''}${node.italic?'italic ':''}${fontSize}px "${font.replace(/"/g,'')}"`;
      ctx.textBaseline='alphabetic';ctx.fillStyle='#000000';
      const measured=ctx.measureText(text).width;
      const maskCanvas=document.createElement('canvas');
      maskCanvas.width=Math.max(1,Math.min(rw,Math.ceil(measured)+4));
      maskCanvas.height=Math.max(1,Math.ceil(fontSize*1.4)+4);
      const mc=maskCanvas.getContext('2d',{willReadFrequently:true});
      mc.font=ctx.font;mc.fillStyle='#000000';
      mc.fillText(text,2,fontSize*.84+2);
      const pixels=mc.getImageData(0,0,maskCanvas.width,maskCanvas.height).data;
      const points=[];
      for(let py=0;py<maskCanvas.height;py++) for(let px=0;px<maskCanvas.width;px++)
        if(pixels[(py*maskCanvas.width+px)*4+3]>110) points.push([px-2,py-2]);
      if(points.length<8) continue;
      for(const dy of shifts) for(const dx of shifts){
        const tx=Math.round(initialX+dx),ty=Math.round(initialY+dy),
          anchor=node.anchor==='middle'?(Number(node.w)||0)/2-measured/2:
            node.anchor==='end'?(Number(node.w)||0)-measured:0;
        let hit=0;
        for(const [px,py] of points){
          const xx=Math.round(tx+anchor+px),yy=ty+py;
          if(xx>=0&&xx<rw&&yy>=0&&yy<rh&&sourceMask[yy*rw+xx]) hit++;
        }
        const precision=hit/points.length;
        const score=precision-.002*(Math.abs(dx)+Math.abs(dy));
        if(!best||score>best.score) best={score,precision,font,fontSize,dx,dy};
      }
    }
    if(best&&best.precision>.42&&best.score>.46){
      node.x=x+best.dx;node.y=y+best.dy;node.fontSize=best.fontSize;
      node.fontFamily=best.font;adjusted++;
    }
  }
  return adjusted;
}
