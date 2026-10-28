import assert from 'node:assert/strict';
import * as core from './reconstruction-core.mjs';
import * as pipeline from './reconstruction-pipeline.mjs';
import {reconstructWithEvidence} from './bitmap-evidence.mjs';

// Exercise real patch ownership, version checks, quality gates and orchestration.
const canvas={width:1000,height:200};
const nodes=Array.from({length:4},(_,i)=>({id:`n${i}`,type:'text',x:30+i*240,y:70,w:60,h:30,text:String(i),fill:'#000000',fontSize:20}));
const original={canvas,nodes};
const inventory={canvas:{...canvas,units:'source-pixels'},items:nodes.map(n=>({id:`i${n.text}`,kind:'text',description:'label',x:n.x,y:n.y,w:n.w,h:n.h,text:n.text,expectedCount:null,colors:[{role:'text',value:'#000000'}]})),layers:[],connections:[],uncertainties:[]};
const defects=nodes.map(n=>({x:n.x,y:n.y,w:n.w,h:n.h,reason:'Incorrect label emphasis',objectIds:[n.id]}));
const baseRegions=nodes.map((n,i)=>({id:`r${i}`,x:n.x-10,y:50,w:100,h:80,coreX:n.x-10,coreY:50,coreRight:n.x+90,coreBottom:130,defects:[defects[i]]}));
const quality=n=>Object.fromEntries(['score','darkRecall','localRecall','edgeF1','colorSimilarity'].map(k=>[k,n]));
globalThis.document={createElement:()=>({getContext:()=>({drawImage(){}}),toDataURL:()=> 'crop'})};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

async function run({overlap=false,shared=false,fail,abort=false}={}){
  const audit={tiles:[]},started=[],finished=[],committed=[];
  const gates=baseRegions.map(deferred),ready=deferred(),controller=new AbortController();
  let active=0,peak=0,assessments=0;
  const regions=structuredClone(baseRegions);
  if(overlap){regions[1].x=regions[0].x+80;regions[1].w=260;}
  const api={...core,...pipeline,sceneToSvgString:()=>'<svg/>',compactQuality:s=>s,renderCrop:async()=> 'render',planDefectRegions:()=>regions,
    regionObjectCatalog(s,r){
      const catalog=pipeline.regionObjectCatalog(s,r);
      // Simulate a cross-region dependency even when crop rectangles are disjoint.
      if(shared&&r.id==='r1')catalog.readOnlyContext.push({...s.nodes[0]});
      return catalog;
    }};
  const request=async(src,w,h,t)=>{
    if(t.sourceInventory)return inventory;
    if(t.regionalRecognition)throw Error('Use whole-image fixture');
    if(t.wholeImage)return structuredClone(original);
    if(t.wholeImageAssessment){
      assessments++;
      const passed=assessments>1&&t.catalog.nodes.every(n=>n.bold);
      return {complete:passed,wholeImageAcceptable:passed,coverage:[{region:'all',missingGroups:[]}],inventoryComplete:true,unlistedSourceItems:[],uncertainties:[],summary:'Compared',evidence:nodes.map((n,i)=>({itemId:`i${i}`,status:t.catalog.nodes.find(x=>x.id===n.id).bold?'passed':'failed',nodeIds:[n.id],reason:'checked'})),defects:passed?[]:defects};
    }
    if(t.localInspection)return {complete:true,defects:[]};
    if(t.regionPatch){
      const i=Number(t.region.slice(1));started.push(i);active++;peak=Math.max(peak,active);
      if(started.length===(overlap||shared?1:3))ready.resolve();
      await gates[i].promise;active--;finished.push(i);
      if(i===fail)throw Error('One patch failed');
      const node=t.detailCatalog.nodes.find(n=>n.id===`n${i}`);
      return {operations:[{op:'update',id:node.id,node:{...node,bold:true}}],uncertainties:[]};
    }
    throw Error('Unexpected request');
  };
  const measure=async(c,s,r)=>quality(r.w===canvas.width?.6+.1*s.nodes.filter(n=>n.bold).length:s.nodes.find(n=>n.id===`n${r.id?.slice(1)}`)?.bold?1:.6);
  const promise=reconstructWithEvidence(canvas,'source',request,audit,measure,async s=>{
    for(const n of s.nodes)if(n.bold&&!committed.includes(n.id))committed.push(n.id);
  },{signal:controller.signal},api);
  await ready.promise;
  assert.deepEqual(started,overlap||shared?[0,2,3]:[0,1,2],'conflicting region waits while independent regions fill available slots');
  if(abort)controller.abort();
  // Independent repairs may commit in completion order. Rolling scheduling
  // records dispatch groups rather than fixed three-request batches.
  gates[2].resolve();gates[1].resolve();gates[0].resolve();gates[3].resolve();
  if(abort){await assert.rejects(promise,{name:'AbortError'});assert.deepEqual(committed,[]);return;}
  const result=await promise;
  assert.ok(peak<=3);assert.equal(audit.repairCalls,4);
  if(overlap||shared){assert.equal(audit.repairBatches[0].length,1);}
  else {assert.equal(peak,3);assert.deepEqual(finished.slice(0,3),[2,1,0]);assert.deepEqual(audit.repairBatches.flat(),['r0','r1','r2','r3']);}
  const expected=nodes.filter((n,i)=>i!==fail).map(n=>n.id);
  assert.deepEqual([...committed].sort(),expected,'each successful repair commits exactly once');
  assert.deepEqual(result.nodes.filter(n=>n.bold).map(n=>n.id),expected);
  assert.equal(audit.finalValidation.state,fail===undefined?'passed':'failed');
}

await run();
await run({overlap:true});
await run({shared:true});
await run({fail:1});
await run({abort:true});
console.log('PASS three parallel repairs, stable final scene, overlap/read dependencies, sibling failure isolation and cancellation');
