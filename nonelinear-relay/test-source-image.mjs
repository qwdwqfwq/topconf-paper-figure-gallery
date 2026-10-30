import assert from 'node:assert/strict';
import worker from './worker.mjs';
import {fetchBitmapSource} from '../forge/nonelinear-source.mjs';
const origin='https://qwdwqfwq.github.io';
const base='https://gallery-nonelinear-relay.lixiao-gallery.workers.dev/v1';
const src='https://imagen-nonelinear-2025.tos-cn-beijing.volces.com/gemini/test-0.jpg';
const make=(url=src,headers={})=>new Request(base+'/source-image',{method:'POST',headers:{Origin:origin,Authorization:'Bearer test-only',...headers},body:JSON.stringify({url})});
const original=globalThis.fetch; let calls=[];
try {
  globalThis.fetch=async(url,options)=>{ calls.push({url,options}); return new Response(new Uint8Array([255,216,255,0,1,2]),{headers:{'Content-Type':'application/octet-stream'}}); };
  const r=await worker.fetch(make());
  assert.equal(r.status,200); assert.equal(r.headers.get('Content-Type'),'image/jpeg');
  assert.equal(r.headers.get('Access-Control-Allow-Origin'),origin);
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()),new Uint8Array([255,216,255,0,1,2]));
  assert.equal(calls[0].url,src); assert.equal(calls[0].options.redirect,'manual');
  assert.equal(calls[0].options.headers,undefined,'No key or cookies sent to object storage');
  calls=[];
  for(const url of ['http://127.0.0.1/a.jpg',src.replace('/gemini/','/other/'),src+'?target=x',src+'#x',src.replace('https://','https://user:secret@'),src.replace('volces.com','volces.com.evil.test')]) assert.equal((await worker.fetch(make(url))).status,400);
  assert.equal((await worker.fetch(make(src,{Origin:'https://evil.test'}))).status,403);
  assert.equal((await worker.fetch(make(src,{Authorization:''}))).status,401);
  assert.equal(calls.length,0);
  for(const response of [new Response(null,{status:302,headers:{Location:'https://evil.test'}}),new Response('<html>not image'),new Response(null,{headers:{'Content-Length':String(41*1024*1024)}})]) {
    globalThis.fetch=async()=>response;
    assert.ok([413,502].includes((await worker.fetch(make())).status));
  }
  const spy=async(...args)=>args;
  const [target,options]=await fetchBitmapSource(src,{provider:'nonelinear',base,key:'test-only'},spy);
  assert.equal(target,base+'/source-image'); assert.deepEqual(JSON.parse(options.body),{url:src});
  assert.equal(options.headers.Authorization,'Bearer test-only'); assert.ok(!target.includes('test-only'));
  for(const context of [{provider:'openai',base,key:'test-only'},{provider:'nonelinear',base:'https://custom.test/v1',key:'test-only'}]) assert.deepEqual(await fetchBitmapSource(src,context,spy),[src]);
  assert.deepEqual(await fetchBitmapSource('data:image/png;base64,abc',{provider:'nonelinear',base,key:'test-only'},spy),['data:image/png;base64,abc']);
  console.log('PASS: original image bytes, provider isolation, fixed storage host, MIME, redirects, CORS and credential isolation');
} finally {globalThis.fetch=original;}
