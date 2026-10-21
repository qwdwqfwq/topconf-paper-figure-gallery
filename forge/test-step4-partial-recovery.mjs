import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as core from './reconstruction-core.mjs';
import * as pipeline from './reconstruction-pipeline.mjs';
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('async function reconstructCatalogWithFallback('),html.indexOf('function reconstructionProgressText('));
const identity=s=>s;
const regions=[0,700].map((x,i)=>({id:i?'right':'left',x,y:0,w:700,h:700,coreX:x,coreY:0,coreRight:x+700,coreBottom:700}));
// Exercise the orchestration and real patch ownership/versioning. Pixel fitting
// has separate browser coverage and is isolated from these recovery tests.
const context=vm.createContext({...core,...pipeline,
 structuredClone,DOMException,document:{createElement:()=>({getContext:()=>({drawImage(){}}),toDataURL:()=> 'crop'})},
 compareEditableRender:()=>{},recoverDocumentInk:identity,rejectUnsupportedLines:identity,
 repairStructuralLayers:identity,fitSourceFills:identity,calibrateShapeGeometry:identity,
 filterUnsupportedLongLines:(c,old,candidate)=>candidate,calibrateEditableText:()=>{},
 loadImage:async()=>({}),sceneToSvgString:()=>'<svg/>',compactQuality:identity,
 planDefectRegions:(s,d)=>d.length?regions:[]});
vm.runInContext(source,context);
const run=(canvas,src,request,audit,cached,checked,measure,progress,options)=>context.reconstructCatalogWithFallback(canvas,src,async(s,w,h,a,...rest)=>{
 if(a.wholeCorrection)return cached||scene;
 if(a.defectDiagnosis)return {wholeImageAcceptable:true,summary:"Only isolated residual defects",coverage:[{region:"all",missingGroups:[]}],complete:false,defects:[{x:0,y:0,w:1400,h:700,reason:'missing ink'}]};
 return request(s,w,h,a,...rest);
},audit,cached,checked,measure,progress,options);
const canvas={width:1400,height:700};
const scene={canvas:{width:1400,height:700},nodes:[100,1000].map((x,i)=>({id:String(i),type:'rect',x,y:100,w:100,h:100,fill:'#ffffff'}))};
const audit=()=>({tiles:[],fallbackTiles:0});
const quality=(c,s,r)=>{const nodes=s.nodes.filter(n=>n.x>=r.x&&n.x<r.x+r.w);const value=nodes.length&&nodes.every(n=>n.fill==='#000000')?1:.5;return Object.fromEntries(['score','darkRecall','localRecall','edgeF1','colorSimilarity'].map(k=>[k,value]));};
const refined=a=>({operations:a.detailCatalog.nodes.map(n=>({op:'update',id:n.id,node:{...n,fill:'#000000'}})),uncertainties:[]});
const once={refine:true,maxAttempts:1};
let calls=0;
await assert.rejects(()=>run(canvas,'src',async()=>{calls++;throw Error('whole failed');},audit(),null,false,quality),/whole failed/);
assert.equal(calls,1);
const partial=audit();let delayedFinished=false;const saved=[];
const result=await run(canvas,'src',async(s,w,h,a)=>{
 if(a.wholeImage)return scene;
 if(a.region==='left')throw Error('terminal crop failure');
 await new Promise(r=>setTimeout(r,20));delayedFinished=true;return refined(a);
},partial,null,false,quality,async s=>saved.push(s),once);
assert.ok(delayedFinished);assert.equal(result.nodes[1].fill,'#000000');assert.equal(result.nodes[0].fill,'#ffffff');
assert.equal(partial.regionStates.left.state,'retry');assert.equal(partial.regionStates.right.state,'passed');assert.equal(partial.tilePassComplete,false);
assert.ok(saved.some(s=>s.nodes[1].fill==='#000000'),'successful concurrent region must be persisted despite another failure');
const resumed=audit();const requested=[];
const complete=await run(canvas,'src',async(s,w,h,a)=>{requested.push(a.region);return refined(a);},resumed,result,true,quality,undefined,once);
assert.deepEqual(requested,['left']);assert.equal(resumed.tilePassComplete,true);assert.ok(complete.nodes.every(n=>n.fill==='#000000'));
const cached={...core.createWholeImageCatalog(scene),regionStates:{left:{state:'passed'},right:{state:'passed'}}};
const retry=audit();calls=0;
await run(canvas,'src',async(s,w,h,a)=>{calls++;return refined(a);},retry,cached,true,quality,undefined,once);
assert.equal(calls,2,'stale passed cache must be remeasured and refined');assert.equal(retry.tilePassComplete,true);
const high=audit();
await run(canvas,'src',async()=>{throw Error('must not call');},high,complete,true,quality,undefined,once);
assert.equal(high.tiles.length,3);assert.equal(high.tilePassComplete,true);
const rejected=audit();
const unchanged=await run(canvas,'src',async(s,w,h,a)=>refined(a),rejected,cached,true,()=>({score:.5,darkRecall:.5,localRecall:.5,edgeF1:.5,colorSimilarity:.5}),undefined,once);
assert.equal(rejected.tilePassComplete,false);assert.ok(unchanged.nodes.every(n=>n.fill==='#ffffff'));
assert.ok(rejected.tiles.filter(t=>!t.defectDiagnosis).every(t=>t.accepted===false),'unimproved candidates must be rejected');
const bounded=audit();const attempts=[];
await run(canvas,'src',async(s,w,h,a)=>{attempts.push(a);if(a.attempt===0)throw Error('temporary failure');return refined(a);},bounded,cached,true,quality,undefined,{refine:true,maxAttempts:2,retryBudget:1});
assert.equal(attempts.length,3);assert.equal(bounded.retryRegions.length,1);assert.equal(bounded.tilePassComplete,false);
console.log('PASS: whole-image failure, concurrent partial persistence, selective resume, cache remeasurement, quality rejection, bounded retry');

// Default pass publishes the catalog, completes semantic regions, then skips detail crops when passed.
let published=false,firstCalls=0;
const first=audit();
await run(canvas,'src',async(s,w,h,a)=>{firstCalls++;return a.wholeImage?scene:refined(a);},first,null,false,
 (c,s,r)=>{assert.ok(published);return quality(c,s,r);},async()=>{published=true;},{maxAttempts:2,retryBudget:3});
assert.equal(firstCalls,3);assert.equal(first.totalTiles,3);assert.equal(first.completedTiles,3);assert.equal(first.tilePassComplete,true);
assert.equal(first.detailRegions.length,0);
await assert.rejects(()=>run(canvas,'src',async()=>scene,audit(),cached,true,quality,undefined,
 {...once,signal:{aborted:true}}),/Stopped/);
await assert.rejects(()=>run(canvas,'src',async()=>scene,audit(),cached,true,quality,undefined,
 {...once,deadline:Date.now()-1}),/budget/);
console.log('PASS: one whole catalog, early publication, no exhaustive detail crops, cancellation and total budget');

// A clean diagnosis must skip all regional calls even with conservative pixel scores.
const clean=audit(),stages=[];
await context.reconstructCatalogWithFallback(canvas,'src',async(s,w,h,a)=>{stages.push(a.wholeImage?'whole':a.wholeCorrection?'correction':a.defectDiagnosis?'diagnosis':'region');if(a.defectDiagnosis)return {wholeImageAcceptable:true,summary:"Complete",coverage:[{region:"all",missingGroups:[]}],complete:true,defects:[]};return scene;},clean,null,false,quality);
assert.deepEqual(stages,['whole','diagnosis','diagnosis','diagnosis']);assert.equal(clean.repairRegions.length,0);assert.equal(clean.tilePassComplete,true);
console.log('PASS: fresh diagnosis precedes targeted repairs without whole rewriting; clean render skips all regions');

// A deficient first pass must never invoke regional diagnosis or reconstruction.
for(const verdict of [false,undefined]){
 const log=[],a=audit();let evidence;
 await assert.rejects(()=>context.reconstructCatalogWithFallback({width:5504,height:3072},'native-source',async(src,w,h,task)=>{
  log.push(task);assert.equal(src,'native-source');assert.equal(w,5504);assert.equal(h,3072);
  if(task.wholeImage)return {...scene,recognitionCounts:{raw:2,expanded:2,parsed:2}};
  assert.ok(task.wholeImageAssessment);return {wholeImageAcceptable:verdict,summary:'Missing panel interiors',coverage:[{region:'panel',missingGroups:['interiors']}],complete:false,defects:[]};
 },a,null,false,quality,undefined,{onWholeImage:r=>{evidence=r;}}),/整图首轮未通过/);
 assert.equal(log.length,2);assert.equal(evidence.validation.state,'failed');assert.equal(evidence.nodeCounts.raw,2);assert.equal(evidence.nodeCounts.deduplicated,2);
}
console.log('PASS: native-resolution whole input, count evidence and failed acceptance stop all regional work');
