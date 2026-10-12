// Pure geometry helpers shared by the browser reconstruction flow and tests.
import {geometrySegments} from './editable-native.mjs';
export function extractEditableNodes(raw){
  const nodeKeys=['nodes','elements','objects','items','shapes','components','primitives'];
  const wrapperKeys=['scene','diagram','result','data','payload','output','response','figure','drawing','vector','content','layers','groups'];
  const seen=new Set();
  const nodeLike=v=>v&&typeof v==='object'&&!Array.isArray(v)&&
    (typeof v.type==='string'||typeof v.kind==='string'||typeof v.shape==='string'||
      v.x!==undefined||v.y!==undefined||v.points!==undefined||v.text!==undefined);
  function find(value,depth,fromNodeKey=false){
    if(typeof value==='string' && /^[\[{]/.test(value.trim())){
      try{ return find(JSON.parse(value),depth+1,fromNodeKey); }catch(_){ return null; }
    }
    if(!value||typeof value!=='object'||depth>10||seen.has(value)) return null;
    seen.add(value);
    if(Array.isArray(value)){
      if(value.length===0) return fromNodeKey?[]:null;
      if(value.every(nodeLike)) return value;
      const nested=value.map(item=>find(item,depth+1)).filter(Boolean);
      return nested.length?nested.flat():null;
    }
    for(const key of nodeKeys){
      if(value[key]!==undefined){
        const found=find(value[key],depth+1,true);
        if(found) return found;
      }
    }
    for(const key of wrapperKeys){
      if(value[key]!==undefined){
        const found=find(value[key],depth+1);
        if(found) return found;
      }
    }
    // Relays and models sometimes invent one more envelope name. Only traverse
    // objects/arrays; metadata strings cannot become scene nodes.
    for(const [key,child] of Object.entries(value)){
      if(nodeKeys.includes(key)||wrapperKeys.includes(key)) continue;
      if(child&&typeof child==='object'){
        const found=find(child,depth+1);
        if(found) return found;
      }
    }
    return null;
  }
  const found=find(raw,0);
  if(found) return found;
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

// Vision models sometimes use a crop corner as a placeholder endpoint for a
// line they cannot locate. Once the crop is moved onto the full canvas, these
// become the long diagonal rays seen in every exported format. Remove only
// long lines anchored at a crop corner; keep short ticks and real interior
// connectors. This must happen before the shared scene reaches any exporter.
function isCropCornerArtifactLine(n,tile){
  if(n.type!=='line') return false;
  const coordinates=[n.x,n.y,n.x2,n.y2].map(Number);
  if(coordinates.some(v=>!Number.isFinite(v))) return true;
  const [x1,y1,x2,y2]=coordinates;
  const corner=(x,y)=>(Math.abs(x)<=1||Math.abs(x-tile.w)<=1)
    && (Math.abs(y)<=1||Math.abs(y-tile.h)<=1);
  return (corner(x1,y1)||corner(x2,y2))
    && Math.hypot(x2-x1,y2-y1)>=Math.max(100,0.16*Math.min(tile.w,tile.h));
}

export function mergeReconstructionTiles(results,width,height){
  const nodes=[];
  let filteredArtifactLines=0;
  for(const {tile,scene} of results){
    for(const source of scene.nodes||[]){
      const n={...source,id:`tile${tile.index}_${source.id||nodes.length}`};
      if(isCropCornerArtifactLine(n,tile)){
        filteredArtifactLines++;
        continue;
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
        // SVG transforms are not valid inside a path's d attribute. Flatten
        // sampled curves to absolute polylines before shifting the tile.
        for(let k=0;k<segments.length;k++){
          const segment=segments[k];
          nodes.push({...n,id:`${n.id}_part${k+1}`,type:'polyline',d:undefined,
            points:segment.points.map(p=>`${p.x+tile.x},${p.y+tile.y}`).join(' '),closed:segment.closed});
        }
        continue;
      }
      nodes.push(n);
    }
  }
  return {schema:'figureforge.scene.v4',canvas:{width,height,w:width,h:height},nodes,
    counts:{total:nodes.length,text:nodes.filter(n=>n.type==='text').length,
      shapes:nodes.filter(n=>n.type!=='text'&&n.type!=='image').length,
      images:nodes.filter(n=>n.type==='image').length,
      filteredArtifactLines}};
}
