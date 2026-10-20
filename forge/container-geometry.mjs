// Source-pixel radii and shared container boundaries, in canvas pixels.
// Keep paths editable in SVG, DrawingML and Visio; no raster masking.
export function repairContainerGeometry(scene,canvas){
  const {width:W,height:H}=canvas;
  const data=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
  const ink=(x,y,color)=>{
    x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=W||y>=H)return false;
    const i=(y*W+x)*4;
    return Math.max(...color.map((c,k)=>Math.abs(c-data[i+k])))<45;
  };
  let nodes=scene.nodes.map(n=>{
    if(n.type!=='rect'||n.w<24||n.h<24||!(n.strokeWidth>0)||!/^#?[\da-f]{6}$/i.test(n.stroke||''))return n;
    const color=n.stroke.replace('#','').match(/../g).map(v=>parseInt(v,16));
    const limit=Math.min(n.w,n.h)/2,tolerance=Math.max(1,n.strokeWidth/2),estimates=[];
    for(const [sx,sy] of [[1,1],[-1,1],[1,-1],[-1,-1]]){
      const ox=sx===1?n.x:n.x+n.w,oy=sy===1?n.y:n.y+n.h;
      const score=r=>{
        let hits=0,total=0;
        for(let j=1;j<16;j++){
          const a=j*Math.PI/32,x=r-r*Math.cos(a),y=r-r*Math.sin(a);
          let found=false;
          for(let d=-tolerance;d<=tolerance;d+=1)if(ink(ox+sx*(x+d*Math.cos(a)),oy+sy*(y+d*Math.sin(a)),color)){found=true;break;}
          // A solid block is not evidence of an outline arc.
          const outside=ink(ox+sx*(x-(tolerance+2)*Math.cos(a)),oy+sy*(y-(tolerance+2)*Math.sin(a)),color);
          hits+=found&&!outside?1:0;total++;
        }
        return hits/total;
      };
      let best={r:0,q:score(0)};
      const step=Math.max(1,limit/60);
      for(let r=step;r<=limit;r+=step){const q=score(r);if(q>best.q)best={r,q};}
      const center=best.r;
      for(let r=Math.max(0,center-step);r<=Math.min(limit,center+step);r+=.5){const q=score(r);if(q>best.q)best={r,q};}
      if(best.q>=.8)estimates.push(best.r);
    }
    // Occluded corners cannot dictate the radius. Require two agreeing corners.
    estimates.sort((a,b)=>a-b);
    let agreed=null;
    for(let i=1;i<estimates.length;i++)if(estimates[i]-estimates[i-1]<=Math.max(2,tolerance*2)){
      agreed=(estimates[i]+estimates[i-1])/2;break;
    }
    return agreed===null?n:{...n,radius:agreed};
  });
  nodes=nodes.map(n=>{
    // Only shallow, full-width top fills belong to this constraint. Icons,
    // connectors and deliberate overlays retain their original geometry/order.
    const original=n.containerFill||n;
    if(original.type!=='rect'||original.strokeWidth>0||!original.fill||original.fill==='none')return n;
    const parents=nodes.filter(p=>p.id!==n.id&&p.type==='rect'&&p.strokeWidth>0&&p.h>original.h*2&&p.w>=original.w*.95&&
      Math.abs(p.x-original.x)<=Math.max(4,p.strokeWidth*2)&&Math.abs(p.y-original.y)<=Math.max(4,p.strokeWidth*2)&&Math.abs(p.w-original.w)<=Math.max(8,p.strokeWidth*4));
    const parent=parents.sort((a,b)=>a.w*a.h-b.w*b.h)[0];if(!parent)return n;
    const inset=parent.strokeWidth/2,x=parent.x+inset,y=parent.y+inset,w=parent.w-2*inset,h=original.y+original.h-y;
    const r=Math.max(0,Math.min((parent.radius||0)-inset,w/2,h));
    // If the fill ends above the corner tangent, do not invent a clipped arc.
    if(h<=0||h<(parent.radius||0)-inset)return n;
    const k=.5522847498307936;
    const d=`M ${x+r} ${y} L ${x+w-r} ${y} C ${x+w-r+k*r} ${y} ${x+w} ${y+r-k*r} ${x+w} ${y+r} L ${x+w} ${y+h} L ${x} ${y+h} L ${x} ${y+r} C ${x} ${y+r-k*r} ${x+r-k*r} ${y} ${x+r} ${y} Z`;
    return {...n,type:'path',x,y,w,h,d,containerFill:{...original},containerId:parent.id};
  });
  return {...scene,nodes};
}
