import assert from 'node:assert/strict';
import * as core from './reconstruction-core.mjs';
import * as pipeline from './reconstruction-pipeline.mjs';
import {inventoryPrompt,nativeLayoutRecognitionPrompt,planNativeRecognition,nativeGlobalOwnership,mergeNativeRecognition,regionalRecognitionPrompt,patchPrompt,evidencePrompt,localInspectionPrompt,resolveDiagnosisReferences,groundedEvidenceDefects,validateInventory,normalizeInventory,normalizeDiagnosis,validateEvidence,guardPatch,reconstructWithEvidence} from './bitmap-evidence.mjs';
const canvas={width:600,height:300};
const scene={canvas:{width:600,height:300},nodes:[{id:'label',type:'text',x:100,y:100,w:100,h:30,text:'A',fill:'#000000',fontSize:20}]};
const inventory={canvas:{width:600,height:300,units:"source-pixels"},items:[{id:'i',kind:'text',description:'label',x:100,y:100,w:100,h:30,text:'A',expectedCount:null,colors:[{role:'text',value:'#000000'}]}],layers:[],connections:[],uncertainties:[]};
// The whole-image QA contract must carry the full frozen inventory and require
// actionable regions for the visual omissions found in the real Office render.
const qaPrompt=evidencePrompt(inventory);
const sourceInventoryContract=inventoryPrompt(600,300);
assert.ok(sourceInventoryContract.includes("compact coverage map, not a primitive-by-primitive transcription"));
assert.ok(sourceInventoryContract.includes("its own tight bounding box and expectedCount:1"));
assert.ok(sourceInventoryContract.includes("do not assume a tree, robot, badge, table or scientific diagram exists"));
assert.ok(qaPrompt.includes('Retain every row, required ID, instance, coverage entry and independently visible defect'));
const repairContract=patchPrompt(600,300,{});
assert.ok(repairContract.includes('A text box width is not the visible glyph width'));
assert.ok(repairContract.includes('correct ALL visibly diagnosed discrepancies using the allowed operations below'));
assert.ok(!repairContract.includes('Compare them and add ONLY'));
assert.ok(qaPrompt.includes(JSON.stringify(inventory)));
for(const requirement of ['literal underscores, carets, braces','only categories present','connectivity, endpoints','charts: axes','tables: row/column structure','slightly smaller text','invented white rectangles','Report these extra shapes with their actual catalog IDs','For each failed or uncertain evidence row','objectIds:[]','all affected regions enter the single repair round','Missing from the inventory does not mean missing from the rendering','The ORIGINAL pixels are authoritative','An inventory omission or contradiction still prevents complete acceptance'])assert.ok(qaPrompt.includes(requirement),requirement);
assert.ok(qaPrompt.includes('complete/wholeImageAcceptable may be true only if every item and every layer/connection passes'));
const verdict=(s,passed)=>({complete:passed,wholeImageAcceptable:passed,coverage:[{region:'all',missingGroups:[]}],inventoryComplete:true,unlistedSourceItems:[],uncertainties:[],summary:'Source/render compared',evidence:[{itemId:'i',status:passed?'passed':'failed',nodeIds:['label'],reason:'checked'}],defects:passed?[]:[{x:100,y:100,w:100,h:30,reason:'Wrong OCR',objectIds:['label']}]});
const q=n=>Object.fromEntries(['score','darkRecall','localRecall','edgeF1','colorSimilarity'].map(k=>[k,n]));
const cropped=[];
globalThis.document={createElement:()=>({width:0,height:0,getContext(){return {drawImage(){}};},toDataURL(){cropped.push([this.width,this.height]);return 'native-crop';}})};
const api={...core,...pipeline,sceneToSvgString:()=>'<svg/>',compactQuality:s=>s,renderCrop:async()=> 'render'};
async function run(config={}){
 const audit={tiles:[]},calls=[],snapshots=[];let assessments=0;
 const request=async(src,w,h,t)=>{
  calls.push(t);assert.equal(t.maxAttempts,1);
  if(t.sourceInventory){assert.equal(src,'source');assert.equal(w,600);assert.equal(h,300);assert.equal(t.catalog,undefined);if(config.inventoryError)throw Error('Inventory JSON failed');return config.invalidInventory?{}:inventory;}
  // This repair fixture deliberately exercises the coarse-draft fallback;
  // dedicated native fixtures below cover successful crop merging.
  if(t.regionalRecognition)throw Error('Native crop unavailable in repair fixture');
  if(t.wholeImage){if(config.wholeError)throw Error('whole failed');return {...structuredClone(scene),nodes:scene.nodes.map(n=>({...n,text:config.wrongText?'B':n.text}))};}
  if(t.panelInspection)return {complete:true,defects:[],uncertainties:[]};
  if(t.localInspection)return {complete:!config.localReject,defects:config.localReject?[{reason:'bad'}]:[]};
  if(t.wholeImageAssessment){assessments++;if(config.diagnosisError||config.finalError&&assessments>1)throw Error('QA failed');const v=verdict(t.catalog,config.clean||assessments>1&&!config.finalReject);if(config.missingEvidence){delete v.evidence;delete v.coverage;}if(config.semanticRegression){v.evidence[0].status=assessments===1?'passed':'failed';v.complete=false;v.wholeImageAcceptable=false;v.defects=verdict(t.catalog,false).defects;}if(config.remoteDefect&&assessments===1)v.defects.push({x:220,y:100,w:20,h:30,reason:'Missing remote icon',objectIds:[]});if(config.noConcreteDefects)v.defects=[];if(config.inventoryReference&&assessments===1)v.defects[0].objectIds=['i'];return v;}
  if(t.regionPatch){assert.equal(src,'native-crop');assert.equal(w,t.sourceRegion.w);assert.equal(h,t.sourceRegion.h);if(config.patchError)throw Error('patch failed');return {operations:[{op:'update',id:'label',node:{...t.detailCatalog.nodes[0],text:'A',fill:'#000000',bold:true}}],uncertainties:[]};}
  throw Error('Unexpected request');
 };
 const measure=async(c,s,r)=>q(s.nodes[0].bold?(config.globalDamage&&r.w===600?.4:1):.6);
 try{const result=await reconstructWithEvidence(canvas,'source',request,audit,measure,async s=>snapshots.push(structuredClone(s)),{maxAttempts:99,retryBudget:99,...config.options},api);return {result,audit,calls,snapshots};}
 catch(error){return {error,audit,calls,snapshots};}
}
let r=await run({clean:true});
assert.equal(r.audit.finalValidation.state,'passed');assert.equal(r.audit.tilePassComplete,true);assert.equal(r.audit.repairRounds,0);assert.equal(r.calls.length,7);
assert.deepEqual(r.calls.map(t=>t.sourceInventory?'inventory':t.regionalRecognition?'native':t.wholeImage?'whole':t.panelInspection?'panel-QA':'QA'),['inventory','whole','native','native','whole','QA','panel-QA']);
assert.equal(r.audit.nativeRecognition.recovery.state,'recovered');
assert.ok(r.snapshots.length>0);
const layoutTask=r.calls.find(t=>t.wholeImage&&!t.sourceInventory);
assert.equal(layoutTask.nativeLayout,true);
assert.deepEqual(layoutTask.nativeRegions,r.audit.nativeRecognition.regions);
const layoutContract=nativeLayoutRecognitionPrompt(600,300,inventory,layoutTask.nativeRegions);
for(const requirement of ['NATIVE LAYOUT AND UNCOVERED CONTENT','every structural background/frame/header fill','all visible content OUTSIDE the crop union','Do not output placeholder objects','Preserve large panel backgrounds beneath the crops',JSON.stringify(layoutTask.nativeRegions)])assert.ok(layoutContract.includes(requirement),requirement);
r=await run();
assert.equal(r.audit.repairRounds,1);assert.equal(r.calls.filter(t=>t.regionPatch).length,1);assert.equal(r.calls.filter(t=>t.wholeImage&&!t.sourceInventory&&!t.regionalRecognition&&!t.recognitionRecovery).length,1);assert.equal(r.calls.filter(t=>t.localInspection&&!t.panelInspection).length,1);assert.equal(r.audit.finalValidation.state,'passed');assert.equal(r.audit.tilePassComplete,true);assert.ok(r.result.nodes[0].bold);assert.ok(cropped.some(([w,h])=>w===r.audit.repairRegions[0].w&&h===r.audit.repairRegions[0].h),"repair crop retains native dimensions alongside panel inspection crops");
const localTask=r.calls.find(t=>t.localInspection&&!t.panelInspection),patchTask=r.calls.find(t=>t.regionPatch);
assert.deepEqual(localTask.ownership,patchTask.ownership);
assert.deepEqual(localTask.feedback,patchTask.feedback);
assert.deepEqual(localTask.sourceRegion,patchTask.sourceRegion);
const localPrompt=localInspectionPrompt(localTask);
for(const requirement of ['CROP-RELATIVE','GLOBAL source','ALL owned content','Never ignore a defect intersecting ownership','final whole-image gate','contextDefects'])assert.ok(localPrompt.includes(requirement),requirement);
assert.ok(localPrompt.includes(JSON.stringify(patchTask.ownership)));
// The second defect is inside the first crop's padding, but outside its
// ownership. Neither its instructions nor its IDs belong in the first patch.
r=await run({remoteDefect:true});
const scopedPatches=r.calls.filter(t=>t.regionPatch);
assert.equal(scopedPatches.length,2);
assert.deepEqual(scopedPatches.map(t=>t.feedback.defects.map(d=>d.reason)),[['Wrong OCR'],['Missing remote icon']]);
assert.deepEqual(scopedPatches.map(t=>t.diagnosedIds),[['label'],[]]);
assert.deepEqual(Object.values(r.audit.regionStates).map(s=>s.repairEvidence.defectCount),[1,1]);
for(const config of [{patchError:true},{localReject:true},{globalDamage:true},{finalError:true}]){
 r=await run(config);assert.equal(r.result.nodes[0].bold,undefined,JSON.stringify(config));assert.equal(r.audit.tilePassComplete,false);assert.equal(r.calls.filter(t=>t.regionPatch).length,1);assert.equal(r.calls.filter(t=>t.wholeImage&&!t.sourceInventory&&!t.regionalRecognition&&!t.recognitionRecovery).length,1);
}
r=await run({finalError:true});assert.equal(r.audit.roundRolledBack,true);assert.equal(r.audit.finalValidation.state,'unverified');
r=await run({semanticRegression:true});assert.equal(r.audit.roundRolledBack,true);assert.equal(r.result.nodes[0].bold,undefined);assert.equal(r.audit.tilePassComplete,false);assert.ok(r.audit.finalCandidateValidation);assert.ok(r.audit.finalCandidateRegressions.some(e=>e.itemId==='i'));
for(const config of [{invalidInventory:true},{inventoryError:true},{missingEvidence:true}]){
 r=await run(config);assert.equal(r.error,undefined);assert.ok(r.result.nodes[0].bold);assert.equal(r.audit.tilePassComplete,false);assert.equal(r.calls.filter(t=>t.regionPatch).length,1);assert.equal(r.calls.filter(t=>t.wholeImage&&!t.sourceInventory&&!t.regionalRecognition&&!t.recognitionRecovery).length,1);assert.notEqual(r.audit.finalValidation.state,'passed');
}
for(const config of [{invalidInventory:true},{inventoryError:true}]){
 const fallback=await run(config),whole=fallback.calls.find(t=>t.wholeImage&&!t.sourceInventory);
 assert.equal(whole.nativeLayout,false);
 assert.deepEqual(whole.nativeRegions,[]);
}
r=await run({diagnosisError:true});assert.equal(r.error,undefined);assert.equal(r.result.nodes.length,1);assert.equal(r.audit.finalValidation.state,'unverified');assert.equal(r.audit.repairRounds,0);
r=await run({missingEvidence:true,clean:true});assert.equal(r.audit.repairRounds,0);assert.notEqual(r.audit.finalValidation.state,'passed');
r=await run({wholeError:true});assert.match(r.error.message,/whole failed/);assert.deepEqual(r.calls.map(t=>t.sourceInventory?'inventory':t.regionalRecognition?'native':t.wholeImage?'whole':'QA'),['inventory','whole','native','native']);assert.equal(r.snapshots.length,0,'failed global result must never publish a partial regional merge');
for(const options of [{signal:{aborted:true}},{deadline:Date.now()-1},{refine:true}]){r=await run({options});assert.ok(r.error);assert.equal(r.calls.length,0);}
console.log('PASS source-only inventory, native crops, early draft, one whole call, one repair round, no retries, local/global rollback, QA failure, cancellation');

const good=verdict(scene,true),check=(i=inventory,s=scene,v=good)=>validateEvidence(i,s,v,core.editableNodeBounds);
assert.equal(check().state,'passed');
for(const mutate of [v=>v.evidence=[],v=>v.evidence[0].nodeIds=['fake'],v=>v.evidence[0].status='uncertain',v=>v.uncertainties=['unknown'],v=>delete v.uncertainties,v=>v.unlistedSourceItems=['arrow'],v=>v.evidence.push(v.evidence[0])]){const v=structuredClone(good);mutate(v);assert.equal(check(inventory,scene,v).state,'failed');}
assert.equal(check(inventory,{...scene,nodes:[{...scene.nodes[0],text:'B'}]}).state,'failed');
assert.equal(check(inventory,{...scene,nodes:[{...scene.nodes[0],fill:'#ff0000'}]}).state,'failed');
assert.equal(check(inventory,{...scene,nodes:[{...scene.nodes[0],x:400}]}).state,'failed');
assert.equal(check(inventory,scene,{...good,evidence:[]}).errors[0].code,'evidence-row');
assert.equal(check(inventory,{...scene,nodes:[{...scene.nodes[0],text:'B'}]}).errors[0].code,'evidence-text');
assert.equal(check(inventory,{...scene,nodes:[{...scene.nodes[0],fill:'#ff0000'}]}).errors[0].code,'evidence-color');
assert.match(check(inventory,{...scene,nodes:[{...scene.nodes[0],fill:'#ff0000'}]}).errors[0].reason,/#000000/);
assert.equal(check(inventory,{...scene,nodes:[{...scene.nodes[0],x:400}]}).errors[0].code,'evidence-position');
// A missing evidence reference is not permission to rewrite correct text.
assert.deepEqual(groundedEvidenceDefects({...inventory,coordinateVerified:true},scene,core.editableNodeBounds,{...good,evidence:[]}),[]);
const repeated=structuredClone(inventory);repeated.items[0].expectedCount=2;
assert.equal(check(repeated).state,'failed');
assert.equal(check(repeated).errors[0].code,'evidence-count');
const two={...scene,nodes:[scene.nodes[0],{...scene.nodes[0],id:'second'}]},ordered=structuredClone(inventory);ordered.items.push({...ordered.items[0],id:'j'});ordered.layers=[{backItemId:'i',frontItemId:'j',reason:'background behind foreground'}];
const both=structuredClone(good);both.evidence.push({...both.evidence[0],itemId:'j',nodeIds:['second']});
assert.equal(check(ordered,two,both).state,'passed');assert.equal(check(ordered,{...two,nodes:two.nodes.toReversed()},both).state,'failed');
const count=structuredClone(inventory);count.items[0].expectedCount=2;count.items[0].text=null;
const units=structuredClone(good);units.evidence[0].nodeIds=['label','second'];units.evidence[0].instances=[['label'],['second']];assert.equal(check(count,two,units).state,'passed');units.evidence[0].instances=[['label'],['label']];assert.equal(check(count,two,units).state,'failed');
assert.throws(()=>validateInventory({...inventory,layers:[{backItemId:'fake',frontItemId:'i',reason:'x'}]},600,300),/图层引用/);
for(const op of [{op:'delete',id:'readonly'},{op:'update',id:'label'},{op:'merge',ids:['label']}])assert.throws(()=>guardPatch({operations:[op],uncertainties:[]},[],['label']));
assert.doesNotThrow(()=>guardPatch({operations:[{op:'delete',id:'label'}],uncertainties:[]},['label'],['label']));
assert.doesNotThrow(()=>guardPatch({operations:[{op:'add',node:{type:'rect'}}],uncertainties:[]},[],[]));
assert.throws(()=>guardPatch({operations:[]},[],[]));
console.log('PASS evidence IDs/OCR/color/position/layers/counts/uncertainty and immutable-object patch guards');
const variants=structuredClone(inventory);Object.assign(variants.items[0],{x:'100',y:'100',w:'100',h:'30',colors:[{role:'text',value:'#000'}]});
assert.deepEqual(normalizeInventory(variants,600,300),{...inventory,coordinateVerified:true,coordinateSystem:'source-pixels',rejectedResources:[]});
const partial=structuredClone(inventory);partial.items.push({...partial.items[0],id:'bad',w:900});partial.layers=[{backItemId:'bad',frontItemId:'i',reason:'unknown'}];
const recovered=normalizeInventory(partial,600,300);assert.equal(recovered.items.length,1);assert.equal(recovered.layers.length,0);assert.ok(recovered.uncertainties.length>=2);assert.equal(check(recovered).state,'failed');assert.deepEqual(normalizeInventory(recovered,600,300),recovered);
const malformed=normalizeDiagnosis({defects:[{x:'100',y:'100',w:'100',h:'30',reason:'Missing label'},null,{x:900,y:0,w:10,h:10,reason:'outside'}]},600,300);
assert.equal(malformed.defects.length,1);assert.equal(malformed.complete,false);assert.ok(malformed.uncertainties.length);assert.deepEqual(normalizeDiagnosis(malformed,600,300),malformed);
assert.equal(check(inventory,scene,{...good,evidence:[null]}).state,'failed');
console.log('PASS deterministic normalization, retained valid inventory, malformed diagnosis regions, no invented evidence or false acceptance');

r=await run({wrongText:true,noConcreteDefects:true});
assert.equal(r.error,undefined);assert.equal(r.audit.evidenceDefects.length,1);assert.equal(r.calls.filter(t=>t.regionPatch).length,1);assert.equal(r.result.nodes[0].text,'A');assert.equal(r.audit.finalValidation.state,'passed');
const verified=normalizeInventory(inventory,600,300);
assert.equal(groundedEvidenceDefects(verified,scene,core.editableNodeBounds,verdict(scene,false)).length,0);
assert.equal(groundedEvidenceDefects({...verified,coordinateVerified:false},{nodes:[]},core.editableNodeBounds).length,0);
assert.deepEqual(groundedEvidenceDefects(verified,{nodes:[{id:'background',type:'rect',x:0,y:0,w:600,h:300}]},core.editableNodeBounds,verdict(scene,false))[0].objectIds,[]);
assert.equal(groundedEvidenceDefects(verified,{nodes:[{...scene.nodes[0],x:90,text:'B'}]},core.editableNodeBounds).length,0);
const differentText={...scene,nodes:[{...scene.nodes[0],text:'B'}]};
for(const evidence of [[],[{itemId:'i',status:'passed'}],[{itemId:'i',status:'uncertain'}],[{itemId:'i',status:'failed'},{itemId:'i',status:'failed'}]]){
 assert.equal(groundedEvidenceDefects(verified,differentText,core.editableNodeBounds,{evidence}).length,0);
}
assert.equal(groundedEvidenceDefects(verified,differentText,core.editableNodeBounds).length,0);
assert.equal(groundedEvidenceDefects(verified,differentText,core.editableNodeBounds,verdict(scene,false)).length,1);
assert.equal(check(verified,differentText,{...good,evidence:[{itemId:'i',status:'uncertain',nodeIds:['label']}]}).state,'failed');
console.log('PASS visual failure required for fallback OCR repair; uncertain inventory never authorizes rewriting or acceptance');

const refInventory=normalizeInventory(inventory,600,300);
const refVerdict=verdict(scene,false);refVerdict.defects[0].objectIds=['i'];
assert.deepEqual(resolveDiagnosisReferences(refVerdict,refInventory,scene,core.editableNodeBounds).defects[0].objectIds,['label']);
for(const change of [v=>v.evidence=[],v=>v.evidence[0].status='passed',v=>v.evidence.push(v.evidence[0]),v=>v.defects[0].x=400,v=>v.evidence[0].nodeIds=['fake']]){
 const v=structuredClone(refVerdict);change(v);assert.deepEqual(resolveDiagnosisReferences(v,refInventory,scene,core.editableNodeBounds).defects[0].objectIds,[]);
}
assert.deepEqual(resolveDiagnosisReferences(refVerdict,refInventory,{...scene,nodes:[{...scene.nodes[0],x:400}]},core.editableNodeBounds).defects[0].objectIds,[]);
assert.equal(groundedEvidenceDefects({...refInventory,items:[{...refInventory.items[0],kind:'panel'}]},{nodes:[]},core.editableNodeBounds).length,0);
console.log('PASS failed inventory-ID diagnosis resolves bounded existing nodes only; broad panel titles never authorize OCR replacement');

r=await run({inventoryReference:true});assert.equal(r.audit.finalValidation.state,'passed');assert.ok(r.result.nodes[0].bold);assert.deepEqual(r.audit.diagnosisReferenceMappings[0].resolvedIds,['label']);

// Region selection is based on verified source pixels, including transitive
// overlap, nested groups, and mixed photo/chart ownership. It never tiles by a fixed quota.
const ni=normalizeInventory({canvas:{width:600,height:300,units:'source-pixels'},items:[
 {id:'panel',kind:'panel',x:0,y:0,w:600,h:300},
 {id:'card',kind:'panel',panelId:'panel',x:20,y:20,w:100,h:100},
 {id:'inner',kind:'icon',x:30,y:30,w:20,h:20},
 {id:'a',kind:'chart',x:200,y:20,w:40,h:40},
 {id:'b',kind:'equation',x:230,y:25,w:40,h:30},
 {id:'c',kind:'icon',x:260,y:20,w:40,h:40},
 {id:'photo',kind:'photo',x:400,y:20,w:40,h:40},
 {id:'photo-chart',kind:'chart',x:390,y:10,w:60,h:60}
].map(i=>({...i,description:i.id,colors:[]})),layers:[],connections:[],uncertainties:[]},600,300);
assert.equal(ni.coordinateVerified,true);
const nr=planNativeRecognition(ni,600,300);
assert.deepEqual(nr.map(r=>[r.x,r.y,r.w,r.h]),[[374,0,92,86],[20,20,100,100],[200,20,100,40]]);
assert.deepEqual(planNativeRecognition({...ni,coordinateVerified:false},600,300),[]);
// Real inventory uses group/formula/icon-component for the same visual roles.
const aliases={chart:'group',equation:'formula',icon:'icon-component'};
assert.deepEqual(planNativeRecognition({...ni,items:ni.items.map(i=>({...i,kind:aliases[i.kind]||i.kind}))},600,300),nr);
// A single OCR math box can stop above the denominator. Use its complete
// panel, but do not expand a math caption across neighboring tree groups.
const textInventory={coordinateVerified:true,items:[
 {id:'math-panel',kind:'panel',x:0,y:0,w:200,h:200},
 {id:'math-body',kind:'text',panelId:'math-panel',text:'V = N / max{1, k_*}',x:20,y:30,w:150,h:80},
 {id:'mixed-panel',kind:'panel',x:220,y:0,w:300,h:200},
 {id:'tree',kind:'group',panelId:'mixed-panel',x:240,y:20,w:50,h:50},
 {id:'math-caption',kind:'text',panelId:'mixed-panel',text:'H_t = H_{t−1}',x:240,y:100,w:150,h:30},
 {id:'multiline',kind:'text',text:'Same agent\nSame budget',x:540,y:20,w:50,h:70}
]};
assert.deepEqual(planNativeRecognition(textInventory,600,300).map(r=>[r.id,r.x,r.y,r.w,r.h]),[
 ['math-panel',0,0,200,200],['mixed-panel',220,0,300,200],['multiline',530,16,70,78]
]);
// The actual qualitative tree inventory cuts through its leftmost leaf.
const badgedMath=planNativeRecognition({coordinateVerified:true,items:[
 {id:'quantities',kind:'panel',x:1249,y:589,w:352,h:315},
 {id:'number7',kind:'icon',panelId:'quantities',x:1262,y:594,w:37,h:37},
 {id:'definitions',kind:'text',panelId:'quantities',text:'Replay score: V = N / max{1, k_*}',x:1268,y:658,w:315,h:154}
]},2048,1152);
assert.equal(badgedMath.length,1);
assert.deepEqual([badgedMath[0].x,badgedMath[0].y,badgedMath[0].w,badgedMath[0].h],[1249,589,352,315]);
assert.ok(badgedMath[0].itemIds.includes('number7'));
// Native context includes the complete circle and stays inside the panel.
const edgeTree=planNativeRecognition({coordinateVerified:true,items:[
 {id:'panel8',kind:'panel',x:1613,y:589,w:424,h:315},
 {id:'qual_tree',kind:'group',panelId:'panel8',x:1644,y:686,w:145,h:190},
 {id:'qual_tree_root_label',kind:'text',panelId:'panel8',text:'r',x:1698,y:680,w:16,h:18},
 {id:'legend',kind:'text',panelId:'panel8',text:'unrevealed nodes',x:1819,y:840,w:187,h:22}
]},2048,1152).find(r=>r.id==='panel8');
assert.deepEqual([edgeTree.x,edgeTree.y,edgeTree.w,edgeTree.h],[1613,589,424,315]);
assert.ok(edgeTree.x<=1632,'include the complete left leaf, not only its center');
// The real right-table box begins one pixel inside its outer vertical border.
// Include native context on all four sides, bounded by its neighboring labels.
const edgeTable=planNativeRecognition({coordinateVerified:true,items:[
 {id:'panel9',kind:'panel',x:1115,y:915,w:922,h:228},
 {id:'table',kind:'table',panelId:'panel9',x:1596,y:995,w:428,h:91},
 {id:'title',kind:'text',panelId:'panel9',x:1596,y:970,w:220,h:20},
 {id:'summary',kind:'text',panelId:'panel9',x:1604,y:1096,w:400,h:26}
]},2048,1152).find(r=>r.id==='panel9');
assert.deepEqual([edgeTable.x,edgeTable.y,edgeTable.w,edgeTable.h],[1115,915,922,228]);
assert.ok(edgeTable.x<1595&&edgeTable.x+edgeTable.w>2022,'outer grid strokes remain inside crop');
// A real inventory stopped at "handcrafted po". Context must include the word
// ending, without merging the neighboring icon or cropping its source pixels.
const clippedText={coordinateVerified:true,items:[
 {id:'panel',kind:'panel',x:10,y:588,w:615,h:316},
 {id:'methods',kind:'text',panelId:'panel',x:83,y:764,w:188,h:122,text:'Controlled Methods\nand initial handcrafted policy.'},
 {id:'left-icon',kind:'icon',panelId:'panel',x:27,y:760,w:39,h:43},
 {id:'right-icon',kind:'icon',panelId:'panel',x:304,y:760,w:40,h:43},
 {id:'budget',kind:'text',panelId:'panel',x:362,y:764,w:240,h:123,text:'Per-round Budget'},
 {id:'photo',kind:'photo',x:500,y:900,w:60,h:4}
]};
const padded=planNativeRecognition(clippedText,2048,1152),methods=padded.find(r=>r.id==='panel');
assert.deepEqual([methods.x,methods.y,methods.w,methods.h],[10,588,615,316]);
assert.ok(methods.itemIds.includes('methods'),'complete panel retains the entire text group');
assert.equal(padded.length,1);
for(const a of padded)for(const b of padded)if(a!==b)assert.ok(!(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y),'padded workers must not overlap');
const besidePhoto=planNativeRecognition({coordinateVerified:true,items:[
 {id:'caption',kind:'text',text:'Caption',x:10,y:10,w:80,h:20},
 {id:'photo',kind:'photo',x:95,y:0,w:50,h:50}
]},200,100);
assert.equal(besidePhoto.length,1);assert.equal(besidePhoto[0].x+besidePhoto[0].w,95);

// Single-line summaries, loop arrowheads and badge disks must not silently
// bypass native recognition. Backgrounds stay owned by the whole scene.
const standalone={coordinateVerified:true,items:[
 {id:'summary',kind:'text',text:'18.3% lower runtime',x:10,y:10,w:180,h:30},
 {id:'loop',kind:'connector',x:220,y:10,w:100,h:150},
 {id:'badge',kind:'badge',x:350,y:10,w:40,h:40},
 {id:'background',kind:'background',x:0,y:0,w:600,h:300}
]};
assert.deepEqual(planNativeRecognition(standalone,600,300).map(r=>r.id),['summary','loop','badge']);

// Actual source inventories describe missing policy cards, replay trees and
// simulator pools using open-vocabulary kinds, not the old kind whitelist.
const openKinds=['card','tree','tree-node','diagram','box','arrow','table-cell','unfamiliar-vector-kind'];
const openInventory={coordinateVerified:true,items:openKinds.map((kind,j)=>({id:kind,kind,x:20+j*70,y:20,w:30,h:30}))};
const openRegions=planNativeRecognition(openInventory,600,100);
assert.deepEqual(new Set(openRegions.flatMap(r=>r.itemIds)),new Set(openKinds));
assert.equal(openRegions.length,openKinds.length);
// A cross-panel heading summary must not collapse independent panel workers.
const bridged=planNativeRecognition({coordinateVerified:true,items:[
 {id:'left',kind:'panel',x:10,y:50,w:180,h:240},
 {id:'right',kind:'panel',x:210,y:50,w:180,h:240},
 {id:'headings',kind:'content-group',x:10,y:50,w:380,h:35},
 {id:'between',kind:'connector',x:185,y:95,w:30,h:20},
 {id:'left-body',kind:'diagram',panelId:'left',x:20,y:100,w:160,h:180}
]},400,300);
assert.deepEqual(bridged.map(r=>r.id),['left','right']);
assert.ok(bridged[0].itemIds.includes('left-body'));
assert.ok(bridged.every(r=>!r.itemIds.includes('headings')&&!r.itemIds.includes('between')),'cross-panel objects remain owned by the global worker');
const openMixed=planNativeRecognition({coordinateVerified:true,items:[
 {id:'panel',kind:'panel',x:0,y:0,w:300,h:200},
 {id:'replay-tree',kind:'tree',panelId:'panel',x:20,y:20,w:80,h:80},
 {id:'caption',kind:'text',panelId:'panel',text:'H_t',x:160,y:130,w:80,h:20}
]},300,200);
assert.equal(openMixed.length,2,'math captions must not swallow an open-kind tree into the whole panel');
assert.ok(openMixed.some(r=>r.itemIds.includes('replay-tree')));

// Real inventory described only the root of panel 8 and omitted its heading.
// Recognition must still inspect the full tree, badge and unlisted title. One
// shared border pixel must not fuse neighboring panels into a whole-image crop.
const incompletePanels=planNativeRecognition({coordinateVerified:true,items:[
 {id:'left',kind:'panel',x:10,y:10,w:201,h:200},
 {id:'right',kind:'panel',x:210,y:10,w:200,h:200},
 {id:'root-only',kind:'tree-node',panelId:'left',x:90,y:40,w:20,h:20}
]},600,300);
assert.deepEqual(incompletePanels.map(r=>[r.id,r.x,r.y,r.w,r.h]),[['left',10,10,200,200],['right',210,10,200,200]]);
assert.ok(incompletePanels[0].itemIds.includes('root-only'));
assert.ok(incompletePanels[0].y+incompletePanels[0].h>=200,'unlisted descendants remain inside the inspected crop');

// A common outer frame must not turn three independent child panels back
// into one slow request. Child contents retain exactly one crop owner.
const nestedPanels=planNativeRecognition({coordinateVerified:true,items:[
 {id:'column-frame',kind:'panel',x:10,y:10,w:180,h:280},
 ...[0,1,2].flatMap(i=>[
  {id:'child-'+i,kind:'panel',panelId:'column-frame',x:20,y:20+i*90,w:160,h:80},
  {id:'body-'+i,kind:'text-group',panelId:'child-'+i,x:30,y:40+i*90,w:130,h:35}
 ])
]},600,300);
assert.deepEqual(nestedPanels.map(r=>r.id),['child-0','child-1','child-2']);
for(let i=0;i<3;i++)assert.ok(nestedPanels[i].itemIds.includes('body-'+i));
assert.ok(nestedPanels.every(r=>!r.itemIds.includes('column-frame')),'shared outer frame belongs to global recognition');

assert.match(regionalRecognitionPrompt({regionalRecognition:true}),/CROP-RELATIVE/);
const ownershipContract=regionalRecognitionPrompt({regionalRecognition:true});
for(const requirement of ['SHARED-OBJECT OWNERSHIP','do not redraw them as cropped borders','including internal frames, backgrounds, connectors and their heads','Ownership follows the visible continuous object','Do not discard an internal object merely because it touches another object','ALL visible primitives owned by this region'])assert.ok(ownershipContract.includes(requirement),requirement);
assert.ok(!ownershipContract.includes('Preserve clipped boundary strokes as visible'));
assert.equal(regionalRecognitionPrompt({}), '');
assert.match(regionalRecognitionPrompt({regionalRecognition:true}),/inventory hint, not a pixel transcription/);
assert.match(regionalRecognitionPrompt({regionalRecognition:true}),/separately positioned smaller text nodes/);
for(const requirement of ['attach each script immediately to its own base glyph','do not use its spare width to position the next glyph','Crop boundaries and text bounding boxes are not source shapes','ordinary parentheses and braces stay on the base line','fraction bar spans the complete denominator','Operators such as max remain upright','output each visible head as its own filled triangle or closed path','do not use a generic arrow flag','do not clone one instance or impose symmetry','adjacent cells share exactly one separator','fill-only rectangles for cell backgrounds'])assert.ok(regionalRecognitionPrompt({regionalRecognition:true}).includes(requirement),requirement);
const repairPrompt=patchPrompt(600,300,patchTask);
for(const requirement of ['Diagnosis and inventory are fallible hypotheses','never change correct rendered wording','record the contradiction'])assert.ok(repairPrompt.includes(requirement),requirement);
const base={canvas:{width:600,height:300},nodes:[
 {id:'background',type:'rect',x:0,y:0,w:600,h:300},
 {id:'coarse',type:'rect',x:30,y:30,w:20,h:20},
 {id:'bridge',type:'line',x:10,y:60,x2:150,y2:60},
 {id:'outside',type:'rect',x:500,y:30,w:20,h:20},
 {id:'asset',type:'image',x:30,y:30,w:20,h:20,sourceAssetId:'photo'}
]};
const detail={canvas:{width:100,height:100},nodes:[
 {id:'dot',type:'ellipse',x:10,y:10,w:10,h:10},
 {id:'path',type:'path',d:'M 10 10 L 20 20',fill:'none'},
 {id:'points',type:'polyline',points:'10,10 20,20',closed:false},
 {id:'edge',type:'line',x:10,y:10,x2:20,y2:20}
]};
const merged=mergeNativeRecognition(base,detail,nr.find(r=>r.id==='card'),core.editableNodeBounds,pipeline.translateNode);
assert.deepEqual(merged.removedIds,['coarse']);
assert.ok(merged.crossingIds.includes('bridge'));
assert.ok(merged.scene.nodes.some(n=>n.id==='asset'));
assert.equal(merged.scene.nodes.find(n=>n.id==='native-card-dot').x,30);
for(const id of ['path','points','edge'])assert.deepEqual(core.editableNodeBounds(merged.scene.nodes.find(n=>n.id==='native-card-'+id)),{x:30,y:30,right:40,bottom:40});
assert.equal(base.nodes.length,5);
const headingBase={...base,nodes:[...base.nodes,
 {id:'overshooting-heading',type:'text',text:'Panel title',x:18,y:30,w:100,h:20},
 {id:'cross-panel-label',type:'text',text:'Shared label',x:0,y:70,w:220,h:20}
]};
const headingMerge=mergeNativeRecognition(headingBase,detail,nr.find(r=>r.id==='card'),core.editableNodeBounds,pipeline.translateNode);
assert.ok(headingMerge.removedIds.includes('overshooting-heading'),'regional ownership removes slightly overshooting duplicate headings');
assert.ok(headingMerge.scene.nodes.some(n=>n.id==='cross-panel-label'),'shared cross-panel text remains intact');

// A source-owned coarse arrow can overshoot the inventory crop. Replace the
// whole arrow, while retaining an unowned bridge and a tagged raster asset.
const lineageBase={...base,nodes:[...base.nodes,
 {id:'owned-arrow',type:'line',x:10,y:60,x2:150,y2:60,sourceItemId:'card'},
 {id:'foreign-arrow',type:'line',x:10,y:60,x2:150,y2:60,sourceItemId:'other'},
 {id:'owned-photo',type:'image',x:10,y:60,w:140,h:20,sourceAssetId:'photo',sourceItemId:'card'}
]};
const lineageMerge=mergeNativeRecognition(lineageBase,detail,{...nr.find(r=>r.id==='card'),itemIds:['card','inner']},core.editableNodeBounds,pipeline.translateNode);
assert.deepEqual(lineageMerge.removedIds,['coarse','owned-arrow']);
for(const id of ['bridge','foreign-arrow','owned-photo'])assert.ok(lineageMerge.scene.nodes.some(n=>n.id===id));
// Global-native ownership is explicit: a gutter number's layout box or a
// separate cross-panel arrowhead can lie inside the regional rectangle.
// Neither geometry nor a shared panel inventory ID may erase these objects.
const globalBase={...base,nodes:[...base.nodes,
 {id:'gutter-number',type:'text',text:'1',x:18,y:40,w:30,h:25,sourceItemId:'card'},
 {id:'crossing-head',type:'path',d:'M 40 50 L 50 60 L 40 70 Z',fill:'#000000',sourceItemId:'card'}
]};
const protectedGlobalIds=new Set(['gutter-number','crossing-head']);
const globalMerge=mergeNativeRecognition(globalBase,detail,{...nr.find(r=>r.id==='card'),itemIds:['card']},core.editableNodeBounds,pipeline.translateNode,protectedGlobalIds);
assert.deepEqual(globalMerge.removedIds,['coarse'],'regional coarse objects still replace normally');
for(const id of protectedGlobalIds)assert.deepEqual(globalMerge.scene.nodes.find(n=>n.id===id),globalBase.nodes.find(n=>n.id===id),'retain global content without changing its geometry');
const frameRegion={id:'frame',x:20,y:20,w:100,h:100,itemIds:['panel']};
const sharedFrame={id:'global-frame',type:'rect',x:20,y:20,w:100,h:100,fill:'#edf8fc',stroke:'#83b9e2',strokeWidth:3,sourceItemId:'panel'};
const localFrame={...sharedFrame,id:'local-frame',x:0,y:0};
const ownershipScene={nodes:[sharedFrame,
 {...sharedFrame,id:'crossing-frame',x:19},
 {...sharedFrame,id:'rotated-frame',rotation:10},
 {...sharedFrame,id:'connector-box',sourceItemId:'connection'},
 ...globalBase.nodes.filter(n=>protectedGlobalIds.has(n.id))
]};
const ownership=nativeGlobalOwnership(ownershipScene,[frameRegion],{connections:[{itemId:'connection'}]},core.editableNodeBounds);
assert.deepEqual(ownership.regionalFrames,[{id:'global-frame',regionId:'frame'}]);
for(const id of ['crossing-frame','rotated-frame','connector-box',...protectedGlobalIds])assert.ok(ownership.protectedIds.has(id),'crossing frames and connector components stay globally owned');
assert.ok(ownershipScene.nodes.includes(sharedFrame),'ownership assignment retains fallback content until regional success');
const ownedFrameMerge=mergeNativeRecognition({nodes:[sharedFrame]},{nodes:[localFrame]},frameRegion,core.editableNodeBounds,pipeline.translateNode,ownership.protectedIds);
assert.deepEqual(ownedFrameMerge.removedIds,['global-frame']);
assert.equal(ownedFrameMerge.scene.nodes.length,1,'successful regional recognition replaces the internal global frame');
const frameMerge=mergeNativeRecognition({nodes:[sharedFrame]},{nodes:[
 localFrame,
 {...localFrame,id:'nested',x:5,y:5,w:90,h:90},
 {...localFrame,id:'different-paint',fill:'#ffffff'},
 {...localFrame,id:'different-source',sourceItemId:'other'},
 {...localFrame,id:'different-dash',dash:[6,3]}
]},frameRegion,core.editableNodeBounds,pipeline.translateNode,new Set(['global-frame']));
assert.equal(frameMerge.scene.nodes.length,5,'only the matching global frame is suppressed');
assert.ok(!frameMerge.addedIds.includes('native-frame-local-frame'));
for(const suffix of ['nested','different-paint','different-source','different-dash'])assert.ok(frameMerge.addedIds.includes('native-frame-'+suffix));
assert.equal(mergeNativeRecognition({nodes:[sharedFrame]},{nodes:[localFrame]},frameRegion,core.editableNodeBounds,pipeline.translateNode).addedIds.length,1,'ordinary replacement does not suppress regional frames');
assert.ok(nr.find(r=>r.id==='card').itemIds.includes('inner'),'contained inventory descendants retain replacement ownership');
assert.throws(()=>mergeNativeRecognition(base,{nodes:[]},nr.find(r=>r.id==='card'),core.editableNodeBounds,pipeline.translateNode),/没有可编辑对象/);
assert.throws(()=>mergeNativeRecognition(base,{nodes:[{id:'wrong',type:'rect',x:400,y:100,w:10,h:10}]},nr.find(r=>r.id==='card'),core.editableNodeBounds,pipeline.translateNode),/裁图坐标/);
// Exercise production orchestration: native-sized crop, local inventory, no
// retry, merge before whole-image QA, and failed recognition retains its base.
for(const failed of [false,true]){
 const audit={tiles:[]},tasks=[];
 const request=async(src,w,h,t)=>{
  tasks.push(t);
  if(t.sourceInventory)return {...ni,items:ni.items.slice(0,3)};
  if(t.regionalRecognition){
   assert.equal(src,'native-crop');assert.equal(w,100);assert.equal(h,100);assert.equal(t.inputScale,1);assert.equal(t.maxAttempts,1);
   assert.deepEqual(t.sourceChecklist.items.map(i=>[i.id,i.x,i.y]),[['card',0,0],['inner',10,10]]);
   if(failed)throw Error('region unavailable');return detail;
  }
  if(t.wholeImage)return structuredClone(base);
  if(t.wholeImageAssessment){assert.equal(t.catalog.nodes.some(n=>n.id==='native-card-dot'),!failed);throw Error('QA unavailable');}
  throw Error('unexpected task');
 };
 const result=await reconstructWithEvidence(canvas,'source',request,audit,async()=>q(1),async()=>{},{},api);
 assert.equal(audit.nativeRecognition.results[0].state,failed?'failed':'merged');
 // Fully contained global frames are replaced only after regional success;
 // failed regional work takes the complete whole-image recovery path.
 assert.equal(result.nodes.some(n=>n.id==='coarse'),failed);
 assert.equal(audit.finalValidation.state,'unverified');
 assert.equal(tasks.filter(t=>t.regionalRecognition).length,failed?2:1);
 assert.equal(audit.nativeRecognition.recovery?.state,failed?'recovered':undefined);
}
console.log('PASS native region planning, crop-relative inventory, translation of every geometry type, crossing objects, source assets, atomic failure and real orchestration');

// Responses may finish in reverse order. Requests stay bounded and commits keep
// source order; a failed middle response cannot discard successful siblings.
{
 const items=Array.from({length:5},(_,i)=>({id:'parallel-'+i,kind:'icon',description:'icon',colors:[],x:150+i*30,y:200,w:20,h:20}));
 const inventory={canvas:{width:600,height:300,units:'source-pixels'},items,layers:[],connections:[],uncertainties:[]};
 const audit={tiles:[]};let active=0,maxActive=0;
 const request=async(src,w,h,t)=>{
  if(t.sourceInventory)return inventory;
  if(t.regionalRecognition){
   const i=Number(t.region.split('-')[1]);active++;maxActive=Math.max(maxActive,active);
   await new Promise(resolve=>setTimeout(resolve,(5-i)*3));active--;
   if(i===1)throw Error('one region failed');
   return {canvas:{width:w,height:h},nodes:[{id:'dot',type:'ellipse',x:2,y:2,w:5,h:5}]};
  }
  if(t.wholeImage)return structuredClone(base);
  if(t.wholeImageAssessment)throw Error('QA unavailable');
  throw Error('unexpected task');
 };
 const result=await reconstructWithEvidence(canvas,'source',request,audit,async()=>q(1),async()=>{},{},api);
 assert.equal(maxActive,3);assert.equal(active,0);
 assert.deepEqual(audit.nativeRecognition.results.map(r=>r.state),['merged','failed','merged','merged','merged']);
 assert.equal(audit.nativeRecognition.recovery.state,'recovered');
 assert.deepEqual(result,{...core.createWholeImageCatalog(base),regionStates:{}});
 console.log('PASS bounded regional concurrency commits source order and preserves successful siblings on failure');
}
