import {repairContainerGeometry} from './container-geometry.mjs';
import {editableNodeBounds,planReconstructionTiles,registerMissingObjects} from './reconstruction-core.mjs';

// Recover broad, opaque heading strips from source color evidence. This is
// deliberately independent of the vision model's object inventory: a missing
// strip otherwise exposes the panel border through its title in PowerPoint.
// Source evidence is anchored to prominent model headings, so colored body
// boxes cannot accidentally become topmost opaque title plates.
export function repairStructuralLayers(scene,canvas){
  const W=canvas.width,H=canvas.height,ctx=canvas.getContext('2d',{willReadFrequently:true});
  const pixels=ctx.getImageData(0,0,W,H).data;
  const rgb=(x,y)=>{const i=(Math.round(y)*W+Math.round(x))*4;return [pixels[i],pixels[i+1],pixels[i+2]];};
  const colored=(x,y)=>{const c=rgb(x,y),mean=c.reduce((a,b)=>a+b,0)/3;return Math.min(...c)>110&&Math.max(...c)-Math.min(...c)>25&&mean>180&&mean<242;};
  const blue=(x,y)=>{const [r,g,b]=rgb(x,y);return r<110&&g-r>10&&b-r>30&&b<185;};
  // Invisible ownership rectangles are metadata, not visible panel frames.
  let nodes=scene.nodes.filter(n=>n.sourceDetail!=='heading-strip');
  // Identical overlapping text is a duplicate, not a second semantic label.
  // Keep distinct nearby labels (e.g. repeated chart ticks) intact.
  nodes=nodes.filter((n,i)=>n.type!=='text'||!nodes.slice(0,i).some(o=>{
    if(o.type!=='text'||String(o.text).trim()!==String(n.text).trim())return false;
    const overlap=Math.max(0,Math.min(o.x+o.w,n.x+n.w)-Math.max(o.x,n.x))*Math.max(0,Math.min(o.y+o.h,n.y+n.h)-Math.max(o.y,n.y));
    return overlap/Math.max(1,Math.max(o.w*o.h,n.w*n.h))>.8;
  }));
  nodes=nodes.filter((n,i)=>!(n.type==='rect'&&n.w>W*.13&&n.h>H*.12&&nodes.slice(0,i).some(o=>o.type==='rect'&&o.fill===n.fill&&o.stroke===n.stroke&&o.strokeWidth===n.strokeWidth&&JSON.stringify(o.gradient)===JSON.stringify(n.gradient)&&Math.abs(o.x-n.x)<4&&Math.abs(o.y-n.y)<4&&Math.abs(o.w-n.w)<7&&Math.abs(o.h-n.h)<7)));
  // Whole-image structure can contain transparent frame placeholders. Recover
  // their geometry only when all four source edges have blue pixel support.
  nodes=nodes.map(n=>{
    if(n.type!=='rect'||!n.stroke||n.stroke==='none'||n.w<W*.20||n.h<H*.15||(!/^(panel_|background_)/.test(String(n.id))&&n.owner!=='__structure'))return n;
    const vertical=(x)=>{let hits=0,total=0;for(let y=Math.max(0,n.y+n.h*.23);y<Math.min(H,n.y+n.h*.77);y+=2){total++;if(blue(x,y))hits++;}return hits/Math.max(1,total);};
    const horizontal=(y)=>{let hits=0,total=0;for(let x=Math.max(0,n.x+n.w*.04);x<Math.min(W,n.x+n.w*.96);x+=2){total++;if(blue(x,y))hits++;}return hits/Math.max(1,total);};
    // Prefer the nearest supported edge. Maximizing coverage can snap a top
    // edge to the preceding panel's bottom, which has no opaque title over it.
    const search=(center,range,limit,score,min)=>{let best=null;for(let v=Math.max(0,Math.round(center-range));v<Math.min(limit,center+range);v++){const q=score(v);if(q<min)continue;const distance=Math.abs(v-center);if(!best||distance<best.distance)best={v,q,distance};}return best;};
    const l=search(n.x,26,W,vertical,.6),r=search(n.x+n.w,26,W,vertical,.6);
    const t=search(n.y,Math.max(28,H*.045),H,horizontal,.035),b=search(n.y+n.h,26,H,horizontal,.6);
    if(!l||!r||!t||!b||r.v<=l.v||b.v<=t.v)return n;
    const c=rgb(l.v,Math.round(t.v+(b.v-t.v)*.5));
    return {...n,x:l.v,y:t.v,w:r.v-l.v,h:b.v-t.v,radius:n.radius||0,stroke:'#'+c.map(v=>v.toString(16).padStart(2,'0')).join(''),strokeWidth:Math.max(2,n.strokeWidth||0),sourceDetail:'panel-frame'};
  });
  // Regional workers sometimes invent a frame around a chart group. Test all
  // four edges, not just standalone line nodes. Only suppress a large regional
  // frame when at least three sides lack source evidence; retain its fill.
  nodes=nodes.map(n=>{
    if(n.type!=='rect'||!n.owner||n.owner==='__structure'||n.w<W*.15||n.h<H*.12||!/^#[\da-f]{6}$/i.test(n.stroke||''))return n;
    const color=n.stroke.slice(1).match(/../g).map(v=>parseInt(v,16));
    const chromatic=Math.max(...color)-Math.min(...color)>25;
    const edges=[[n.x,n.y,n.x+n.w,n.y],[n.x,n.y+n.h,n.x+n.w,n.y+n.h],[n.x,n.y,n.x,n.y+n.h],[n.x+n.w,n.y,n.x+n.w,n.y+n.h]];
    const support=edges.map(([x,y,x2,y2])=>{
      let hit=0,total=0;
      for(let t=.15;t<.85;t+=.01){const px=x+(x2-x)*t,py=y+(y2-y)*t;let found=false;
        if(px<0||py<0||px>=W||py>=H)continue;
        total++;
        for(let d=-5;d<=5;d++){const xx=px+(x===x2?d:0),yy=py+(y===y2?d:0);if(xx<0||yy<0||xx>=W||yy>=H)continue;
          const c=rgb(xx,yy);if(Math.max(...c.map((v,k)=>Math.abs(v-color[k])))<48&&(!chromatic||Math.max(...c)-Math.min(...c)>20)){found=true;break;}}
        if(found)hit++;
      }return hit/Math.max(1,total);
    });
    return support.filter(v=>v<.2).length>=3?{...n,stroke:'none',strokeWidth:0}:n;
  });
  const overlays=[];
  const headings=nodes.filter(n=>n.type==='text'&&n.fontSize>=Math.max(22,H*.024));
  headings.forEach((heading,i)=>{
    const fs=heading.fontSize,margin=Math.max(24,fs*1.5,heading.w*.35),rows=[];
    const left=Math.max(0,Math.floor(heading.x-margin)),right=Math.min(W,Math.ceil(heading.x+heading.w+margin));
    for(let y=Math.max(0,Math.floor(heading.y-fs*.65));y<Math.min(H,heading.y+Math.max(heading.h,fs)+fs*.4);y++){
      let start=-1,last=-1,gap=0;
      const save=()=>{if(start>=0&&last-start>=heading.w*.72&&start<=heading.x+heading.w*.25&&last>=heading.x+heading.w*.75)rows.push({x:start,right:last+1,y});};
      for(let x=left;x<=right;x++){
        if(x<right&&colored(x,y)){if(start<0)start=x;last=x;gap=0;}
        else if(start>=0&&++gap>Math.max(16,fs*1.25)){save();start=-1;last=-1;gap=0;}
      }
      save();
    }
    // A true strip surrounds the heading. A body box or a few colored pixels
    // below the letters cannot satisfy this height and center test.
    if(!rows.length)return;
    const groups=[];for(const row of rows){const g=groups.at(-1);if(g&&row.y-g.at(-1).y<=2)g.push(row);else groups.push([row]);}
    const group=groups.filter(g=>g.length>=fs*.9&&g[0].y<=heading.y+fs*.25&&g.at(-1).y>=heading.y+fs*.65).sort((a,b)=>b.length-a.length)[0];
    if(!group)return;
    const middle=group.slice(Math.floor(group.length*.2),Math.ceil(group.length*.8));
    const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
    const x=median(middle.map(r=>r.x)),end=median(middle.map(r=>r.right)),y=group[0].y,h=group.at(-1).y-y+1;
    if(end-x<W*.17||(end-x)/h<4)return;
    const c=rgb(x+(end-x)*.15,y+h*.2);
    const plate={id:`source_heading_${i}`,type:'rect',x,y,w:end-x,h,radius:h/2,fill:'#'+c.map(v=>v.toString(16).padStart(2,'0')).join(''),stroke:'none',strokeWidth:0,sourceDetail:'heading-strip',owner:'__structure',version:0};
    // Replace the model's old plate; otherwise offset, duplicated plates survive.
    nodes=nodes.filter(n=>{
      if(n.id===heading.id)return false;
      if(n.type!=='rect'||n.h>fs*2.3||n.w<heading.w*.65)return true;
      const intersection=Math.max(0,Math.min(n.x+n.w,end)-Math.max(n.x,x))*Math.max(0,Math.min(n.y+n.h,y+h)-Math.max(n.y,y));
      return intersection/Math.max(1,Math.min(n.w*n.h,plate.w*plate.h))<.65;
    });
    overlays.push(plate,heading);
  });
  return repairContainerGeometry(fitSourceFills({...scene,nodes:[...nodes,...overlays]},canvas,new Set(overlays.filter(n=>n.type==='rect').map(n=>n.id))),canvas);
}

// A nearby glyph is not evidence for a connector. Match its actual ink color
// along the segment, including cached objects (old errors must not be immune).
export function rejectUnsupportedLines(scene,canvas){
  const {width:W,height:H}=canvas;
  const pixels=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
  return {...scene,nodes:scene.nodes.filter(n=>{
    const stroke=n.stroke||'#111111';
    if(n.type!=='line'||!/^#[\da-f]{6}$/i.test(stroke))return true;
    const dx=n.x2-n.x,dy=n.y2-n.y,length=Math.hypot(dx,dy);
    if(!Number.isFinite(length)||length<Math.max(120,W*.10))return true;
    const color=stroke.slice(1).match(/../g).map(v=>parseInt(v,16));
    const chromatic=Math.max(...color)-Math.min(...color)>25;
    const radius=Math.min(5,Math.max(2,Math.ceil((n.strokeWidth||1)/2)+1));
    let support=0,valid=0;
    const count=Math.min(500,Math.ceil(length/2));
    for(let i=0;i<count;i++){
      const t=(i+.5)/count,x=Math.round(n.x+dx*t),y=Math.round(n.y+dy*t);
      if(x<radius||y<radius||x>=W-radius||y>=H-radius)continue;
      valid++;let found=false;
      // Search only perpendicular to the line, never forward into a glyph.
      for(let d=-radius;d<=radius;d++){
        const px=Math.round(x-d*dy/length),py=Math.round(y+d*dx/length),at=(py*W+px)*4;
        const rgb=[pixels[at],pixels[at+1],pixels[at+2]];
        if(Math.max(...rgb.map((v,k)=>Math.abs(v-color[k])))>(chromatic?48:110))continue;
        if(chromatic&&Math.max(...rgb)-Math.min(...rgb)<20)continue;
        if(!chromatic&&(Math.max(...rgb)-Math.min(...rgb)>28||Math.max(...rgb)>=180))continue;
        found=true;break;
      }
      if(found)support++;
    }
    return valid<20||support/valid>=(n.dash?.18:.70);
  })};
}

// Preserve unreadable miniature printing as measured editable vector ink,
// never as invented words or an embedded source bitmap. Only dense repeated
// rows inside small light paper-like rectangles qualify. Later filled shapes
// mask occluded sheets, and existing text/ink is left alone.
export function recoverDocumentInk(scene,canvas){
  // Derived ink follows its parent after moves, resizing or deletion. Rebuild
  // it from the source instead of retaining stale paths from a prior patch.
  scene={...scene,nodes:scene.nodes.filter(n=>n.sourceDetail!=='untranscribed-ink')};
  const {width:W,height:H}=canvas;
  const pixels=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
  const inside=(b,x,y)=>b&&x>=b.x&&y>=b.y&&x<=b.right&&y<=b.bottom;
  const boxes=scene.nodes.map(editableNodeBounds),out=[],replacedInk=new Set();
  scene.nodes.forEach((n,index)=>{
    out.push(n);
    if(n.type!=='rect'||n.radius>Math.min(20,n.w*.15)||n.w<40||n.w>W*.085||n.h<n.w*.8||n.h>H*.24||
      !/^#[\da-f]{6}$/i.test(n.fill||'')||Math.min(...n.fill.slice(1).match(/../g).map(v=>parseInt(v,16)))<210)return;
    const inset=Math.max(5,Math.ceil((n.strokeWidth||1)*2));
    const x0=Math.max(0,Math.ceil(n.x+inset)),x1=Math.min(W,Math.floor(n.x+n.w-inset));
    const y0=Math.max(0,Math.ceil(n.y+inset)),y1=Math.min(H,Math.floor(n.y+n.h-inset));
    // Model-generated miniature horizontal rules must be replaced, not painted
    // over with source ink. Otherwise the two layers darken the same paper.
    const miniature=scene.nodes.filter(v=>{
      if(v.type==='text'&&Number(v.fontSize)<=8&&
        /^[\s▪■□▫·.\-–—_]+$/u.test(v.text||'')&&(v.text||'').length>=20){
        // Placeholder glyphs are not transcription. Their declared text box
        // can extend below a sheet, so identify them by their inset origin.
        return v.x>=x0&&v.x<x1&&v.y>=y0&&v.y<y1;
      }
      return v.type==='line'&&!v.arrow&&!v.dash&&
        Math.abs(v.y2-v.y)<=1&&Math.abs(v.x2-v.x)>=3&&
        Math.min(v.x,v.x2)>=x0&&Math.max(v.x,v.x2)<=x1&&v.y>=y0&&v.y<y1&&
        (v.strokeWidth||1)<=2;
    });
    const miniatureIds=new Set(miniature.map(v=>v.id));
    const blockers=scene.nodes.map((v,i)=>({v,b:boxes[i],i})).filter(({v,b,i})=>i>index&&b&&
      !miniatureIds.has(v.id)&&
      b.x<x1&&b.right>x0&&b.y<y1&&b.bottom>y0&&
      ((v.fill&&v.fill!=='none')||['text','line','path','polyline'].includes(v.type)));
    const runs=[];let rows=0,ink=0,visible=0;
    for(let y=y0;y<y1;y++){
      let start=-1,rowInk=0,grayTotal=0;
      for(let x=x0;x<=x1;x++){
        const blocked=blockers.some(({b})=>inside(b,x,y));
        const at=(y*W+x)*4,r=pixels[at],g=pixels[at+1],b=pixels[at+2];
        const dark=x<x1&&!blocked&&Math.max(r,g,b)-Math.min(r,g,b)<28&&r*.299+g*.587+b*.114<180;
        if(x<x1&&!blocked)visible++;
        if(dark){if(start<0)start=x;rowInk++;ink++;grayTotal+=(r+g+b)/3;}
        else if(start>=0){runs.push([start,y,x-start,Math.round(grayTotal/(x-start)/20)*20]);start=-1;grayTotal=0;}
      }
      if(rowInk>=Math.min(12,n.w*.12))rows++;
    }
    if(rows<12||visible<300||ink/visible<.012||ink/visible>.38)return;
    // A single narrow vertical stroke is not miniature document printing.
    if(runs.filter(r=>r[2]>=3).length<20)return;
    miniatureIds.forEach(id=>replacedInk.add(id));
    const shades=[...new Set(runs.map(r=>r[3]))];
    shades.forEach((shade,i)=>{
      const d=runs.filter(r=>r[3]===shade).map(([x,y,w])=>`M${x} ${y}h${w}v1h-${w}Z`).join(' ');
      out.push({id:`${n.id}_source_ink${i?'_shade_'+shade:''}`,owner:n.owner,version:0,type:'path',x:n.x,y:n.y,w:n.w,h:n.h,
        d,fill:'#'+shade.toString(16).padStart(2,'0').repeat(3),stroke:'none',strokeWidth:0,sourceDetail:'untranscribed-ink'});
    });
  });
  return {...scene,nodes:out.filter(n=>!replacedInk.has(n.id))};
}

// Semantic regions are supplied by the structure pass. Dense charts/tables must
// be independent leaves; the fallback keeps older cached scenes usable.
export function planSemanticRegions(scene,width,height){
  // Cross-panel connectors belong to the global structure catalog. Their large
  // bounding box must never become a worker that reconstructs overlapping panels.
  const regions=(scene.regions||[]).filter(r=>!/^connectors?$/i.test(String(r.kind||''))&&Number.isFinite(r.x)&&Number.isFinite(r.y)&&r.w>0&&r.h>0);
  const leaves=regions.filter(r=>!regions.some(c=>c.parentId===r.id));
  // A child covers only its own rectangle. Preserve the rest of its parent so
  // a chart subdivision cannot silently discard the panel's labels or arrows.
  const residuals=[];
  for(const parent of regions){
    const children=regions.filter(c=>c.parentId===parent.id);
    if(!children.length)continue;
    let pieces=[{x:parent.x,y:parent.y,w:parent.w,h:parent.h}];
    for(const child of children)pieces=pieces.flatMap(p=>{
      const l=Math.max(p.x,child.x),t=Math.max(p.y,child.y);
      const r=Math.min(p.x+p.w,child.x+child.w),b=Math.min(p.y+p.h,child.y+child.h);
      if(l>=r||t>=b)return [p];
      return [{x:p.x,y:p.y,w:p.w,h:t-p.y},{x:p.x,y:b,w:p.w,h:p.y+p.h-b},
        {x:p.x,y:t,w:l-p.x,h:b-t},{x:r,y:t,w:p.x+p.w-r,h:b-t}].filter(v=>v.w>0&&v.h>0);
    });
    if(pieces.length)residuals.push({...parent,id:`${parent.id}_remaining`,parentId:parent.id,excludeRects:children.map(({x,y,w,h})=>({x,y,w,h}))});
  }
  const tiles=leaves.length?[...leaves,...residuals]:planReconstructionTiles(width,height,650,32);
  return tiles.map((r,i)=>{
    const x=Math.max(0,Math.floor(r.x)),y=Math.max(0,Math.floor(r.y));
    const right=Math.min(width,Math.ceil(r.x+r.w)),bottom=Math.min(height,Math.ceil(r.y+r.h));
    return {...r,id:r.id||`region_${i}`,index:i,x:Math.max(0,x-24),y:Math.max(0,y-24),
      w:Math.min(width,right+24)-Math.max(0,x-24),h:Math.min(height,bottom+24)-Math.max(0,y-24),
      coreX:x,coreY:y,coreRight:right,coreBottom:bottom};
  });
}
// A semantic panel is a layout unit, not a sufficient recognition resolution.
// Preserve the panel pass, then inspect native-resolution crops with disjoint
// ownership cores and overlap for labels crossing a crop boundary.
export function planDetailRegions(regions,width,height,maxCore=900,padding=128){
  const result=[];
  for(const r of regions){
    const left=r.coreX??r.x,top=r.coreY??r.y,right=r.coreRight??r.x+r.w,bottom=r.coreBottom??r.y+r.h;
    const cols=Math.ceil((right-left)/maxCore),rows=Math.ceil((bottom-top)/maxCore);
    if(cols===1&&rows===1)continue;
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
      const coreX=Math.floor(left+(right-left)*col/cols),coreY=Math.floor(top+(bottom-top)*row/rows);
      const coreRight=Math.floor(left+(right-left)*(col+1)/cols),coreBottom=Math.floor(top+(bottom-top)*(row+1)/rows);
      const x=Math.max(0,coreX-padding),y=Math.max(0,coreY-padding);
      result.push({...r,id:`${r.id}_detail_${row}_${col}`,parentRegionId:r.id,editableOwners:[r.id],detailPass:true,
        index:result.length,x,y,w:Math.min(width,coreRight+padding)-x,h:Math.min(height,coreBottom+padding)-y,
        coreX,coreY,coreRight,coreBottom});
    }
  }
  return result;
}
const ownsRegionNode=(region,n)=>!n.owner||n.owner===region.id||(region.editableOwners||[]).includes(n.owner);
export const objectVersion=n=>Number(n.version)||0;
export function snapshotVersions(scene){return Object.fromEntries(scene.nodes.map(n=>[n.id,objectVersion(n)]));}
// Roll back only objects owned by rejected regions, including deletes/splits.
// Restore deleted objects beside their original surviving neighbour for z order.
export function rollbackRegionChanges(original,candidate,regionIds){
  const rejected=new Set(regionIds),old=new Map(original.nodes.map(n=>[n.id,n]));
  const restored=new Set();
  const nodes=candidate.nodes.flatMap(n=>{
    const prior=old.get(n.id);
    if(rejected.has(n.owner)||rejected.has(prior?.owner)){
      if(prior){restored.add(prior.id);return [prior];}return [];
    }
    return [n];
  });
  const present=new Set(nodes.map(n=>n.id));
  original.nodes.forEach((n,i)=>{
    if(!rejected.has(n.owner)||present.has(n.id)||restored.has(n.id))return;
    const next=original.nodes.slice(i+1).find(v=>present.has(v.id));
    const at=next?nodes.findIndex(v=>v.id===next.id):nodes.length;
    nodes.splice(at,0,n);present.add(n.id);
  });
  return {...candidate,nodes};
}
// Ownership uses declared geometry, not the conservative text audit padding.
function patchBounds(n){return editableNodeBounds(n?.type==='text'?{...n,type:'rect',textPath:null}:n);}
function patchCatalog(scene,region){
  return scene.nodes.filter(n=>{const b=patchBounds(n);return b&&b.x>=region.x-1&&b.y>=region.y-1&&b.right<=region.x+region.w+1&&b.bottom<=region.y+region.h+1;});
}
const excluded=(r,x,y)=>(r.excludeRects||[]).some(b=>x>=b.x&&y>=b.y&&x<b.x+b.w&&y<b.y+b.h);
export function regionObjectCatalog(scene,region){
  const owned=patchCatalog(scene,region).filter(n=>{const b=patchBounds(n),cx=(b.x+b.right)/2,cy=(b.y+b.bottom)/2;return !excluded(region,cx,cy)&&ownsRegionNode(region,n)&&cx>=(region.coreX??region.x)&&cy>=(region.coreY??region.y)&&cx<(region.coreRight??region.x+region.w)&&cy<(region.coreBottom??region.y+region.h);});
  const ids=new Set(owned.map(n=>n.id));
  return {canvas:{width:region.w,height:region.h},nodes:owned.map(n=>translateNode(n,-region.x,-region.y)),readOnlyContext:scene.nodes.filter(n=>{const b=patchBounds(n);return !ids.has(n.id)&&b&&b.x<region.x+region.w&&b.right>region.x&&b.y<region.y+region.h&&b.bottom>region.y;}).map(n=>translateNode(n,-region.x,-region.y)),excludeRects:(region.excludeRects||[]).map(b=>({...b,x:b.x-region.x,y:b.y-region.y}))};
}

// Operations are atomic: a stale or out-of-region operation cannot partially
// delete a table before its replacement has passed ownership validation.
export function applyRegionPatch(scene,region,patch,versions){
  let nodes=scene.nodes.slice();const conflicts=[],rejected=[],ignored=[];
  const owns=n=>{const b=patchBounds(n);if(!b)return false;const cx=(b.x+b.right)/2,cy=(b.y+b.bottom)/2;
    return !excluded(region,cx,cy)&&ownsRegionNode(region,n)&&cx>=(region.coreX??region.x)&&cy>=(region.coreY??region.y)&&cx<(region.coreRight??region.x+region.w)&&cy<(region.coreBottom??region.y+region.h);};
  const allowed=new Set(patchCatalog(scene,region).filter(owns).map(n=>n.id));
  const inside=n=>{const b=patchBounds(n);return b&&b.x>=region.x-1&&b.y>=region.y-1&&b.right<=region.x+region.w+1&&b.bottom<=region.y+region.h+1;};
  const global=n=>{
    if(!patchBounds(n))return null;
    const translated={...n};
    // Reuse the core affine transform for paths and all geometry.
    return translateNode(translated,region.x,region.y);
  };
  for(const op of patch.operations||[]){
    if(!op||typeof op!=='object'){rejected.push({reason:'operation'});continue;}
    const ids=op.ids|| (op.id?[op.id]:[]);
    if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length){rejected.push({reason:'ids'});continue;}
    const originals=ids.map(id=>nodes.find(n=>n.id===id));
    if(ids.some((id,i)=>!allowed.has(id)||!originals[i])){rejected.push({op,reason:'ownership'});continue;}
    if(ids.some((id,i)=>versions[id]!==objectVersion(originals[i]) || (op.version!=null&&op.version!==objectVersion(originals[i])))){
      conflicts.push({ids,reason:'stale-version'});continue;
    }
    if(!['add','update','delete','split','merge'].includes(op.op)){rejected.push({op,reason:'operation'});continue;}
    if(op.op==='add'&&ids.length || ['update','delete','split'].includes(op.op)&&ids.length!==1 || op.op==='merge'&&ids.length<2){rejected.push({op,reason:'arity'});continue;}
    const sources=op.op==='delete'?[]:Array.isArray(op.nodes)?op.nodes:[op.node];
    const replacements=sources.filter(Boolean).map(global);
    if((op.op!=='delete'&&!replacements.length)||(op.op==='update'&&replacements.length!==1)||(op.op==='split'&&replacements.length<2)||(op.op==='merge'&&replacements.length!==1)||replacements.some(n=>!n||!inside(n)||!owns({...n,owner:region.id}))){
      const independent=op.op==='add'&&(patch.operations||[]).every(o=>o.op==='add');
      (independent?ignored:rejected).push({op,reason:'bounds-or-arity'});continue;
    }
    const insertion=ids.length?Math.min(...ids.map(id=>nodes.findIndex(n=>n.id===id))):nodes.length;
    if(op.op==='add'){
      // Repeated existing details are idempotent no-ops. They must not cancel
      // unrelated valid additions in the same model response.
      for(let i=replacements.length-1;i>=0;i--)if(isDuplicate(nodes,replacements[i])){ignored.push({reason:'duplicate'});replacements.splice(i,1);}
      if(!replacements.length)continue;
    }
    nodes=nodes.filter(n=>!ids.includes(n.id));
    const additions=replacements.map((n,i)=>{
      let id=op.op==='update'?ids[0]:`${region.id||region.index}_v${scene.revision||0}_${insertion}_${i}`;
      while(nodes.some(o=>o.id===id))id+='_';
      return {...n,id,owner:region.id,version:op.op==='update'?objectVersion(originals[0])+1:0};
    });
    nodes.splice(insertion,0,...additions);
  }
  return {scene:{...scene,nodes:conflicts.length||rejected.length?scene.nodes:nodes,revision:(scene.revision||0)+1},conflicts,rejected,ignored};
}
function isDuplicate(nodes,n){
  if(['line','path','polyline'].includes(n.type)){
    const geometry=o=>o.type==='line'?[o.x,o.y,o.x2,o.y2]:String(o.d||o.points||'').match(/[-+]?\d*\.?\d+/g)?.map(Number);
    const a=geometry(n);return nodes.some(o=>{if(n.type==='path'&&String(o.d).replace(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi,'')!==String(n.d).replace(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi,''))return false;if(o.type!==n.type||o.stroke!==n.stroke||!!o.arrow!==!!n.arrow)return false;const b=geometry(o);return a&&b&&a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<=.75);});
  }
  return registerMissingObjects({nodes},{nodes:[n]}).nodes.length===nodes.length;
}
import {transformEditablePath,parseEditablePath} from './editable-native.mjs';
function translateNode(n,dx,dy){
  const out={...n};
  for(const k of ['x','x2'])if(Number.isFinite(n[k]))out[k]+=dx;
  for(const k of ['y','y2'])if(Number.isFinite(n[k]))out[k]+=dy;
  if(n.d)out.d=transformEditablePath(n.d,1,1,dx,dy);
  if(n.textPath?.d)out.textPath={...n.textPath,d:transformEditablePath(n.textPath.d,1,1,dx,dy)};
  if(n.cellBounds)out.cellBounds={...n.cellBounds,x:n.cellBounds.x+dx,y:n.cellBounds.y+dy};
  if(n.points)out.points=String(n.points).match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map((v,i)=>Number(v)+(i%2?dy:dx)).join(' ');
  return out;
}

// Color estimation excludes borders and dark text. A robust median resists
// small icon strokes; gradients are kept when the model identifies them.
export function fitSourceFills(scene,canvas,changedIds){
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const nodes=scene.nodes.map(n=>{
    if(changedIds&&!changedIds.has(n.id))return n;
    if(!['rect','ellipse'].includes(n.type)||!/^#[\da-f]{6}$/i.test(n.fill||''))return n;
    if(n.w<12||n.h<12)return n;
    const colors=[[],[],[]],samples=[];
    for(let iy=0;iy<=6;iy++)for(let ix=0;ix<=6;ix++){
      const x=Math.round(n.x+n.w*(.15+ix*.7/6)),y=Math.round(n.y+n.h*(.15+iy*.7/6));
      if(x<0||y<0||x>=canvas.width||y>=canvas.height)continue;
      const p=ctx.getImageData(x,y,1,1).data;
      if(Math.max(...p.slice(0,3))-Math.min(...p.slice(0,3))<15&&p[0]<120)continue;
      samples.push({u:(x-n.x)/n.w,v:(y-n.y)/n.h,color:Array.from(p.slice(0,3))});
      p.slice(0,3).forEach((v,i)=>colors[i].push(v));
    }
    if(colors[0].length<12)return n;
    const median=colors.map(c=>c.sort((a,b)=>a-b)[Math.floor(c.length/2)]);
    // Never recolor an object from unrelated background pixels.
    const expected=n.fill.match(/[\da-f]{2}/gi).map(v=>parseInt(v,16));
    if(median.some((v,i)=>Math.abs(v-expected[i])>45))return n;
    const hex=c=>'#'+c.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('');
    // Fit only a clean, one-axis linear ramp. Text or multiple colored objects
    // raise the residual and keep the robust flat fill instead.
    let best=null;
    for(const axis of ['u','v']){
      const mean=samples.reduce((s,p)=>s+p[axis],0)/samples.length;
      const means=[0,1,2].map(i=>samples.reduce((s,p)=>s+p.color[i],0)/samples.length);
      const variance=samples.reduce((s,p)=>s+(p[axis]-mean)**2,0);
      if(variance<.01)continue;
      const slope=means.map((m,i)=>samples.reduce((s,p)=>s+(p[axis]-mean)*(p.color[i]-m),0)/variance);
      const start=means.map((m,i)=>m-slope[i]*mean),end=start.map((v,i)=>v+slope[i]);
      const error=Math.sqrt(samples.reduce((s,p)=>s+p.color.reduce((s,c,i)=>s+(c-start[i]-slope[i]*p[axis])**2,0),0)/(3*samples.length));
      if(error<2.5&&Math.max(...slope.map(Math.abs))>6&&(!best||error<best.error))best={error,angle:axis==='u'?0:90,start,end};
    }
    return {...n,fill:hex(median),...(best?{gradient:{angle:best.angle,stops:[{offset:0,color:hex(best.start)},{offset:1,color:hex(best.end)}]}}:{})};
  });
  return {...scene,nodes};
}

// Bounded coordinate descent against source border pixels. Only confident
// rectangular outlines participate; text and neighboring fills cannot pull a
// low-confidence shape away from its recognized position.
export function calibrateShapeGeometry(scene,canvas,changedIds,region){
  const pixels=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height).data;
  let budget=64;
  return {...scene,nodes:scene.nodes.map(n=>{
    if(budget<=0||(changedIds&&!changedIds.has(n.id))||n.type!=='rect'||n.rotation||n.w<20||n.h<20||!/^#[\da-f]{6}$/i.test(n.stroke||'')||!(n.strokeWidth>=.5))return n;
    budget--;
    const color=n.stroke.slice(1).match(/../g).map(v=>parseInt(v,16));
    const score=b=>{
      let hits=0,total=0;
      for(let i=0;i<24;i++){
        const t=.18+i*.64/23;
        for(const [x,y] of [[b.x+b.w*t,b.y],[b.x+b.w*t,b.y+b.h],[b.x,b.y+b.h*t],[b.x+b.w,b.y+b.h*t]]){
          const px=Math.round(x),py=Math.round(y);total++;
          if(px<0||py<0||px>=canvas.width||py>=canvas.height)continue;
          const p=(py*canvas.width+px)*4;
          if(color.reduce((s,c,j)=>s+Math.abs(c-pixels[p+j]),0)<100)hits++;
        }
      }
      return hits/total;
    };
    let best={...n},value=score(n);const initial=value;
    for(let pass=0;pass<2;pass++)for(const key of ['x','y','w','h']){
      let next=best,nextValue=value;
      for(const delta of [-4,-2,-1,1,2,4]){
        const test={...best,[key]:best[key]+delta};
        if(Math.abs(test[key]-n[key])>4||test.w<20||test.h<20)continue;
        if(region&&(test.x<region.x||test.y<region.y||test.x+test.w>region.x+region.w||test.y+test.h>region.y+region.h))continue;
        if(region&&(test.x+test.w/2<region.coreX||test.y+test.h/2<region.coreY||test.x+test.w/2>=region.coreRight||test.y+test.h/2>=region.coreBottom))continue;
        const candidate=score(test);
        if(candidate>nextValue+.015){next=test;nextValue=candidate;}
      }
      best=next;value=nextValue;
    }
    return value>=.8&&value>initial+.12?best:n;
  })};
}

// Structured dense content expands to ordinary editable primitives before export.
export function expandStructuredNodes(nodes){
  return nodes.filter(n=>n&&typeof n==='object').flatMap(n=>{
    if(n.arrow&&Number.isFinite(n.arrowLength)&&n.arrowLength>0&&Number.isFinite(n.arrowWidth)&&n.arrowWidth>0){
      let end,previous;
      if(n.type==='line'){end={x:n.x2,y:n.y2};previous={x:n.x,y:n.y};}
      if(n.type==='polyline'){
        const p=String(n.points||'').match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number)||[];
        if(p.length>=4){end={x:p.at(-2),y:p.at(-1)};previous={x:p.at(-4),y:p.at(-3)};}
      }
      if(n.type==='path'){
        const p=parseEditablePath(n.d).at(-1),c=p?.commands.at(-1);
        if(c){end=c.end;previous=c.c2||p.commands.at(-2)?.end||p.start;}
      }
      if(end&&previous){
        const length=Math.hypot(end.x-previous.x,end.y-previous.y);
        if(length>0){
          const ux=(end.x-previous.x)/length,uy=(end.y-previous.y)/length;
          const bx=end.x-ux*n.arrowLength,by=end.y-uy*n.arrowLength,half=n.arrowWidth/2;
          return [{...n,arrow:false},{type:'path',d:`M${end.x} ${end.y}L${bx-uy*half} ${by+ux*half}L${bx+uy*half} ${by-ux*half}Z`,fill:n.stroke||'#000000',stroke:'none',strokeWidth:0}];
        }
      }
    }
    if(n.type==='table'&&Array.isArray(n.rows)&&Array.isArray(n.columns)){
      if(!Number.isFinite(n.x)||!Number.isFinite(n.y)||!n.rows.length||!n.columns.length||[...n.rows,...n.columns].some(v=>!Number.isFinite(v)||v<=0))return [];
      const xs=[n.x],ys=[n.y];n.columns.forEach(w=>xs.push(xs.at(-1)+w));n.rows.forEach(h=>ys.push(ys.at(-1)+h));
      const out=[];
      const sparseBorders=n.borders==='horizontal'||n.borders==='none';
      for(let r=0;r<n.rows.length;r++)for(let c=0;c<n.columns.length;c++){
        const cell=n.cells?.[r]?.[c],v=cell&&typeof cell==='object'?cell:{text:String(cell??'')};
        out.push({type:'rect',x:xs[c],y:ys[r],w:n.columns[c],h:n.rows[r],fill:v.fill||n.fill||'none',stroke:sparseBorders?'none':n.stroke||'#333333',strokeWidth:sparseBorders?0:n.strokeWidth??1});
        if(v.text)out.push({type:'text',x:xs[c]+3,y:ys[r]+2,w:Math.max(1,n.columns[c]-6),h:Math.max(1,n.rows[r]-4),text:String(v.text),fontSize:v.fontSize||n.fontSize||12,fontFamily:v.fontFamily||n.fontFamily||'Arial',bold:!!v.bold,fill:v.color||'#000000',cellBounds:{x:xs[c],y:ys[r],w:n.columns[c],h:n.rows[r]}});
      }
      if(n.borders==='horizontal'){
        const boundaries=Array.isArray(n.rowLines)?n.rowLines:ys.map((_,i)=>i);
        for(const r of new Set(boundaries))if(Number.isInteger(r)&&r>=0&&r<ys.length)
          out.push({type:'line',x:xs[0],y:ys[r],x2:xs.at(-1),y2:ys[r],stroke:n.stroke||'#333333',strokeWidth:n.strokeWidth??1});
      }
      return out;
    }
    if(n.type==='heatmap'&&Array.isArray(n.colors)&&n.colors.length){
      const rows=n.colors.length,cols=n.colors[0]?.length;
      if(!cols||n.colors.some(row=>!Array.isArray(row)||row.length!==cols))return [];
      return n.colors.flatMap((row,r)=>row.map((fill,c)=>({type:'rect',x:n.x+c*n.w/cols,y:n.y+r*n.h/rows,w:n.w/cols,h:n.h/rows,fill,stroke:'none',strokeWidth:0})));
    }
    if(n.type==='bars'&&Array.isArray(n.values)){
      if(!n.values.length||n.values.some(v=>!Number.isFinite(v)||v<0))return [];
      const max=Math.max(1e-9,n.max||Math.max(...n.values)),gap=Math.max(0,Math.min(.9,n.gap??.2)),step=n.w/n.values.length;
      return n.values.map((v,i)=>({type:'rect',x:n.x+i*step+step*gap/2,y:n.y+n.h*(1-v/max),w:step*(1-gap),h:n.h*v/max,fill:n.colors?.[i]||n.fill||'#88aacc',stroke:n.stroke||'none',strokeWidth:n.strokeWidth??1}));
    }
    return [n];
  });
}
