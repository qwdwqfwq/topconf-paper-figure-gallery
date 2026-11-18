import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {ASSETS,DOMESTIC} from './retrieval-assets.mjs';
import {fetchAsset,verifyAsset} from './retrieval-resource-loader.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const path='data/ids.json';
const fixture=JSON.parse(readFileSync(new URL('./retrieval-assets.mjs',import.meta.url),'utf8').match(/export const ASSETS=([\s\S]*);/)[1]);
test('manifest has immutable sizes and SHA256 checks for all 13 resources',()=>{
 assert.equal(Object.keys(fixture).length,13);for(const value of Object.values(ASSETS)){assert.match(value.sha256,/^[a-f0-9]{64}$/);assert.ok(value.size>0);}
});
test('unknown and damaged data are rejected',async()=>{
 await assert.rejects(verifyAsset(path,new Uint8Array([1,2,3]).buffer),/integrity/);
 await assert.rejects(fetchAsset('missing'),/Unknown/);
});
test('all sources failing yields a retryable error',async()=>{
 const seen=[];await assert.rejects(fetchAsset(path,{cache:false,bases:[DOMESTIC,'https://fallback.invalid/'],fetchImpl:async url=>{seen.push(url);return new Response('',{status:503});}}),/unavailable/);assert.equal(seen.length,2);
});
test('stalled requests are bounded and cancelled',async()=>{
 const start=Date.now();let aborted=0;
 await assert.rejects(fetchAsset(path,{cache:false,bases:[DOMESTIC],idleMs:20,budgetMs:100,fetchImpl:(_,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborted++;reject(signal.reason);}))}),/unavailable|timeout/);
 assert.ok(Date.now()-start<1000);assert.equal(aborted,1);
});
test('explicit cancellation aborts download',async()=>{
 const controller=new AbortController();const promise=fetchAsset(path,{cache:false,signal:controller.signal,fetchImpl:(_,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason)))});
 controller.abort(new Error('cancel fixture'));await assert.rejects(promise,/cancel fixture/);
});
