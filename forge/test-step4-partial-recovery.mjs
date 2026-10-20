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
 document:{createElement:()=>({getContext:()=>({drawImage(){}}),toDataURL:()=> 'crop'})},
 compareEditableRender:()=>{},recoverDocumentInk:identity,rejectUnsupportedLines:identity,
 repairStructuralLayers:identity,fitSourceFills:identity,calibrateShapeGeometry:identity,
 filterUnsupportedLongLines:(c,old,candidate)=>candidate,calibrateEditableText:()=>{},
 loadImage:async()=>({}),sceneToSvgString:()=>'<svg/>',compactQuality:identity,
 planSemanticRegions:()=>regions});
vm.runInContext(source,context);
const run=context.reconstructCatalogWithFallback;
const canvas={width:1400,height:700};
const scene={canvas:{width:1400,height:700},nodes:[100,1000].map((x,i)=>({id:String(i),type:'rect',x,y:100,w:100,h:100,fill:'#ffffff'}))};
const audit=()=>({tiles:[],fallbackTiles:0});
const quality=(c,s,r)=>{const nodes=s.nodes.filter(n=>n.x>=r.x&&n.x<r.x+r.w);const value=nodes.length&&nodes.every(n=>n.fill==='#000000')?1:.5;return Object.fromEntries(['score','darkRecall','localRecall','edgeF1','colorSimilarity'].map(k=>[k,value]));};
const refined=a=>({operations:a.detailCatalog.nodes.map(n=>({op:'update',id:n.id,node:{...n,fill:'#000000'}})),uncertainties:[]});
const once={maxAttempts:1};
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
assert.equal(high.skippedRegions,2);assert.equal(high.tilePassComplete,true);
const rejected=audit();
const unchanged=await run(canvas,'src',async(s,w,h,a)=>refined(a),rejected,cached,true,()=>({score:.5,darkRecall:.5,localRecall:.5,edgeF1:.5,colorSimilarity:.5}),undefined,once);
assert.equal(rejected.tilePassComplete,false);assert.ok(unchanged.nodes.every(n=>n.fill==='#ffffff'));
assert.ok(rejected.tiles.every(t=>t.accepted===false),'unimproved candidates must be rejected');
const bounded=audit();const attempts=[];
await run(canvas,'src',async(s,w,h,a)=>{attempts.push(a);if(a.attempt===0)throw Error('temporary failure');return refined(a);},bounded,cached,true,quality,undefined,{maxAttempts:2,retryBudget:1});
assert.equal(attempts.length,3);assert.equal(bounded.retryRegions.length,1);assert.equal(bounded.tilePassComplete,false);
console.log('PASS: whole-image failure, concurrent partial persistence, selective resume, cache remeasurement, quality rejection, bounded retry');
