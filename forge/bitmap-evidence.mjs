// Step 4: source evidence is collected before (and independently of) reconstruction.
export function inventoryPrompt(W,H){
  return `Inspect ONLY the original ${W} x ${H} pixel image. Do not reconstruct it. Return STRICT JSON {items:[{id,kind,panelId,x,y,w,h,description,text,expectedCount,colors:[{role:"fill|stroke|text",value:"#rrggbb"}]}],layers:[{backItemId,frontItemId,reason}],connections:[{itemId,fromItemId,toItemId}],uncertainties:[]}. Inventory ALL panels, backgrounds, text groups (exact OCR), repeated units (exact count), icons, chart/table contents, photographs and connectors, including tiny details and margins. Use stable unique item IDs and source pixel bounding boxes. One repeated unit may consist of several primitives. Use null text/count where inapplicable. Record visible colors and meaningful occlusion/paint order: backgrounds behind contents, highlights behind text, foreground occluders above what they occlude. Create separate items for objects participating in layer relationships. Connections reference their own item and the source/target items; do not invent endpoints. Enumerate actual content without a quota. Record unreadable text, uncertain counts, colors or layer relations in uncertainties; never silently omit them. This inventory will be frozen BEFORE a separate reconstruction call. No reconstruction catalog or rendered output is available in this call.`;
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
  const items=[],ids=new Set();
  if(!Array.isArray(raw?.items)||!raw.items.length)warn('缺少有效原图对象清单');
  for(const [index,value] of (Array.isArray(raw?.items)?raw.items:[]).entries()){
    const i={...value},box=i.bbox||i.bounds;
    if(box&&typeof box==='object')for(const [k,n] of ['x','y','w','h'].entries())i[n]??=Array.isArray(box)?box[k]:box[n]??box[n==='w'?'width':n==='h'?'height':n];
    for(const n of ['x','y','w','h'])i[n]=number(i[n]);
    if(typeof i.id==='number'&&Number.isFinite(i.id))i.id=String(i.id);
    if(typeof i.id!=='string'||!i.id||ids.has(i.id)||typeof i.kind!=='string'||!i.kind||typeof i.description!=='string'||!i.description||![i.x,i.y,i.w,i.h].every(Number.isFinite)||i.x<0||i.y<0||i.w<=0||i.h<=0||i.x+i.w>W+1||i.y+i.h>H+1){warn(`原图对象 ${index+1} 字段或边界无效，未纳入有效证据`);continue;}
    ids.add(i.id);
    if(!Array.isArray(i.colors)){warn(`对象 ${i.id} 缺少颜色证据`);i.colors=[];}
    i.colors=i.colors.flatMap(c=>{let value=c?.value;if(/^#[\da-f]{3}$/i.test(value||''))value='#'+value.slice(1).split('').map(v=>v+v).join('');if(!['fill','stroke','text'].includes(c?.role)||!/^#[\da-f]{6}$/i.test(value||'')){warn(`对象 ${i.id} 颜色证据无效`);return [];}return [{role:c.role,value}];});
    if(i.expectedCount!=null){i.expectedCount=number(i.expectedCount);if(!Number.isInteger(i.expectedCount)||i.expectedCount<1){warn(`对象 ${i.id} 重复数量无效`);i.expectedCount=null;}}
    if(i.text!=null&&typeof i.text!=='string'){warn(`对象 ${i.id} OCR 字段无效`);i.text=null;}
    items.push(i);
  }
  for(const i of items)if(i.panelId&&!ids.has(i.panelId)){warn(`对象 ${i.id} 面板引用无效`);i.panelId=null;}
  const relations=(key,valid)=>{if(!Array.isArray(raw?.[key])){warn(`缺少 ${key} 证据`);return [];}return raw[key].filter(r=>{if(r&&valid(r))return true;warn(`${key} 引用无效`);return false;});};
  const layers=relations('layers',r=>ids.has(r.backItemId)&&ids.has(r.frontItemId)&&r.backItemId!==r.frontItemId&&typeof r.reason==='string'&&!!r.reason);
  const connections=relations('connections',r=>[r.itemId,r.fromItemId,r.toItemId].every(id=>ids.has(id)));
  return {items,layers,connections,uncertainties:[...new Set(issues)]};
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
export function evidencePrompt(inventory){
  return ' Fixed ORIGINAL-ONLY inventory (do not replace or shorten): '+JSON.stringify(inventory)+'. In addition to defects/coverage, return inventoryComplete:boolean, unlistedSourceItems:[], uncertainties:[], evidence:[{itemId,status:"passed|failed|uncertain",nodeIds:["actual catalog ID"],instances:[["node IDs for unit 1"]],reason:"visible source versus render comparison"}]. Include EXACTLY one evidence row per inventory item. Inspect the ORIGINAL again for content absent even from the inventory; report it in unlistedSourceItems and bounded defects. For each item verify geometry, OCR, repeated-unit count, colors, layer/occlusion and connector endpoints against the actual rendering, not catalog claims. Passed node IDs must exist and correspond to the visible item. instances is required for expectedCount items; each unit has disjoint IDs. Every mismatch requires a tightly bounded defect, with objectIds ONLY for existing objects that genuinely need correction. Missing objects require no fabricated IDs. complete/wholeImageAcceptable may be true only if every item and every layer/connection passes, no unlisted item and no uncertainty remains.';
}
export function patchPrompt(W,H,audit,serialize=JSON.stringify){
  return 'Return STRICT JSON {"operations":[],"uncertainties":[]}. Image 1 is the native-resolution ORIGINAL crop; image 2 is source context; image 3 is the CURRENT crop rendering; image 4 is the full source. Compare them and add ONLY genuinely missing objects. Existing catalog.nodes are mutable ONLY when their IDs appear in diagnosedIds; catalog.readOnlyContext is immutable. Never redraw correct objects or entire panels. Allowed operations: {op:"add",node:{type,...}}, {op:"update",id,version,node:{...complete corrected primitive...}}, {op:"style",id,version,changes:{fill,stroke,strokeWidth,dash}}, {op:"reorder",id,version,afterId}, {op:"reorder",id,version,position:"front|back"}, {op:"delete",id,version}. Update OCR or delete a duplicate ONLY for an explicitly diagnosed ID and visible source evidence. Preserve unrelated properties. Never split or merge objects. Nodes use rect/ellipse {x,y,w,h,fill,stroke,strokeWidth}, line {x,y,x2,y2,stroke,strokeWidth,arrow}, polyline {points,closed,fill,stroke}, path {d,fill,stroke}, text {x,y,w,h,text,fontSize,fill,fontFamily,bold,anchor,rotation}, image {x,y,w,h}. Use images only for photographic content, never as a substitute for editable text/diagrams. Coordinates and font sizes are crop pixels, '+W+' x '+H+'; text x,y is box TOP-LEFT. Preserve exact OCR, repeated-unit counts, colors and back-to-front stacking. Stay inside ownership bounds and outside excludeRects. Reorder relative to existing IDs, without changing unrelated stacking. No invented unreadable text; report uncertainties instead. Empty operations is valid. Catalog: '+serialize(audit.detailCatalog)+' diagnosedIds: '+JSON.stringify(audit.diagnosedIds)+' ownership: '+JSON.stringify(audit.ownership)+' sourceRegion: '+JSON.stringify(audit.sourceRegion)+' defects: '+JSON.stringify(audit.feedback)+' fixed source inventory in GLOBAL coordinates: '+JSON.stringify(audit.sourceChecklist);
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
    let ok=found.length===1&&e.status==='passed'&&typeof e.reason==='string'&&!!e.reason.trim()&&Array.isArray(ids)&&ids.length>0&&new Set(ids).size===ids.length&&ids.every(id=>byId.has(id));
    const nodes=ok?ids.map(id=>byId.get(id).n):[];
    if(ok&&bounds)ok=nodes.every(n=>{const b=bounds(n);return b&&b.x<item.x+item.w+4&&b.right>item.x-4&&b.y<item.y+item.h+4&&b.bottom>item.y-4;});
    if(ok&&item.text!=null)ok=norm(nodes.filter(n=>n.type==='text').map(n=>n.text).join(''))===norm(item.text);
    if(ok&&item.expectedCount!=null){
      const units=e.instances;
      ok=Array.isArray(units)&&units.length===item.expectedCount&&units.every(u=>Array.isArray(u)&&u.length>0&&u.every(id=>ids.includes(id)));
      if(ok){const flat=units.flat();ok=new Set(flat).size===flat.length&&new Set(flat).size===ids.length;}
    }
    if(ok)for(const c of item.colors){const a=rgb(c.value);if(!nodes.some(n=>{const b=rgb(c.role==='stroke'?n.stroke:n.fill);return b&&b.every((v,i)=>Math.abs(v-a[i])<=32);}))ok=false;}
    matches.set(item.id,ok?ids:[]);
    if(!ok)errors.push({itemId:item.id,reason:'缺少可核对的对象、文字、数量、颜色或位置证据'});
  }
  if(rows.length!==inventory.items.length||rows.some(e=>!matches.has(e.itemId)))errors.push({reason:'检查证据数量或 ID 不匹配'});
  for(const l of inventory.layers){const back=matches.get(l.backItemId),front=matches.get(l.frontItemId);if(!back?.length||!front?.length||Math.max(...back.map(id=>byId.get(id).i))>=Math.min(...front.map(id=>byId.get(id).i)))errors.push({itemId:l.frontItemId,reason:'图层顺序未通过：'+l.reason});}
  for(const c of inventory.connections)if(![c.itemId,c.fromItemId,c.toItemId].every(id=>matches.get(id)?.length))errors.push({itemId:c.itemId,reason:'连接或端点对象缺失'});
  if(inventory.uncertainties.length||result?.uncertainties?.length||!Array.isArray(result?.uncertainties))errors.push({reason:'存在未解决的不确定项或缺少不确定项证据'});
  if(result?.inventoryComplete!==true||!Array.isArray(result?.unlistedSourceItems)||result.unlistedSourceItems.length)errors.push({reason:'原图仍有未盘点内容或盘点完整性未确认'});
  const passed=!errors.length&&result?.complete===true&&result?.wholeImageAcceptable===true&&Array.isArray(result?.defects)&&!result.defects.length;
  return {state:passed?'passed':'failed',errors,evidence:rows,summary:result?.summary||'',defects:result?.defects||[],inventoryComplete:result?.inventoryComplete===true,unlistedSourceItems:result?.unlistedSourceItems,uncertainties:result?.uncertainties};
}

// Every non-add mutation needs both a diagnosed ID and region ownership.
export function guardPatch(patch,diagnosedIds,mutableIds){
  const allowed=new Set(diagnosedIds.filter(id=>mutableIds.includes(id)));
  if(!Array.isArray(patch?.operations)||!Array.isArray(patch?.uncertainties)||patch.uncertainties.length)throw Error('修补包含未解决的不确定项');
  for(const op of patch.operations){
    if(!['add','update','style','reorder','delete'].includes(op.op))throw Error('不支持的修补操作');
    const ids=op.ids|| (op.id?[op.id]:[]);
    if(op.op==='add'){if(ids.length)throw Error('新增操作不能替换既有对象');}
    else if(ids.length!==1||!allowed.has(ids[0]))throw Error('修补试图改动未诊断或只读对象');
  }
  return {...patch,allowPartial:false};
}

export async function reconstructWithEvidence(canvas,src,request,audit,measure,onProgress,options,api){
  const {createWholeImageCatalog,sceneToSvgString,compactQuality,planDefectRegions,regionObjectCatalog,snapshotVersions,applyRegionPatch,acceptReconstructionRepair,reconstructionQualityDeficit,editableNodeBounds,renderCrop}=api;
  const W=canvas.width,H=canvas.height,whole={x:0,y:0,w:W,h:H};
  const stop=()=>{if(options.signal?.aborted||(options.deadline&&Date.now()>=options.deadline))throw new DOMException('Stopped or total budget exhausted','AbortError');};
  const call=async(image,w,h,task)=>{stop();task.maxAttempts=1;audit.tiles.push(task);return request(image,w,h,task);};
  if(options.refine)throw Error('此结果的修补流程已封闭；如需新结果，请手动发起新的重建。');
  audit.strategy='source-inventory-one-repair-round';audit.phase='inventory';audit.repairRounds=0;
  let inventory;
  try{inventory=normalizeInventory(await call(src,W,H,{sourceInventory:true,wholeImage:true,inputWidth:W,inputHeight:H}),W,H);}
  catch(error){stop();audit.inventoryError=String(error.message);inventory=normalizeInventory(null,W,H);inventory.uncertainties.push('原图盘点失败：'+audit.inventoryError);}
  audit.sourceInventory=inventory;
  audit.phase='whole';
  const task={wholeImage:true,sourceChecklist:inventory,inputWidth:W,inputHeight:H};
  const initial=await call(src,W,H,task);
  let scene=createWholeImageCatalog(initial);
  audit.wholeImageNodeCounts={...initial.recognitionCounts,parsed:initial.nodes.length,deduplicated:scene.nodes.length,removedByDeduplication:initial.nodes.length-scene.nodes.length};
  await onProgress(scene,false);
  const crop=r=>{const c=document.createElement('canvas');c.width=r.w;c.height=r.h;c.getContext('2d').drawImage(canvas,r.x,r.y,r.w,r.h,0,0,r.w,r.h);return c.toDataURL('image/png');};
  async function assess(candidate){
    stop();audit.phase='quality';
    const measured=await measure(canvas,candidate,whole);
    const result=normalizeDiagnosis(await call(src,W,H,{defectDiagnosis:true,wholeImageAssessment:true,sourceChecklist:inventory,catalog:candidate,contextImage:measured.preview}),W,H);
    return {result,validation:validateEvidence(inventory,candidate,result,editableNodeBounds),measured};
  }
  const firstPass={scene:structuredClone(scene),svg:sceneToSvgString(scene),source:{width:W,height:H},sourceInventory:inventory,nodeCounts:audit.wholeImageNodeCounts,validation:{state:'pending'}};
  await options.onWholeImage?.(firstPass);
  let before;
  try{before=await assess(scene);firstPass.validation=before.validation;firstPass.quality=compactQuality(before.measured);}
  catch(e){stop();audit.diagnosisError=String(e.message);firstPass.validation={state:'unverified',error:String(e.message),errors:[],evidence:[]};before={result:{complete:false,defects:[]},validation:firstPass.validation};}
  finally{audit.wholeImageValidation=firstPass.validation;await options.onWholeImage?.(firstPass);}
  audit.defectDiagnosis={complete:before.result.complete,defects:before.result.defects};
  // Repair only concrete source/render defects, never infer missing objects from absent evidence rows.
  const defects=[...before.result.defects];
  audit.defects=defects;
  const regions=planDefectRegions(scene,defects,W,H,[]);
  audit.repairRegions=regions;audit.regionStates={};audit.inspection={total:0,complete:0,failed:0};
  audit.totalTiles=1+regions.length;audit.completedTiles=1;
  const roundStart=structuredClone(scene);
  if(regions.length){audit.repairRounds=1;audit.phase='regions';}
  // A single round over a fixed defect list. Never retry a region or regenerate the whole image.
  for(const region of regions){
    stop();const versions=snapshotVersions(scene),catalog=regionObjectCatalog(scene,region);
    const diagnosedIds=[...new Set((region.defects||defects.filter(d=>d.x<region.x+region.w&&d.x+d.w>region.x&&d.y<region.y+region.h&&d.y+d.h>region.y)).flatMap(d=>d.objectIds||[]))];
    const patchTask={regionPatch:true,region:region.id,attempt:0,detailCatalog:catalog,diagnosedIds,sourceChecklist:inventory,sourceRegion:region,contextImage:src,fullSourceImage:src,inputWidth:region.w,inputHeight:region.h,inputScale:1,ownership:{x:(region.coreX??region.x)-region.x,y:(region.coreY??region.y)-region.y,w:(region.coreRight??region.x+region.w)-(region.coreX??region.x),h:(region.coreBottom??region.y+region.h)-(region.coreY??region.y)},feedback:{defects:region.defects||defects}};
    try{
      patchTask.retryRender=await renderCrop(scene,region);
      const patch=guardPatch(await call(crop(region),region.w,region.h,patchTask),diagnosedIds,catalog.nodes.map(n=>n.id));
      // Ownership/version checks still run in the existing patch engine. Explicit IDs
      // above allow narrowly diagnosed text correction or duplicate deletion.
      const applied=applyRegionPatch(scene,{...region,targeted:false,targetIds:undefined},patch,versions);
      if(applied.conflicts.length||applied.rejected.length)throw Error('修补发生对象冲突或越界');
      const candidate=applied.scene;
      const localBefore=await measure(canvas,scene,region),localAfter=await measure(canvas,candidate,region);
      const globalBefore=await measure(canvas,scene,whole),globalAfter=await measure(canvas,candidate,whole);
      const changed=JSON.stringify(scene.nodes)!==JSON.stringify(candidate.nodes);
      const globalSafe=reconstructionQualityDeficit(globalAfter)<=reconstructionQualityDeficit(globalBefore)+1e-6&&['score','darkRecall','localRecall','edgeF1','colorSimilarity'].every(k=>Number.isFinite(globalBefore[k])&&Number.isFinite(globalAfter[k])&&globalAfter[k]>=globalBefore[k]-1e-6);
      let accepted=changed&&acceptReconstructionRepair(localBefore,localAfter)&&globalSafe;
      if(accepted){
        const localCatalog=regionObjectCatalog(candidate,{...region,targetIds:undefined});
        const localCheck=await call(crop(region),region.w,region.h,{defectDiagnosis:true,localInspection:true,catalog:{...localCatalog,nodes:[...localCatalog.nodes,...localCatalog.readOnlyContext]},contextImage:await renderCrop(candidate,region)});
        accepted=localCheck.complete===true&&Array.isArray(localCheck.defects)&&localCheck.defects.length===0;
      }
      if(accepted)scene=candidate;
      audit.regionStates[region.id]={state:accepted?'candidate':'failed',accepted,quality:compactQuality(accepted?localAfter:localBefore),rolledBack:!accepted};
    }catch(error){if(options.signal?.aborted)throw error;audit.regionStates[region.id]={state:'failed',accepted:false,error:String(error.message)};}
    finally{delete patchTask.contextImage;delete patchTask.retryRender;delete patchTask.fullSourceImage;audit.completedTiles++;}
    await onProgress({...scene,regionStates:audit.regionStates},false);
  }
  let final=before;
  if(regions.length){
    try{
      final=await assess(scene);
      const priorPassed=new Set(before.validation.evidence.filter(e=>e.status==='passed'&&!before.validation.errors.some(x=>x.itemId===e.itemId)).map(e=>e.itemId));
      const regressions=final.validation.errors.filter(e=>priorPassed.has(e.itemId));
      if(regressions.length||final.validation.unlistedSourceItems?.length>(before.validation.unlistedSourceItems?.length||0)){
        scene=roundStart;audit.roundRolledBack=true;audit.rollbackReason='最终整图复验发现此前通过项退化';final=before;
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
  audit.finalValidation=final.validation;
  audit.omissionChecked=final.validation.state==='passed';
  audit.tilePassComplete=audit.omissionChecked&&Object.values(audit.regionStates).every(s=>s.state==='passed');
  await onProgress({...scene,regionStates:audit.regionStates},false);
  return {...scene,regionStates:audit.regionStates};
}
