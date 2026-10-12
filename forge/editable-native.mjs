// Browser-only editable OOXML exporter. Every vector primitive becomes a native
// DrawingML shape; only photographic crops remain pictures.
const EMU = 914400;
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const rgb = (value, fallback='000000') => {
  const s = String(value ?? '').trim();
  if (!s || s === 'none' || s === 'transparent') return null;
  const h = s.replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) return h.split('').map(c => c+c).join('').toUpperCase();
  return /^[0-9a-f]{6}$/i.test(h) ? h.toUpperCase() : fallback;
};
const xmlLine = (n, unit) => {
  const stroke = rgb(n.stroke);
  if (!stroke) return '<a:ln><a:noFill/></a:ln>';
  const width = Math.max(1, Math.round(num(n.strokeWidth || 1) * unit));
  return `<a:ln w="${width}"><a:solidFill><a:srgbClr val="${stroke}"/></a:solidFill>${n.dash ? '<a:prstDash val="dash"/>' : ''}${n.arrow ? '<a:tailEnd type="triangle"/>' : ''}</a:ln>`;
};
const xmlFill = n => {
  const fill = rgb(n.fill);
  return fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : '<a:noFill/>';
};
const point = (x,y) => ({x:num(x),y:num(y)});

// Convert SVG path data into editable line segments. Curves are sampled as line
// vertices, retaining their visible contour in PowerPoint, Visio and draw.io.
export function geometrySegments(n) {
  if (n.type === 'polyline' || n.points) {
    const values = String(n.points || '').match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi) || [];
    const points=[];
    for(let i=0;i+1<values.length;i+=2) points.push(point(values[i],values[i+1]));
    return points.length>1 ? [{points,closed:!!n.closed}] : [];
  }
  if (n.type === 'line') return [{points:[point(n.x,n.y),point(n.x2,n.y2)],closed:false}];
  if (n.type !== 'path') return [];
  const tokens = String(n.d || '').match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi) || [];
  const sizes={M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2,A:7};
  let i=0, cmd='', current=point(0,0), start=point(0,0), previous=null, lastCurve='';
  const paths=[]; let run=[];
  const add=(p)=>{current=p;run.push(p);};
  const finish=(closed=false)=>{if(run.length>1) paths.push({points:run,closed});run=[];};
  while(i<tokens.length){
    if(/^[a-zA-Z]$/.test(tokens[i])) { cmd=tokens[i++]; if(cmd.toUpperCase()==='Z'){finish(true);current=start;lastCurve='';continue;} }
    const upper=cmd.toUpperCase(), count=sizes[upper];
    if(!count || i+count>tokens.length || /^[a-zA-Z]$/.test(tokens[i])) break;
    const v=tokens.slice(i,i+count).map(Number);i+=count;
    const rel=cmd!==upper, old=current;
    const xy=(x,y)=>point(rel?old.x+x:x,rel?old.y+y:y);
    if(upper==='M'){finish();start=xy(v[0],v[1]);add(start);cmd=rel?'l':'L';lastCurve='';continue;}
    if(!run.length) run=[old];
    if(upper==='L') add(xy(v[0],v[1]));
    else if(upper==='H') add(point(rel?old.x+v[0]:v[0],old.y));
    else if(upper==='V') add(point(old.x,rel?old.y+v[0]:v[0]));
    else if(upper==='C' || upper==='S' || upper==='Q' || upper==='T'){
      let a,b,end;
      if(upper==='C'){a=xy(v[0],v[1]);b=xy(v[2],v[3]);end=xy(v[4],v[5]);}
      if(upper==='S'){a=(lastCurve==='C'||lastCurve==='S')&&previous?point(2*old.x-previous.x,2*old.y-previous.y):old;b=xy(v[0],v[1]);end=xy(v[2],v[3]);}
      if(upper==='Q'){a=xy(v[0],v[1]);end=xy(v[2],v[3]);}
      if(upper==='T'){a=(lastCurve==='Q'||lastCurve==='T')&&previous?point(2*old.x-previous.x,2*old.y-previous.y):old;end=xy(v[0],v[1]);}
      const steps=12;
      for(let k=1;k<=steps;k++){
        const t=k/steps, u=1-t;
        if(b) add(point(u*u*u*old.x+3*u*u*t*a.x+3*u*t*t*b.x+t*t*t*end.x,u*u*u*old.y+3*u*u*t*a.y+3*u*t*t*b.y+t*t*t*end.y));
        else add(point(u*u*old.x+2*u*t*a.x+t*t*end.x,u*u*old.y+2*u*t*a.y+t*t*end.y));
      }
      previous=b||a;
    } else if(upper==='A') add(xy(v[5],v[6]));
    if(!['C','S','Q','T'].includes(upper)) previous=null;
    lastCurve=upper;
  }
  finish();
  return paths;
}

const dataUri = uri => {
  const m=/^data:(image\/(?:png|jpeg|jpg|gif|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(uri||''));
  if(!m) return null;
  const binary=atob(m[2].replace(/\s+/g,''));
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
  const ext=m[1].toLowerCase().replace('image/','').replace('jpg','jpeg');
  return {bytes,ext,mime:ext==='jpeg'?'image/jpeg':`image/${ext}`};
};

function shapeXml(n,id,unit,media){
  const nv=`<p:nvSpPr><p:cNvPr id="${id}" name="FigureForge ${esc(n.type)} ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>`;
  if(n.type==='image'){
    const part=dataUri(n.href);
    if(!part) throw new Error('PPTX image crop is not an embedded data URI');
    const rid=`rIdImage${media.length+1}`, filename=`image${media.length+1}.${part.ext}`;
    media.push({...part,rid,filename});
    const x=Math.round(num(n.x)*unit), y=Math.round(num(n.y)*unit), w=Math.max(1,Math.round(num(n.w)*unit)), h=Math.max(1,Math.round(num(n.h)*unit));
    return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="FigureForge crop ${id}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
  }
  let x=num(n.x), y=num(n.y), w=num(n.w), h=num(n.h), geometry='';
  if(['path','polyline','line'].includes(n.type)){
    const paths=geometrySegments(n);
    if(!paths.length) return '';
    const coords=paths.flatMap(p=>p.points);
    const minX=Math.min(...coords.map(p=>p.x)),maxX=Math.max(...coords.map(p=>p.x));
    const minY=Math.min(...coords.map(p=>p.y)),maxY=Math.max(...coords.map(p=>p.y));
    x=minX;y=minY;w=Math.max(maxX-minX,0.001);h=Math.max(maxY-minY,0.001);
    const pathXml=paths.map(p=>{
      const pts=p.points.map(q=>({x:Math.round((q.x-minX)*unit),y:Math.round((q.y-minY)*unit)}));
      const first=pts[0];
      return `<a:path w="${Math.max(1,Math.round(w*unit))}" h="${Math.max(1,Math.round(h*unit))}"${p.closed?'':' fill="none"'}><a:moveTo><a:pt x="${first.x}" y="${first.y}"/></a:moveTo>${pts.slice(1).map(q=>`<a:lnTo><a:pt x="${q.x}" y="${q.y}"/></a:lnTo>`).join('')}${p.closed?'<a:close/>':''}</a:path>`;
    }).join('');
    geometry=`<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="l" t="t" r="r" b="b"/><a:pathLst>${pathXml}</a:pathLst></a:custGeom>`;
  }else{
    const preset=n.type==='ellipse'?'ellipse':(n.radius>0?'roundRect':'rect');
    geometry=`<a:prstGeom prst="${preset}"><a:avLst/></a:prstGeom>`;
  }
  if(n.type==='text'){
    const font=num(n.fontSize||16), boxW=Math.max(num(n.w),font*0.7),boxH=Math.max(num(n.h),font*1.3);
    w=boxW;h=boxH;
    // Scene text coordinates are the top-left of its measured bounding box.
    const ptSize=Math.max(100,Math.round(font*unit/EMU*72*100));
    const color=rgb(n.fill)||'000000';
    const face=esc(String(n.fontFamily||'Arial').split(',')[0].replace(/["']/g,''));
    const tx=`<p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"/><a:lstStyle/><a:p><a:pPr algn="${n.anchor==='middle'?'ctr':n.anchor==='end'?'r':'l'}"/><a:r><a:rPr lang="en-US" sz="${ptSize}" b="${n.bold?1:0}" i="${n.italic?1:0}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="${face}"/></a:rPr><a:t>${esc(n.text)}</a:t></a:r><a:endParaRPr lang="en-US"/></a:p></p:txBody>`;
    return `<p:sp>${nv}<p:spPr><a:xfrm><a:off x="${Math.round(x*unit)}" y="${Math.round(y*unit)}"/><a:ext cx="${Math.max(1,Math.round(w*unit))}" cy="${Math.max(1,Math.round(h*unit))}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr>${tx}</p:sp>`;
  }
  return `<p:sp>${nv}<p:spPr><a:xfrm><a:off x="${Math.round(x*unit)}" y="${Math.round(y*unit)}"/><a:ext cx="${Math.max(1,Math.round(w*unit))}" cy="${Math.max(1,Math.round(h*unit))}"/></a:xfrm>${geometry}${xmlFill(n)}${xmlLine(n,unit)}</p:spPr></p:sp>`;
}

let templatePromise;
async function template(){
  if(!templatePromise) templatePromise=fetch('./pptx-template.json').then(r=>{if(!r.ok) throw new Error(`PPTX template ${r.status}`);return r.json();});
  return templatePromise;
}
const b64bytes=s=>{const bin=atob(s),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;};

export async function buildNativePptx(scene,zipStore){
  const canvas=scene.canvas||{}, width=num(canvas.width||canvas.w||1200), height=num(canvas.height||canvas.h||675);
  if(width<=0||height<=0) throw new Error('Invalid canvas dimensions');
  const slideW=10*EMU,slideH=Math.round(slideW*height/width),unit=slideW/width;
  const media=[];
  const nodes=(scene.nodes||[]).filter(n=>n&&n.export!==false);
  const shapes=nodes.map((n,i)=>shapeXml(n,i+2,unit,media)).join('');
  const slide=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  const raw=await template(), decoder=new TextDecoder(), encoder=new TextEncoder();
  const files=Object.entries(raw).map(([name,b64])=>({name,data:b64bytes(b64)}));
  const set=(name,data)=>{const entry=files.find(f=>f.name===name);if(entry) entry.data=typeof data==='string'?encoder.encode(data):data;else files.push({name,data:typeof data==='string'?encoder.encode(data):data});};
  set('ppt/slides/slide1.xml',slide);
  let pres=decoder.decode(files.find(f=>f.name==='ppt/presentation.xml').data);
  pres=pres.replace(/<p:sldSz\b[^>]*\/>/,`<p:sldSz cx="${slideW}" cy="${slideH}" type="custom"/>`);
  set('ppt/presentation.xml',pres);
  let rels=decoder.decode(files.find(f=>f.name==='ppt/slides/_rels/slide1.xml.rels').data);
  rels=rels.replace('</Relationships>',media.map(m=>`<Relationship Id="${m.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${m.filename}"/>`).join('')+'</Relationships>');
  set('ppt/slides/_rels/slide1.xml.rels',rels);
  let types=decoder.decode(files.find(f=>f.name==='[Content_Types].xml').data);
  const extensions=[...new Set(media.map(m=>m.ext))];
  types=types.replace('</Types>',extensions.filter(ext=>!new RegExp(`<Default Extension="${ext}"`).test(types)).map(ext=>`<Default Extension="${ext}" ContentType="${ext==='jpeg'?'image/jpeg':`image/${ext}`}"/>`).join('')+'</Types>');
  set('[Content_Types].xml',types);
  media.forEach(m=>set(`ppt/media/${m.filename}`,m.bytes));
  const zip=zipStore(files);
  return new Blob([await zip.arrayBuffer()],{type:'application/vnd.openxmlformats-officedocument.presentationml.presentation'});
}
