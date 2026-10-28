import {runRepairQueue} from './repair-queue.mjs';
import {layoutEditableText} from './editable-text-layout.mjs';
// Step 4: source evidence is collected before (and independently of) reconstruction.
export function inventoryPrompt(W,H){
  return `Inspect ONLY the original ${W} x ${H} pixel image. Do not reconstruct it. Return STRICT JSON {canvas:{width:1000,height:1000,units:"normalized-1000"},items:[{id,kind,panelId,x,y,w,h,description,text,expectedCount,colors:[{role:"fill|stroke|text",value:"#rrggbb"}]}],layers:[{backItemId,frontItemId,reason}],connections:[{itemId,fromItemId,toItemId}],uncertainties:[]}. Build a compact coverage map, not a primitive-by-primitive transcription. Inventory the actual canvas organization: panels and backgrounds; coherent text groups; content groups such as charts, tables, connected diagrams and illustrations; meaningful repeated instances; connectors between groups; and visible layer/occlusion relationships. Use only categories actually present; do not assume a tree, robot, badge, table or scientific diagram exists. Use stable unique IDs and normalized bounding boxes: x and w are fractions of the FULL image width times 1000; y and h are fractions of the FULL image height times 1000. The top-left is (0,0), bottom-right is (1000,1000), regardless of image aspect ratio or displayed resolution. Never use displayed thumbnail pixels or mix normalized and source-pixel coordinates. Check each box against visible panel boundaries before returning. Prefer complete coherent panels with their children, rather than isolated word/label crops. Keep a connected diagram, table or chart as one coherent content item with a concise structural description (its overall role and visible extent only); its individual primitives will be traced during reconstruction and checked during acceptance, not redundantly listed here. Record exact OCR in text only for standalone titles and short readable labels; for mixed content or long prose use text:null and describe its scope, leaving complete transcription to reconstruction. Record meaningful repeated instances separately when they have different contents, positions or relationships; never use a group spanning unrelated intervening content. In a large mixed panel, give independently bounded subdiagrams, chart blocks and repeated rows with distinct content their own coherent child items. Keep each complete row or connected subdiagram together, including its labels and formulas; do not list each primitive or combine all distinct rows into one giant item. Only split at actual visible content boundaries, never through a formula, table, photo or connected diagram. Use expectedCount only for a clearly countable visible unit, not for the number of primitives inside a group. Include every content group without an arbitrary quota; grouping must not hide missing contents. Every non-null panelId MUST exactly equal an id present in items for the containing panel; root panels use panelId:null. For photographs, video frames and heatmaps use kind photo/video-frame/heatmap and ONE item per visible raster crop, with its own tight bounding box and expectedCount:1, including every overlapping frame. Give exact visible crop bounds and explicit layer relations; never label an entire mixed panel as a photo or combine separate raster crops. Use null text/count where inapplicable. Record salient visible colors. Record meaningful occlusion and paint order only between independently bounded items, not a container and its own contents. Connections reference their connector item and the visible source/target item IDs; do not invent endpoints. A connector box covers its COMPLETE visible route, including bends, shared trunks, junctions, branches and arrowheads, never just its head. For a shared connection network use one connector item and repeat its itemId across the visible source/target relationships; briefly describe the branching pattern without listing each segment. Record unreadable content, uncertain counts, coordinates or relationships in uncertainties; never silently omit them. Keep descriptions concise and avoid duplicating prose, table cells or repeated geometry. Adjacent independent modules must have separate panel boxes following their actual visible borders; do not use overlapping column strips spanning unrelated modules. This inventory guides a separate reconstruction call; original pixels take precedence over uncertain descriptions. No reconstruction catalog or rendered output is available in this call.`;
}
export function validateInventory(raw,W,H){
  const fail=msg=>{throw Error('原图检查清单无效：'+msg);};
  if(!Array.isArray(raw?.items)||!raw.items.length||!Array.isArray(raw.layers)||!Array.isArray(raw.connections)||!Array.isArray(raw.uncertainties))fail('缺少完整结构');
  const ids=new Set();
  for(const i of raw.items){
    if(!i||typeof i.id!=='string'||!i.id||ids.has(i.id)||!i.kind||!i.description||![i.x,i.y,i.w,i.h].every(Number.isFinite)||i.x<0||i.y<0||i.w<=0||i.h<=0||i.x+i.w>W+1||i.y+i.h>H+1)fail('对象 ID、描述或边界');
    ids.add(i.id);
    if(!Array.isArray(i.colors)||i.colors.some(c=>!['fill','stroke','text'].includes(c.role)||!/^#[\da-f]{6}$/i.test(c.value)))fail('颜色证据');
    if(i.expectedCount!=null&&(!Number.isInteger(i.expectedCount)||i.expectedCount<1))fail('重复数量');
    if(i.text!=null&&typeof i.text!=='string')fail('文字');
  }
  for(const i of raw.items)if(i.panelId&&!ids.has(i.panelId))fail('面板引用');
  for(const l of raw.layers)if(!ids.has(l.backItemId)||!ids.has(l.frontItemId)||l.backItemId===l.frontItemId||!l.reason)fail('图层引用');
  for(const c of raw.connections)if(![c.itemId,c.fromItemId,c.toItemId].every(id=>ids.has(id)))fail('连接引用');
  return structuredClone({items:raw.items,layers:raw.layers,connections:raw.connections,uncertainties:raw.uncertainties});
}
// Normalize representation only; discarded/unknown evidence always blocks formal acceptance.
export function normalizeInventory(raw,W,H){
  const issues=Array.isArray(raw?.uncertainties)?structuredClone(raw.uncertainties):['缺少原图不确定项清单'];
  const warn=message=>issues.push(message), number=v=>typeof v==='number'?v:typeof v==='string'&&v.trim()?Number(v):NaN;
  const normalized=raw?.canvas?.width===1000&&raw?.canvas?.height===1000&&raw?.canvas?.units==='normalized-1000';
  // A declared coordinate system permits conversion; it is NOT visual proof
  // that the model located an item correctly. Acceptance still checks pixels.
  const coordinateVerified=normalized||(raw?.canvas?.width===W&&raw?.canvas?.height===H&&raw?.canvas?.units==='source-pixels');
  if(!coordinateVerified)warn('盘点坐标缺少与原图一致的像素画布声明，禁止自动裁切');
  const items=[],ids=new Set(),rejectedResources=structuredClone(raw?.rejectedResources||[]);
  if(!Array.isArray(raw?.items)||!raw.items.length)warn('缺少有效原图对象清单');
  for(const [index,value] of (Array.isArray(raw?.items)?raw.items:[]).entries()){
    const i={...value},box=i.bbox||i.bounds;
    if(box&&typeof box==='object')for(const [k,n] of ['x','y','w','h'].entries())i[n]??=Array.isArray(box)?box[k]:box[n]??box[n==='w'?'width':n==='h'?'height':n];
    for(const n of ['x','y','w','h'])i[n]=number(i[n]);
    if(normalized){i.x*=W/1000;i.w*=W/1000;i.y*=H/1000;i.h*=H/1000;}
    if(typeof i.id==='number'&&Number.isFinite(i.id))i.id=String(i.id);
    if(typeof i.id!=='string'||!i.id||ids.has(i.id)||typeof i.kind!=='string'||!i.kind||typeof i.description!=='string'||!i.description||![i.x,i.y,i.w,i.h].every(Number.isFinite)||i.x<0||i.y<0||i.w<=0||i.h<=0||i.x+i.w>W+1||i.y+i.h>H+1){warn(`原图对象 ${index+1} 字段或边界无效，未纳入有效证据`);if(isRasterItem(i))rejectedResources.push({...i,id:i.id||`invalid-resource-${index+1}`});continue;}
    ids.add(i.id);
    if(!Array.isArray(i.colors)){warn(`对象 ${i.id} 缺少颜色证据`);i.colors=[];}
    i.colors=i.colors.flatMap(c=>{let value=c?.value;if(/^#[\da-f]{3}$/i.test(value||''))value='#'+value.slice(1).split('').map(v=>v+v).join('');if(!['fill','stroke','text'].includes(c?.role)||!/^#[\da-f]{6}$/i.test(value||'')){warn(`对象 ${i.id} 颜色证据无效`);return [];}return [{role:c.role,value}];});
    if(i.expectedCount!=null){i.expectedCount=number(i.expectedCount);if(!Number.isInteger(i.expectedCount)||i.expectedCount<1){warn(`对象 ${i.id} 重复数量无效`);i.expectedCount=null;i.resourceInvalidCount=true;}}
    if(i.text!=null&&typeof i.text!=='string'){warn(`对象 ${i.id} OCR 字段无效`);i.text=null;}
    items.push(i);
  }
  for(const i of items)if(i.panelId&&!ids.has(i.panelId)){warn(`对象 ${i.id} 面板引用无效`);i.panelId=null;}
  const relations=(key,valid)=>{if(!Array.isArray(raw?.[key])){warn(`缺少 ${key} 证据`);return [];}return raw[key].filter(r=>{if(r&&valid(r))return true;warn(`${key} 引用无效`);return false;});};
  const layers=relations('layers',r=>ids.has(r.backItemId)&&ids.has(r.frontItemId)&&r.backItemId!==r.frontItemId&&typeof r.reason==='string'&&!!r.reason);
  const connections=relations('connections',r=>[r.itemId,r.fromItemId,r.toItemId].every(id=>ids.has(id)));
  return {canvas:coordinateVerified?{width:W,height:H,units:'source-pixels'}:raw?.canvas,coordinateVerified,coordinateSystem:normalized?'normalized-1000':'source-pixels',rejectedResources,items,layers,connections,...(Array.isArray(raw?.corrections)?{corrections:structuredClone(raw.corrections)}:{}),uncertainties:[...new Set(issues)]};
}
// Substantially overlapping sibling panels indicate a bad coverage map, rather
// than independent workers. Nested panels and shared thin borders are valid.
export function inventoryPartitionConflicts(inventory){
  const panels=inventory.items.filter(i=>/^panel$/i.test(i.kind)),conflicts=[];
  for(let a=0;a<panels.length;a++)for(let b=a+1;b<panels.length;b++){
    const p=panels[a],q=panels[b];
    if(containsBox(p,q)||containsBox(q,p))continue;
    const w=Math.min(p.x+p.w,q.x+q.w)-Math.max(p.x,q.x),h=Math.min(p.y+p.h,q.y+q.h)-Math.max(p.y,q.y);
    if(w>2&&h>2&&w*h/Math.min(p.w*p.h,q.w*q.h)>.08)conflicts.push([p.id,q.id]);
  }
  return conflicts;
}
// A second look may correct an erroneous count or panel, but must explain every
// replaced identity explicitly. Preserve both inventories in the audit trail.
export function inventoryCorrectionComplete(previous,next,W,H){
  const resources=resourceManifest(next,W,H);
  if(!next.coordinateVerified||resources.some(r=>r.state!=='confirmed')||inventoryPartitionConflicts(next).length)return false;
  return previous.items.every(old=>{
    const correction=next.corrections?.find(c=>c.itemId===old.id);
    if(correction)return correction.verifiedFromOriginal===true&&typeof correction.reason==='string'&&!!correction.reason.trim()&&Array.isArray(correction.replacementIds)&&correction.replacementIds.length>0&&new Set(correction.replacementIds).size===correction.replacementIds.length&&correction.replacementIds.every(id=>next.items.some(i=>i.id===id));
    if(!isRasterItem(old))return next.items.some(i=>i.id===old.id&&i.kind===old.kind);
    const children=next.items.filter(i=>isRasterItem(i)&&(i.id===old.id||i.sourceItemId===old.id));
    return children.length===(old.expectedCount??1)&&children.every(i=>resources.some(r=>r.itemId===i.id&&r.state==='confirmed'));
  });
}
// Resource identity is independent of the model's primitive counts.
export const isRasterItem=item=>/^(photo(?:graph)?s?|photographic|image|video[-_ ]?frames?|heat[-_ ]?maps?|照片|图片|视频帧|热力图)$/i.test(String(item?.kind||''));
export function resourceManifest(inventory,W,H){
  return [...inventory.items.filter(isRasterItem),...(inventory.rejectedResources||[])].map(item=>({itemId:item.id,kind:item.kind,source:{width:W,height:H},crop:{x:Math.floor(item.x),y:Math.floor(item.y),w:Math.ceil(item.x+item.w)-Math.floor(item.x),h:Math.ceil(item.y+item.h)-Math.floor(item.y)},expectedCount:item.expectedCount??1,layers:inventory.layers.filter(l=>l.backItemId===item.id||l.frontItemId===item.id),state:!item.resourceInvalidCount&&!inventory.rejectedResources?.some(r=>r.id===item.id)&&inventory.coordinateVerified&&item.x>=0&&item.y>=0&&item.x+item.w<=W&&item.y+item.h<=H&&(item.expectedCount==null||item.expectedCount===1)?'confirmed':'unresolved'}));
}
// Bind only independently reconstructed, original-pixel crops. A valid inventory
// rectangle alone is not evidence that the rectangle contains the right photo.
export function reconcileResourceCrops(manifest,scene){
  const images=(scene.nodes||[]).filter(n=>n.type==='image'&&n.href&&n.sourceCrop&&n.sourceCanvas);
  const agrees=(r,n)=>{
    const c=n.sourceCrop;
    if(r.state!=='confirmed'||r.expectedCount!==1||n.sourceCanvas.width!==r.source.width||n.sourceCanvas.height!==r.source.height)return false;
    if(!['x','y','w','h'].every(k=>Number.isFinite(c[k])&&Math.abs(c[k]-n[k])<=2))return false;
    const intersection=Math.max(0,Math.min(c.x+c.w,r.crop.x+r.crop.w)-Math.max(c.x,r.crop.x))*Math.max(0,Math.min(c.y+c.h,r.crop.y+r.crop.h)-Math.max(c.y,r.crop.y));
    return intersection/(c.w*c.h+r.crop.w*r.crop.h-intersection)>=.8;
  };
  const matches=manifest.map(r=>images.filter(n=>agrees(r,n)));
  for(let i=0;i<manifest.length;i++){
    const candidates=matches[i];
    if(candidates.length!==1||matches.filter(m=>m.includes(candidates[0])).length!==1)continue;
    const n=candidates[0];
    if(!n.sourceAssetId||n.sourceAssetId===manifest[i].itemId)n.sourceAssetId=manifest[i].itemId;
  }
  return scene;
}
export function resourceDefects(manifest,scene){
  const bound=structuredClone(scene);reconcileResourceCrops(manifest,bound);
  // Recompute every identity together, including cross-resource ambiguity.
  // An old sourceAssetId must never bypass the one-to-one matching rule.
  const fresh=structuredClone(scene);for(const n of fresh.nodes||[])delete n.sourceAssetId;
  reconcileResourceCrops(manifest,fresh);
  return manifest.flatMap(r=>{
    // An unresolved inventory guess is evidence to review, not proof that a
    // photograph is missing. Keep it in final validation without scheduling
    // edits that could replace a correct mixed-content panel with a crop.
    if(r.state!=='confirmed')return [{...r.crop,itemId:r.itemId,inventoryUncertain:true,objectIds:[],reason:'原图资源清单的类别、数量或坐标未确认；需核对原图，不能据此判定照片缺失或自动覆盖'}];
    const nodes=bound.nodes.filter(n=>n.type==='image'&&n.sourceAssetId===r.itemId);
    const valid=nodes.length===1&&nodes[0].href&&nodes[0].sourceCrop&&nodes[0].sourceCanvas&&['x','y','w','h'].every(k=>Math.abs(nodes[0].sourceCrop[k]-nodes[0][k])<=2);
    // Recompute agreement even for existing IDs: stale identity is not proof.
    const confirmed=fresh.nodes.filter(n=>n.sourceAssetId===r.itemId).length===1;
    return valid&&confirmed?[]:[{...r.crop,itemId:r.itemId,resourceMissing:true,objectIds:nodes.map(n=>n.id),reason:'照片缺失、重复或两次定位不一致；对照原图核对真实边界后修复，禁止按清单坐标直接覆盖'}];
  });
}
export function repairStatus(audit,zh=true){
  const state=!audit.repairRounds?'not-executed':audit.finalValidation?.state==='passed'?'passed':audit.resourceRepairs?.some(r=>r.state==='failed')||Object.values(audit.regionStates||{}).some(r=>r.error)?'failed':'needs-review';
  return zh?({'not-executed':'未执行局部修补',passed:'一轮修补完成并通过验收',failed:'一轮修补执行失败，保留草稿','needs-review':'一轮修补已执行，仍未通过完整验收'}[state]):({'not-executed':'Local repair was not executed',passed:'One repair round passed validation',failed:'Repair failed; draft retained','needs-review':'One repair round executed; validation still incomplete'}[state]);
}
// Conservative renderer geometry guard. Minor font differences and separately
// positioned mathematical glyphs remain the responsibility of visual review.
export function textGeometryDefects(scene,W,H){
  const defects=[],ink=[];
  const box=(n,b,reason,ids=[n.id],severity=0)=>{
    const x=Math.max(0,b.x),y=Math.max(0,b.y),right=Math.min(W,b.right),bottom=Math.min(H,b.bottom);
    if(right>x&&bottom>y)defects.push({x,y,w:right-x,h:bottom-y,kind:'text',objectIds:ids.filter(Boolean),reason,severity});
  };
  for(const n of scene.nodes||[]){
    if(n.type!=='text'||n.rotation||n.textPath?.d||!String(n.text||'').trim()||![n.x,n.y,n.w,n.h].every(Number.isFinite))continue;
    // Emoji pictograms have font-dependent ink metrics. Their visual size is
    // checked against the source render, not the ordinary text box metric.
    if(/^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\uFE0F|\u200D|\s)+$/u.test(n.text))continue;
    const original=Math.max(6,Number(n.fontSize)||16),fitted=layoutEditableText(n.text,{...n,fontSize:original});
    if(fitted.measuredWidth==null)continue;
    const width=fitted.measuredWidth*fitted.fontSize/original,height=fitted.measuredHeight*fitted.fontSize/original;
    const x=n.x+(n.anchor==='middle'?(n.w-width)/2:n.anchor==='end'?n.w-width:0);
    const y=n.y+(n.verticalAlign==='middle'?(n.h-height)/2:0),b={x,y,right:x+width,bottom:y+height};
    // A fitting text box can still sit outside the slide. Check the measured
    // ink against the export canvas as well; Office/SVG silently clip it.
    // Keep a small tolerance for font metrics, as with ordinary box overflow.
    const edgeTolerance=Math.max(3,original*.15);
    const clippedWidth=Math.max(0,-b.x)+Math.max(0,b.right-W);
    const clippedHeight=Math.max(0,-b.y)+Math.max(0,b.bottom-H);
    if(clippedWidth>edgeTolerance||clippedHeight>edgeTolerance){
      // Fully off-canvas text still needs an inspectable region at the nearest
      // edge. An empty intersection would otherwise silently drop the defect.
      const ex=Math.max(0,Math.min(W-Math.min(width,W),b.x)),ey=Math.max(0,Math.min(H-Math.min(height,H),b.y));
      box(n,{x:ex,y:ey,right:ex+Math.min(width,W),bottom:ey+Math.min(height,H)},'文字可见范围超出画布边界，导出会被截断，需结合原图修正位置或文字框',[n.id],(clippedWidth+clippedHeight)/original);
    }
    // Export permits a modest correction. Flag only overflow remaining after
    // that correction, with additional room for canvas/Office font differences.
    if(width>n.w+Math.max(3,original*.15)||height>n.h+Math.max(3,original*.15))box(n,b,'文字在允许的字体微调后仍超出布局框，需核对原图并调整文字框或字号',[n.id],Math.max(0,width-n.w)/original+Math.max(0,height-n.h)/original);
    if(!/[=∑∫√π]/u.test(n.text))for(const [lineIndex,line] of fitted.text.split('\n').entries()){
      if(!/[\p{L}]{2}/u.test(line))continue;
      const lineWidth=fitted.lineWidths[lineIndex]*fitted.fontSize/original;
      const lineX=n.x+(n.anchor==='middle'?(n.w-lineWidth)/2:n.anchor==='end'?n.w-lineWidth:0);
      const lineY=y+lineIndex*fitted.fontSize*1.14;
      ink.push({n,b:{x:lineX,y:lineY,right:lineX+lineWidth,bottom:lineY+fitted.fontSize},font:fitted.fontSize});
    }
  }
  for(let i=0;i<ink.length;i++)for(let j=i+1;j<ink.length;j++){
    const a=ink[i],b=ink[j],w=Math.min(a.b.right,b.b.right)-Math.max(a.b.x,b.b.x),h=Math.min(a.b.bottom,b.b.bottom)-Math.max(a.b.y,b.b.y);
    if(a.n===b.n)continue;
    if(w>Math.max(4,Math.min(a.font,b.font)*.35)&&h>Math.min(a.font,b.font)*.65){
      box(a.n,{x:Math.min(a.b.x,b.b.x),y:Math.min(a.b.y,b.b.y),right:Math.max(a.b.right,b.b.right),bottom:Math.max(a.b.bottom,b.b.bottom)},'普通文字的可见范围明显重叠，需结合原图核对行距与位置',[a.n.id,b.n.id],w*h/Math.min(a.font,b.font)**2);
    }
  }
  return defects;
}
// Fixing one label must not buy permission to damage another. Compare defect
// identities and severity rather than just totals; preserve multiplicity for
// multiline text. Match the smallest sufficient allowance first so the order
// of source lines or defect reports cannot hide a worsening collision.
export function textGeometryRegressions(before,after){
  const key=d=>JSON.stringify([d.reason,[...new Set(d.objectIds||[])].sort()]);
  const remaining=new Map();
  const severity=d=>Number.isFinite(d.severity)?Math.max(0,d.severity):0;
  for(const d of before){const k=key(d);if(!remaining.has(k))remaining.set(k,[]);remaining.get(k).push(severity(d));}
  for(const values of remaining.values())values.sort((a,b)=>a-b);
  return after.filter(d=>{
    const values=remaining.get(key(d))||[],amount=severity(d);
    // Allow a small metric difference without permitting accumulated damage:
    // every candidate is compared to the geometry before this repair.
    const match=values.findIndex(previous=>amount<=previous+Math.max(.05,previous*.05));
    if(match<0)return true;
    values.splice(match,1);return false;
  });
}
export function normalizeDiagnosis(raw,W,H){
  const issues=Array.isArray(raw?.uncertainties)?[...raw.uncertainties]:['缺少诊断不确定项证据'];
  const defects=[];
  if(!Array.isArray(raw?.defects))issues.push('缺少具体缺陷清单');
  for(const d of Array.isArray(raw?.defects)?raw.defects:[]){
    const b=Object.fromEntries(['x','y','w','h'].map(k=>[k,typeof d?.[k]==='string'&&d[k].trim()?Number(d[k]):d?.[k]]));
    if(!Object.values(b).every(Number.isFinite)||b.x<0||b.y<0||b.w<=0||b.h<=0||b.x+b.w>W+1||b.y+b.h>H+1||typeof d?.reason!=='string'||!d.reason){issues.push('诊断中有无效缺陷区域，未用于修补');continue;}
    defects.push({...d,...b,objectIds:Array.isArray(d.objectIds)?d.objectIds.filter(id=>typeof id==='string'):[]});
  }
  if(typeof raw?.complete!=='boolean'||typeof raw?.wholeImageAcceptable!=='boolean'||typeof raw?.summary!=='string'||!Array.isArray(raw?.coverage)||!raw.coverage.length||raw.coverage.some(r=>typeof r?.region!=='string'||!Array.isArray(r.missingGroups)))issues.push('整图验收结构不完整');
  return {...raw,defects,uncertainties:[...new Set(issues)],complete:raw?.complete===true&&!defects.length&&!issues.length};
}
export function normalizePanelInspection(raw,region){
  const normalized=normalizeDiagnosis({...raw,wholeImageAcceptable:raw?.complete===true,summary:'panel inspection',coverage:[{region:region.id,missingGroups:[]}],uncertainties:Array.isArray(raw?.uncertainties)?raw.uncertainties:[]},region.w,region.h);
  if(raw?.complete===false&&!normalized.defects.length)normalized.uncertainties.push('分区未通过但未提供可定位缺陷');
  normalized.complete=normalized.complete&&!normalized.uncertainties.length;
  normalized.defects=normalized.defects.map(d=>({...d,x:d.x+region.x,y:d.y+region.y,inspectionRegion:region.id}));
  return normalized;
}
export const typographyTolerance = ' Typography acceptance: slight differences in font family/style, weight, glyph metrics, or size (including slightly smaller text) are acceptable when the wording, readability, mathematical meaning, grouping and layout remain intact. Such differences alone are NOT defects, failed evidence, uncertainty, missing coverage, or a reason to repair. Judge painted text in context, not bounding-box coordinates or a few pixels of baseline/glyph-edge offset: when the text remains correctly associated with the same object and aligned within its intended row, column or panel, that offset alone does not justify repair. For a position defect, identify the visibly broken alignment, association, spacing or containment; for overlap/clipping identify the affected text and obstructing object. Do not invent a universal minimum font size or enlarge readable small source labels. Still report missing/wrong/duplicated text, unreadable text, clipping/overlap, substantial displacement or scale changes, and incorrect mathematical symbols or script/fraction relationships. Aim for the closest practical source typography during reconstruction; do not spend a repair on harmless font variation. ';
export const connectorFidelity = ' CONNECTOR GEOMETRY: Follow the visible source route rather than inferring a semantic connection. Measure endpoints, bends, curve control points, shared junctions and each arrowhead independently. Preserve dashed/dotted spacing using dash:[on,off,...] in source pixels on lines, polylines or paths, including curved and closed routes. Do not replace a dashed loop with a solid ellipse, a measured route with a generic U-shape, or a double-headed arrow with a single head. Represent each visible head as a separately measured filled closed path with fill matching the source and stroke:"none"; keep its shaft plain to avoid duplicate marker heads. A closed route with heads needs an explicit path plus independent heads. Preserve the source head count, direction, size and position. These differences are actionable geometry defects even when endpoint labels are correct; report bounded defects and affected existing IDs. ';
export function evidencePrompt(inventory){
  return typographyTolerance+connectorFidelity+' Fixed ORIGINAL-ONLY inventory (do not replace or shorten): '+JSON.stringify(inventory)+'. In addition to defects/coverage, return inventoryComplete:boolean, unlistedSourceItems:[], uncertainties:[], evidence:[{itemId,status:"passed|failed|uncertain",nodeIds:["actual catalog ID"],instances:[["node IDs for unit 1"]],reason:"visible source versus render comparison"}]. Include EXACTLY one evidence row per inventory item. Keep the output compact: for a passed row use a short concrete reason (at most 8 words); failed reasons should name the mismatch without repeating inventory descriptions. Do not repeat the catalog, inventory, geometry, or analysis in evidence reasons. Retain every row, required ID, instance, coverage entry and independently visible defect; compact wording must never omit checks or findings. Inspect the ORIGINAL again for content absent even from the inventory; report it in unlistedSourceItems. Missing from the inventory does not mean missing from the rendering: emit a bounded defect only after independently locating an actual source-versus-render discrepancy. The ORIGINAL pixels are authoritative; inventory OCR and descriptions can be wrong. Never replace correct rendered wording with inventory wording contradicted by the source image. If inventory text is inaccurate, record the exact source reading and affected item in uncertainties rather than inventing a rendering defect. An inventory omission or contradiction still prevents complete acceptance. For each item verify geometry, OCR, repeated-unit count, colors, layer/occlusion and connector endpoints against the actual rendering, not catalog claims. Perform an explicit second visual sweep in reading order across EVERY panel, including items omitted by the inventory. Check only categories present in the image, independently: (1) exact readable wording and mathematical meaning; preserve scripts, fractions and visible symbols, and do not output literal underscores, carets, braces or markup absent from the source; (2) panel layout, frames, fills, alignment and whitespace; (3) counts, internal components, colors and opacity of actual icons, shapes and repeated instances, without imposing a particular icon anatomy; (4) connectivity, endpoints, arrowheads and labels of each actual connected diagram, including deep or faded branches when present; (5) charts: axes, ticks, legends and data marks; tables: row/column structure, separate cell text, separators and fills; (6) photographs and other raster crops, their placement and stacking; (7) invented white rectangles, opaque text-box fills or crop-sized backgrounds covering source ink or panel colors. Report these extra shapes with their actual catalog IDs and bounded coordinates even when all foreground text is correct. Compare actual pixels, not semantic similarity or a plausible diagram. A correct title does not make the panel complete. For each failed or uncertain evidence row, emit all independently visible discrepancies as tightly bounded defects with explicit source-versus-render reasons; do not leave an actionable discrepancy only in an evidence reason, summary or unlistedSourceItems. A missing object uses objectIds:[]; a malformed existing object uses its actual catalog IDs. Keep separate defects for disjoint regions so all affected regions enter the single repair round. Do not skip small or repeated elements because larger defects already exist. Passed node IDs must exist and correspond to the visible item. Cite the complete set of IDs needed to substantiate its checked text, colors and components; a representative title, frame or single bar cannot substantiate an entire content group. For a connection network, compare its full visible route against the source: shared trunks, bends, junction positions, every branch, endpoints and arrowhead directions. Independent arrows with the same semantic endpoints do not pass when the source has a shared trunk. A missing trunk or branch is a bounded missing-geometry defect even if all endpoint labels are present. instances is required for expectedCount items; each unit has disjoint IDs. Every mismatch requires a tightly bounded defect, with objectIds ONLY for existing objects that genuinely need correction. Missing objects require no fabricated IDs. complete/wholeImageAcceptable may be true only if every item and every layer/connection passes, no unlisted item and no uncertainty remains.';
}
export function localInspectionPrompt(audit){
  return typographyTolerance+connectorFidelity+`LOCAL PATCH ACCEPTANCE. The crop includes read-only padding. The ORIGINAL crop pixels are the authority; inventory counts, descriptions and earlier defect reports are fallible hypotheses. Independently locate each alleged source-versus-render mismatch in the original crop before reporting it. For a missing photograph or repeated object, identify its actual separate visible source rectangle; never infer additional instances from inventory counts or surrounding layout. Do not turn an inventory contradiction into a rendering defect. If source evidence is ambiguous, report the specific uncertainty instead of inventing content. Inspect EVERY original element within or crossing the repair ownership rectangle in CROP-RELATIVE pixels: ${JSON.stringify(audit.ownership)}. Check all owned content, not merely the listed defects, including boundary crossings, missing primitives, text, alignment and occlusion. Existing defects wholly outside ownership belong to the final whole-image gate; record them separately in contextDefects rather than using them to reject this local patch. Never ignore a defect intersecting ownership, even when its catalog object is read-only. Apply the typography acceptance rule above to EVERY decision, including complete and uncertainty: harmless font variation must not make an otherwise valid patch fail. A text ending slightly earlier or using a slightly smaller size is acceptable when its full wording, readability, grouping and layout remain intact. complete may be true only if ALL owned content matches the source under these acceptance rules, defects is empty and no owned-content uncertainty remains. Missing characters, changed words, incorrect math, clipping, overlap and substantial displacement still fail acceptance. The final whole-image gate still inspects the entire image. Original diagnosed defects use GLOBAL source coordinates: ${JSON.stringify(audit.feedback?.defects||[])}. Source crop position: ${JSON.stringify({x:audit.sourceRegion?.x,y:audit.sourceRegion?.y})}. `;
}
export function patchPrompt(W,H,audit,serialize=JSON.stringify){
  return typographyTolerance+connectorFidelity+rasterRecognitionPolicy+'Return STRICT JSON {"operations":[],"uncertainties":[]}. Image 1 is the native-resolution ORIGINAL crop; image 2 is source context; image 3 is the CURRENT crop rendering; image 4 is the full source. Compare them and correct ALL visibly diagnosed discrepancies using the allowed operations below; use add ONLY for genuinely missing objects. Diagnosis and inventory are fallible hypotheses, not authoritative transcriptions. Verify each proposed correction directly against image 1 before editing: never change correct rendered wording to match a mistaken defect report or inventory OCR. If the reported defect contradicts the original pixels, leave the correct object unchanged and record the contradiction, exact source reading and affected IDs in uncertainties. Existing catalog.nodes are mutable ONLY when their IDs appear in diagnosedIds; catalog.readOnlyContext is immutable. Never redraw correct objects or entire panels. Allowed operations: {op:"add",node:{type,...}}, {op:"update",id,version,node:{...complete corrected primitive...}}, {op:"style",id,version,changes:{fill,stroke,strokeWidth,dash}}, {op:"reorder",id,version,afterId}, {op:"reorder",id,version,position:"front|back"}, {op:"delete",id,version}. Update OCR or delete a duplicate ONLY for an explicitly diagnosed ID and visible source evidence. Preserve unrelated properties. Never split or merge correct objects. Exception: an explicitly diagnosed coarse primitive that incorrectly combines distinct source objects may be replaced using delete/update plus separate add operations, preserving all source content and immutable context. Nodes use rect/ellipse {x,y,w,h,fill,stroke,strokeWidth}, line {x,y,x2,y2,stroke,strokeWidth,dash}, polyline {points,closed,fill,stroke,strokeWidth,dash}, path {d,fill,stroke,strokeWidth,dash}, text {x,y,w,h,text,fontSize,fill,fontFamily,bold,anchor,rotation}, image {x,y,w,h}. Use images only for photographs, video frames and heatmaps, never as a substitute for editable text/diagrams. Coordinates and font sizes are crop pixels, '+W+' x '+H+'; text x,y is box TOP-LEFT. Preserve exact OCR, repeated-unit counts, colors and back-to-front stacking. Stay inside ownership bounds and outside excludeRects. Reorder relative to existing IDs, without changing unrelated stacking. No invented unreadable text; report uncertainties instead.  Resolve ALL listed defects inside this ownership region in this single response, including defects sharing the same crop; correcting only its title while leaving missing internals is incomplete. Inspect every visible source instance against the current crop: the actual shapes and their interior parts, connectors, repeated objects, fills, chart marks, table cells and typeset mathematics, where present. Add each missing primitive separately with exact geometry and colors. Existing diagnosed coarse primitives may be corrected with update; add absent independent components with add, without changing immutable or already-correct objects. Never replace detailed geometry with a generic symbol or a table with pipe-delimited text. Preserve readable typography, line grouping and mathematical layout; do not print markup that is not visible in the source. A text box width is not the visible glyph width: catalog x/y/w/h describe layout bounds, not the actual painted letters. For significant text defects, compare the actual visible letters and layout in image 3 against image 1; matching catalog bounds alone cannot establish correct rendering. Apply the typography acceptance policy above. Image 3 is the actual target renderer, including PowerPoint font metrics when exported there. Correct the diagnosed font family, font size, position or wrapping using visible source evidence; do not assume the renderer automatically fits text to its box. Preserve exact wording and unrelated text properties. Before returning check every feedback entry and every inventory instance in the ownership region against the proposed operations. If a required correction cannot be made within ownership or diagnosedIds, state that specific limitation in uncertainties rather than silently returning a partial fix. Empty operations is valid. Catalog: '+serialize(audit.detailCatalog)+' diagnosedIds: '+JSON.stringify(audit.diagnosedIds)+' ownership: '+JSON.stringify(audit.ownership)+' sourceRegion: '+JSON.stringify(audit.sourceRegion)+' defects: '+JSON.stringify(audit.feedback)+' fixed source inventory in GLOBAL coordinates: '+JSON.stringify(audit.sourceChecklist);
}
const norm=s=>String(s??'').replace(/\s+/g,'');
const rgb=s=>/^#[\da-f]{6}$/i.test(s||'')?[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)):null;
export function validateEvidence(inventory,scene,result,bounds){
  const errors=[], rows=Array.isArray(result?.evidence)?result.evidence.filter(e=>e&&typeof e==='object'):[], byId=new Map(scene.nodes.map((n,i)=>[n.id,{n,i}]));
  if(Array.isArray(result?.evidence)&&rows.length!==result.evidence.length)errors.push({reason:'无效的对象验收证据'});
  if(!inventory.items.length)errors.push({reason:'缺少有效原图对象清单'});
  const matches=new Map();
  for(const item of inventory.items){
    const found=rows.filter(e=>e.itemId===item.id), e=found[0];
    const ids=e?.nodeIds;
    const failures=[];
    const verify=(valid,code,reason)=>{if(!valid)failures.push({code,reason});return valid;};
    let ok=verify(found.length===1,'evidence-row','对象验收证据缺失或重复')
      &&verify(e.status==='passed','visual-status','对象未通过原图与渲染图的视觉核对')
      &&verify(typeof e.reason==='string'&&!!e.reason.trim(),'evidence-reason','缺少具体核对说明')
      &&verify(Array.isArray(ids)&&ids.length>0&&new Set(ids).size===ids.length&&ids.every(id=>byId.has(id)),'evidence-ids','对象证据 ID 缺失、重复或不存在');
    const nodes=ok?ids.map(id=>byId.get(id).n):[];
    if(ok&&bounds)ok=verify(nodes.every(n=>{const b=bounds(n);return b&&b.x<item.x+item.w+4&&b.right>item.x-4&&b.y<item.y+item.h+4&&b.bottom>item.y-4;}),'evidence-position','引用对象的位置与原图清单区域不相交');
    if(ok&&isRasterItem(item))ok=verify(inventory.coordinateVerified===true&&nodes.every(n=>n.type==='image'&&n.sourceAssetId===item.id&&!!n.href)&&nodes.length===(item.expectedCount??1),'raster-source','原图裁片来源、坐标确认或数量证据不匹配');
    if(ok&&item.text!=null)ok=verify(norm(nodes.filter(n=>n.type==='text').map(n=>n.text).join(''))===norm(item.text),'evidence-text','引用文字与清单文字不一致，需核对原图像素');
    if(ok&&item.expectedCount!=null){
      const units=e.instances;
      ok=Array.isArray(units)&&units.length===item.expectedCount&&units.every(u=>Array.isArray(u)&&u.length>0&&u.every(id=>ids.includes(id)));
      if(ok){const flat=units.flat();ok=new Set(flat).size===flat.length&&new Set(flat).size===ids.length;}
      verify(ok,'evidence-count','重复对象的数量、独立分组或证据覆盖不完整');
    }
    if(ok&&!isRasterItem(item))for(const c of item.colors){const a=rgb(c.value);if(!verify(nodes.some(n=>{const b=rgb(c.role==='stroke'?n.stroke:n.fill);return b&&b.every((v,i)=>Math.abs(v-a[i])<=32);}), 'evidence-color','引用对象未提供颜色证据：'+c.role+' '+c.value))ok=false;}
    matches.set(item.id,ok?ids:[]);
    if(!ok)errors.push({itemId:item.id,code:failures[0].code,reason:failures.map(f=>f.reason).join('；')});
  }
  if(rows.length!==inventory.items.length||rows.some(e=>!matches.has(e.itemId)))errors.push({reason:'检查证据数量或 ID 不匹配'});
  for(const l of inventory.layers){const back=matches.get(l.backItemId),front=matches.get(l.frontItemId);if(!back?.length||!front?.length||Math.max(...back.map(id=>byId.get(id).i))>=Math.min(...front.map(id=>byId.get(id).i)))errors.push({itemId:l.frontItemId,reason:'图层顺序未通过：'+l.reason});}
  for(const c of inventory.connections)if(![c.itemId,c.fromItemId,c.toItemId].every(id=>matches.get(id)?.length))errors.push({itemId:c.itemId,reason:'连接或端点对象缺失'});
  if(inventory.uncertainties.length||result?.uncertainties?.length||!Array.isArray(result?.uncertainties))errors.push({reason:'存在未解决的不确定项或缺少不确定项证据'});
  if(result?.inventoryComplete!==true||!Array.isArray(result?.unlistedSourceItems)||result.unlistedSourceItems.length)errors.push({reason:'原图仍有未盘点内容或盘点完整性未确认'});
  const passed=!errors.length&&result?.complete===true&&result?.wholeImageAcceptable===true&&Array.isArray(result?.defects)&&!result.defects.length;
  return {state:passed?'passed':'failed',errors,evidence:rows,summary:result?.summary||'',defects:result?.defects||[],inventoryComplete:result?.inventoryComplete===true,unlistedSourceItems:result?.unlistedSourceItems,uncertainties:result?.uncertainties};
}

// Inventory OCR is fallible. Only an explicit visual failure can authorize
// fallback repair ownership; uncertain or missing evidence must never rewrite text.
export function groundedEvidenceDefects(inventory,scene,bounds,diagnosis){
  if(inventory.coordinateVerified!==true)return [];
  const defects=[];
  for(const item of inventory.items){
    const rows=(diagnosis?.evidence||[]).filter(row=>row?.itemId===item.id);
    if(rows.length!==1||rows[0].status!=='failed')continue;
    if(!/^(text|label|text[-_ ]?group|cell[-_ ]?text|文字|文本)$/i.test(item.kind)||!norm(item.text)||![item.x,item.y,item.w,item.h].every(Number.isFinite)||item.w<=0||item.h<=0)continue;
    const touching=scene.nodes.filter(n=>n.type==='text').map(n=>{const b=bounds(n),pad=n.textPath?.d?0:Math.max(2,Number(n.fontSize||16)*.25);return {n,b:b&&{x:b.x+pad,y:b.y+pad,right:b.right-pad,bottom:b.bottom-pad}};}).filter(({b})=>b&&b.x<item.x+item.w&&b.right>item.x&&b.y<item.y+item.h&&b.bottom>item.y);
    // A box crossing the source item's boundary has ambiguous ownership.
    if(touching.some(({b})=>b.x<item.x-4||b.y<item.y-4||b.right>item.x+item.w+4||b.bottom>item.y+item.h+4))continue;
    const actual=touching.map(({n})=>n.text).join('');
    if(norm(actual)===norm(item.text))continue;
    defects.push({x:item.x,y:item.y,w:item.w,h:item.h,kind:'text',itemId:item.id,objectIds:touching.map(({n})=>n.id),reason:'Visual evidence reports a failure; verify ORIGINAL pixels before editing. Inventory text: '+item.text+'; current text: '+actual});
  }
  return defects;
}

// Some providers return inventory IDs in defect.objectIds. Resolve only explicit
// failed evidence, with both source-item and defect overlap; never infer failure.
export function resolveDiagnosisReferences(result,inventory,scene,bounds){
  const nodes=new Map(scene.nodes.map(n=>[n.id,n])),items=new Map(inventory.items.map(i=>[i.id,i]));
  const overlaps=(a,b)=>a&&b&&a.x<b.x+b.w+4&&a.x+a.w>b.x-4&&a.y<b.y+b.h+4&&a.y+a.h>b.y-4;
  const mappings=[];
  const defects=result.defects.map(d=>{
    const objectIds=[];
    for(const id of d.objectIds||[]){
      if(nodes.has(id)){objectIds.push(id);continue;}
      const item=items.get(id),rows=(result.evidence||[]).filter(e=>e?.itemId===id);
      const resolved=inventory.coordinateVerified===true&&item&&overlaps(d,item)&&rows.length===1&&rows[0].status==='failed'
        ?(Array.isArray(rows[0].nodeIds)?rows[0].nodeIds:[]).filter(nodeId=>{const b=nodes.has(nodeId)&&bounds(nodes.get(nodeId));const box=b&&{x:b.x,y:b.y,w:b.right-b.x,h:b.bottom-b.y};return overlaps(box,item)&&overlaps(box,d);}) : [];
      objectIds.push(...resolved);mappings.push({inventoryId:id,resolvedIds:resolved,defect:{x:d.x,y:d.y,w:d.w,h:d.h}});
    }
    return {...d,objectIds:[...new Set(objectIds)]};
  });
  return {defects,mappings};
}

// Every non-add mutation needs both a diagnosed ID and region ownership.
export function guardPatch(patch,diagnosedIds,mutableIds){
  const allowed=new Set(diagnosedIds.filter(id=>mutableIds.includes(id)));
  if(!Array.isArray(patch?.operations)||!Array.isArray(patch?.uncertainties))throw Error('修补结构无效');
  const recovery=patch.recovery||{schema:'patch',repaired:[],rejected:[]},operations=[];
  for(const [index,op] of patch.operations.entries())try{
    if(!['add','update','style','reorder','delete'].includes(op.op))throw Error('不支持的修补操作');
    const ids=op.ids|| (op.id?[op.id]:[]);
    if(op.op==='add'){if(ids.length)throw Error('新增操作不能替换既有对象');}
    else if(ids.length!==1||!allowed.has(ids[0]))throw Error('修补试图改动未诊断或只读对象');
    operations.push(op);
  }catch(error){
    recovery.rejected.push({field:'operations',index,reason:String(error.message)});
  }
  if(patch.operations.length&&!operations.length)throw Error('没有合法修补操作：'+recovery.rejected.map(r=>r.reason).join('；'));
  return {...patch,operations,recovery,allowPartial:false};
}

const containsBox=(a,b)=>b.x>=a.x&&b.y>=a.y&&b.x+b.w<=a.x+a.w&&b.y+b.h<=a.y+a.h;
const intersectsBox=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
// Use complete bounded panels and independent semantic groups. Never resize
// source pixels or let overlapping workers replace one another's content.
// Single-line text, standalone connectors and badges also carry visible detail;
// excluding them leaves arrowheads and mixed typography at whole-image fidelity.
export function planNativeRecognition(inventory,W,H){
  if(!inventory.coordinateVerified)return [];
  const items=inventory.items,panels=items.filter(i=>/^panel$/i.test(i.kind));
  // Contradictory bounds cannot define crop ownership. Isolate their entire
  // footprint without disabling unrelated, independently bounded workers.
  // The original inventory remains intact for confirmation and acceptance;
  // uncovered source ink still receives recognition and visual inspection.
  const conflictIds=new Set(inventoryPartitionConflicts(inventory).flat());
  const conflictAreas=panels.filter(p=>conflictIds.has(p.id));
  // Inventory kinds are open vocabulary (tree, card, diagram, box, ...).
  // Only structural backgrounds/panels and raster assets are excluded here;
  // a positive kind whitelist silently drops valid source regions.
  const background=i=>/^(background|background-fill|canvas|背景|底色)$/i.test(i.kind);
  const connector=i=>/^(connector|arrow|connection|edge|连接线|箭头)$/i.test(i.kind);
  const contentGroup=i=>/^(panel|group|chart|table|tree|diagram|card|box)$/i.test(i.kind);
  // Broad mixed panels can contain several independent diagrams without any
  // nested panel border. Give those coherent groups separate workers too.
  // Text, math primitives and raster crops alone never justify splitting a
  // context-dependent panel. Require substantial, disjoint content groups.
  const sharedContainers=new Set(panels.filter(p=>{
    const children=panels.filter(c=>c.id!==p.id&&containsBox(p,c));
    if(children.some((a,i)=>children.slice(i+1).some(b=>!intersectsBox(a,b))))return true;
    if(p.w*p.h<W*H*.12)return false;
    const groups=items.filter(i=>i.id!==p.id&&contentGroup(i)&&containsBox(p,i)&&
      (i.panelId===p.id||!panels.some(q=>q.id!==p.id&&containsBox(p,q)&&containsBox(q,i))))
      .filter(i=>i.w*i.h>=p.w*p.h*.06&&i.w*i.h<=p.w*p.h*.7);
    return groups.some((a,index)=>groups.slice(index+1).some(b=>!intersectsBox(a,b)&&
      a.w*a.h+b.w*b.h>=p.w*p.h*.2));
  }).map(p=>p.id));
  // Connectors outside a single panel belong to the global worker. Allowing
  // their bounds into the crop union can join otherwise independent panels.
  // Interior connectors remain in their complete panel's recognition request.
  const globalConnector=i=>panels.length>0&&connector(i)&&!panels.some(p=>!sharedContainers.has(p.id)&&containsBox(p,i));
  // A broad inventory group can summarize headings in several panels. It is
  // global context, not permission to union all those independent interiors.
  // Their complete panel workers still inspect every heading inside them.
  const globalShared=i=>!/^panel$/i.test(i.kind)&&!panels.some(p=>containsBox(p,i))&&panels.filter(p=>intersectsBox(p,i)).length>1;
  const semantic=i=>!background(i)&&!/^panel$/i.test(i.kind)&&!isRasterItem(i)&&!globalConnector(i)&&!globalShared(i);
  // Inventory children are not an exhaustive segmentation. A tree-node may
  // describe only its root and headings/badges can be absent altogether. Give
  // their complete panel one owner so those pixels are still inspected. A
  // canvas-sized container remains split into independent groups. Mixed
  // photo panels keep their context; photographs remain source crop assets.
  // A container around several independent panels owns only their shared
  // frame. Sending that container to a worker would absorb all of its child
  // requests again. Keep complete leaf panels; the global worker owns the
  // enclosing frame and uncovered source ink is checked separately below.
  const completePanels=panels.filter(p=>p.w*p.h<W*H*.8&&!sharedContainers.has(p.id));
  // Math-only panels need their complete context: OCR text boxes can omit the
  // bottom of a fraction or scripts. Mixed panels keep their smaller groups.
  const textRegion=i=>{
    const p=panels.find(p=>p.id===i.panelId);
    // A title badge above the body is decoration, not mixed diagram content.
    // Its presence must not make an undersized OCR box crop off a fraction.
    const headerDecoration=s=>/^icon$/i.test(s.kind)&&s.y+s.h<=p.y+p.h*.2;
    return p&&/[πβ∪⊆≤∈_{}]/u.test(i.text||'')&&!items.some(s=>s.panelId===p.id&&(/^panel$/i.test(s.kind)||(semantic(s)&&!/^(text|equation|formula)$/i.test(s.kind)&&!headerDecoration(s))))?p:i;
  };
  const candidates=[...completePanels,...items.filter(semantic)]
    .map(i=>/^text$/i.test(i.kind)?textRegion(i):i)
    .filter(i=>!conflictAreas.some(p=>intersectsBox(p,i)))
    .map(i=>({id:i.id,itemIds:[i.id],x:Math.floor(i.x),y:Math.floor(i.y),w:Math.ceil(i.x+i.w)-Math.floor(i.x),h:Math.ceil(i.y+i.h)-Math.floor(i.y)}))
    .filter(r=>r.x>=0&&r.y>=0&&r.x+r.w<=W&&r.y+r.h<=H)
    .sort((a,b)=>b.w*b.h-a.w*a.h||a.id.localeCompare(b.id));
  const regions=[];
  for(const r of candidates){
    if(regions.some(p=>containsBox(p,r)))continue;
    regions.push(r);
  }
  // Unite partial overlaps transitively; each source pixel has one owner.
  for(let i=0;i<regions.length;i++)for(let j=i+1;j<regions.length;j++)if(intersectsBox(regions[i],regions[j])){
    const a=regions[i],other=regions[j];
    // Adjacent panel bounds often share one antialiased border pixel. Do not
    // turn that rounding overlap into a giant multi-panel recognition request.
    if(panels.some(p=>p.id===a.id)&&panels.some(p=>p.id===other.id)){
      const overlapX=Math.min(a.x+a.w,other.x+other.w)-Math.max(a.x,other.x);
      const overlapY=Math.min(a.y+a.h,other.y+other.h)-Math.max(a.y,other.y);
      if(overlapX<=2){const left=a.x<other.x?a:other,right=left===a?other:a;left.w=right.x-left.x;continue;}
      if(overlapY<=2){const top=a.y<other.y?a:other,bottom=top===a?other:a;top.h=bottom.y-top.y;continue;}
    }
    const b=regions.splice(j,1)[0],right=Math.max(a.x+a.w,b.x+b.w),bottom=Math.max(a.y+a.h,b.y+b.h);
    a.x=Math.min(a.x,b.x);a.y=Math.min(a.y,b.y);a.w=right-a.x;a.h=bottom-a.y;a.itemIds.push(...b.itemIds);i=-1;break;
  }
  // Inventory bounds can end inside a word or a tree's outermost node. Include nearby source pixels,
  // bounded by the parent and other workers, after resolving overlaps so that
  // context padding cannot join a chain of small regions into a whole panel.
  const contextObstacles=[...regions,...conflictAreas,...items.filter(isRasterItem)];
  for(const r of regions){
    const kinds=r.itemIds.map(id=>items.find(i=>i.id===id)?.kind||'');
    const textOnly=kinds.every(kind=>/^text$/i.test(kind));
    if(!textOnly&&!kinds.every(kind=>/^(text|group|chart|table|tree|tree-node|diagram|card|box)$/i.test(kind)))continue;
    const item=items.find(i=>i.id===r.id),p=panels.find(p=>p.id===item?.panelId),pad=textOnly?Math.min(40,Math.max(8,r.w*.2)):16;
    let left=Math.max(0,p?.x||0,r.x-pad),right=Math.min(W,p?p.x+p.w:W,r.x+r.w+pad);
    const verticalPad=textOnly?4:16;
    let top=Math.max(0,p?.y||0,r.y-verticalPad),bottom=Math.min(H,p?p.y+p.h:H,r.y+r.h+verticalPad);
    for(const b of contextObstacles){
      if(b===r)continue;
      if(b.x<r.x+r.w&&b.x+b.w>r.x){
        if(b.y+b.h<=r.y)top=Math.max(top,b.y+b.h);
        if(b.y>=r.y+r.h)bottom=Math.min(bottom,b.y);
      }
    }
    for(const b of contextObstacles){
      if(b===r)continue;
      if(b.y<bottom&&b.y+b.h>top){
        if(b.x+b.w<=r.x)left=Math.max(left,b.x+b.w);
        if(b.x>=r.x+r.w)right=Math.min(right,b.x);
      }
    }
    r.x=Math.floor(left);r.y=Math.floor(top);r.w=Math.ceil(right)-r.x;r.h=Math.ceil(bottom)-r.y;
  }
  // Keep explicit inventory lineage for descendants covered by a larger worker.
  for(const r of regions)r.itemIds=[...new Set([...r.itemIds,...items.filter(i=>containsBox(r,i)).map(i=>i.id)])];
  return regions.sort((a,b)=>a.y-b.y||a.x-b.x);
}
// A model's inventory is a planning hint, not proof that its rectangles cover
// the image. Give substantial uncovered ink an explicit worker and inspection.
export function recognitionCoverageGaps(regions,W,H){
  let gaps=[{x:0,y:0,w:W,h:H}];
  for(const r of regions){
    const next=[];
    for(const g of gaps){
      const l=Math.max(g.x,r.x),t=Math.max(g.y,r.y),right=Math.min(g.x+g.w,r.x+r.w),bottom=Math.min(g.y+g.h,r.y+r.h);
      if(l>=right||t>=bottom){next.push(g);continue;}
      if(t>g.y)next.push({x:g.x,y:g.y,w:g.w,h:t-g.y});
      if(bottom<g.y+g.h)next.push({x:g.x,y:bottom,w:g.w,h:g.y+g.h-bottom});
      if(l>g.x)next.push({x:g.x,y:t,w:l-g.x,h:bottom-t});
      if(right<g.x+g.w)next.push({x:right,y:t,w:g.x+g.w-right,h:bottom-t});
    }
    gaps=next;
  }
  // Subtraction can slice an empty column at unrelated panels' horizontal
  // edges. Rejoin exact neighbors before measuring the source content.
  for(let changed=true;changed;){
    changed=false;
    outer:for(let i=0;i<gaps.length;i++)for(let j=i+1;j<gaps.length;j++){
      const a=gaps[i],b=gaps[j];
      if(a.x===b.x&&a.w===b.w&&(a.y+a.h===b.y||b.y+b.h===a.y)){
        a.y=Math.min(a.y,b.y);a.h+=b.h;
      }else if(a.y===b.y&&a.h===b.h&&(a.x+a.w===b.x||b.x+b.w===a.x)){
        a.x=Math.min(a.x,b.x);a.w+=b.w;
      }else continue;
      gaps.splice(j,1);changed=true;break outer;
    }
  }
  return gaps.sort((a,b)=>a.y-b.y||a.x-b.x);
}
export function uncoveredRecognitionRegions(regions,W,H,hasContent){
  if(!regions.length)return [];
  return recognitionCoverageGaps(regions,W,H).filter(g=>g.w>=W*.035&&g.h>=H*.035&&g.w*g.h>=W*H*.008&&hasContent(g))
    .sort((a,b)=>a.y-b.y||a.x-b.x).map((g,i)=>({...g,id:'uncovered-'+(i+1),itemIds:[],coverageRecovery:true}));
}
// Inventory rectangles are estimates. A cut through a panel's lettering or
// frame must not become a permanent crop boundary. Move panel edges only to
// nearby, sustained source-background corridors; ambiguous images stay put.
export function alignRecognitionBoundaries(canvas,regions,inventory,W,H){
  const context=canvas.getContext?.('2d');
  if(!context?.getImageData||!regions.length)return regions;
  const pixels=context.getImageData(0,0,W,H).data;
  const channels=[[],[],[]],step=Math.max(1,Math.floor(Math.min(W,H)/100));
  for(let x=0;x<W;x+=step)for(const y of [0,H-1])for(let c=0;c<3;c++)channels[c].push(pixels[(y*W+x)*4+c]);
  for(let y=0;y<H;y+=step)for(const x of [0,W-1])for(let c=0;c<3;c++)channels[c].push(pixels[(y*W+x)*4+c]);
  const background=channels.map(a=>a.sort((a,b)=>a-b)[Math.floor(a.length/2)]);
  const panelIds=new Set(inventory.items.filter(i=>/^panel$/i.test(i.kind)).map(i=>i.id));
  const proposals=regions.map(r=>{
    const edges={left:r.x,right:r.x+r.w,top:r.y,bottom:r.y+r.h},corridors={};
    if(!r.itemIds?.some(id=>panelIds.has(id)))return {r,edges,corridors};
    for(const side of ['left','right','top','bottom']){
      const vertical=side==='left'||side==='right',edge=edges[side],limit=vertical?W:H;
      if(edge<=0||edge>=limit)continue;
      const begin=vertical?r.y:r.x,end=vertical?r.y+r.h:r.x+r.w;
      const stride=Math.max(1,Math.floor((end-begin)/450));
      const ink=position=>{
        let count=0,total=0;
        for(let along=begin+stride;along<end-stride;along+=stride){
          const p=((vertical?along:position)*W+(vertical?position:along))*4;
          if(Math.max(...background.map((b,c)=>Math.abs(pixels[p+c]-b)))>45)count++;
          total++;
        }
        return total?count/total:1;
      };
      const radius=Math.min(256,Math.floor(Math.min(r.w,r.h)*.4));
      const searchStart=Math.max(0,edge-radius),searchEnd=Math.min(limit-1,edge+radius);
      const runs=[];let start;
      for(let position=searchStart;position<=searchEnd;position++){
        // A connector may cross a panel gutter. Allow a small ink fraction,
        // while still requiring a sustained corridor rather than one column.
        if(ink(position)<.04){start??=position;}
        else if(start!==undefined){if(position-start>=3&&(start>searchStart||searchStart===0))runs.push([start,position-1]);start=undefined;}
      }
      // Ignore truncated corridors: their apparent midpoint depends on the
      // search window rather than the source. Actual canvas margins are safe.
      if(start!==undefined&&searchEnd===limit-1&&searchEnd-start>=3)runs.push([start,searchEnd]);
      runs.sort((a,b)=>Math.abs((a[0]+a[1])/2-edge)-Math.abs((b[0]+b[1])/2-edge));
      if(runs.length){
        corridors[side]=runs[0];
        const aligned=Math.round((runs[0][0]+runs[0][1])/2);
        // Never discard an outer strip merely because an interior blank looks
        // like a gutter. Inward moves require a neighboring owner below.
        edges[side]=(side==='left'||side==='top')?Math.min(edge,aligned):Math.max(edge,aligned);
      }
    }
    return {r,edges,corridors};
  });
  // Neighboring workers must agree on a shared gutter. Never permit a source
  // pixel to gain two owners after adjusting independently estimated bounds.
  for(let i=0;i<proposals.length;i++)for(let j=i+1;j<proposals.length;j++){
    const a=proposals[i],b=proposals[j];
    for(const [near,far,axis,size,other,otherSize] of [['left','right','x','w','y','h'],['top','bottom','y','h','x','w']]){
      const first=a.r[axis]<=b.r[axis]?a:b,second=first===a?b:a;
      if(first.r[axis]+first.r[size]>second.r[axis]+2)continue;
      if(Math.min(first.r[other]+first.r[otherSize],second.r[other]+second.r[otherSize])<=Math.max(first.r[other],second.r[other]))continue;
      const p=first.corridors[far],q=second.corridors[near];
      if(p&&q&&Math.max(p[0],q[0])<=Math.min(p[1],q[1])){
        first.edges[far]=second.edges[near]=Math.round((Math.max(p[0],q[0])+Math.min(p[1],q[1]))/2);
      }
    }
  }
  const boxes=()=>proposals.map(({r,edges:e})=>({...r,x:e.left,y:e.top,w:e.right-e.left,h:e.bottom-e.top}));
  // Conservative fallback for competing or collapsed proposals. Repeating is
  // necessary because reverting one neighbor can invalidate another expansion.
  for(let pass=0;pass<=regions.length;pass++){
    const current=boxes(),invalid=new Set();
    for(let i=0;i<current.length;i++){
      if(current[i].w<regions[i].w*.5||current[i].h<regions[i].h*.5)invalid.add(i);
      for(let j=i+1;j<current.length;j++)if(intersectsBox(current[i],current[j])){invalid.add(i);invalid.add(j);}
    }
    let changed=false;
    for(const i of invalid){const {r,edges:e}=proposals[i];if(e.left!==r.x||e.top!==r.y||e.right!==r.x+r.w||e.bottom!==r.y+r.h){proposals[i].edges={left:r.x,top:r.y,right:r.x+r.w,bottom:r.y+r.h};changed=true;}}
    if(!changed)break;
  }
  return boxes();
}
export function sourceCoverageRecovery(canvas,regions,W,H){
  const context=canvas.getContext?.('2d');
  if(!context?.getImageData)return [];
  const pixels=context.getImageData(0,0,W,H).data;
  return uncoveredRecognitionRegions(regions,W,H,g=>{
    const bins=new Map();let samples=0,edges=0;
    const step=Math.max(2,Math.floor(Math.min(W,H)/500));
    for(let y=g.y+step;y<g.y+g.h-step;y+=step)for(let x=g.x+step;x<g.x+g.w-step;x+=step){
      const p=(y*W+x)*4,q=p+step*4;
      const key=(pixels[p]>>5)*64+(pixels[p+1]>>5)*8+(pixels[p+2]>>5);
      bins.set(key,(bins.get(key)||0)+1);samples++;
      if(Math.max(Math.abs(pixels[p]-pixels[q]),Math.abs(pixels[p+1]-pixels[q+1]),Math.abs(pixels[p+2]-pixels[q+2]))>35)edges++;
    }
    const dominant=Math.max(0,...bins.values());
    return samples>0&&(samples-dominant)/samples>.035&&edges/samples>.012;
  });
}
export const rasterRecognitionPolicy="PHOTOGRAPHIC CONTENT EXCEPTION: Preserve each actual photograph, video frame, photorealistic rendering or raster heatmap as ONE image node with independently measured tight source-pixel x,y,w,h and href:\"\". The application will extract those exact ORIGINAL pixels. Never trace hands, people, robots, textures or shading inside a photograph into approximate vector shapes. Keep separate source frames as separate image nodes. Do not include neighboring labels, arrows, borders or surrounding panel content in a photo crop; rebuild those as editable primitives above the image where visible. Schematic illustrations, icons, charts, tables, equations and ordinary diagrams remain editable vector/text primitives; never rasterize an entire diagram or panel. This exception takes precedence over instructions to enumerate every primitive. ";
export function nativeLayoutRecognitionPrompt(W,H,inventory,regions){
  const gaps=recognitionCoverageGaps(regions,W,H);
  const gapInstructions=' Explicit global foreground ownership, including narrow gutters: '+JSON.stringify(gaps)+'. Inspect EACH listed rectangle in the original, even a thin strip: it may contain panel numbers, captions, arrow tips or border segments. Reconstruct visible ink there without inventing content in blank gaps. These rectangles are coverage hints, never shapes to draw. Shared frames and cross-region connectors must still be reconstructed in full rather than clipped to these gaps. ';
  return typographyTolerance+connectorFidelity+rasterRecognitionPolicy+gapInstructions+'NATIVE LAYOUT AND UNCOVERED CONTENT recognition. Image 1 is the ORIGINAL '+W+' x '+H+' source pixels. Return STRICT JSON {"canvas":{"width":'+W+',"height":'+H+'},"nodes":[...]}. The following authoritative native crop plan will reconstruct ALL foreground primitives inside its rectangles in separate calls: '+JSON.stringify(regions)+'. Do not duplicate those foreground objects now. Your responsibility is every structural background/frame/header fill extending beyond an individual crop, all visible content OUTSIDE the crop union, and complete connectors crossing crop boundaries. Trace every such connector from its visible origin through all bends and junctions to every visible destination, including portions inside crops. Preserve shared trunks and branching topology; do not replace a shared route with disconnected direct arrows or invent a route from semantic relationships. Inspect the actual original pixels even when an inventory connector box covers only an arrowhead or its description omits a branch; that incomplete hint must not clip or simplify the visible route. Inspect the entire original for uncovered text, headings, badges, arrows and details; reconstruct those fully now. Preserve large panel backgrounds beneath the crops. Do not omit anything merely because its inventory ID belongs to a panel: use the actual crop rectangles to determine coverage. Do not output placeholder objects or simplified versions of cropped foreground content. Do not invent filled header strips, outlines or backgrounds absent from the pixels. Use rounded panel frames where visible. Preserve original colors, thin borders, opacity and back-to-front paint order. Nodes use stable unique id, type rect/ellipse/line/path/polyline/text/image; image: x,y,w,h,href; rect: x,y,w,h,rx; ellipse: cx,cy,rx,ry; line: x1,y1,x2,y2; path: d with SVG source-pixel coordinates; polyline: points [[x,y],...]. Style fields: fill and stroke hex colors or none, strokeWidth, opacity, dash. Text: text,x,y,w,h,fontSize,fontFamily,bold,italic,anchor start/middle/end. Text x,y are TOP-LEFT of the visible box, never center or baseline; alignment is inside the box. Aim for source font sizes, line grouping and the closest practical font family under the typography acceptance policy. Typeset scripts as separately positioned smaller text and fractions with separate bars. Trace visible arrowheads as independent filled closed paths, shafts as plain paths. Include sourceItemId whenever an inventory item identifies the object. All coordinates GLOBAL original pixels. No raster substitutes for editable diagrams or text. Frozen inventory, used as a checklist rather than literal mathematical transcription: '+JSON.stringify(inventory);
}
// A crop must not inherit the contradictory whole-canvas reconstruction prompt.
export function regionalScenePrompt(W,H,audit){
  return 'Reconstruct Image 1 as an editable scene. Return STRICT JSON only: {"canvas":{"width":'+W+',"height":'+H+'},"nodes":[...]}. All geometry and font sizes use Image 1 crop pixels. Nodes have unique id, type and sourceItemId where known; sourceItemId is replacement lineage, not a reason to omit another visible component. Paint order is back to front. Geometry: rect x,y,w,h,radius; ellipse x,y,w,h; line x,y,x2,y2; path d (SVG path); polyline points [[x,y],...],closed; image x,y,w,h,href:"". Style: fill/stroke as hex or none, strokeWidth,opacity,dash. For a visibly rounded rectangle include a nonzero radius. Text: x,y,w,h,text,fontSize,fontFamily,bold,italic,anchor start/middle/end,rotation in degrees. Text x,y are the TOP-LEFT of the enclosing visible box; alignment is inside it. Use the closest practical font or a generic serif or sans-serif family instead of guessing. Preserve visible line breaks; never split a word or label into several text nodes unless its style visibly changes. Check clipping/overlap against actual glyphs, not just text boxes. Complete every visible equation: base glyphs, operators, delimiters, scripts, numerator, denominator and fraction bar. Do not infer an equation from its label or substitute a bare fraction bar for missing terms. Before returning, inspect every heading, formula and repeated group in this crop against Image 1 for omissions. '+regionalRecognitionPrompt(audit)+(audit.sourceChecklist?'\nCrop coverage hints (not a transcription; original pixels take precedence): '+JSON.stringify(audit.sourceChecklist):'');
}
export function regionalRecognitionPrompt(audit){
  const context=audit.fullSourceImage?' IMAGE ROLES: Image 1 is the authoritative native-resolution crop to reconstruct. Image 2 is the complete original, provided ONLY to understand continuous objects and cross-boundary connections. The crop occupies '+JSON.stringify(audit.sourceRegion)+' in that original '+audit.fullSourceWidth+' x '+audit.fullSourceHeight+' canvas. Return coordinates relative to Image 1; never rescale from Image 2 or reconstruct other panels. Read-only shared-object hints below use GLOBAL original coordinates: '+JSON.stringify(audit.sharedObjectContext||[])+' . These hints may be incomplete: verify continuity against both images. A hint does not transfer ownership of independent internal objects to the global request. ':'';
  const ownership=context+' SHARED-OBJECT OWNERSHIP: A separate global request reconstructs complete panel frames/backgrounds extending beyond this crop, and complete connectors crossing its boundary, including their shafts, junctions and arrowheads. Those visible fragments are read-only context here: do not redraw them as cropped borders, strips, connector fragments or duplicate arrowheads. Reconstruct all independent objects fully contained in this crop, including internal frames, backgrounds, connectors and their heads. Ownership follows the visible continuous object, not its inventory label. Do not discard an internal object merely because it touches another object. ';
  return audit.regionalRecognition?typographyTolerance+connectorFidelity+rasterRecognitionPolicy+ownership+' This is ONE native-resolution ORIGINAL region, not a thumbnail. Reconstruct ALL visible primitives owned by this region now, including all shapes and their interior parts, diagram nodes/connectors/arrowheads, chart marks, repeated objects, table cells/grid lines and typeset equation components, wherever these actually occur. Trace the table grid as one consistent shared boundary network: adjacent cells share exactly one separator at the same coordinate. Do not outline each cell as an inset rectangle and also draw a second grid over it. Use fill-only rectangles for cell backgrounds when a shared grid supplies their borders; measure all row/column intersections directly from the image. Measure arrowheads independently from their shafts: output each visible head as its own filled triangle or closed path with explicit source-pixel coordinates and no stroke when the source has none; do not use a generic arrow flag whose marker dimensions are unspecified. Keep shafts as plain lines or paths, stopping at their measured endpoints. Trace repeated content groups independently: preserve the distinct structure, colors, opacity and contents of EACH source instance; do not clone one instance or impose symmetry that the pixels do not show. Coordinates start at (0,0) of this crop. The checklist below is also CROP-RELATIVE. Checklist text may linearize mathematical notation: it is an inventory hint, not a pixel transcription. Read the image itself for each glyph and its position. Typeset visible superscripts and subscripts as separately positioned smaller text nodes, and fractions as numerator, denominator and fraction bar. Measure each equation component against the crop pixels: attach each script immediately to its own base glyph, preserve the visible spacing between terms, and match the endpoints of every fraction bar to the source. A text box is layout metadata, not visible ink; do not use its spare width to position the next glyph. Preserve the exact baseline relationship: ordinary parentheses and braces stay on the base line; only visibly raised or lowered glyphs are scripts. Use editable Unicode mathematical alphabet glyphs when the source uses calligraphic letters, rather than replacing their enclosing parentheses with literal braces or moving the argument into a superscript. Keep an ordinary same-baseline denominator together as one text node when possible; the fraction bar spans the complete denominator, including its leading operator and delimiters. Place its numerator centered over that full span. Operators such as max remain upright; italicize only the variables that are italic in the pixels. Do not copy checklist underscores, LaTeX commands or braces unless those marks are actually visible in the source. Keep each ordinary word and each continuous same-style line in one text node; never split a word into letters, syllables or arbitrary fragments. Separate only visibly different styles, mathematical scripts or independently positioned labels. Match the original line breaks, font size, weight and alignment of prose. Allocate enough width and height for the actual glyphs; do not rely on PowerPoint wrapping or overflow to finish a word. Crop boundaries and text bounding boxes are not source shapes: never add a white rectangle behind a label or across the crop merely to represent its canvas. Include a background or highlight only when its actual source fill or boundary is visible; retain its true color and extent. Do not output global coordinates or content outside this image. Leave fragments of globally owned objects to the global request; preserve the measured boundaries of region-owned objects. Return a complete scene for this crop, not patch operations. No primitive quota or semantic simplification.':'';
}
// A global response can violate the disjoint prompt by drawing an internal
// frame. Keep it as recovery content, but let a successful regional response
// replace it. Never infer ownership of separate connector parts from geometry.
export function nativeGlobalOwnership(scene,regions,inventory,bounds){
  const connectorIds=new Set((inventory?.connections||[]).map(c=>c.itemId).filter(Boolean));
  for(const item of inventory?.items||[])if(/connector|arrow|connection/i.test(item.kind||''))connectorIds.add(item.id);
  const protectedIds=new Set(),regionalFrames=[];
  for(const node of scene.nodes||[]){
    const box=node.type==='rect'&&!node.rotation&&!node.sourceAssetId&&!connectorIds.has(node.sourceItemId)&&bounds(node);
    const owner=box&&regions.find(r=>box.x>=r.x-1e-6&&box.y>=r.y-1e-6&&box.right<=r.x+r.w+1e-6&&box.bottom<=r.y+r.h+1e-6);
    if(owner)regionalFrames.push({id:node.id,regionId:owner.id});
    else protectedIds.add(node.id);
  }
  return {protectedIds,regionalFrames};
}
export function mergeNativeRecognition(scene,detail,region,bounds,translate,protectedIds=new Set()){
  if(!detail?.nodes?.length)throw Error('区域识别没有可编辑对象，保留整图对象');
  const local={x:0,y:0,w:region.w,h:region.h};
  for(const node of detail.nodes){
    const raw=bounds(node),pad=node.type==='text'&&!node.textPath?.d?Math.max(2,Number(node.fontSize||16)*.25):0;
    const b=raw&&{x:raw.x+pad,y:raw.y+pad,right:raw.right-pad,bottom:raw.bottom-pad};
    const tolerance=2;
    if(!b||![b.x,b.y,b.right,b.bottom].every(Number.isFinite)||b.x < -tolerance||b.y < -tolerance||b.right>local.w+tolerance||b.bottom>local.h+tolerance)throw Error('区域对象超出裁图坐标，需重新识别：'+node.id);
  }
  const removedIds=[],crossingIds=[],kept=[];let insertion=-1;
  for(const n of scene.nodes){
    const b=bounds(n),pad=n.type==='text'&&!n.textPath?.d?Math.max(2,Number(n.fontSize||16)*.25):0;
    const box=b&&{x:b.x+pad,y:b.y+pad,w:b.right-b.x-2*pad,h:b.bottom-b.y-2*pad};
    // A coarse object's guessed geometry may cross its source crop boundary.
    // Explicit inventory lineage replaces it in full; geometry alone must not
    // delete unrelated cross-region connectors or source assets.
    const owned=typeof n.sourceItemId==='string'&&region.itemIds?.includes(n.sourceItemId);
    const overlap=box&&Math.max(0,Math.min(region.x+region.w,box.x+box.w)-Math.max(region.x,box.x))*Math.max(0,Math.min(region.y+region.h,box.y+box.h)-Math.max(region.y,box.y));
    // Coarse text can overshoot a crop edge. Its majority ownership still belongs
    // to this region; cross-region connectors and background shapes are retained.
    const ownedText=n.type==='text'&&!n.sourceItemId&&box&&box.w>0&&box.h>0&&overlap/(box.w*box.h)>=.8;
    // In the disjoint native plan, the global request owns shared frames,
    // crossing connectors (including their separate heads) and gutter labels.
    // Their layout boxes may extend inside a crop. Inventory membership and
    // geometric containment must not transfer that explicit responsibility.
    if(!protectedIds.has(n.id)&&!n.sourceAssetId&&box&&(owned||ownedText||containsBox(region,box))){
      if(insertion<0)insertion=kept.length;removedIds.push(n.id);
    }else{kept.push(n);if(box&&intersectsBox(region,box))crossingIds.push(n.id);}
  }
  const ids=new Set(kept.map(n=>n.id));
  // Suppress only a repeated, explicitly identified global frame. A shared
  // inventory ID alone is insufficient: nested frames and separate objects
  // within the same panel must survive. Compare visible paint and every edge.
  const globalFrames=kept.filter(n=>protectedIds.has(n.id)&&n.type==='rect'&&n.sourceItemId);
  const repeatsGlobalFrame=node=>node.type==='rect'&&node.sourceItemId&&globalFrames.some(frame=>{
    if(frame.sourceItemId!==node.sourceItemId)return false;
    const a=bounds(frame),b=bounds(node);
    if(!a||!b||!['x','y','right','bottom'].every(k=>Math.abs(a[k]-b[k])<=2))return false;
    const color=v=>String(v??'none').trim().toLowerCase();
    return ['fill','stroke'].every(k=>color(frame[k])===color(node[k]))&&
      Math.abs(Number(frame.strokeWidth??1)-Number(node.strokeWidth??1))<=.5&&
      ['rx','ry'].every(k=>Math.abs(Number(frame[k]??0)-Number(node[k]??0))<=2)&&
      Number(frame.opacity??1)===Number(node.opacity??1)&&
      JSON.stringify(frame.dash??[])===JSON.stringify(node.dash??[])&&
      !frame.rotation&&!node.rotation;
  });
  const added=detail.nodes.map((n,i)=>{
    const node=translate(n,region.x,region.y);let id=`native-${region.id}-${n.id||i}`;while(ids.has(id))id+='-copy';ids.add(id);return {...node,id};
  }).filter(node=>!repeatsGlobalFrame(node));
  kept.splice(insertion<0?kept.length:insertion,0,...added);
  return {scene:{...scene,nodes:kept},removedIds,crossingIds,addedIds:added.map(n=>n.id)};
}

// Keep repairs owned by separate source panels separate. Ownership is assigned
// only after expanding to the full bounds of every diagnosed object; a shared
// or cross-panel object stays in the global group and is never clipped.
export function planOwnedDefectRegions(scene,defects,W,H,owners,planner){
  if(!owners||owners.length<2)return planner(scene,defects,W,H,[]);
  const groups=new Map();
  for(const defect of defects){
    const expanded=planner(scene,[defect],W,H,[]);
    if(!expanded.length)continue;
    const owner=owners.filter(r=>expanded.every(b=>
      b.coreX>=r.x&&b.coreY>=r.y&&b.coreRight<=r.x+r.w&&b.coreBottom<=r.y+r.h
    )).sort((a,b)=>a.w*a.h-b.w*b.h)[0];
    const key=owner||null;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(defect);
  }
  if(groups.size<2)return planner(scene,defects,W,H,[]);
  return [...groups.values()].flatMap(group=>planner(scene,group,W,H,[]))
    .map((region,index)=>({...region,id:`defect_${index}`,index}));
}

export async function reconstructWithEvidence(canvas,src,request,audit,measure,onProgress,options,api){
  const {createWholeImageCatalog,sceneToSvgString,compactQuality,planDefectRegions,regionObjectCatalog,snapshotVersions,applyRegionPatch,acceptReconstructionRepair,reconstructionQualityDeficit,editableNodeBounds,renderCrop}=api;
  const W=canvas.width,H=canvas.height,whole={x:0,y:0,w:W,h:H};
  let requestFailure;
  const stop=()=>{if(requestFailure)throw requestFailure;if(options.signal?.aborted||(options.deadline&&Date.now()>=options.deadline))throw new DOMException('Stopped or total budget exhausted','AbortError');};
  const call=async(image,w,h,task)=>{
    stop();task.maxAttempts=1;audit.tiles.push(task);
    try{return await request(image,w,h,task);}
    catch(error){
      // Authentication failures cannot be repaired by another image, crop or
      // recovery request. Latch them across all workers and fallback stages.
      const status=Number(error?.status??error?.statusCode??error?.response?.status);
      if([401,403].includes(status)||/\bHTTP\s+(401|403)\b/i.test(String(error?.message))){
        requestFailure=error;audit.requestFailure={state:'stopped',reason:'authentication',status:status||Number(String(error.message).match(/\bHTTP\s+(401|403)\b/i)?.[1])};
      }
      throw error;
    }
  };
  if(options.refine)throw Error('此结果的修补流程已封闭；如需新结果，请手动发起新的重建。');
  audit.strategy='source-inventory-native-regions-one-repair-round';audit.phase='inventory';audit.repairRounds=0;
  let inventory;
  try{inventory=normalizeInventory(await call(src,W,H,{sourceInventory:true,wholeImage:true,inputWidth:W,inputHeight:H}),W,H);}
  catch(error){stop();audit.inventoryError=String(error.message);inventory=normalizeInventory(null,W,H);inventory.uncertainties.push('原图盘点失败：'+audit.inventoryError);}
  if(resourceManifest(inventory,W,H).some(r=>r.state==='unresolved')||inventoryPartitionConflicts(inventory).length){
    audit.originalSourceInventory=structuredClone(inventory);
    try{
      const confirmed=normalizeInventory(await call(src,W,H,{sourceInventory:true,resourceCoordinateConfirmation:true,previousInventory:inventory,inputWidth:W,inputHeight:H}),W,H);
      // A coordinate follow-up cannot silently erase the original resource evidence.
      if(!inventoryCorrectionComplete(inventory,confirmed,W,H))throw Error('资源坐标、逐项身份、数量或分区更正说明不完整，保留原始盘点');
      inventory=confirmed;
    }catch(error){stop();audit.coordinateConfirmationError=String(error.message);}
  }
  audit.sourceInventory=inventory;
  audit.resourceManifest=resourceManifest(inventory,W,H);
  const estimatedRegions=planNativeRecognition(inventory,W,H);
  audit.nativeRecognition={regions:alignRecognitionBoundaries(canvas,estimatedRegions,inventory,W,H),results:[]};
  audit.nativeRecognition.estimatedRegions=estimatedRegions;
  const recoveredCoverage=sourceCoverageRecovery(canvas,audit.nativeRecognition.regions,W,H);
  audit.nativeRecognition.coverageRecovery=recoveredCoverage;
  audit.nativeRecognition.regions.push(...recoveredCoverage);
  audit.phase='recognition';
  const regionsToRecognize=audit.nativeRecognition.regions;
  const task={wholeImage:true,nativeLayout:regionsToRecognize.length>0,nativeRegions:regionsToRecognize,sourceChecklist:inventory,inputWidth:W,inputHeight:H};
  let scene,globalNodeIds=new Set();
  const crop=r=>{const c=document.createElement('canvas');c.width=r.w;c.height=r.h;c.getContext('2d').drawImage(canvas,r.x,r.y,r.w,r.h,0,0,r.w,r.h);return c.toDataURL('image/png');};
  // All recognition requests share a rolling pool. Buffer completions and commit
  // in source order: faster requests cannot change ownership or stacking order.
  const jobs=[null,...regionsToRecognize],ready=new Map();
  let cursor=0,commitCursor=0,commitChain=Promise.resolve(),fatal;
  audit.recognitionConcurrency=3;
  audit.nativeRecognition.globalState='pending';
  const commitReady=async()=>{
    while(ready.has(commitCursor)){
      stop();const result=ready.get(commitCursor);ready.delete(commitCursor);
      if(commitCursor===0){
        if(result.error){fatal=result.error;throw fatal;}
        const initial=result.detail;scene=createWholeImageCatalog(initial);
        if(task.nativeLayout){
          const ownership=nativeGlobalOwnership(scene,regionsToRecognize,inventory,editableNodeBounds);
          globalNodeIds=ownership.protectedIds;
          audit.nativeRecognition.regionalGlobalFrames=ownership.regionalFrames;
        }
        audit.wholeImageNodeCounts={...initial.recognitionCounts,parsed:initial.nodes.length,deduplicated:scene.nodes.length,removedByDeduplication:initial.nodes.length-scene.nodes.length};
        audit.nativeRecognition.globalState='merged';
      }else{
        const {region,record,detail,error}=result;
        try{
          if(error)throw error;
          const merged=mergeNativeRecognition(scene,detail,region,editableNodeBounds,api.translateNode,globalNodeIds);
          scene=merged.scene;Object.assign(record,{state:'merged',parsed:detail.nodes.length,removedIds:merged.removedIds,addedIds:merged.addedIds,crossingIds:merged.crossingIds});
        }catch(error){Object.assign(record,{state:'failed',error:String(error.message)});}
      }
      commitCursor++;await onProgress(scene,false);
    }
  };
  const worker=async()=>{
    while(cursor<jobs.length&&!fatal){
      stop();const index=cursor++,region=jobs[index];let result;
      if(index===0){
        try{result={detail:await call(src,W,H,task)};}
        catch(error){audit.nativeRecognition.globalState='failed';fatal=error;result={error};}
      }else{
      const owned=inventory.items.filter(i=>containsBox(region,i)).map(i=>({...i,x:i.x-region.x,y:i.y-region.y}));
      const sharedObjectContext=inventory.items.filter(i=>intersectsBox(region,i)&&!containsBox(region,i)).map(({id,kind,x,y,w,h,description})=>({id,kind,x,y,w,h,description}));
      const ownedIds=new Set(owned.map(i=>i.id));for(const i of owned)if(!ownedIds.has(i.panelId))i.panelId=null;
      const localInventory={canvas:{width:region.w,height:region.h,units:'source-pixels'},coordinateVerified:true,items:owned,layers:inventory.layers.filter(l=>ownedIds.has(l.backItemId)&&ownedIds.has(l.frontItemId)),connections:inventory.connections.filter(c=>[c.itemId,c.fromItemId,c.toItemId].every(id=>ownedIds.has(id))),uncertainties:[]};
      const record={region:structuredClone(region),state:'pending'};audit.nativeRecognition.results.push(record);
        record.attempts=[];
        for(let attempt=0;attempt<2;attempt++){
          try{
            const detail=await call(crop(region),region.w,region.h,{wholeImage:true,regionalRecognition:true,region:region.id,sourceRegion:region,fullSourceWidth:W,fullSourceHeight:H,fullSourceImage:src,sharedObjectContext,sourceChecklist:localInventory,inputWidth:region.w,inputHeight:region.h,inputScale:1,attempt,feedback:attempt?{error:record.attempts.at(-1).error}:undefined});
            mergeNativeRecognition({nodes:[]},detail,region,editableNodeBounds,api.translateNode);
            result={region,record,detail};record.state='ready';record.attempts.push({attempt,state:'ready'});break;
          }catch(error){stop();record.attempts.push({attempt,state:'failed',error:String(error.message)});result={region,record,error};record.state='failed';record.error=String(error.message);}
        }
      }
      ready.set(index,result);
      commitChain=commitChain.then(commitReady).catch(error=>{fatal=error;});
      // Do not wait for a slower global request or UI rendering to fill a slot.
    }
  };
  const workers=await Promise.allSettled(Array.from({length:Math.min(3,jobs.length)},worker));
  await commitChain;stop();
  if(fatal)throw fatal;
  const failedWorker=workers.find(r=>r.status==='rejected');if(failedWorker)throw failedWorker.reason;
  const failedRegions=audit.nativeRecognition.results.filter(r=>r.state==='failed');
  if(failedRegions.length){
    audit.nativeRecognition.recovery={state:'pending',failedRegions:failedRegions.map(r=>r.region.id)};
    try{
      // A global layout intentionally omits regional foreground. It is never a
      // usable fallback for missing workers: request the COMPLETE original.
      const detail=await call(src,W,H,{wholeImage:true,nativeLayout:false,recognitionRecovery:true,inputWidth:W,inputHeight:H});
      if(!detail?.nodes?.length)throw Error('整图恢复返回空内容');
      scene=createWholeImageCatalog(detail);
      audit.nativeRecognition.recovery.state='recovered';
      await onProgress(scene,false);
    }catch(error){stop();audit.nativeRecognition.recovery={...audit.nativeRecognition.recovery,state:'failed',error:String(error.message)};throw Error('分区识别及整图恢复失败，已停止导出以免产生缺失内容：'+error.message);}
  }
  reconcileResourceCrops(audit.resourceManifest,scene);
  async function assess(candidate){
    reconcileResourceCrops(audit.resourceManifest,candidate);
    stop();audit.phase='quality';
    const measured=await measure(canvas,candidate,whole);
    // The whole-image pass supplies global evidence; panel crops expose small
    // omissions which can disappear in a downscaled overview. Use one shared
    // rolling pool, including the global request, to respect the three-call cap.
    const checks=[null,...regionsToRecognize],checksDone=new Array(checks.length);let checkCursor=0;
    await Promise.all(Array.from({length:Math.min(3,checks.length)},async()=>{
      while(checkCursor<checks.length){
        const index=checkCursor++,region=checks[index];stop();
        try{
          checksDone[index]=region
            ?normalizePanelInspection(await call(crop(region),region.w,region.h,{defectDiagnosis:true,localInspection:true,panelInspection:true,sourceRegion:region,ownership:{x:0,y:0,w:region.w,h:region.h},catalog:regionObjectCatalog(candidate,region),contextImage:await renderCrop(candidate,region)}),region)
            :normalizeDiagnosis(await call(src,W,H,{defectDiagnosis:true,wholeImageAssessment:true,sourceChecklist:inventory,catalog:candidate,contextImage:measured.preview}),W,H);
        }catch(error){stop();checksDone[index]={complete:false,defects:[],uncertainties:[String(error.message)],inspectionError:String(error.message)};}
      }
    }));
    const result=checksDone[0];
    audit.panelInspections=checks.slice(1).map((r,i)=>({region:r.id,...checksDone[i+1]}));
    for(const panel of audit.panelInspections){
      result.defects.push(...panel.defects);
      if(!panel.complete){result.complete=false;result.wholeImageAcceptable=false;}
      result.uncertainties.push(...panel.uncertainties.map(issue=>panel.region+': '+issue));
    }
    const geometry=textGeometryDefects(candidate,W,H);
    result.defects.push(...geometry);if(geometry.length)result.complete=false;
    const validation=validateEvidence(inventory,candidate,result,editableNodeBounds);
    const inspectionErrors=checksDone.filter(check=>check.inspectionError).map(check=>check.inspectionError);
    if(inspectionErrors.length){validation.state='unverified';validation.error=inspectionErrors.join('；');}
    if(geometry.length){validation.state='failed';validation.errors.push(...geometry);}
    return {result,validation,measured,inspectionErrors};
  }
  const firstPass={scene:structuredClone(scene),svg:sceneToSvgString(scene),source:{width:W,height:H},sourceInventory:inventory,nodeCounts:audit.wholeImageNodeCounts,validation:{state:'pending'}};
  await options.onWholeImage?.(firstPass);
  let before;
  try{before=await assess(scene);firstPass.validation=before.validation;firstPass.quality=compactQuality(before.measured);}
  catch(e){stop();audit.diagnosisError=String(e.message);firstPass.validation={state:'unverified',error:String(e.message),errors:[],evidence:[]};before={result:{complete:false,defects:textGeometryDefects(scene,W,H)},validation:firstPass.validation};}
  finally{audit.wholeImageValidation=firstPass.validation;await options.onWholeImage?.(firstPass);}
  audit.defectDiagnosis={complete:before.result.complete,defects:before.result.defects};
  // Repair only concrete source/render defects, never infer missing objects from absent evidence rows.
  const resourceIssues=resourceDefects(audit.resourceManifest,scene);
  audit.resourceInventoryUncertainties=resourceIssues.filter(d=>d.inventoryUncertain);
  const missingResources=resourceIssues.filter(d=>!d.inventoryUncertain);
  const resolvedDiagnosis=resolveDiagnosisReferences(before.result,inventory,scene,editableNodeBounds);
  audit.diagnosisReferenceMappings=resolvedDiagnosis.mappings;
  audit.evidenceDefects=groundedEvidenceDefects(inventory,scene,editableNodeBounds,before.result).filter(d=>!before.result.defects.some(e=>e.x<=d.x&&e.y<=d.y&&e.x+e.w>=d.x+d.w&&e.y+e.h>=d.y+d.h&&d.objectIds.every(id=>(e.objectIds||[]).includes(id))));
  const defects=[...resolvedDiagnosis.defects,...audit.evidenceDefects,...missingResources];
  audit.defects=defects;
  const regions=planOwnedDefectRegions(scene,defects,W,H,audit.nativeRecognition?.regions,planDefectRegions);
  audit.repairRegions=regions;audit.regionStates={};audit.inspection={total:0,complete:0,failed:0};
  audit.totalTiles=1+regions.length;audit.completedTiles=1;
  audit.resourceRepairs=[];
  // Missing or conflicting resources enter the same inspected, reversible repair
  // path as other defects. Never overlay an unverified inventory rectangle.
  for(const resource of audit.resourceManifest){
    if(missingResources.some(d=>d.itemId===resource.itemId))audit.resourceRepairs.push({itemId:resource.itemId,state:'needs-review'});
  }
  const roundStart=structuredClone(scene);
  if(regions.length){audit.repairRounds=1;audit.phase='regions';}
  // Reserve dependencies until validation finishes; refill independent slots
  // as soon as a task commits, without waiting for an entire batch.
  audit.repairConcurrency=3;audit.repairBatches=[];
  const overlaps=(a,b)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;
  await runRepairQueue(regions,{
    limit:3,check:stop,
    describe(region){
      const batchScene=scene,catalog=regionObjectCatalog(batchScene,region);
      const mutable=new Set(catalog.nodes.map(n=>n.id));
      const reads=new Set([...catalog.nodes,...(catalog.readOnlyContext||[])].map(n=>n.id));
      return {region,catalog,mutable,reads,batchScene,versions:snapshotVersions(batchScene)};
    },
    conflicts:(a,b)=>overlaps(a.region,b.region)||[...a.mutable].some(id=>b.reads.has(id))||[...b.mutable].some(id=>a.reads.has(id)),
    async prepare(entry){
      const {batchScene}=entry;
      audit.repairBatches.push([entry.region.id]);
      const {region,catalog}=entry;
      const repairEvidence={};
      // Padding supplies visual context, not additional repair ownership. Feed the
      // same owned defects to the model and to the mutable-ID guard.
      const regionDefects=region.defects||defects.filter(d=>d.x<(region.coreRight??region.x+region.w)&&d.x+d.w>(region.coreX??region.x)&&d.y<(region.coreBottom??region.y+region.h)&&d.y+d.h>(region.coreY??region.y));
      const diagnosedIds=[...new Set(regionDefects.flatMap(d=>d.objectIds||[]))];
      repairEvidence.defectCount=regionDefects.length;
      const patchTask={regionPatch:true,region:region.id,attempt:0,detailCatalog:catalog,diagnosedIds,sourceChecklist:inventory,sourceRegion:region,fullSourceWidth:W,fullSourceHeight:H,contextImage:src,fullSourceImage:src,inputWidth:region.w,inputHeight:region.h,inputScale:1,ownership:{x:(region.coreX??region.x)-region.x,y:(region.coreY??region.y)-region.y,w:(region.coreRight??region.x+region.w)-(region.coreX??region.x),h:(region.coreBottom??region.y+region.h)-(region.coreY??region.y)},feedback:{defects:regionDefects}};
      try{
        patchTask.retryRender=await renderCrop(batchScene,region);
        audit.repairCalls=(audit.repairCalls||0)+1;
        const patch=guardPatch(await call(crop(region),region.w,region.h,patchTask),diagnosedIds,catalog.nodes.filter(n=>!n.sourceAssetId).map(n=>n.id));
        return {...entry,patchTask,repairEvidence,patch};
      }catch(error){return {...entry,patchTask,repairEvidence,error};}
      finally{delete patchTask.contextImage;delete patchTask.retryRender;delete patchTask.fullSourceImage;}
    },
    async commit({region,versions,patchTask,repairEvidence,patch,error}){
      try{
        stop();if(error)throw error;
        // Ownership/version checks still run in the existing patch engine. Explicit IDs
        // above allow narrowly diagnosed text correction or duplicate deletion.
        const applied=applyRegionPatch(scene,{...region,targeted:false,targetIds:undefined},patch,versions);
        Object.assign(repairEvidence,{conflicts:applied.conflicts,rejected:applied.rejected});
        if(applied.conflicts.length||applied.rejected.length)throw Error('修补发生对象冲突或越界');
        const candidate=reconcileResourceCrops(audit.resourceManifest,applied.scene);
        const localBefore=await measure(canvas,scene,region),localAfter=await measure(canvas,candidate,region);
        const globalBefore=await measure(canvas,scene,whole),globalAfter=await measure(canvas,candidate,whole);
        const changed=JSON.stringify(scene.nodes)!==JSON.stringify(candidate.nodes);
        const globalSafe=reconstructionQualityDeficit(globalAfter)<=reconstructionQualityDeficit(globalBefore)+1e-6&&['score','darkRecall','localRecall','edgeF1','colorSimilarity'].every(k=>Number.isFinite(globalBefore[k])&&Number.isFinite(globalAfter[k])&&globalAfter[k]>=globalBefore[k]-1e-6);
        const localImproved=acceptReconstructionRepair(localBefore,localAfter);
        Object.assign(repairEvidence,{changed,localImproved,globalSafe,localBefore:compactQuality(localBefore),localAfter:compactQuality(localAfter),globalBefore:compactQuality(globalBefore),globalAfter:compactQuality(globalAfter)});
        const geometryBefore=textGeometryDefects(scene,W,H),geometryAfter=textGeometryDefects(candidate,W,H);
        const geometryRegressions=textGeometryRegressions(geometryBefore,geometryAfter);
        repairEvidence.textGeometry={before:geometryBefore.length,after:geometryAfter.length,regressions:geometryRegressions};
        let accepted=changed&&localImproved&&globalSafe&&!geometryRegressions.length;
        if(accepted){
          const localCatalog=regionObjectCatalog(candidate,{...region,targetIds:undefined});
          const localCheck=await call(crop(region),region.w,region.h,{defectDiagnosis:true,localInspection:true,ownership:patchTask.ownership,feedback:patchTask.feedback,sourceRegion:region,catalog:{...localCatalog,nodes:[...localCatalog.nodes,...localCatalog.readOnlyContext]},contextImage:await renderCrop(candidate,region)});
          repairEvidence.localInspection=normalizePanelInspection(localCheck,region);
          accepted=repairEvidence.localInspection.complete;
        }
        if(accepted)scene=candidate;
        audit.regionStates[region.id]={state:accepted?'candidate':'failed',accepted,quality:compactQuality(accepted?localAfter:localBefore),rolledBack:!accepted,repairEvidence};
      }catch(error){if(options.signal?.aborted)throw error;audit.regionStates[region.id]={state:'failed',accepted:false,error:String(error.message),repairEvidence};}
      finally{audit.completedTiles++;}
      await onProgress({...scene,regionStates:audit.regionStates},false);
    }
  });
  let final=before;
  // A rejected patch leaves the immutable scene untouched. Re-running all
  // global/panel model inspections on identical pixels adds latency and can
  // introduce contradictory judgements without supplying any new evidence.
  if(audit.repairRounds&&Object.values(audit.regionStates).some(state=>state.accepted)){
    try{
      final=await assess(scene);
      audit.finalCandidateValidation=structuredClone(final.validation);
      audit.finalCandidateInspectionErrors=[...(final.inspectionErrors||[])];
      if(final.inspectionErrors?.length)throw Error('最终复验未完成：'+final.inspectionErrors.join('；'));
      const priorPassed=new Set((before.validation.evidence||[]).filter(e=>e.status==='passed'&&!(before.validation.errors||[]).some(x=>x.itemId===e.itemId)).map(e=>e.itemId));
      const regressions=final.validation.errors.filter(e=>priorPassed.has(e.itemId));
      audit.finalCandidateRegressions=structuredClone(regressions);
      if(regressions.length||final.validation.unlistedSourceItems?.length>(before.validation.unlistedSourceItems?.length||0)){
        scene=roundStart;audit.roundRolledBack=true;audit.rollbackReason='最终整图复验发现此前通过项退化';final=JSON.stringify(roundStart.nodes)===JSON.stringify(firstPass.scene.nodes)?before:{validation:{state:'unverified',error:'保留的原图资源裁片尚未通过整图复验'}};
        for(const state of Object.values(audit.regionStates))Object.assign(state,{state:'failed',accepted:false,rolledBack:true});
      }
    }catch(error){scene=roundStart;audit.roundRolledBack=true;final={validation:{state:'unverified',error:String(error.message)}};for(const state of Object.values(audit.regionStates))Object.assign(state,{state:'failed',accepted:false,rolledBack:true});if(options.signal?.aborted)throw error;}
  }
  // Recheck every touched crop after all commits, as well as the full image.
  await onProgress({...scene,regionStates:audit.regionStates},false);
  for(const region of regions){
    stop();const state=audit.regionStates[region.id];
    try{const q=await measure(canvas,scene,region);state.finalQuality=compactQuality(q);state.state=state.accepted&&reconstructionQualityDeficit(q)<.001?'passed':'failed';}
    catch(error){state.state='failed';state.error=String(error.message);}
  }
  audit.resourceReconciliation=resourceDefects(audit.resourceManifest,scene);
  if(audit.resourceReconciliation.length){final.validation={...final.validation,state:'failed',errors:[...(final.validation.errors||[]),...audit.resourceReconciliation]};}
  audit.textGeometryDefects=textGeometryDefects(scene,W,H);
  if(audit.textGeometryDefects.length)final.validation={...final.validation,state:'failed',errors:[...(final.validation.errors||[]),...audit.textGeometryDefects]};
  audit.finalNodeCounts={total:scene.nodes.length,images:scene.nodes.filter(n=>n.type==='image').length,sourceAssets:scene.nodes.filter(n=>n.sourceAssetId).length};
  audit.finalValidation=final.validation;
  audit.omissionChecked=final.validation.state==='passed';
  audit.tilePassComplete=audit.omissionChecked&&Object.values(audit.regionStates).every(s=>s.state==='passed');
  await onProgress({...scene,regionStates:audit.regionStates},false);
  return {...scene,regionStates:audit.regionStates};
}
