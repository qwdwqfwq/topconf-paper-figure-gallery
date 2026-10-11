// Pure geometry helpers shared by the browser reconstruction flow and tests.
import {geometrySegments} from './editable-native.mjs';
export function extractEditableNodes(raw){
  const root=raw&&typeof raw==='object'?(raw.scene||raw.diagram||raw.result||raw.data||raw.payload||raw.output||raw):raw;
  if(Array.isArray(root)) return root;
  for(const key of ['nodes','elements','objects','items','shapes','components']){
    if(root&&Array.isArray(root[key])) return root[key];
  }
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

function movedPoints(points,dx,dy){
  const nums=String(points||'').match(/-?\d*\.?\d+(?:e[+-]?\d+)?/gi)?.map(Number)||[];
  const out=[];
  for(let i=0;i+1<nums.length;i+=2) out.push(`${nums[i]+dx},${nums[i+1]+dy}`);
  return out.join(' ');
}

export function mergeReconstructionTiles(results,width,height){
  const nodes=[];
  for(const {tile,scene} of results){
    for(const source of scene.nodes||[]){
      const n={...source,id:`tile${tile.index}_${source.id||nodes.length}`};
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
      images:nodes.filter(n=>n.type==='image').length}};
}
