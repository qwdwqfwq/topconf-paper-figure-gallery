import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetchBitmapSource,readBitmapSource} from './nonelinear-source.mjs';
const base='https://gallery-nonelinear-relay.lixiao-gallery.workers.dev/v1';
const context={provider:'nonelinear',base,key:'fixture-secret'};
const url=id=>'https://imagen-nonelinear-2025.tos-cn-beijing.volces.com/others/'+id+'.jpg';
const bytes=new Uint8Array([255,216,255,0,9,4]);
const response=()=>new Response(bytes,{headers:{'content-type':'image/jpeg'}});
const dataUrl=async blob=>'data:'+blob.type+';base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');
test('both image folders preserve bytes, pin bridge and omit credentials to storage',async()=>{
 for(const src of [url('bytes'),url('bytes').replace('/others/','/gemini/')]){
  const r=await fetchBitmapSource(src,context,async(target,options)=>{
   assert.equal(target,base+'/source-image');assert.deepEqual(JSON.parse(options.body),{url:src});
   assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');return response();
  });
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()),bytes);
 }
});
test('transient statuses and interrupted bodies retry at most three times',async()=>{
 for(const first of [408,429,503,'body','network']){
  let calls=0;
  const r=await fetchBitmapSource(url('retry'),context,async()=>{
   calls++;if(calls===3)return response();
   if(first==='network')throw Error('socket reset');
   if(first==='body')return new Response(new ReadableStream({start(c){c.error(Error('body disconnected'));}}));
   return new Response('temporary',{status:first});
  });
  assert.equal(calls,3);assert.deepEqual(new Uint8Array(await r.arrayBuffer()),bytes);
 }
 let calls=0;const r=await fetchBitmapSource(url('exhaust'),context,async()=>{calls++;return new Response('',{status:503});});
 assert.equal(calls,3);assert.equal(r.status,503);
});
test('permanent failures do not retry or cache; successful manual retry is reusable',async()=>{
 for(const status of [400,401,403,404,413,422]){
  let calls=0;
  await assert.rejects(readBitmapSource(url('error'+status),context,dataUrl,async()=>{calls++;return new Response('private upstream body',{status});}),error=>error.message.includes('HTTP '+status)&&!error.message.includes('private'));
  assert.equal(calls,1);
 }
 let calls=0;const fetcher=async()=>{calls++;return response();};
 const src=url('error404'),first=await readBitmapSource(src,context,dataUrl,fetcher);
 assert.equal(first,'data:image/jpeg;base64,'+Buffer.from(bytes).toString('base64'));
 assert.equal(await readBitmapSource(src,context,dataUrl,fetcher),first);assert.equal(calls,1);
 for(let i=0;i<4;i++)await readBitmapSource(url('evict'+i),context,dataUrl,fetcher);
 await readBitmapSource(src,context,dataUrl,fetcher);assert.equal(calls,6,'bounded cache evicts old versions');
});
test('cancellation stops active download and retry delay',async()=>{
 for(const phase of ['download','delay']){
  const c=new AbortController();let calls=0;
  const pending=fetchBitmapSource(url('abort'),{...context,signal:c.signal},async(_url,options)=>{
   calls++;
   if(phase==='download')return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));
   return new Response('',{status:503});
  });
  setTimeout(()=>c.abort(new DOMException('User stopped','AbortError')),30);
  await assert.rejects(pending,{name:'AbortError'});assert.equal(calls,1);
 }
});
test('data URIs, other providers and custom gateways keep their existing path',async()=>{
 const data='data:image/png;base64,original';
 assert.equal(await readBitmapSource(data,context,dataUrl,()=>{throw Error('unexpected request');}),data);
 for(const config of [{...context,provider:'infistar'},{...context,base:'https://custom.example/v1'}]){
  let calls=0;await fetchBitmapSource(url('direct'),config,async(target,options)=>{calls++;assert.equal(target,url('direct'));assert.equal(options,undefined);return response();});assert.equal(calls,1);
 }
});
