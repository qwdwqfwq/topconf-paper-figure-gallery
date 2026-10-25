import assert from 'node:assert/strict';
import * as core from './reconstruction-core.mjs';
import * as pipeline from './reconstruction-pipeline.mjs';
import {validateInventory,validateEvidence,guardPatch,reconstructWithEvidence} from './bitmap-evidence.mjs';
const canvas={width:600,height:300};
const scene={canvas:{width:600,height:300},nodes:[{id:'label',type:'text',x:100,y:100,w:100,h:30,text:'A',fill:'#000000',fontSize:20}]};
const inventory={items:[{id:'i',kind:'text',description:'label',x:100,y:100,w:100,h:30,text:'A',expectedCount:null,colors:[{role:'text',value:'#000000'}]}],layers:[],connections:[],uncertainties:[]};
const verdict=(s,passed)=>({complete:passed,wholeImageAcceptable:passed,inventoryComplete:true,unlistedSourceItems:[],uncertainties:[],summary:'Source/render compared',evidence:[{itemId:'i',status:passed?'passed':'failed',nodeIds:['label'],reason:'checked'}],defects:passed?[]:[{x:100,y:100,w:100,h:30,reason:'Wrong OCR',objectIds:['label']}]});
const q=n=>Object.fromEntries(['score','darkRecall','localRecall','edgeF1','colorSimilarity'].map(k=>[k,n]));
const cropped=[];
globalThis.document={createElement:()=>({width:0,height:0,getContext(){return {drawImage(){}};},toDataURL(){cropped.push([this.width,this.height]);return 'native-crop';}})};
const api={...core,...pipeline,sceneToSvgString:()=>'<svg/>',compactQuality:s=>s,renderCrop:async()=> 'render'};
async function run(config={}){
 const audit={tiles:[]},calls=[],snapshots=[];let assessments=0;
 const request=async(src,w,h,t)=>{
  calls.push(t);assert.equal(t.maxAttempts,1);
  if(t.sourceInventory){assert.equal(src,'source');assert.equal(w,600);assert.equal(h,300);assert.equal(t.catalog,undefined);return config.invalidInventory?{}:inventory;}
  if(t.wholeImage){if(config.wholeError)throw Error('whole failed');return structuredClone(scene);}
  if(t.localInspection)return {complete:!config.localReject,defects:config.localReject?[{reason:'bad'}]:[]};
  if(t.wholeImageAssessment){assessments++;if(config.finalError&&assessments>1)throw Error('QA failed');const v=verdict(t.catalog,config.clean||assessments>1&&!config.finalReject);if(config.semanticRegression){v.evidence[0].status=assessments===1?'passed':'failed';v.complete=false;v.wholeImageAcceptable=false;v.defects=verdict(t.catalog,false).defects;}return v;}
  if(t.regionPatch){assert.equal(src,'native-crop');assert.equal(w,t.sourceRegion.w);assert.equal(h,t.sourceRegion.h);if(config.patchError)throw Error('patch failed');return {operations:[{op:'update',id:'label',node:{...t.detailCatalog.nodes[0],text:'A',fill:'#000000',bold:true}}],uncertainties:[]};}
  throw Error('Unexpected request');
 };
 const measure=async(c,s,r)=>q(s.nodes[0].bold?(config.globalDamage&&r.w===600?.4:1):.6);
 try{const result=await reconstructWithEvidence(canvas,'source',request,audit,measure,async s=>snapshots.push(structuredClone(s)),{maxAttempts:99,retryBudget:99,...config.options},api);return {result,audit,calls,snapshots};}
 catch(error){return {error,audit,calls,snapshots};}
}
let r=await run({clean:true});
assert.equal(r.audit.finalValidation.state,'passed');assert.equal(r.audit.tilePassComplete,true);assert.equal(r.audit.repairRounds,0);assert.equal(r.calls.length,3);
assert.deepEqual(r.calls.map(t=>t.sourceInventory?'inventory':t.wholeImage?'whole':'QA'),['inventory','whole','QA']);
assert.ok(r.snapshots.length>0);
r=await run();
assert.equal(r.audit.repairRounds,1);assert.equal(r.calls.filter(t=>t.regionPatch).length,1);assert.equal(r.calls.filter(t=>t.wholeImage&&!t.sourceInventory).length,1);assert.equal(r.calls.filter(t=>t.localInspection).length,1);assert.equal(r.audit.finalValidation.state,'passed');assert.equal(r.audit.tilePassComplete,true);assert.ok(r.result.nodes[0].bold);assert.deepEqual(cropped.at(-1),[r.audit.repairRegions[0].w,r.audit.repairRegions[0].h]);
for(const config of [{patchError:true},{localReject:true},{globalDamage:true},{finalError:true}]){
 r=await run(config);assert.equal(r.result.nodes[0].bold,undefined,JSON.stringify(config));assert.equal(r.audit.tilePassComplete,false);assert.equal(r.calls.filter(t=>t.regionPatch).length,1);assert.equal(r.calls.filter(t=>t.wholeImage&&!t.sourceInventory).length,1);
}
r=await run({finalError:true});assert.equal(r.audit.roundRolledBack,true);assert.equal(r.audit.finalValidation.state,'unverified');
r=await run({semanticRegression:true});assert.equal(r.audit.roundRolledBack,true);assert.equal(r.result.nodes[0].bold,undefined);assert.equal(r.audit.tilePassComplete,false);
r=await run({invalidInventory:true});assert.match(r.error.message,/清单/);assert.equal(r.calls.length,1);
r=await run({wholeError:true});assert.match(r.error.message,/whole failed/);assert.equal(r.calls.length,2);
for(const options of [{signal:{aborted:true}},{deadline:Date.now()-1},{refine:true}]){r=await run({options});assert.ok(r.error);assert.equal(r.calls.length,0);}
console.log('PASS source-only inventory, native crops, early draft, one whole call, one repair round, no retries, local/global rollback, QA failure, cancellation');

const good=verdict(scene,true),check=(i=inventory,s=scene,v=good)=>validateEvidence(i,s,v,core.editableNodeBounds);
assert.equal(check().state,'passed');
for(const mutate of [v=>v.evidence=[],v=>v.evidence[0].nodeIds=['fake'],v=>v.evidence[0].status='uncertain',v=>v.uncertainties=['unknown'],v=>delete v.uncertainties,v=>v.unlistedSourceItems=['arrow'],v=>v.evidence.push(v.evidence[0])]){const v=structuredClone(good);mutate(v);assert.equal(check(inventory,scene,v).state,'failed');}
assert.equal(check(inventory,{...scene,nodes:[{...scene.nodes[0],text:'B'}]}).state,'failed');
assert.equal(check(inventory,{...scene,nodes:[{...scene.nodes[0],fill:'#ff0000'}]}).state,'failed');
assert.equal(check(inventory,{...scene,nodes:[{...scene.nodes[0],x:400}]}).state,'failed');
const repeated=structuredClone(inventory);repeated.items[0].expectedCount=2;
assert.equal(check(repeated).state,'failed');
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
