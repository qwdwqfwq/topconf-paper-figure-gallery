// Revision-only orthogonal routing. Geometry follows the requested layout;
// parallel branches never force nodes into a predefined row or column.
export function routeRevisionEdges(plan,width,height){
  const nodes=plan.items.filter(i=>i.keep),pad=Math.max(3,Math.min(width,height)*.006);
  const boxes=nodes.map(i=>({id:i.id,x:i.target.x-pad,y:i.target.y-pad,right:i.target.x+i.target.width+pad,bottom:i.target.y+i.target.height+pad}));
  const ports=i=>{const r=i.target,cx=r.x+r.width/2,cy=r.y+r.height/2;return [
    {x:r.x-pad,y:cy,tip:{x:r.x,y:cy}}, {x:r.x+r.width+pad,y:cy,tip:{x:r.x+r.width,y:cy}},
    {x:cx,y:r.y-pad,tip:{x:cx,y:r.y}}, {x:cx,y:r.y+r.height+pad,tip:{x:cx,y:r.y+r.height}}
  ].filter(p=>p.x>=1&&p.y>=1&&p.x<=width-1&&p.y<=height-1);};
  const allPorts=nodes.flatMap(ports),xs=[1,width-1,...boxes.flatMap(b=>[b.x,b.right]),...allPorts.map(p=>p.x)].filter(x=>x>=1&&x<=width-1),ys=[1,height-1,...boxes.flatMap(b=>[b.y,b.bottom]),...allPorts.map(p=>p.y)].filter(y=>y>=1&&y<=height-1);
  const unique=a=>[...new Set(a)].sort((a,b)=>a-b),X=unique(xs),Y=unique(ys),W=X.length;
  const blocked=(a,b)=>boxes.some(r=>a.x===b.x?a.x>r.x+.01&&a.x<r.right-.01&&Math.max(a.y,b.y)>r.y+.01&&Math.min(a.y,b.y)<r.bottom-.01:a.y>r.y+.01&&a.y<r.bottom-.01&&Math.max(a.x,b.x)>r.x+.01&&Math.min(a.x,b.x)<r.right-.01);
  const cache=new Map(),point=n=>({x:X[n%W],y:Y[Math.floor(n/W)]}),index=p=>Y.indexOf(p.y)*W+X.indexOf(p.x);
  const clear=(a,b)=>{const key=Math.min(a,b)+':'+Math.max(a,b);if(!cache.has(key))cache.set(key,!blocked(point(a),point(b)));return cache.get(key);};
  const routes=[];
  for(const edge of plan.edges){
    const from=nodes.find(i=>i.id===edge.from),to=nodes.find(i=>i.id===edge.to);if(!from||!to)throw Error('连线端点不在保留清单中。');
    const starts=ports(from),ends=ports(to),endMap=new Map(ends.map(p=>[index(p),p])),dist=new Map(),previous=new Map(),roots=new Map(),heap=[];
    const push=v=>{heap.push(v);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p].cost<=v.cost)break;heap[i]=heap[p];i=p;}heap[i]=v;};
    const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].cost<heap[c].cost)c++;if(heap[c].cost>=last.cost)break;heap[i]=heap[c];i=c;}heap[i]=last;}return first;};
    for(const p of starts){if(boxes.some(b=>b.id!==from.id&&p.x>b.x&&p.x<b.right&&p.y>b.y&&p.y<b.bottom))continue;const n=index(p),dir=p.x===p.tip.x?1:0,key=n*2+dir;dist.set(key,pad);roots.set(key,p);push({key,cost:pad});}
    let finish;
    while(heap.length){const {key,cost}=pop();if(cost!==dist.get(key))continue;const n=Math.floor(key/2),dir=key%2,x=n%W,y=Math.floor(n/W);if(endMap.has(n)){finish=key;break;}
      for(const [nx,ny,nd] of [[x-1,y,0],[x+1,y,0],[x,y-1,1],[x,y+1,1]]){if(nx<0||nx>=W||ny<0||ny>=Y.length)continue;const nn=ny*W+nx;if(!clear(n,nn))continue;const nk=nn*2+nd,nc=cost+Math.abs(X[nx]-X[x])+Math.abs(Y[ny]-Y[y])+(nd!==dir?pad*3:0);if(nc>=(dist.get(nk)??Infinity))continue;dist.set(nk,nc);previous.set(nk,key);roots.set(nk,roots.get(key));push({key:nk,cost:nc});}
    }
    if(finish===undefined)throw Error('确认布局没有可用连线路径，请为节点之间预留空间后重新规划。');
    const path=[];for(let k=finish;k!==undefined;k=previous.get(k))path.push(point(Math.floor(k/2)));path.reverse();
    const points=[roots.get(finish).tip,...path,endMap.get(Math.floor(finish/2)).tip],simplified=[];
    for(const p of points){while(simplified.length>1){const a=simplified.at(-2),b=simplified.at(-1);if((a.x===b.x&&b.x===p.x)||(a.y===b.y&&b.y===p.y))simplified.pop();else break;}simplified.push(p);}
    routes.push({edge,points:simplified});
  }
  return routes;
}

// Preserve label text while offering different line breaks to the layout solver.
export function revisionLabelSizes(text,measureText,fontSize,padding){
  const original=text.split(/\\n|\n/),variants=[original];
  const natural=Math.max(...original.map(measureText));
  for(const fraction of [.75,.5,.35]){
    const limit=natural*fraction,lines=[];
    for(const line of original){
      // Break between Latin words and between CJK glyphs, retaining all text.
      const words=line.match(/[^\s\u3000-\u9fff]+(?:\s+|$)|[\u3000-\u9fff]|\s+/gu)||[''];
      let current='';
      for(const word of words){if(current&&measureText(current+word)>limit){lines.push(current);current='';}current+=word;}
      lines.push(current);
    }
    if(!variants.some(v=>JSON.stringify(v)===JSON.stringify(lines)))variants.push(lines);
  }
  return variants.map(lines=>({lines,width:Math.max(...lines.map(measureText))+padding*2,height:lines.length*fontSize*1.12+padding*2}));
}

// Branch text belongs beside its own path. Shared stems must not cause all
// conditions to be painted at the same longest-segment midpoint.
export function placeRevisionLabels(routes,items,width,height,measure){
  const occupied=items.filter(i=>i.keep).map(i=>i.target),gap=Math.max(2,width/500*2),choices=[];
  const overlaps=(a,b)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;
  const crosses=(a,b,r)=>a.x===b.x
    ?a.x>r.x-gap&&a.x<r.x+r.width+gap&&Math.max(a.y,b.y)>r.y-gap&&Math.min(a.y,b.y)<r.y+r.height+gap
    :a.y>r.y-gap&&a.y<r.y+r.height+gap&&Math.max(a.x,b.x)>r.x-gap&&Math.min(a.x,b.x)<r.x+r.width+gap;
  for(const route of routes){
    delete route.labelBox;
    if(!route.edge.label)continue;
    const measured=measure(route.edge.label),sizes=Array.isArray(measured)?measured:[measured],candidates=[];
    for(const [variant,size] of sizes.entries()){
    for(let n=1;n<route.points.length;n++){
      const a=route.points[n-1],b=route.points[n],horizontal=a.y===b.y,length=Math.hypot(b.x-a.x,b.y-a.y);
      if(length<(horizontal?size.width:size.height)+gap*2)continue;
      for(const fraction of [.5,.25,.75])for(const side of [-1,1]){
        const mx=a.x+(b.x-a.x)*fraction,my=a.y+(b.y-a.y)*fraction;
        const box={x:horizontal?mx-size.width/2:mx+(side<0?-size.width-gap:gap),y:horizontal?my+(side<0?-size.height-gap:gap):my-size.height/2,...size};
        if(box.x<gap||box.y<gap||box.x+box.width>width-gap||box.y+box.height>height-gap)continue;
        if(occupied.some(r=>overlaps(box,r)))continue;
        if(routes.some(r=>r.points.slice(1).some((p,i)=>crosses(r.points[i],p,box))))continue;
        // Prefer the destination approach so parallel branches remain distinct.
        candidates.push({box,score:variant*30+(route.points.length-n)*1000+(horizontal?0:100)+Math.abs(fraction-.5)});
      }
    }
    }
    candidates.sort((a,b)=>a.score-b.score);
    if(!candidates.length)throw Error('分支条件 '+JSON.stringify(route.edge.label)+' 缺少清晰放置空间；请调整节点尺寸、间距或流程方向后重新规划。');
    choices.push({route,candidates});
  }
  // Place constrained labels first and revisit earlier choices when necessary.
  choices.sort((a,b)=>a.candidates.length-b.candidates.length);
  const placed=[];let searches=0;
  const place=index=>{
    if(index===choices.length)return true;
    if(++searches>10000)return false;
    const {route,candidates}=choices[index];
    for(const {box} of candidates){
      if(placed.some(r=>overlaps(box,r)))continue;
      route.labelBox=box;placed.push(box);
      if(place(index+1))return true;
      placed.pop();delete route.labelBox;
    }
    return false;
  };
  if(!place(0))throw Error('分支条件之间缺少清晰放置空间；请联合调整节点、文字和连线路径后重新规划。');
  return routes;
}
