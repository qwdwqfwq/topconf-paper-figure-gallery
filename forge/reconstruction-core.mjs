// Pure geometry helpers shared by the browser reconstruction flow and tests.
import {geometrySegments,transformEditablePath} from './editable-native.mjs';
// Use the same targets for deciding whether to repair and for final review.
// The former low thresholds stopped corrections while obvious errors remained.
const QUALITY_TARGETS={score:.98,darkRecall:.98,localRecall:.97,
  edgeF1:.97,colorSimilarity:.98};
export function reconstructionQualityDeficit(qa){
  if(!qa) return Infinity;
  let deficit=0;
  for(const [key,target] of Object.entries(QUALITY_TARGETS)){
    const value=Number(qa[key]);
    if(!Number.isFinite(value)) return Infinity;
    deficit+=Math.max(0,(target-value)/target);
  }
  return deficit;
}
export function acceptReconstructionRepair(before,after){
  if(!before||!after) return false;
  // A higher average can conceal damage to small labels or thin strokes.
  const maximumLoss={score:.001,darkRecall:0,localRecall:0,
    edgeF1:.001,colorSimilarity:.001};
  for(const key of Object.keys(QUALITY_TARGETS)){
    if(!Number.isFinite(Number(after[key])) ||
      Number(after[key])+maximumLoss[key]<Number(before[key])) return false;
  }
  // A single chart tick or fine line may move a crop score by less than .005.
  return reconstructionQualityDeficit(after)<reconstructionQualityDeficit(before)-.0005;
}
export function editableNodeBounds(n){
  if(!n||typeof n!=='object')return null;
  let coordinates=[];
  if(n.type==='text'&&n.textPath?.d)return editableNodeBounds({type:'path',d:n.textPath.d});
  if(['path','polyline','line'].includes(n.type))
    coordinates=geometrySegments(n).flatMap(segment=>segment.points);
  else {
    const x=Number(n.x),y=Number(n.y),w=Number(n.w??n.width??0),h=Number(n.h??n.height??0);
    if([x,y,w,h].every(Number.isFinite)){
      const pad=n.type==='text'?Math.max(2,Number(n.fontSize||16)*.25):0;
      coordinates=[{x:x-pad,y:y-pad},{x:x+w+pad,y:y+h+pad}];
    }
  }
  if(!coordinates.length)return null;
  const xs=coordinates.map(p=>p.x),ys=coordinates.map(p=>p.y);
  const bounds={x:Math.min(...xs),y:Math.min(...ys),
    right:Math.max(...xs),bottom:Math.max(...ys)};
  return Object.values(bounds).every(Number.isFinite)?bounds:null;
}
export function planObjectRepairRegion(weak,scene,width,height){
  if(!weak)return null;
  const seed={x:Math.max(0,weak.x),y:Math.max(0,weak.y),
    right:Math.min(width,weak.x+weak.w),bottom:Math.min(height,weak.y+weak.h)};
  let box={...seed};
  const nodes=(scene.nodes||[]).map(n=>({n,b:editableNodeBounds(n)})).filter(v=>v.b);
  const intersects=(a,b)=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;
  // Grow through complete small objects so the model never receives half an
  // icon or half a compact chart. Large panels remain as background context.
  for(let pass=0;pass<3;pass++){
    for(const {b} of nodes){
      if(!intersects(box,b)||b.right-b.x>width*.38||b.bottom-b.y>height*.38)continue;
      const proposed={x:Math.min(box.x,b.x),y:Math.min(box.y,b.y),
        right:Math.max(box.right,b.right),bottom:Math.max(box.bottom,b.bottom)};
      if(proposed.right-proposed.x<=Math.min(width,900)&&
        proposed.bottom-proposed.y<=Math.min(height,900))box=proposed;
    }
  }
  const margin=Math.max(16,Math.min(45,Math.max(seed.right-seed.x,seed.bottom-seed.y)*.12));
  const x=Math.max(0,Math.floor(box.x-margin)),y=Math.max(0,Math.floor(box.y-margin));
  const right=Math.min(width,Math.ceil(box.right+margin));
  const bottom=Math.min(height,Math.ceil(box.bottom+margin));
  return {x,y,w:right-x,h:bottom-y};
}
// Give the first pass stable IDs; later passes may register missed objects.
export function createWholeImageCatalog(scene){
  const nodes=(scene.nodes||[]).map(n=>({...n}));
  const deduplicatedText=deduplicateText(nodes);
  const ids=new Set();nodes.forEach((n,i)=>{if(!n.id||ids.has(n.id)){n.id=`whole_${i+1}`;while(ids.has(n.id))n.id+='_';}ids.add(n.id);n.version=Number(n.version)||0;});
  return {...scene,nodes,counts:{...scene.counts,total:nodes.length,
    text:nodes.filter(n=>n.type==='text').length,deduplicatedText}};
}
// Register genuinely new objects from whole-image or regional inspections.
export function registerMissingObjects(scene,proposals){
  const nodes=scene.nodes.map(n=>({...n}));let added=0;
  for(const source of proposals.nodes||[]){
    const b=editableNodeBounds(source);if(!b)continue;
    if(nodes.some(n=>{
      if(n.type!==source.type)return false;
      if(n.type==='text'&&String(n.text).replace(/\s/g,'')!==String(source.text).replace(/\s/g,''))return false;
      if(n.type==='line'&&sameLinearEntity(n,source))return true;
      // Shared bounding boxes alone cannot identify distinct curves or arrows.
      if(['path','polyline','line'].includes(n.type)&&!sameCurveGeometry(n,source))return false;
      const a=editableNodeBounds(n);if(!a)return false;
      const distance=Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y),Math.abs(a.right-b.right),Math.abs(a.bottom-b.bottom));
      const w=Math.max(0,Math.min(a.right,b.right)-Math.max(a.x,b.x));
      const h=Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y));
      const area=(a.right-a.x)*(a.bottom-a.y)+(b.right-b.x)*(b.bottom-b.y)-w*h;
      return distance<=4||(area>0&&w*h/area>.8);
    }))continue;
    let id='whole_added_'+(nodes.length+1);while(nodes.some(n=>n.id===id))id+='_';
    nodes.push({...source,id});added++;
  }
  return {...scene,nodes,counts:{...scene.counts,total:nodes.length,
    registeredMissing:(scene.counts?.registeredMissing||0)+added}};
}
export function regionForObjects(nodes,width,height){
  const boxes=nodes.map(editableNodeBounds).filter(Boolean);if(!boxes.length)return null;
  const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));
  const right=Math.max(...boxes.map(b=>b.right)),bottom=Math.max(...boxes.map(b=>b.bottom));
  const pad=Math.max(24,Math.max(right-x,bottom-y)*.12);
  const left=Math.max(0,Math.floor(x-pad)),top=Math.max(0,Math.floor(y-pad));
  return {x:left,y:top,w:Math.min(width,Math.ceil(right+pad))-left,h:Math.min(height,Math.ceil(bottom+pad))-top};
}
export function planCatalogRepairs(scene,width,height){
  // Spatial batches own disjoint IDs. Crops can overlap, but never own the
  // same arrow/text twice, and boundaries are expanded around whole objects.
  const nodes=scene.nodes.filter(n=>editableNodeBounds(n)).sort((a,b)=>{
    const x=editableNodeBounds(a),y=editableNodeBounds(b);
    return Math.floor(x.y/(height/3))-Math.floor(y.y/(height/3))||x.x-y.x;
  });
  const size=Math.max(1,Math.min(16,Math.ceil(nodes.length/3))),jobs=[];
  const planned=new Set();
  for(let i=0;i<nodes.length;i+=size){
    const batch=nodes.slice(i,i+size),region=regionForObjects(batch,width,height);
    const eligible=new Set(objectRepairCatalog({nodes:batch},region,1).nodes.map(n=>n.id));
    if(eligible.size){jobs.push({region,ids:[...eligible]});eligible.forEach(id=>planned.add(id));}
  }
  // Long cross-region connectors and large panels need their own complete crop.
  for(const node of nodes){
    if(planned.has(node.id))continue;
    const region=regionForObjects([node],width,height);
    if(region&&objectRepairCatalog({nodes:[node]},region,1,true).nodes.length)
      jobs.push({region,ids:[node.id],allowLarge:true});
  }
  return jobs;
}
// Existing objects are owned by the crop containing their centre.
export function tileDetailCatalog(scene,tile){
  const left=tile.coreX??tile.x,top=tile.coreY??tile.y;
  const right=tile.coreRight??tile.x+tile.w,bottom=tile.coreBottom??tile.y+tile.h;
  const owned=(scene.nodes||[]).filter(node=>{
    const b=editableNodeBounds(node);
    if(!b)return false;
    const cx=(b.x+b.right)/2,cy=(b.y+b.bottom)/2;
    return cx>=left&&cx<right&&cy>=top&&cy<bottom;
  });
  return objectRepairCatalog({nodes:owned},tile,1);
}
function transformCatalogNode(source,s,dx,dy){
  const n={...source};
  if(n.type==='path')n.d=transformEditablePath(n.d,s,s,dx,dy);
  else if(n.type==='polyline')n.points=(String(n.points||'').match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi)||[]).map((v,i)=>Number(v)*s+(i%2?dy:dx)).join(' ');
  else{
    for(const k of ['x','x2'])if(Number.isFinite(Number(n[k])))n[k]=Number(n[k])*s+dx;
    for(const k of ['y','y2'])if(Number.isFinite(Number(n[k])))n[k]=Number(n[k])*s+dy;
    for(const k of ['w','h'])if(Number.isFinite(Number(n[k])))n[k]=Number(n[k])*s;
  }
  for(const k of ['fontSize','strokeWidth','radius','arrowLength','arrowWidth'])if(Number.isFinite(Number(n[k])))n[k]=Number(n[k])*s;
  if(n.textPath?.d)n.textPath={...n.textPath,d:transformEditablePath(n.textPath.d,s,s,dx,dy)};
  return n;
}
export function scaleStructureScene(scene,width,height){
  const scale=width/scene.canvas.width;
  return {...scene,canvas:{width,height,w:width,h:height},
    nodes:(scene.nodes||[]).map(n=>transformCatalogNode(n,scale,0,0)),
    regions:(scene.regions||[]).map(r=>({...r,x:r.x*scale,y:r.y*scale,w:r.w*scale,h:r.h*scale}))};
}
export function scaleRegionCatalog(catalog,scale){
  const box=r=>({...r,x:r.x*scale,y:r.y*scale,w:r.w*scale,h:r.h*scale});
  return {...catalog,canvas:{width:Math.round(catalog.canvas.width*scale),height:Math.round(catalog.canvas.height*scale)},
    nodes:catalog.nodes.map(n=>transformCatalogNode(n,scale,0,0)),
    readOnlyContext:(catalog.readOnlyContext||[]).map(n=>transformCatalogNode(n,scale,0,0)),
    excludeRects:(catalog.excludeRects||[]).map(box)};
}
export function scaleRegionPatch(patch,scale){
  return {...patch,operations:(patch.operations||[]).map(op=>({...op,
    ...(op.changes?{changes:Object.fromEntries(Object.entries(op.changes).map(([k,v])=>[k,["fontSize","strokeWidth"].includes(k)&&typeof v==="number"?v*scale:Array.isArray(v)&&k==="dash"?v.map(x=>x*scale):v]))}:{}),
    ...(op.node?{node:transformCatalogNode(op.node,scale,0,0)}:{}),
    ...(op.nodes?{nodes:op.nodes.map(n=>transformCatalogNode(n,scale,0,0))}:{})})),
    uncertainties:(patch.uncertainties||[]).map(r=>({...r,x:r.x*scale,y:r.y*scale,w:r.w*scale,h:r.h*scale}))};
}
export function objectRepairCatalog(scene,region,scale,allowLarge=false){
  return {canvas:{width:Math.round(region.w*scale),height:Math.round(region.h*scale)},
    nodes:(scene.nodes||[]).filter(n=>{
      const b=editableNodeBounds(n);
      return b&&b.x>=region.x-1&&b.y>=region.y-1&&
        b.right<=region.x+region.w+1&&b.bottom<=region.y+region.h+1&&
        (allowLarge||b.right-b.x<region.w*.85&&b.bottom-b.y<region.h*.85);
    }).map(n=>{
      const entry=transformCatalogNode(n,scale,-region.x*scale,-region.y*scale);
      // The crop bitmap supplies image pixels; do not duplicate data URLs in the prompt.
      if(entry.type==='image'){delete entry.href;delete entry.crop;}
      return entry;
    })};
}
// Conservative bounding-box warnings; visual review still checks actual glyphs.
export function auditExportLayout(source,exported){
  const texts=(exported.nodes||[]).filter(n=>n.type==='text');
  const issues=[];
  for(let i=0;i<texts.length;i++)for(let j=i+1;j<texts.length;j++){
    const a=texts[i],b=texts[j];
    if(a.rotation||b.rotation||a.textPath||b.textPath)continue;
    const w=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x));
    const h=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
    if(w*h>Math.min(a.w*a.h,b.w*b.h)*.35)
      issues.push({kind:a.text===b.text?'duplicate-text':'text-overlap',text:a.text,other:b.text});
  }
  const remaining=new Set(texts);
  for(const n of (source.nodes||[]).filter(n=>n.type==='text'&&!n.textPath)){
    const matches=[...remaining].filter(v=>v.text===n.text).sort((a,b)=>
      Math.hypot(a.x-n.x,a.y-n.y)-Math.hypot(b.x-n.x,b.y-n.y));
    const match=matches[0];
    if(!match){issues.push({kind:'missing-text',id:n.id,text:n.text});continue;}
    remaining.delete(match);
    if(Math.abs(match.fontSize/n.fontSize-1)>.1)
      issues.push({kind:'font-size',id:n.id,expected:n.fontSize,actual:match.fontSize});
  }
  return {state:issues.length?'needs-review':'passed',issues,textCount:texts.length};
}
export function replaceObjectRepairRegion(scene,region,localScene,scale,allowLarge=false){
  if(!Number.isFinite(scale)||scale<=0)return scene;
  const x1=region.x+region.w,y1=region.y+region.h;
  const inside=b=>b&&b.x>=region.x-1&&b.y>=region.y-1&&b.right<=x1+1&&b.bottom<=y1+1;
  const small=b=>b&&(allowLarge||(b.right-b.x)<region.w*.85&&(b.bottom-b.y)<region.h*.85);
  const originals=new Map((scene.nodes||[]).filter(n=>n.id&&inside(editableNodeBounds(n))&&small(editableNodeBounds(n))).map(n=>[String(n.id),n]));
  const updates=new Map();
  const additions=[];
  const existingIds=new Set((scene.nodes||[]).filter(n=>n.id!=null).map(n=>String(n.id)));
  const coreLeft=region.coreX??region.x,coreTop=region.coreY??region.y;
  const coreRight=region.coreRight??x1,coreBottom=region.coreBottom??y1;
  for(const source of localScene.nodes||[]){
    const original=originals.get(String(source.id));
    if(original&&(original.type!==source.type||updates.has(String(source.id))))continue;
    if(!original&&source.id!=null&&existingIds.has(String(source.id)))continue;
    const n=transformCatalogNode(source,1/scale,region.x,region.y);
    if(original&&n.type==='text'){
      if(!Number.isFinite(n.fontSize)||Math.abs(n.fontSize/original.fontSize-1)>.2)continue;
    }
    const b=editableNodeBounds(n);
    if(!inside(b))continue;
    // Keep a complete icon or chart even when it nearly fills the repair crop.
    // Reject only a dominant panel/background invented by the local model.
    const area=(b.right-b.x)*(b.bottom-b.y);
    if(!allowLarge&&['rect','image'].includes(n.type)&&area>region.w*region.h*.8)continue;
    if(original){updates.set(String(n.id),{...original,...n});continue;}
    const cx=(b.x+b.right)/2,cy=(b.y+b.bottom)/2;
    if(cx<coreLeft||cx>=coreRight||cy<coreTop||cy>=coreBottom)continue;
    if(!small(b))continue;
    additions.push(n);
  }
  const updated={...scene,nodes:(scene.nodes||[]).map(n=>updates.get(String(n.id))||n)};
  // A new transcription at the same location is a correction proposal, not a
  // second text box. Existing-ID corrections above handle that case.
  const novel=additions.filter(n=>n.type!=='text'||!updated.nodes.some(other=>{
    if(other.type!=='text')return false;
    const a=editableNodeBounds(other),b=editableNodeBounds(n);
    if(!a||!b)return false;
    const overlap=Math.max(0,Math.min(a.right,b.right)-Math.max(a.x,b.x))*
      Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y));
    return overlap>Math.min((a.right-a.x)*(a.bottom-a.y),(b.right-b.x)*(b.bottom-b.y))*.65;
  }));
  return registerMissingObjects(updated,{nodes:novel});
}
export function extractEditableNodes(raw){
  const nodeKeys=['nodes','elements','objects','items','shapes','components','primitives',
    'labels','texts','arrows','connectors','rectangles','circles','lines','paths','images','panels'];
  const wrapperKeys=['scene','diagram','result','data','payload','output','response','figure','drawing','vector','content','layers','groups'];
  const seen=new Set();
  const explicitNodeTypes=['rect','rectangle','ellipse','circle','line','arrow','polyline','polygon','path','text','image'];
  const normalizeNode=v=>{
    if(!v||typeof v!=='object'||Array.isArray(v)) return v;
    if(v.type||v.kind||v.shape) return v;
    for(const type of explicitNodeTypes){
      if(v[type]&&typeof v[type]==='object'&&!Array.isArray(v[type]))
        return {type,...v[type]};
    }
    if(v.text!==undefined||v.content!==undefined||v.label!==undefined) return {type:'text',...v};
    if(v.href!==undefined||v.src!==undefined) return {type:'image',...v};
    if(v.x2!==undefined&&v.y2!==undefined) return {type:'line',...v};
    if(v.x!==undefined&&v.y!==undefined&&
      (v.w!==undefined||v.width!==undefined)) return {type:'rect',...v};
    return v;
  };
  const nodeLike=v=>v&&typeof v==='object'&&!Array.isArray(v)&&
    (typeof v.type==='string'||typeof v.kind==='string'||typeof v.shape==='string'||
      v.x!==undefined||v.y!==undefined||v.points!==undefined||v.text!==undefined||
      explicitNodeTypes.some(type=>v[type]&&typeof v[type]==='object'));
  function find(value,depth,fromNodeKey=false){
    if(typeof value==='string' && /^[\[{]/.test(value.trim())){
      try{ return find(JSON.parse(value),depth+1,fromNodeKey); }catch(_){ return null; }
    }
    if(!value||typeof value!=='object'||depth>10||seen.has(value)) return null;
    seen.add(value);
    if(Array.isArray(value)){
      if(value.length===0) return fromNodeKey?[]:null;
      if(value.every(nodeLike)) return value.map(normalizeNode);
      if(fromNodeKey){
        const nodes=value.filter(nodeLike);
        const nested=value.filter(item=>!nodeLike(item)).map(item=>find(item,depth+1)).filter(Boolean).flat();
        if(nodes.length||nested.length) return [...nodes.map(normalizeNode),...nested];
      }
      const nested=value.map(item=>find(item,depth+1)).filter(Boolean);
      return nested.length?nested.flat():null;
    }
    if(fromNodeKey){
      const entries=Object.entries(value);
      if(entries.length && entries.every(([,node])=>nodeLike(node)))
        return entries.map(([id,node])=>normalizeNode({id,...node}));
    }
    const explicit=[];
    let explicitEmpty=false;
    for(const key of nodeKeys){
      if(value[key]!==undefined){
        const found=find(value[key],depth+1,true);
        if(found!==null){
          if(!found.length) explicitEmpty=true;
          explicit.push(...found);
        }
      }
    }
    const wrapped=[];
    for(const key of wrapperKeys){
      if(value[key]!==undefined){
        const found=find(value[key],depth+1);
        if(found!==null){
          if(!found.length) explicitEmpty=true;
          wrapped.push(...found);
        }
      }
    }
    // Relays and models sometimes invent one more envelope name. Only traverse
    // objects/arrays; metadata strings cannot become scene nodes.
    const nested=[];
    for(const [key,child] of Object.entries(value)){
      if(nodeKeys.includes(key)||wrapperKeys.includes(key)||['regions','canvas','recovery'].includes(key)) continue;
      if(child&&typeof child==='object'){
        const found=find(child,depth+1);
        if(found!==null){
          if(!found.length) explicitEmpty=true;
          nested.push(...found);
        }
      }
    }
    const all=[...explicit,...wrapped,...nested];
    return all.length?all:explicitEmpty?[]:null;
  }
  const found=find(raw,0);
  if(found!==null) return found;
  throw new Error('Vision model returned JSON without an editable nodes array');
}
export function planReconstructionTiles(width, height, target=900, overlap=28){
  const columns=Math.max(1,Math.ceil(width/target));
  const rows=Math.max(1,Math.ceil(height/target));
  const tiles=[];
  for(let row=0;row<rows;row++) for(let col=0;col<columns;col++){
    const coreX=Math.round(col*width/columns), coreY=Math.round(row*height/rows);
    const coreRight=Math.round((col+1)*width/columns), coreBottom=Math.round((row+1)*height/rows);
    const x=Math.max(0,coreX-overlap), y=Math.max(0,coreY-overlap);
    const right=Math.min(width,coreRight+overlap), bottom=Math.min(height,coreBottom+overlap);
    tiles.push({index:tiles.length+1,x,y,w:right-x,h:bottom-y,coreX,coreY,coreRight,coreBottom});
  }
  return tiles;
}

export function subdivideReconstructionTile(parent, target=450, overlap=14){
  return planReconstructionTiles(parent.w,parent.h,target,overlap).map(child=>({
    ...child,
    index:`${parent.index}.${child.index}`,
    x:parent.x+child.x,
    y:parent.y+child.y,
    coreX:Math.max(parent.coreX,parent.x+child.coreX),
    coreY:Math.max(parent.coreY,parent.y+child.coreY),
    coreRight:Math.min(parent.coreRight,parent.x+child.coreRight),
    coreBottom:Math.min(parent.coreBottom,parent.y+child.coreBottom)
  })).filter(child=>child.coreRight>child.coreX && child.coreBottom>child.coreY);
}

function movedPoints(points,dx,dy){
  const nums=String(points||'').match(/-?\d*\.?\d+(?:e[+-]?\d+)?/gi)?.map(Number)||[];
  const out=[];
  for(let i=0;i+1<nums.length;i+=2) out.push(`${nums[i]+dx},${nums[i+1]+dy}`);
  return out.join(' ');
}

function sourceTileId(node){
  return /^tile([^_]+)_/.exec(String(node.id||''))?.[1]||null;
}

function sameStrokeStyle(a,b){
  return String(a.stroke||'').toLowerCase()===String(b.stroke||'').toLowerCase()
    && Math.abs(Number(a.strokeWidth||1)-Number(b.strokeWidth||1))<=1
    && Boolean(a.dash)===Boolean(b.dash);
}

function sameCurveGeometry(a,b){
  if(!sameStrokeStyle(a,b))return false;
  const as=geometrySegments(a),bs=geometrySegments(b);
  return as.length===bs.length&&as.every((segment,i)=>
    segment.closed===bs[i].closed&&segment.points.length===bs[i].points.length&&
    segment.points.every((point,j)=>Math.hypot(point.x-bs[i].points[j].x,
      point.y-bs[i].points[j].y)<=4));
}

function sameLinearEntity(a,b){
  if(!sameStrokeStyle(a,b))return null;
  const ax=Number(a.x),ay=Number(a.y),bx=Number(a.x2),by=Number(a.y2);
  const cx=Number(b.x),cy=Number(b.y),dx=Number(b.x2),dy=Number(b.y2);
  if(![ax,ay,bx,by,cx,cy,dx,dy].every(Number.isFinite))return null;
  const length=Math.hypot(bx-ax,by-ay),otherLength=Math.hypot(dx-cx,dy-cy);
  if(length<6||otherLength<6)return null;
  const ux=(bx-ax)/length,uy=(by-ay)/length;
  const perpendicular=(x,y)=>Math.abs((x-ax)*uy-(y-ay)*ux);
  const parallel=Math.abs((dx-cx)*uy-(dy-cy)*ux)/otherLength;
  const t1=(cx-ax)*ux+(cy-ay)*uy,t2=(dx-ax)*ux+(dy-ay)*uy;
  const overlap=Math.max(0,Math.min(length,Math.max(t1,t2))-Math.max(0,Math.min(t1,t2)));
  if(parallel>.018||perpendicular(cx,cy)>3||perpendicular(dx,dy)>3||
    overlap<Math.max(8,Math.min(30,.1*Math.min(length,otherLength))))return null;
  return {ax,ay,ux,uy,length,t1,t2};
}

// A crop can describe only part of a long connector. Its centre may lie in a
// different owning core from another description of that same connector.
// Merge collinear, overlapping descriptions after both are in global space.
function mergeCrossTileLines(nodes){
  let merged=0;
  for(let i=0;i<nodes.length;i++){
    const a=nodes[i];
    if(a.type!=='line')continue;
    for(let j=i+1;j<nodes.length;){
      const b=nodes[j],ownerA=sourceTileId(a),ownerB=sourceTileId(b);
      if(b.type!=='line'||!ownerA||!ownerB||ownerA===ownerB||!sameStrokeStyle(a,b)){
        j++;continue;
      }
      const match=sameLinearEntity(a,b);
      if(!match){j++;continue;}
      const {ax,ay,ux,uy,length,t1,t2}=match;
      const low=Math.min(0,t1,t2),high=Math.max(length,t1,t2);
      // Keep the direction of the arrow-bearing observation when possible.
      if(b.arrow&&!a.arrow){
        a.x=Number(b.x);a.y=Number(b.y);
        a.x2=Number(b.x2);a.y2=Number(b.y2);a.arrow=b.arrow;
      }
      const direction=((Number(a.x2)-Number(a.x))*ux+(Number(a.y2)-Number(a.y))*uy)>=0;
      const start=direction?low:high,end=direction?high:low;
      a.x=ax+start*ux;a.y=ay+start*uy;
      a.x2=ax+end*ux;a.y2=ay+end*uy;
      a.arrow=Boolean(a.arrow||b.arrow);
      nodes.splice(j,1);merged++;
      // The extended connector may also match a third crop.
      j=i+1;
    }
  }
  return merged;
}

function deduplicateCrossTileShapes(nodes){
  let removed=0;
  const shapeTypes=new Set(['rect','ellipse','polyline','path']);
  for(let i=0;i<nodes.length;i++){
    const a=nodes[i],ownerA=sourceTileId(a);
    if(!ownerA||!shapeTypes.has(a.type))continue;
    const ab=editableNodeBounds(a);if(!ab)continue;
    for(let j=i+1;j<nodes.length;){
      const b=nodes[j],ownerB=sourceTileId(b);
      if(!ownerB||ownerA===ownerB||a.type!==b.type||
        String(a.fill||'').toLowerCase()!==String(b.fill||'').toLowerCase()||
        !sameStrokeStyle(a,b)){j++;continue;}
      const bb=editableNodeBounds(b);if(!bb){j++;continue;}
      const distance=Math.max(Math.abs(ab.x-bb.x),Math.abs(ab.y-bb.y),
        Math.abs(ab.right-bb.right),Math.abs(ab.bottom-bb.bottom));
      if(distance>4){j++;continue;}
      if(a.type==='path'||a.type==='polyline'){
        if(!sameCurveGeometry(a,b)){j++;continue;}
      }
      nodes.splice(j,1);removed++;
    }
  }
  return removed;
}

function boundaryTextStitches(results){
  const fragments=[];
  results.forEach(({tile,scene},tileIndex)=>{
    (scene.nodes||[]).forEach((node,nodeIndex)=>{
      if(node.type!=='text'||node.textPath||Number(node.rotation)||typeof node.text!=='string'||!node.text.trim()) return;
      const x=Number(node.x), y=Number(node.y);
      const font=Number(node.fontSize||node.size);
      const explicitW=Number(node.w??node.width);
      // Vision responses often omit text bounds for the first fragment of a
      // heading. Estimate its extent so it can still be joined at a crop seam.
      const w=Number.isFinite(explicitW)&&explicitW>0 ? explicitW :
        font*0.57*node.text.length;
      if(![x,y,w,font].every(Number.isFinite)||w<=0||font<16) return;
      fragments.push({tile,tileIndex,nodeIndex,node,x,y,w,font,
        left:x<=36,right:x+w>=tile.w-36,globalY:tile.y+y});
    });
  });
  const used=new Set(),skip=new Map(),stitched=[];
  const key=f=>`${f.tileIndex}:${f.nodeIndex}`;
  function overlap(a,b){
    const limit=Math.min(a.length,b.length,32);
    for(let n=limit;n>=2;n--) if(a.slice(-n)===b.slice(0,n)) return n;
    return 0;
  }
  for(const first of fragments){
    if(used.has(key(first))||!first.right||first.left) continue;
    const chain=[first];
    let combined=first.node.text;
    while(true){
      const prev=chain.at(-1);
      const options=fragments.filter(next=>!used.has(key(next))&&!chain.includes(next)&&next.left&&
        next.tile.coreX===prev.tile.coreRight&&next.tile.coreY===prev.tile.coreY&&
        Math.abs(next.globalY-prev.globalY)<=Math.max(next.font,prev.font)*0.3&&
        Math.abs(next.font-prev.font)<=Math.max(next.font,prev.font)*0.3);
      const match=options.map(next=>({next,n:overlap(combined,next.node.text)}))
        .filter(item=>item.n>=2).sort((a,b)=>b.n-a.n)[0];
      if(!match) break;
      chain.push(match.next);
      combined+=match.next.node.text.slice(match.n);
    }
    if(chain.length<2) continue;
    for(const part of chain){
      used.add(key(part));
      if(!skip.has(part.tileIndex)) skip.set(part.tileIndex,new Set());
      skip.get(part.tileIndex).add(part.nodeIndex);
    }
    const last=chain.at(-1);
    const globalX=first.tile.x+first.x;
    stitched.push({...first.node,id:`stitched_${first.tile.index}_${last.tile.index}`,
      text:combined,x:globalX,y:first.globalY,
      w:Math.max(1,last.tile.x+last.x+last.w-globalX),
      h:Math.max(...chain.map(part=>Number(part.node.h||part.node.height||part.font*1.2))),
      fontSize:first.font,anchor:'start'});
  }
  return {skip,stitched};
}

// OCR can return two overlapping pieces of one label inside the same crop.
// Join only when their shared characters and measured baselines agree; nearby
// independent labels must remain separate editable objects.
function reconcileTextFragments(nodes){
  let joined=0;
  const removed=new Set();
  const labels=nodes.map((node,index)=>({node,index})).filter(({node})=>
    node.type==='text' && !node.textPath && !Number(node.rotation) &&
    typeof node.text==='string' && node.text.trim() &&
    [node.x,node.y,node.w,node.h,node.fontSize].every(v=>Number.isFinite(Number(v))));
  for(const first of labels){
    if(removed.has(first.index)) continue;
    let a=first.node;
    for(;;){
      const size=Number(a.fontSize), right=Number(a.x)+Number(a.w);
      const choices=labels.filter(b=>b.index!==first.index && !removed.has(b.index) &&
        Number(b.node.x)>=Number(a.x)-2 &&
        Number(b.node.x)-right>=-size*.8 && Number(b.node.x)-right<=size*.65 &&
        Math.abs(Number(b.node.y)-Number(a.y))<=Math.max(size,Number(b.node.fontSize))*.22 &&
        Math.abs(Number(b.node.fontSize)-size)<=Math.max(size,Number(b.node.fontSize))*.3 &&
        String(b.node.fill||'').toLowerCase()===String(a.fill||'').toLowerCase() &&
        !!b.node.bold===!!a.bold && !!b.node.italic===!!a.italic);
      const matches=choices.map(b=>{
        const left=String(a.text).trimEnd(),next=String(b.node.text).trimStart();
        let shared=0;
        for(let n=Math.min(left.length,next.length,24);n>=1;n--){
          if(left.slice(-n)===next.slice(0,n)){shared=n;break;}
        }
        const punctuation=/[^\p{L}\p{N}]/u.test(left.slice(-1));
        return {b,shared,valid:shared>=2 || (shared===1 && punctuation)};
      }).filter(m=>m.valid).sort((x,y)=>y.shared-x.shared);
      if(!matches.length) break;
      const {b,shared}=matches[0];
      const oldRight=Number(a.x)+Number(a.w);
      a.text=String(a.text).trimEnd()+String(b.node.text).trimStart().slice(shared);
      a.w=Math.max(oldRight,Number(b.node.x)+Number(b.node.w))-Number(a.x);
      a.h=Math.max(Number(a.h),Number(b.node.h));
      removed.add(b.index);joined++;
    }
  }
  if(removed.size) for(const index of [...removed].sort((a,b)=>b-a)) nodes.splice(index,1);
  return joined;
}

// Neighboring crops can each return the same complete label. Keep the more
// complete text box, but require substantial geometric overlap so repeated
// labels in a chart or legend remain independent.
function deduplicateText(nodes){
  const removed=new Set();
  const labels=nodes.map((node,index)=>({node,index})).filter(({node})=>
    node.type==='text' && !node.textPath && String(node.text||'').trim() &&
    [node.x,node.y,node.w,node.h].every(v=>Number.isFinite(Number(v))));
  const normalized=node=>String(node.text).replace(/\s+/g,' ').trim().toLowerCase();
  for(let i=0;i<labels.length;i++){
    const a=labels[i];
    if(removed.has(a.index)) continue;
    for(let j=i+1;j<labels.length;j++){
      const b=labels[j];
      if(removed.has(b.index)) continue;
      const at=normalized(a.node),bt=normalized(b.node);
      if(at!==bt && !(at.length>=4&&bt.length>=4&&(at.includes(bt)||bt.includes(at)))) continue;
      if(Math.abs(Number(a.node.rotation||0)-Number(b.node.rotation||0))>2) continue;
      const ax=Number(a.node.x),ay=Number(a.node.y),aw=Number(a.node.w),ah=Number(a.node.h);
      const bx=Number(b.node.x),by=Number(b.node.y),bw=Number(b.node.w),bh=Number(b.node.h);
      const overlapW=Math.max(0,Math.min(ax+aw,bx+bw)-Math.max(ax,bx));
      const overlapH=Math.max(0,Math.min(ay+ah,by+bh)-Math.max(ay,by));
      if(overlapW<.7*Math.min(aw,bw) || overlapH<.6*Math.min(ah,bh)) continue;
      if(Math.abs((ay+ah/2)-(by+bh/2))>Math.max(ah,bh)*.35) continue;
      const keepA=at.length>bt.length || (at.length===bt.length && aw*ah>=bw*bh);
      removed.add(keepA?b.index:a.index);
      if(!keepA) break;
    }
  }
  for(const index of [...removed].sort((a,b)=>b-a)) nodes.splice(index,1);
  return removed.size;
}

// A model may hallucinate a line from a crop boundary to a distant object.
// Relocating that crop turns it into the long rays seen in all four exports.
// Reject those lines in the shared scene, before format-specific rendering.
// Keep short edge ticks, axis-aligned panel borders and interior connectors.
function isCropBoundaryArtifactLine(n,tile){
  let pairs;
  if(n.type==='line'){
    const coordinates=[n.x,n.y,n.x2,n.y2].map(Number);
    if(coordinates.some(v=>!Number.isFinite(v))) return true;
    pairs=[coordinates];
  }else if(n.type==='polyline'||n.type==='path'){
    const segments=geometrySegments(n);
    if(segments.length!==1||segments[0].closed||segments[0].points.length!==2) return false;
    const [a,b]=segments[0].points;
    pairs=[[a.x,a.y,b.x,b.y]];
  }else return false;
  const tolerance=8;
  const edge=(x,y)=>Math.abs(x)<=tolerance||Math.abs(x-tile.w)<=tolerance
    ||Math.abs(y)<=tolerance||Math.abs(y-tile.h)<=tolerance;
  const corner=(x,y)=>(Math.abs(x)<=tolerance||Math.abs(x-tile.w)<=tolerance)
    && (Math.abs(y)<=tolerance||Math.abs(y-tile.h)<=tolerance);
  return pairs.some(([x1,y1,x2,y2])=>{
    const dx=Math.abs(x2-x1),dy=Math.abs(y2-y1);
    const length=Math.hypot(dx,dy);
    if((corner(x1,y1)||corner(x2,y2)) && length>=Math.max(100,0.16*Math.min(tile.w,tile.h))) return true;
    return (edge(x1,y1)||edge(x2,y2))
      && length>=Math.max(160,0.5*Math.min(tile.w,tile.h))
      && dx>=Math.max(30,0.08*tile.w) && dy>=Math.max(30,0.08*tile.h);
  });
}

export function mergeReconstructionTiles(results,width,height){
  const nodes=[];
  const completePanels=[];
  const clippedPanels=[];
  let filteredArtifactLines=0;
  const {skip,stitched}=boundaryTextStitches(results);
  for(const [tileIndex,{tile,scene}] of results.entries()){
    for(const [nodeIndex,source] of (scene.nodes||[]).entries()){
      if(skip.get(tileIndex)?.has(nodeIndex)) continue;
      const n={...source,id:`tile${tile.index}_${source.id||nodes.length}`};
      if(isCropBoundaryArtifactLine(n,tile)){
        filteredArtifactLines++;
        continue;
      }
      // Preserve a panel's complete geometry when the crop actually shows all
      // of its edges. Clipping every panel to a core destroyed rounded corners
      // and made later tile fragments cover previously reconstructed details.
      if(n.type==='rect' && n.fill && n.fill!=='none' && Number(n.w)>40 && Number(n.h)>40){
        const x=Number(n.x)+tile.x,y=Number(n.y)+tile.y;
        const w=Number(n.w),h=Number(n.h);
        if([x,y,w,h].every(Number.isFinite)){
          const touchesInternalEdge=(tile.x>0&&Number(n.x)<=2)
            ||(tile.y>0&&Number(n.y)<=2)
            ||(tile.x+tile.w<width&&Number(n.x)+w>=tile.w-2)
            ||(tile.y+tile.h<height&&Number(n.y)+h>=tile.h-2);
          if(!touchesInternalEdge){
            n.x=x;n.y=y;
            completePanels.push(n);
            continue;
          }
          const left=Math.max(x,tile.coreX,0),top=Math.max(y,tile.coreY,0);
          const right=Math.min(x+w,tile.coreRight,width);
          const bottom=Math.min(y+h,tile.coreBottom,height);
          if(right>left&&bottom>top){
            const clipped=left!==x||top!==y||right!==x+w||bottom!==y+h;
            n.x=left;n.y=top;n.w=right-left;n.h=bottom-top;
            if(clipped){n.stroke='none';n.radius=0;n.rx=0;n.ry=0;}
            clippedPanels.push(n);
          }
          continue;
        }
      }
      // A clipped container is reported as a complete rectangle in each
      // crop. Its newly invented stroke becomes a visible tile seam. Keep its
      // editable fill, but omit that synthetic border on internal crop edges.
      if((n.type==='rect'||n.type==='ellipse')&&Number(n.w)>40&&Number(n.h)>40){
        const x=Number(n.x||0),y=Number(n.y||0),w=Number(n.w),h=Number(n.h);
        if((tile.x>0&&x<=2)||(tile.y>0&&y<=2)||
          (tile.x+tile.w<width&&x+w>=tile.w-2)||
          (tile.y+tile.h<height&&y+h>=tile.h-2)) n.stroke='none';
      }
      // The overlap supplies visual context. The owning core contributes each
      // object's centre once, so labels at a seam are not duplicated.
      const segments=(n.type==='path'||n.type==='polyline') ? geometrySegments(n) : [];
      const vertices=segments.flatMap(s=>s.points);
      const bounds=vertices.length ? {
        x:Math.min(...vertices.map(p=>p.x)),y:Math.min(...vertices.map(p=>p.y)),
        right:Math.max(...vertices.map(p=>p.x)),bottom:Math.max(...vertices.map(p=>p.y))
      } : null;
      const cx=(bounds ? (bounds.x+bounds.right)/2 : n.type==='line' ? (Number(n.x||0)+Number(n.x2||0))/2 : Number(n.x||0)+Number(n.w||0)/2)+tile.x;
      const cy=(bounds ? (bounds.y+bounds.bottom)/2 : n.type==='line' ? (Number(n.y||0)+Number(n.y2||0))/2 : Number(n.y||0)+Number(n.h||0)/2)+tile.y;
      if(cx<tile.coreX || cx>=tile.coreRight || cy<tile.coreY || cy>=tile.coreBottom) continue;
      n.x=Number(n.x||0)+tile.x; n.y=Number(n.y||0)+tile.y;
      if(n.type==='line') {n.x2=Number(n.x2||0)+tile.x; n.y2=Number(n.y2||0)+tile.y;}
      if(n.type==='polyline') n.points=movedPoints(n.points,tile.x,tile.y);
      if(n.type==='path'){
        n.d=transformEditablePath(n.d,1,1,tile.x,tile.y);
      }
      if(n.type==='text'&&n.textPath){
        const path=typeof n.textPath==='string'?{d:n.textPath}:n.textPath;
        n.textPath={...path,d:transformEditablePath(path.d,1,1,tile.x,tile.y)};
      }
      nodes.push(n);
    }
  }
  const samePanel=(a,b)=>a.fill===b.fill
    && Math.abs(Number(a.x)-Number(b.x))<=4
    && Math.abs(Number(a.y)-Number(b.y))<=4
    && Math.abs(Number(a.w)-Number(b.w))<=4
    && Math.abs(Number(a.h)-Number(b.h))<=4;
  const uniquePanels=[];
  for(const panel of completePanels){
    if(!uniquePanels.some(existing=>samePanel(existing,panel))) uniquePanels.push(panel);
  }
  const remainingFragments=clippedPanels.filter(fragment=>!uniquePanels.some(panel=>{
    if(panel.fill!==fragment.fill) return false;
    const overlapW=Math.max(0,Math.min(panel.x+panel.w,fragment.x+fragment.w)-Math.max(panel.x,fragment.x));
    const overlapH=Math.max(0,Math.min(panel.y+panel.h,fragment.y+fragment.h)-Math.max(panel.y,fragment.y));
    return overlapW*overlapH>=0.95*fragment.w*fragment.h;
  }));
  // Backgrounds and cards must precede their editable contents irrespective
  // of which tile supplied each object. Larger backgrounds go first.
  nodes.unshift(...[...uniquePanels,...remainingFragments].sort((a,b)=>b.w*b.h-a.w*a.h));
  nodes.push(...stitched);
  const mergedCrossTileLines=mergeCrossTileLines(nodes);
  const deduplicatedCrossTileShapes=deduplicateCrossTileShapes(nodes);
  const reconciledTextFragments=reconcileTextFragments(nodes);
  const deduplicatedText=deduplicateText(nodes);
  return {schema:'figureforge.scene.v4',canvas:{width,height,w:width,h:height},nodes,
    counts:{total:nodes.length,text:nodes.filter(n=>n.type==='text').length,
      shapes:nodes.filter(n=>n.type!=='text'&&n.type!=='image').length,
      images:nodes.filter(n=>n.type==='image').length,
      filteredArtifactLines,mergedCrossTileLines,deduplicatedCrossTileShapes,
      reconciledTextFragments,deduplicatedText,
      stitchedTextFragments:[...skip.values()].reduce((sum,parts)=>sum+parts.size,0)}};
}
