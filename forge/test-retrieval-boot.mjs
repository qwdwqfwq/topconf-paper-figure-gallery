import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRetrievalBoot} from './retrieval-boot.mjs';
import {buildIndex,prepareQuery,rank} from './retrieval.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('keyword search starts before a slow semantic model; retry is single-flight',async()=>{
  let cores=0,models=0,release;
  const b=createRetrievalBoot({loadCore:async()=>{cores++;},loadSemantic:async()=>{models++;await new Promise(r=>release=r);}});
  await b.start();assert.equal(b.state.phase,'semantic-loading');
  await b.start();assert.equal(cores,1);
  const a=b.retry(),c=b.retry();assert.equal(a,c);assert.equal(models,1);
  release();await a;assert.equal(b.state.phase,'ready');
});
test('core HTTP failure can really retry without reloading the page',async()=>{
  let calls=0;
  const b=createRetrievalBoot({loadCore:async()=>{if(++calls===1)throw new Error('HTTP 503');},loadSemantic:async()=>{}});
  await b.start();assert.equal(b.state.phase,'core-error');
  await b.retry();await delay(0);assert.equal(b.state.phase,'ready');assert.equal(calls,2);
});
test('timeout cancels model attempt, preserves core, and allows a new attempt',async()=>{
  let signal,models=0,cores=0;
  const b=createRetrievalBoot({timeoutMs:20,loadCore:async()=>{cores++;},loadSemantic:async s=>{models++;signal=s;if(models===1)await new Promise(()=>{});}});
  await b.start();await delay(40);
  assert.equal(b.state.phase,'semantic-error');assert.equal(signal.aborted,true);
  await b.retry();assert.equal(b.state.phase,'ready');assert.equal(models,2);assert.equal(cores,1);
});
test('late timed-out completion cannot override retry state',async()=>{
  let finish,attempt=0;
  const b=createRetrievalBoot({timeoutMs:15,loadCore:async()=>{},loadSemantic:async()=>{if(++attempt===1)await new Promise(r=>finish=r);}});
  await b.start();await delay(30);await b.retry();finish();await delay(0);
  assert.equal(b.state.phase,'ready');
});
test('keyword-only index ranks relevant results and still rejects corrupt data',()=>{
  const data={ids:['a','b'],figs:[{id:'a',title:'Diffusion segmentation'},{id:'b',title:'Robot navigation'}],bm:{docs:[['diffusion','segmentation'],['robot','navigation']]}};
  const index=buildIndex(data),scores=new Float32Array(2);
  assert.equal(rank(index,prepareQuery('diffusion segmentation',index.idf),[0,1],scores,scores)[0].i,0);
  assert.throws(()=>buildIndex({...data,IE:new Float32Array(1)}));
  assert.throws(()=>buildIndex({...data,ids:['b','a']}));
});
