import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeModels,fetchParserCatalog} from './parser-model-catalog.mjs';
import {nonelinearCatalog} from './parser-nonelinear-catalog.mjs';
const config={provider:'nonelinear',base:'https://fixture.invalid/v1/',key:'test-key',proto:'oai'};
test('catalog accepts compatible schemas, deduplicates, and rejects malformed or empty responses',()=>{
  assert.deepEqual(normalizeModels({data:[{id:'gpt-4o'},'claude-test',{model:'gemini-test'},{name:'other'},'gpt-4o',null]}),['gpt-4o','claude-test','gemini-test','other']);
  assert.deepEqual(normalizeModels({models:[' a ','a']}),['a']);
  for(const body of [{},{data:[]},{data:[null,{},'']}])assert.throws(()=>normalizeModels(body));
});
test('bundled public catalog has every captured provider id and all three reported families',()=>{
  assert.equal(nonelinearCatalog.models.length,344);
  assert.equal(new Set(nonelinearCatalog.models).size,344);
  for(const family of [/^gpt-/i,/^claude-/i,/^gemini-/i])assert.ok(nonelinearCatalog.models.some(id=>family.test(id)));
  assert.equal(nonelinearCatalog.updated,'2026-11-14');
});
test('transport uses configured endpoint and credentials, retries transient failures, and returns no secrets',async()=>{
  let calls=0;
  const result=await fetchParserCatalog(config,{delayMs:1,fetchImpl:async(url,options)=>{
    assert.equal(url,'https://fixture.invalid/v1/models');assert.equal(options.headers.Authorization,'Bearer test-key');
    assert.equal(options.cache,'no-store');return ++calls===1?new Response('',{status:503}):Response.json({data:[{id:'gpt-test'}]});
  }});
  assert.equal(calls,2);assert.deepEqual(result,{ok:true,list:['gpt-test'],error:null});
  const failure=await fetchParserCatalog(config,{retries:0,fetchImpl:async()=>{throw Error('secret test-key response');}});
  assert.equal(failure.error,'network');assert.ok(!JSON.stringify(failure).includes(config.key));
});
test('authorization failures and malformed responses never retry',async()=>{
  for(const status of [401,403]){
    let calls=0;const result=await fetchParserCatalog(config,{fetchImpl:async()=>{calls++;return new Response('',{status});}});
    assert.equal(calls,1);assert.equal(result.error,'http-'+status);
  }
  let calls=0;const result=await fetchParserCatalog(config,{fetchImpl:async()=>{calls++;return Response.json({unexpected:[]});}});
  assert.equal(calls,1);assert.equal(result.error,'schema');
});
test('both a hung fetch and hung JSON body have bounded deadlines with one retry',async()=>{
  for(const phase of ['fetch','body']){
    let calls=0;const signals=[];
    const result=await fetchParserCatalog(config,{timeoutMs:15,delayMs:1,fetchImpl:async(_,options)=>{
      calls++;signals.push(options.signal);const stuck=new Promise(()=>{});
      return phase==='fetch'?stuck:{ok:true,json:()=>stuck};
    }});
    assert.equal(result.error,'timeout');assert.equal(calls,2);assert.ok(signals.every(signal=>signal.aborted));
  }
});
