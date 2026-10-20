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
  const stops=n.gradient?.stops;
  if(Array.isArray(stops)&&stops.length>=2){
    const angle=((num(n.gradient.angle)%360)+360)%360;
    return `<a:gradFill rotWithShape="1"><a:gsLst>${stops.map(s=>`<a:gs pos="${Math.round(Math.max(0,Math.min(1,num(s.offset)))*100000)}"><a:srgbClr val="${rgb(s.color)||'FFFFFF'}"/></a:gs>`).join('')}</a:gsLst><a:lin ang="${Math.round(angle*60000)}" scaled="1"/></a:gradFill>`;
  }
  const fill = rgb(n.fill);
  return fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : '<a:noFill/>';
};
const point = (x,y) => ({x:num(x),y:num(y)});

// Normalize SVG commands into lines and cubic Beziers. Arc conversion follows
// the SVG endpoint parameterization and keeps curves editable in DrawingML.
export function parseEditablePath(d) {
  const tokens=String(d||'').match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi)||[];
  const size={M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2,A:7};
  const paths=[];let i=0,cmd='',cur=point(0,0),start=cur,run=null,previous=null,previousKind='';
  const begin=p=>{if(run&&run.commands.length)paths.push(run);run={start:p,commands:[],closed:false};start=p;cur=p;};
  const add=(type,end,c1,c2)=>{if(!run)begin(cur);run.commands.push({type,end,...(c1?{c1,c2}:{})});cur=end;};
  const cubic=(c1,c2,end)=>add('cubic',end,c1,c2);
  const arc=(rx0,ry0,angle,large,sweep,end)=>{
    let rx=Math.abs(rx0),ry=Math.abs(ry0);
    if(!rx||!ry||Math.hypot(end.x-cur.x,end.y-cur.y)<1e-9){add('line',end);return;}
    const phi=angle*Math.PI/180,cos=Math.cos(phi),sin=Math.sin(phi);
    const dx=(cur.x-end.x)/2,dy=(cur.y-end.y)/2;
    const xp=cos*dx+sin*dy,yp=-sin*dx+cos*dy;
    const lambda=xp*xp/(rx*rx)+yp*yp/(ry*ry);
    if(lambda>1){const scale=Math.sqrt(lambda);rx*=scale;ry*=scale;}
    const sign=!!large===!!sweep?-1:1;
    const numerator=Math.max(0,rx*rx*ry*ry-rx*rx*yp*yp-ry*ry*xp*xp);
    const denominator=rx*rx*yp*yp+ry*ry*xp*xp;
    const factor=sign*Math.sqrt(numerator/Math.max(denominator,1e-12));
    const cxp=factor*rx*yp/ry,cyp=-factor*ry*xp/rx;
    const cx=cos*cxp-sin*cyp+(cur.x+end.x)/2;
    const cy=sin*cxp+cos*cyp+(cur.y+end.y)/2;
    const unit=(x,y)=>point((cos*(x-cx)+sin*(y-cy))/rx,(-sin*(x-cx)+cos*(y-cy))/ry);
    const u=unit(cur.x,cur.y),v=unit(end.x,end.y);
    let theta=Math.atan2(u.y,u.x),delta=Math.atan2(u.x*v.y-u.y*v.x,u.x*v.x+u.y*v.y);
    if(!sweep&&delta>0)delta-=2*Math.PI;
    if(sweep&&delta<0)delta+=2*Math.PI;
    const count=Math.max(1,Math.ceil(Math.abs(delta)/(Math.PI/2))),step=delta/count;
    const map=(x,y)=>point(cx+rx*cos*x-ry*sin*y,cy+rx*sin*x+ry*cos*y);
    for(let k=0;k<count;k++){
      const a=theta+k*step,b=a+step,t=4/3*Math.tan((b-a)/4);
      cubic(map(Math.cos(a)-t*Math.sin(a),Math.sin(a)+t*Math.cos(a)),
        map(Math.cos(b)+t*Math.sin(b),Math.sin(b)-t*Math.cos(b)),
        k===count-1?end:map(Math.cos(b),Math.sin(b)));
    }
  };
  while(i<tokens.length){
    if(/^[a-zA-Z]$/.test(tokens[i])){
      cmd=tokens[i++];
      if(cmd.toUpperCase()==='Z'){
        if(run){run.closed=true;paths.push(run);run=null;}cur=start;previous=null;previousKind='';cmd='';continue;
      }
    }
    const upper=cmd.toUpperCase(),count=size[upper];
    if(!count||i+count>tokens.length||tokens.slice(i,i+count).some(t=>/^[a-zA-Z]$/.test(t)))break;
    const v=tokens.slice(i,i+count).map(Number);i+=count;
    const rel=cmd!==upper,old=cur;
    const xy=(x,y)=>point(rel?old.x+x:x,rel?old.y+y:y);
    if(upper==='M'){begin(xy(v[0],v[1]));cmd=rel?'l':'L';previous=null;previousKind='';continue;}
    if(upper==='L')add('line',xy(v[0],v[1]));
    else if(upper==='H')add('line',point(rel?old.x+v[0]:v[0],old.y));
    else if(upper==='V')add('line',point(old.x,rel?old.y+v[0]:v[0]));
    else if(upper==='C'){const c1=xy(v[0],v[1]),c2=xy(v[2],v[3]);cubic(c1,c2,xy(v[4],v[5]));previous=c2;}
    else if(upper==='S'){
      const c1=['C','S'].includes(previousKind)&&previous?point(2*old.x-previous.x,2*old.y-previous.y):old;
      const c2=xy(v[0],v[1]);cubic(c1,c2,xy(v[2],v[3]));previous=c2;
    }else if(upper==='Q'){
      const q=xy(v[0],v[1]),end=xy(v[2],v[3]);
      cubic(point(old.x+2*(q.x-old.x)/3,old.y+2*(q.y-old.y)/3),
        point(end.x+2*(q.x-end.x)/3,end.y+2*(q.y-end.y)/3),end);previous=q;
    }else if(upper==='T'){
      const q=['Q','T'].includes(previousKind)&&previous?point(2*old.x-previous.x,2*old.y-previous.y):old;
      const end=xy(v[0],v[1]);cubic(point(old.x+2*(q.x-old.x)/3,old.y+2*(q.y-old.y)/3),
        point(end.x+2*(q.x-end.x)/3,end.y+2*(q.y-end.y)/3),end);previous=q;
    }else if(upper==='A'){arc(v[0],v[1],v[2],v[3],v[4],xy(v[5],v[6]));previous=null;}
    if(!['C','S','Q','T'].includes(upper))previous=null;
    previousKind=upper;
  }
  if(run&&run.commands.length)paths.push(run);
  return paths;
}

export function transformEditablePath(d,sx=1,sy=1,dx=0,dy=0){
  const fmt=p=>`${+(p.x*sx+dx).toFixed(4)} ${+(p.y*sy+dy).toFixed(4)}`;
  return parseEditablePath(d).map(path=>`M ${fmt(path.start)} `+path.commands.map(c=>
    c.type==='cubic'?`C ${fmt(c.c1)} ${fmt(c.c2)} ${fmt(c.end)}`:`L ${fmt(c.end)}`).join(' ')+(path.closed?' Z':'')).join(' ');
}

const cubicPoint=(a,b,c,d,t)=>{
  const u=1-t;return point(u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,
    u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y);
};
export function geometrySegments(n) {
  if (n.type === 'polyline' || n.points) {
    const values = String(n.points || '').match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi) || [];
    const points=[];
    for(let i=0;i+1<values.length;i+=2) points.push(point(values[i],values[i+1]));
    return points.length>1 ? [{points,closed:!!n.closed}] : [];
  }
  if (n.type === 'line') return [{points:[point(n.x,n.y),point(n.x2,n.y2)],closed:false}];
  if (n.type !== 'path') return [];
  return parseEditablePath(n.d).map(path=>{
    const points=[path.start];let current=path.start;
    for(const command of path.commands){
      if(command.type==='cubic')for(let j=1;j<=16;j++)points.push(cubicPoint(current,command.c1,command.c2,command.end,j/16));
      else points.push(command.end);
      current=command.end;
    }
    return {points,closed:path.closed};
  }).filter(p=>p.points.length>1);
}

// PowerPoint cannot edit SVG textPath directly. Place each glyph in its own
// native text shape, tangent to the measured curve, so labels remain editable.
export function normalizeRotatedTextBounds(n) {
  // OCR describes the visible, rotated rectangle. Export formats instead
  // rotate a horizontal text box about its centre. Keep catalog coordinates
  // intact for crop ownership and convert only at the rendering boundary.
  const angle=((Number(n.rotation)||0)%360+360)%360;
  if(n.type!=='text'||n.textPath||n.rotationBounds==='layout'||
    (Math.abs(angle-90)>.01&&Math.abs(angle-270)>.01)||!(n.h>n.w*1.5))return n;
  return {...n,x:n.x+(n.w-n.h)/2,y:n.y+(n.h-n.w)/2,
    w:n.h,h:n.w,anchor:'middle',verticalAlign:'middle',rotationBounds:'layout'};
}

export function expandEditableTextPaths(scene) {
  const nodes=[];
  for(const n of scene.nodes||[]){
    if(n.type!=='text'||!n.textPath){nodes.push(normalizeRotatedTextBounds(n));continue;}
    const spec=typeof n.textPath==='string'?{d:n.textPath}:n.textPath;
    const samples=geometrySegments({type:'path',d:spec?.d||''}).flatMap(p=>p.points);
    if(samples.length<2){nodes.push({...n,textPath:undefined});continue;}
    const lengths=[0];
    for(let i=1;i<samples.length;i++)lengths.push(lengths[i-1]+Math.hypot(samples[i].x-samples[i-1].x,samples[i].y-samples[i-1].y));
    const total=lengths.at(-1),font=Math.max(1,num(n.fontSize||16));
    const chars=[...String(n.text||'')];
    const advances=chars.map(c=>font*(c===' '?0.32:/[ilI.,:;]/.test(c)?0.28:/[MW@]/.test(c)?0.82:0.56));
    const textWidth=advances.reduce((a,b)=>a+b,0);
    const offset=Number(spec.startOffset);
    let cursor=Number.isFinite(offset)?(Math.abs(offset)<=1?offset*total:offset):
      (n.anchor==='middle'?(total-textWidth)/2:n.anchor==='end'?total-textWidth:0);
    const at=distance=>{
      const d=Math.max(0,Math.min(total,distance));let i=1;
      while(i<lengths.length-1&&lengths[i]<d)i++;
      const a=samples[i-1],b=samples[i],span=Math.max(1e-6,lengths[i]-lengths[i-1]);
      const t=(d-lengths[i-1])/span;
      return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,angle:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI};
    };
    chars.forEach((char,i)=>{
      const advance=advances[i],p=at(cursor+advance/2);cursor+=advance;
      if(char===' ')return;
      nodes.push({...n,id:`${n.id||'text'}_char${i}`,text:char,textPath:undefined,
        x:p.x-advance/2,y:p.y-font*0.55,w:advance,h:font*1.2,
        anchor:'middle',verticalAlign:'middle',rotation:p.angle});
    });
  }
  return {...scene,nodes};
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
    const editablePaths=n.type==='path'?parseEditablePath(n.d):null;
    // Control points bound every cubic, including extrema between sampled
    // positions. Using sampled bounds can put OOXML control points outside
    // the custom geometry viewport and clip circular arrows.
    const coords=editablePaths?editablePaths.flatMap(p=>[p.start,...p.commands.flatMap(c=>
      c.type==='cubic'?[c.c1,c.c2,c.end]:[c.end])]):paths.flatMap(p=>p.points);
    const minX=Math.min(...coords.map(p=>p.x)),maxX=Math.max(...coords.map(p=>p.x));
    const minY=Math.min(...coords.map(p=>p.y)),maxY=Math.max(...coords.map(p=>p.y));
    x=minX;y=minY;w=Math.max(maxX-minX,0.001);h=Math.max(maxY-minY,0.001);
    let pathXml=(editablePaths||paths).map(p=>{
      if(editablePaths){
        const pt=q=>`<a:pt x="${Math.round((q.x-minX)*unit)}" y="${Math.round((q.y-minY)*unit)}"/>`;
        const commands=p.commands.map(command=>command.type==='cubic'?
          `<a:cubicBezTo>${pt(command.c1)}${pt(command.c2)}${pt(command.end)}</a:cubicBezTo>`:
          `<a:lnTo>${pt(command.end)}</a:lnTo>`).join('');
        return `<a:path w="${Math.max(1,Math.round(w*unit))}" h="${Math.max(1,Math.round(h*unit))}"${p.closed?'':' fill="none"'}><a:moveTo>${pt(p.start)}</a:moveTo>${commands}${p.closed?'<a:close/>':''}</a:path>`;
      }
      const pts=p.points.map(q=>({x:Math.round((q.x-minX)*unit),y:Math.round((q.y-minY)*unit)}));
      const first=pts[0];
      return `<a:path w="${Math.max(1,Math.round(w*unit))}" h="${Math.max(1,Math.round(h*unit))}"${p.closed?'':' fill="none"'}><a:moveTo><a:pt x="${first.x}" y="${first.y}"/></a:moveTo>${pts.slice(1).map(q=>`<a:lnTo><a:pt x="${q.x}" y="${q.y}"/></a:lnTo>`).join('')}${p.closed?'<a:close/>':''}</a:path>`;
    }).join('');
    // Closed SVG contours share one fill operation. Separate OOXML paths
    // fill holes independently, blacking out glyph counters and icon cutouts.
    pathXml=pathXml.replace(/<a:close\/><\/a:path><a:path w="\d+" h="\d+">/g,'<a:close/>');
    geometry=`<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="l" t="t" r="r" b="b"/><a:pathLst>${pathXml}</a:pathLst></a:custGeom>`;
  }else{
    const preset=n.type==='ellipse'?'ellipse':(n.radius>0?'roundRect':'rect');
    const adjustment=preset==='roundRect'?`<a:gd name="adj" fmla="val ${Math.round(Math.min(.5,Math.max(0,n.radius/Math.max(1,Math.min(n.w,n.h))))*100000)}"/>`:'';
    geometry=`<a:prstGeom prst="${preset}"><a:avLst>${adjustment}</a:avLst></a:prstGeom>`;
  }
  if(n.type==='text'){
    const font=num(n.fontSize||16), boxW=Math.max(num(n.w),font*0.7),boxH=Math.max(num(n.h),font*1.3);
    w=boxW;h=boxH;
    // Scene text coordinates are the top-left of its measured bounding box.
    const ptSize=Math.max(100,Math.round(font*unit/EMU*72*100));
    const color=rgb(n.fill)||'000000';
    const face=esc(String(n.fontFamily||'Arial').split(',')[0].replace(/["']/g,''));
    const textLines=String(n.text||'').split(/\r?\n/);
    const leading=textLines.length>1?`<a:lnSpc><a:spcPts val="${Math.round(ptSize*1.14)}"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft>`:'';
    const paragraphs=textLines.map(line=>`<a:p><a:pPr algn="${n.anchor==='middle'?'ctr':n.anchor==='end'?'r':'l'}">${leading}</a:pPr><a:r><a:rPr lang="en-US" sz="${ptSize}" b="${n.bold?1:0}" i="${n.italic?1:0}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="${face}"/></a:rPr><a:t>${esc(line)}</a:t></a:r><a:endParaRPr lang="en-US"/></a:p>`).join('');
    const tx=`<p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="${n.verticalAlign==='middle'?'ctr':'t'}"/><a:lstStyle/>${paragraphs}</p:txBody>`;
    const rotation=Number.isFinite(Number(n.rotation))?` rot="${Math.round(num(n.rotation)*60000)}"`:'';
    return `<p:sp>${nv}<p:spPr><a:xfrm${rotation}><a:off x="${Math.round(x*unit)}" y="${Math.round(y*unit)}"/><a:ext cx="${Math.max(1,Math.round(w*unit))}" cy="${Math.max(1,Math.round(h*unit))}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr>${tx}</p:sp>`;
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
  const nodes=expandEditableTextPaths(scene).nodes.filter(n=>n&&n.export!==false);
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

// Read the bytes we actually export for QA. This small STORE ZIP/OOXML reader
// is deliberately independent of the scene passed to buildNativePptx.
export async function readNativePptxScene(blob,width,height){
  const bytes=new Uint8Array(await blob.arrayBuffer()),view=new DataView(bytes.buffer);
  const files=new Map(),decoder=new TextDecoder();let at=0;
  while(at+30<=bytes.length&&view.getUint32(at,true)===0x04034b50){
    const method=view.getUint16(at+8,true),size=view.getUint32(at+18,true);
    const nameLength=view.getUint16(at+26,true),extra=view.getUint16(at+28,true);
    const name=decoder.decode(bytes.subarray(at+30,at+30+nameLength));
    const start=at+30+nameLength+extra;
    if(method!==0)throw new Error('PPTX QA requires STORE ZIP entries');
    files.set(name,bytes.subarray(start,start+size));at=start+size;
  }
  const xml=name=>{
    const data=files.get(name);if(!data)throw new Error(`Missing PPTX part: ${name}`);
    const doc=new DOMParser().parseFromString(decoder.decode(data),'application/xml');
    if(doc.getElementsByTagName('parsererror').length)throw new Error(`Invalid PPTX XML: ${name}`);
    return doc;
  };
  const child=(node,name)=>[...(node?.children||[])].find(e=>e.localName===name);
  const children=(node,name)=>[...(node?.children||[])].filter(e=>e.localName===name);
  const descendants=(node,name)=>[...(node?.getElementsByTagName('*')||[])].filter(e=>e.localName===name);
  const presentation=xml('ppt/presentation.xml'),sz=descendants(presentation,'sldSz')[0];
  const slideW=Number(sz?.getAttribute('cx')),unit=slideW/width;
  const slide=xml('ppt/slides/slide1.xml'),tree=descendants(slide,'spTree')[0];
  const rels=xml('ppt/slides/_rels/slide1.xml.rels');
  const media=new Map(descendants(rels,'Relationship').map(e=>[e.getAttribute('Id'),
    e.getAttribute('Target')?.replace('../media/','ppt/media/')]));
  const fill=parent=>{
    const solid=child(parent,'solidFill');
    return child(solid,'srgbClr')?.getAttribute('val') ? '#'+child(solid,'srgbClr').getAttribute('val') : 'none';
  };
  const gradient=parent=>{const g=child(parent,'gradFill');if(!g)return undefined;
    return {angle:Number(child(g,'lin')?.getAttribute('ang')||0)/60000,
      stops:descendants(g,'gs').map(s=>({offset:Number(s.getAttribute('pos'))/100000,color:'#'+child(s,'srgbClr')?.getAttribute('val')}))};};
  const coord=(xfrm)=>{
    const off=child(xfrm,'off'),ext=child(xfrm,'ext');
    return {x:Number(off?.getAttribute('x')||0)/unit,y:Number(off?.getAttribute('y')||0)/unit,
      w:Number(ext?.getAttribute('cx')||0)/unit,h:Number(ext?.getAttribute('cy')||0)/unit};
  };
  const nodes=[];
  for(const shape of tree?.children||[]){
    if(shape.localName!=='sp'&&shape.localName!=='pic')continue;
    const props=child(shape,'spPr'),xfrm=child(props,'xfrm');if(!xfrm)continue;
    const box=coord(xfrm),line=child(props,'ln');
    const common={...box,fill:fill(props),gradient:gradient(props),stroke:fill(line),
      strokeWidth:line?Number(line.getAttribute('w')||0)/unit:0,
      arrow:!!child(line,'tailEnd')};
    if(shape.localName==='pic'){
      const blip=descendants(shape,'blip')[0];
      const rid=blip?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','embed');
      const name=media.get(rid),data=files.get(name);
      if(!data)continue;
      let binary='';for(let i=0;i<data.length;i+=8192)binary+=String.fromCharCode(...data.subarray(i,i+8192));
      nodes.push({type:'image',...box,href:`data:image/${name.endsWith('.jpeg')?'jpeg':'png'};base64,${btoa(binary)}`});continue;
    }
    const body=child(shape,'txBody');
    if(body){
      const paragraphs=descendants(body,'p'),sample=descendants(body,'rPr')[0];
      const paragraph=paragraphs[0],alignment=child(paragraph,'pPr')?.getAttribute('algn');
      nodes.push({type:'text',...box,text:paragraphs.map(p=>descendants(p,'r').map(r=>child(r,'t')?.textContent||'').join('')).join('\n'),
        fontSize:Number(sample?.getAttribute('sz')||1200)/100/72*EMU/unit,
        fontFamily:child(sample,'latin')?.getAttribute('typeface')||'Arial',
        fill:fill(sample),bold:sample?.getAttribute('b')==='1',italic:sample?.getAttribute('i')==='1',
        anchor:alignment==='ctr'?'middle':alignment==='r'?'end':'start',
        verticalAlign:child(body,'bodyPr')?.getAttribute('anchor')==='ctr'?'middle':'top',
        rotation:Number(xfrm.getAttribute('rot')||0)/60000});continue;
    }
    const custom=child(props,'custGeom');
    if(custom){
      for(const path of descendants(custom,'path')){
        let d='';
        for(const command of path.children){
          const pts=descendants(command,'pt').map(p=>({x:box.x+Number(p.getAttribute('x'))/unit,
            y:box.y+Number(p.getAttribute('y'))/unit}));
          const pair=p=>`${+p.x.toFixed(4)} ${+p.y.toFixed(4)}`;
          if(command.localName==='moveTo'&&pts[0])d+=`M ${pair(pts[0])} `;
          else if(command.localName==='lnTo'&&pts[0])d+=`L ${pair(pts[0])} `;
          else if(command.localName==='cubicBezTo'&&pts.length===3)d+=`C ${pts.map(pair).join(' ')} `;
          else if(command.localName==='close')d+='Z ';
        }
        if(d)nodes.push({type:'path',d,...common,fill:path.getAttribute('fill')==='none'?'none':common.fill});
      }
    }else{
      const geometry=child(props,'prstGeom'),preset=geometry?.getAttribute('prst');
      const formula=descendants(geometry||props,'gd').find(g=>g.getAttribute('name')==='adj')?.getAttribute('fmla');
      const match=/^val\s+(-?\d+(?:\.\d+)?)$/.exec(formula||'');
      const adjustment=match?Math.max(0,Math.min(50000,Number(match[1]))):16667;
      nodes.push({type:preset==='ellipse'?'ellipse':'rect',...common,radius:preset==='roundRect'?Math.min(box.w,box.h)*adjustment/100000:0});
    }
  }
  return {canvas:{width,height},nodes};
}
