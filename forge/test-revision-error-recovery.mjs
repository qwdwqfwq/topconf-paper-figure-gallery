import test from 'node:test';
import assert from 'node:assert/strict';
import {revisionPlanContent,revisionPlanner} from './revision-layout.mjs';
import {step3ReferenceInputs} from './step3-reference-input.mjs';
const envelope=content=>({choices:[{message:{content}}]});
test('planner accepts documented text envelopes and single-object wrappers without guessing prose',()=>{
 const plan={mode:'local',regions:[{x:1,y:2,width:30,height:40}]};
 for(const text of [JSON.stringify(plan),'```json\n'+JSON.stringify(plan)+'\n```',JSON.stringify([plan])]){
  assert.deepEqual(revisionPlanContent(envelope(text)),plan);
  assert.deepEqual(revisionPlanContent(envelope([{type:'text',text:text.slice(0,10)},{type:'output_text',text:text.slice(10)}])),plan);
 }
 for(const text of ['Here is your plan: {}','[{},{}]','null','1','[]','{"unfinished":'])assert.throws(()=>revisionPlanContent(envelope(text)),{code:'REVISION_PLAN_FORMAT'});
 assert.throws(()=>revisionPlanContent(envelope([{type:'image_url',text:'{}'}])),{code:'REVISION_PLAN_FORMAT'});
});
test('planner distinguishes body interruption, invalid HTTP envelope and invalid model JSON; never retries interrupted HTTP',async()=>{
 const original=globalThis.fetch,key='private-offline-key';
 const parent={route:{p:'infistar',base:'https://example.invalid/v1'}};
 try{
  for(const code of ['REVISION_PLAN_TRANSPORT','REVISION_PLAN_ENVELOPE','REVISION_PLAN_FORMAT']){
   let calls=0;globalThis.fetch=async()=>{calls++;return {ok:true,status:200,headers:new Headers({'x-oneapi-request-id':'test-'+key}),text:async()=>{if(code==='REVISION_PLAN_TRANSPORT')throw Error('interrupted');return code==='REVISION_PLAN_ENVELOPE'?'invalid':JSON.stringify(envelope('not JSON'));}};};
   await assert.rejects(revisionPlanner(parent,[{type:'text',text:'unchanged'}],{key},4096),error=>{
    assert.equal(error.code,code);assert.ok(error.revisionDiagnostics.requestId.includes('[redacted]'));assert.ok(!error.message.includes(key));return true;
   });
   assert.equal(calls,code==='REVISION_PLAN_FORMAT'?2:1);
  }
 }finally{globalThis.fetch=original;}
});
test('only public NoneLinear Step 3 gallery references use direct URLs; uploads and other providers keep existing bytes and order',async()=>{
 const figures={a:{image:'images/paper/a.png'},b:{image:'images/b.png',localURL:'blob:upload'},c:{image:'https://private.invalid/x'},d:{image:'images/../secret'}};
 const fallback=async ids=>ids.map(id=>'data:'+id);
 assert.deepEqual(await step3ReferenceInputs('nonelinear',['a','b','c','d'],id=>figures[id],fallback),['https://qwdwqfwq.github.io/topconf-paper-figure-gallery/images/paper/a.png','data:b','data:c','data:d']);
 for(const provider of ['infistar','oai'])assert.deepEqual(await step3ReferenceInputs(provider,['a','b'],id=>figures[id],fallback),['data:a','data:b']);
});
