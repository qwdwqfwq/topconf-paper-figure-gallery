import assert from 'node:assert/strict';
import * as core from './reconstruction-core.mjs';
import * as pipeline from './reconstruction-pipeline.mjs';
import {normalizeInventory,planNativeRecognition,mergeNativeRecognition,reconstructWithEvidence,textGeometryDefects,textGeometryRegressions,inventoryPartitionConflicts,inventoryCorrectionComplete,resourceManifest,resourceDefects,normalizePanelInspection} from './bitmap-evidence.mjs';

const item=(id,kind,x,y,w,h,panelId=null)=>({id,kind,x,y,w,h,panelId,description:id,text:null,colors:[]});
const panelRegion={id:'p',x:200,y:300,w:400,h:500};
assert.deepEqual(normalizePanelInspection({complete:false,defects:[{x:10,y:20,w:30,h:40,reason:'missing header',objectIds:[]}]},panelRegion).defects[0],{x:210,y:320,w:30,h:40,reason:'missing header',objectIds:[],inspectionRegion:'p'});
assert.equal(normalizePanelInspection({complete:true,defects:[]},panelRegion).complete,true);
assert.equal(normalizePanelInspection({complete:true,defects:[{x:390,y:0,w:30,h:40,reason:'out of crop'}]},panelRegion).complete,false,'invalid crop coordinates must block acceptance');
assert.equal(normalizePanelInspection({complete:false,defects:[]},panelRegion).complete,false);
assert.equal(normalizePanelInspection({complete:true,defects:[],uncertainties:['fraction numerator cannot be verified']},panelRegion).complete,false,'an empty defect list must not override unresolved repair evidence');
assert.equal(normalizePanelInspection({complete:true,defects:[],uncertainties:[]},panelRegion).complete,true,'a verified repair can pass with an explicit empty uncertainty list');
const coverage=items=>normalizeInventory({canvas:{width:1000,height:1000,units:'source-pixels'},items,layers:[],connections:[],uncertainties:[]},1000,1000);
const overlapping=coverage([item('a','panel',0,0,600,800),item('b','panel',400,0,600,800)]);
assert.equal(inventoryPartitionConflicts(overlapping).length,1,'overlapping column strips need reinspection before scheduling');
assert.deepEqual(planNativeRecognition(overlapping,1000,1000),[],'unresolved conflicting panels must not become a giant merged crop');
const partlyConflicting=coverage([item('a','panel',0,0,600,600),item('b','panel',400,0,600,600),item('child','text',10,10,100,40,'a'),item('safe','panel',0,700,400,250),item('safe-label','text',20,720,100,40,'safe')]);
const safeRegions=planNativeRecognition(partlyConflicting,1000,1000);
assert.deepEqual(safeRegions.map(r=>r.id),['safe'],'a conflict must not disable independent panel workers');
assert.ok(safeRegions[0].itemIds.includes('safe-label'),'safe workers retain their complete interior');
assert.equal(inventoryPartitionConflicts(partlyConflicting).length,1,'scheduling must preserve unresolved source evidence');
assert.equal(inventoryPartitionConflicts(coverage([item('a','panel',0,0,500,800),item('b','panel',499,0,501,800)])).length,0,'shared borders are allowed');
const connectedPanels=coverage([item('a','panel',0,0,450,800),item('b','panel',550,0,450,800),item('bridge','connector',430,100,140,50),item('inside','connector',100,100,100,50,'a')]);
const connectedRegions=planNativeRecognition(connectedPanels,1000,1000);
assert.equal(connectedRegions.length,2,'cross-panel arrows must not merge independent panel workers');
assert.ok(connectedRegions.find(r=>r.id==='a').itemIds.includes('inside'),'interior connectors stay with their panel');
assert.ok(!connectedRegions.some(r=>r.itemIds.includes('bridge')),'cross-panel connector remains owned by the global worker');
const wrong=coverage([{...item('frames','photo',10,10,200,200),expectedCount:10}]);
const corrected=coverage([{...item('frame','photo',10,10,100,100),expectedCount:1}]);
assert.equal(inventoryCorrectionComplete(wrong,corrected,1000,1000),false,'silently dropping a count is forbidden');
corrected.corrections=[{itemId:'frames',replacementIds:['frame'],reason:'Only one frame is visible; prior box included surrounding labels',verifiedFromOriginal:true}];
assert.equal(inventoryCorrectionComplete(wrong,corrected,1000,1000),true,'explicit source-based count correction must not invent nine frames');
corrected.corrections[0].replacementIds=['missing'];
assert.equal(inventoryCorrectionComplete(wrong,corrected,1000,1000),false,'correction must preserve actual replacement identities');
const mixedCorrection=coverage([item('mixed','diagram',10,10,200,200),{...item('actual-photo','photo',20,20,80,80),expectedCount:1}]);
mixedCorrection.corrections=[{itemId:'frames',replacementIds:['mixed','actual-photo'],reason:'Original shows one photo within a mixed diagram, not ten photos',verifiedFromOriginal:true}];
assert.equal(inventoryCorrectionComplete(wrong,mixedCorrection,1000,1000),true,'explicit visual correction may fix a mistaken raster category');
mixedCorrection.corrections[0].verifiedFromOriginal=false;
assert.equal(inventoryCorrectionComplete(wrong,mixedCorrection,1000,1000),false,'kind changes still require explicit source verification');
const uncertainResource=resourceDefects(resourceManifest(wrong,1000,1000),{nodes:[]});
assert.equal(uncertainResource.length,1,'unresolved inventory remains an acceptance blocker');
assert.equal(uncertainResource[0].inventoryUncertain,true);
assert.equal(uncertainResource[0].resourceMissing,undefined,'an unconfirmed photo count cannot prove missing photos');
const normalized=normalizeInventory({canvas:{width:1000,height:1000,units:'normalized-1000'},items:[item('panel','panel',100,100,400,800),item('photo','photo',150,200,100,200,'panel'),item('label','text',270,200,200,80,'panel')],layers:[],connections:[],uncertainties:[]},2000,600);
assert.deepEqual(['x','y','w','h'].map(k=>normalized.items[0][k]),[200,60,800,480],'each axis must use its own source dimension');
const regions=planNativeRecognition(normalized,2000,600);
assert.equal(regions.length,1);
assert.ok(regions[0].itemIds.includes('photo')&&regions[0].itemIds.includes('label'),'mixed photo panels retain one complete context owner');
const mixedDiagrams=coverage([item('mixed','panel',10,10,980,600),item('heading','text',30,20,900,50,'mixed'),item('left','diagram',30,100,350,470,'mixed'),item('right','diagram',600,100,350,470,'mixed'),item('route','connector',350,250,300,100,'mixed')]);
const mixedRegions=planNativeRecognition(mixedDiagrams,1000,1000);
assert.deepEqual(mixedRegions.map(r=>r.id),['heading','left','right'],'large mixed panels split only at independently bounded coherent groups');
assert.ok(!mixedRegions.some(r=>r.itemIds.includes('route')),'shared-container connectors must not reunite independent workers');
const connectedDiagram=coverage([item('mixed','panel',10,10,980,600),item('left','diagram',30,100,600,470,'mixed'),item('right','diagram',400,100,550,470,'mixed')]);
assert.equal(planNativeRecognition(connectedDiagram,1000,1000)[0].id,'mixed','overlapping subdiagrams retain their complete panel context');
const formulaPanel=coverage([item('math','panel',10,10,980,600),item('lhs','text',30,150,200,70,'math'),item('numerator','text',400,100,400,100,'math'),item('denominator','text',400,300,400,100,'math')]);
assert.equal(planNativeRecognition(formulaPanel,1000,1000)[0].id,'math','separate formula glyph boxes must not fragment the formula context');
assert.throws(()=>mergeNativeRecognition({nodes:[]},{nodes:[{id:'outside',type:'rect',x:95,y:10,w:30,h:20}]},{id:'r',x:10,y:10,w:100,h:100},core.editableNodeBounds,core.translateNode),/超出裁图/,'partial intersection must not admit global coordinates');

// A deterministic canvas metric makes severe geometry faults reproducible.
globalThis.document={createElement:()=>({getContext:()=>({drawImage(){},measureText:text=>({width:text.length*10})}),toDataURL:()=> 'crop'})};
const text=(id,x,y,w,h,value='Readable label')=>({id,type:'text',text:value,x,y,w,h,fontSize:20});
assert.ok(textGeometryDefects({nodes:[text('overflow',10,10,30,25)]},1000,300).some(d=>/超出/.test(d.reason)));
assert.equal(textGeometryDefects({nodes:[text('minor',10,10,130,25)]},1000,300).length,0,'modest font fitting remains acceptable');
assert.ok(textGeometryDefects({nodes:[text('right-edge',950,10,150,25)]},1000,300).some(d=>/画布边界/.test(d.reason)),'text that fits its box can still be clipped by the slide');
assert.ok(textGeometryDefects({nodes:[text('bottom-edge',10,295,150,25)]},1000,300).some(d=>/画布边界/.test(d.reason)),'bottom-edge clipping must block acceptance');
assert.ok(textGeometryDefects({nodes:[text('left-edge',-12,10,150,25)]},1000,300).some(d=>/画布边界/.test(d.reason)),'negative text coordinates must receive a repair region');
const outsideText=textGeometryDefects({nodes:[text('outside',1100,10,150,25)]},1000,300).find(d=>/画布边界/.test(d.reason));
assert.ok(outsideText&&outsideText.x>=0&&outsideText.x+outsideText.w<=1000,'fully off-slide labels must not disappear from the defect list');
assert.equal(textGeometryDefects({nodes:[text('edge-tolerance',-2,10,150,25)]},1000,300).length,0,'small metric differences at the boundary remain acceptable');
assert.ok(textGeometryDefects({nodes:[text('math-edge',950,10,150,25,'π = max')]},1000,300).some(d=>/画布边界/.test(d.reason)),'math is exempt from ordinary overlap detection, not export clipping');
assert.equal(textGeometryDefects({nodes:[text('fire',10,10,8,8,'🔥')]},1000,300).length,0,'emoji ink is assessed visually rather than by ordinary text metrics');
assert.ok(textGeometryDefects({nodes:[text('fire-label',10,10,8,8,'🔥 Warning')]},1000,300).length,'labels containing emoji still receive text geometry checks');
assert.ok(textGeometryDefects({nodes:[text('one',10,10,150,25),text('two',30,12,150,25)]},1000,300).some(d=>d.objectIds.length===2));
assert.ok(textGeometryDefects({nodes:[text('one',10,10,40,25,'文字'),text('two',15,12,40,25,'标题')]},1000,300).some(d=>d.objectIds.length===2),'short Chinese labels also require overlap checks');
assert.equal(textGeometryDefects({nodes:[text('multiline',10,10,150,50,'Long first line\nHi'),text('next',60,33,80,25,'Next')]},1000,300).length,0,'short second-line whitespace must not count as visible ink');
assert.equal(textGeometryDefects({nodes:[text('one',10,10,150,25,'π = max'),text('two',30,12,150,25,'π = max')]},1000,300).length,0,'separately positioned math must not trigger ordinary text overlap');
const overlapBefore=textGeometryDefects({nodes:[text('one',10,10,150,25),text('two',30,12,150,25)]},1000,300);
const overlapElsewhere=textGeometryDefects({nodes:[text('three',10,10,150,25),text('four',30,12,150,25)]},1000,300);
assert.equal(overlapBefore.length,overlapElsewhere.length);
assert.equal(textGeometryRegressions(overlapBefore,overlapElsewhere).length,1,'equal defect counts must not conceal a new overlapping pair');
assert.equal(textGeometryRegressions(overlapBefore,overlapBefore.map(d=>({...d,objectIds:[...d.objectIds].reverse()}))).length,0,'pair order does not change defect identity');
assert.equal(textGeometryRegressions(overlapBefore,[]).length,0,'a resolved overlap is allowed');
assert.equal(textGeometryRegressions(overlapBefore,[...overlapBefore,...overlapBefore]).length,1,'new multiline collisions cannot reuse the same preexisting allowance');
const newOverflow=textGeometryDefects({nodes:[text('one',10,10,30,25)]},1000,300);
assert.equal(textGeometryRegressions(overlapBefore,newOverflow).length,1,'fixing overlap cannot conceal newly overflowing text');
const worseOverlap=textGeometryDefects({nodes:[text('one',10,10,150,25),text('two',12,10,150,25)]},1000,300);
assert.equal(textGeometryRegressions(overlapBefore,worseOverlap).length,1,'the same pair overlapping more severely must reject a repair');
assert.equal(textGeometryRegressions(worseOverlap,overlapBefore).length,0,'reducing an existing collision remains allowed');
assert.equal(textGeometryRegressions(overlapBefore,overlapBefore.map(d=>({...d,severity:d.severity*1.01}))).length,0,'minor font metric drift remains acceptable');
const worseOverflow=textGeometryDefects({nodes:[text('one',10,10,10,25)]},1000,300);
assert.equal(textGeometryRegressions(newOverflow,worseOverflow).length,1,'the same label overflowing more severely must reject a repair');
assert.equal(textGeometryRegressions([{...overlapBefore[0],severity:1},{...overlapBefore[0],severity:3}],[{...overlapBefore[0],severity:2.9},{...overlapBefore[0],severity:1}]).length,0,'multiple collisions match independently regardless of report order');

const inventory={canvas:{width:500,height:200,units:'source-pixels'},items:[item('panel','panel',10,20,150,120)],layers:[],connections:[],uncertainties:[]};
const api={...core,...pipeline,sceneToSvgString:()=>'<svg/>',compactQuality:s=>s,renderCrop:async()=> 'render',planDefectRegions:()=>[]};
async function recover(failRecovery){
  const audit={tiles:[]};let attempts=0,recoveries=0;
  const request=async(src,w,h,task)=>{
    if(task.sourceInventory)return inventory;
    if(task.wholeImageAssessment)throw Error('assessment offline');
    if(task.regionalRecognition){attempts++;throw Error('HTTP 500');}
    if(task.recognitionRecovery){recoveries++;assert.equal(task.nativeLayout,false);assert.equal(src,'original');if(failRecovery)throw Error('recovery offline');return {canvas:{width:w,height:h},nodes:[{id:'complete',type:'rect',x:0,y:0,w,h,fill:'#fff'}]};}
    return {canvas:{width:w,height:h},nodes:[{id:'background-only',type:'rect',x:0,y:0,w,h,fill:'#fff'}]};
  };
  const promise=reconstructWithEvidence({width:500,height:200},'original',request,audit,async()=>({score:1,preview:'render'}),async()=>{},{},api);
  if(failRecovery)await assert.rejects(promise,/已停止导出/);
  else{const result=await promise;assert.equal(result.nodes[0].id,'complete');assert.equal(audit.nativeRecognition.recovery.state,'recovered');}
  assert.equal(attempts,2);assert.equal(recoveries,1);
}
await recover(false);await recover(true);
for(const failure of [new Error('HTTP 401: invalid key'),Object.assign(new Error('Forbidden'),{status:403})]){
  const audit={tiles:[]};let calls=0;
  await assert.rejects(reconstructWithEvidence({width:500,height:200},'original',async()=>{calls++;throw failure;},audit,async()=>({}),async()=>{},{},api),error=>error===failure);
  assert.equal(calls,1,'authentication failure must not fall through to full-image recognition');
  assert.equal(audit.requestFailure.reason,'authentication');
}
console.log('PASS quality guards: normalized non-square coordinates, mixed panels, crop containment, text geometry, regional retry, complete recovery and failure stop');
