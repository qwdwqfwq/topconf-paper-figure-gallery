import assert from 'node:assert/strict';
import * as core from './reconstruction-core.mjs';
import * as pipeline from './reconstruction-pipeline.mjs';
import {normalizeInventory,resourceManifest,resourceDefects,reconcileResourceCrops,reconstructWithEvidence,repairStatus} from './bitmap-evidence.mjs';
import {recoverBitmapResponse} from './bitmap-response.mjs';
const canvas={width:200,height:100},draws=[];
globalThis.document={createElement:()=>({getContext:()=>({drawImage:(...args)=>draws.push(args.slice(1))}),toDataURL:()=> 'data:image/png;base64,crop'})};
const photo={id:'photo',kind:'photograph',description:'original photo',x:10,y:20,w:40,h:30,expectedCount:1,colors:[]};
const inventory={canvas:{width:200,height:100,units:'source-pixels'},items:[photo],layers:[],connections:[],uncertainties:[]};
const original={canvas:{width:200,height:100},nodes:[{id:'placeholder',type:'rect',x:10,y:20,w:40,h:30,fill:'#008800'}]};
const api={...core,...pipeline,sceneToSvgString:()=>'<svg/>',compactQuality:s=>s,renderCrop:async()=> 'render'};
async function run(input,confirmation=input,diagnosis){
 const audit={tiles:[]},calls=[];
 const scene=await reconstructWithEvidence(canvas,'source',async(src,w,h,t)=>{
  calls.push(t);
  if(t.sourceInventory)return structuredClone(t.resourceCoordinateConfirmation?confirmation:input);
  if(t.wholeImage)return structuredClone(original);
  if(t.defectDiagnosis){if(diagnosis)return diagnosis;throw Error('QA output limit');}
  if(t.regionPatch)return {operations:[],uncertainties:['No editable change confirmed']};
  throw Error('Unexpected request');
 },audit,async()=>({preview:'render'}),async()=>{}, {},api);
 return {audit,scene,calls};
}
let r=await run(inventory);
assert.equal(r.audit.repairRounds,1);assert.equal(r.scene.nodes.filter(n=>n.type==='image').length,0);
assert.ok(draws.length>0,'missing photo region is cropped only for model inspection');
assert.equal(r.audit.resourceReconciliation.length,1);assert.notEqual(r.audit.finalValidation.state,'passed');
assert.equal(r.calls.filter(t=>t.wholeImage&&!t.sourceInventory).length,1);
assert.equal(r.calls.filter(t=>t.regionPatch).length,1,'missing photos require source inspection through a regional patch');assert.notEqual(r.audit.finalValidation.state,'passed');
const manifest=resourceManifest(normalizeInventory(inventory,200,100),200,100);
const edge=structuredClone(inventory);edge.items[0].x=160.5;
assert.equal(resourceManifest(normalizeInventory(edge,200,100),200,100)[0].state,'unresolved','no crop may extend beyond native source pixels');
assert.equal(resourceDefects(manifest,original).length,1,'a rectangle cannot satisfy photo evidence');
const proved={canvas:{width:200,height:100},nodes:[{id:'independent-photo',type:'image',x:10,y:20,w:40,h:30,href:'data:image/png;base64,crop',sourceCrop:{x:10,y:20,w:40,h:30},sourceCanvas:{width:200,height:100}}]};
reconcileResourceCrops(manifest,proved);
assert.equal(proved.nodes[0].sourceAssetId,'photo');
assert.equal(resourceDefects(manifest,proved).length,0);
for(const change of [{sourceCrop:{x:70,y:20,w:40,h:30}},{sourceCanvas:{width:100,height:50}},{sourceCrop:undefined}]){
 const invalid=structuredClone(proved);Object.assign(invalid.nodes[0],change);
 assert.equal(resourceDefects(manifest,invalid).length,1,'stale resource identity cannot bypass crop proof');
}
const ambiguous=[...manifest,{...manifest[0],itemId:'other-photo'}];
assert.equal(resourceDefects(ambiguous,proved).length,2,'one image cannot satisfy two resource identities');
const duplicate=structuredClone(proved);duplicate.nodes.push({...duplicate.nodes.at(-1),id:'duplicate'});
assert.equal(resourceDefects(manifest,duplicate).length,1,'duplicate images cannot satisfy one resource');
const unverified={...inventory,canvas:undefined};
r=await run(unverified);
assert.equal(r.audit.repairRounds,0);assert.equal(r.audit.resourceReconciliation.length,1);
assert.equal(r.audit.resourceInventoryUncertainties.length,1,'unverified coordinates remain an explicit review uncertainty');
assert.equal(r.calls.filter(t=>t.regionPatch).length,0,'an uncertain inventory alone must not manufacture a missing-photo repair');
assert.notEqual(r.audit.finalValidation.state,'passed');
assert.equal(r.scene.nodes.filter(n=>n.type==='image').length,0);
const replacement=structuredClone(inventory);replacement.items[0].id='unrelated';
r=await run(unverified,replacement);assert.ok(r.audit.coordinateConfirmationError,'confirmation cannot replace asset identities');
r=await run(unverified,inventory);assert.equal(r.audit.resourceReconciliation.length,1);assert.equal(r.audit.repairRounds,1);
const grouped=structuredClone(inventory);grouped.items[0].expectedCount=2;
r=await run(grouped,inventory);assert.ok(r.audit.coordinateConfirmationError,'confirmation cannot discard counted frames');
const split=structuredClone(inventory);split.items=[{...photo,id:'frame1',sourceItemId:'photo'},{...photo,id:'frame2',sourceItemId:'photo',x:70}];
r=await run(grouped,split);assert.equal(r.scene.nodes.filter(n=>n.type==='image').length,0,'split inventory still cannot autoembed unverified pixels');
const truncated='{"complete":false,"wholeImageAcceptable":false,"summary":"cut","defects":[{"x":2,"y":3,"w":4,"h":5,"reason":"missing","objectIds":[]},{"x":';
const recovered=recoverBitmapResponse(truncated,'diagnosis');
assert.equal(recovered.defects.length,1);assert.equal(recovered.complete,false);assert.ok(recovered.uncertainties.length);
r=await run(inventory,inventory,recovered);
assert.ok(r.calls.some(t=>t.regionPatch),'recovered defects and missing resources enter local repair');
assert.equal(r.audit.repairRounds,1);
assert.equal(r.scene.nodes.filter(n=>n.sourceAssetId==='photo').length,0,'failed repair cannot manufacture photo evidence');
assert.equal(r.calls.filter(t=>t.wholeImage&&!t.sourceInventory).length,1);
assert.match(repairStatus({repairRounds:1,resourceRepairs:[{state:'failed'}]}),/执行失败/);
console.log('PASS bitmap resource preservation, coordinate guards, QA-failure repair and honest statuses');

