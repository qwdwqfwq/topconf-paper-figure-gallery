import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {fetchBufferedWithTimeout,requestImageWithRecovery} from './image-api.mjs';
import {requestChat} from './chat-api.mjs';

test('vision catalogs keep editable geometry without embedding photograph bytes as text',()=>{
 const source=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 const start=source.indexOf('function serializeVisionCatalog(');
 const end=source.indexOf('async function requestEditableScene',start);
 const context=vm.createContext({});vm.runInContext(source.slice(start,end),context);
 const photo={id:'photo',type:'image',x:12,y:20,w:300,h:100,href:'data:image/png;base64,'+'A'.repeat(2000000),crop:{x:0,y:0,w:300,h:100}};
 const catalog={nodes:[photo,{id:'label',type:'text',text:'Caption',x:12,y:130}],readOnlyContext:[photo]};
 const serialized=context.serializeVisionCatalog(catalog),result=JSON.parse(serialized);
 assert.ok(serialized.length<1000);assert.equal(result.nodes[0].w,300);
 assert.deepEqual(result.nodes[0].crop,photo.crop);assert.equal(result.nodes[1].text,'Caption');
 assert.equal(result.readOnlyContext[0].href,undefined);assert.ok(photo.href.length>2000000);
});

for(const kind of ['buffer','chat','image']) test(`${kind}: default wait survives 24 hours before headers and body`,async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  let headers,body,signal;
  const fetchImpl=(_,init)=>{signal=init.signal;return new Promise(resolve=>{headers=()=>resolve({status:200,statusText:'OK',ok:true,headers:new Headers(),arrayBuffer:()=>new Promise(r=>body=()=>r(new TextEncoder().encode('ok'))),text:()=>new Promise(r=>body=()=>r('ok'))});});};
  const result=kind==='buffer'?fetchBufferedWithTimeout('https://example.invalid',{},undefined,fetchImpl):kind==='chat'?requestChat('https://example.invalid',{},undefined,fetchImpl):requestImageWithRecovery({url:'https://example.invalid/images/generations',body:{},fetchImpl});
  t.mock.timers.tick(86400000);assert.equal(signal.aborted,false);
  headers();await Promise.resolve();await Promise.resolve();
  t.mock.timers.tick(86400000);assert.equal(signal.aborted,false);
  body();const response=await result;
  assert.equal(kind==='image'?response.text:await response.text(),'ok');
});

test('Step 4 waits without scheduling a timer and still allows manual cancellation',async()=>{
 const source=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 const start=source.indexOf('async function fetchTextWithTimeout(');
 const end=source.indexOf('/* When a POST',start);
 let signal;
 const context=vm.createContext({AbortController,DOMException,setTimeout:()=>{throw Error('Unexpected deadline');},clearTimeout:()=>{},fetch:(_,init)=>{signal=init.signal;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Stopped','AbortError'))));}});
 vm.runInContext(source.slice(start,end),context);
 const controller=new AbortController();
 const pending=context.fetchTextWithTimeout('https://example.invalid',{signal:controller.signal});
 assert.equal(signal.aborted,false);controller.abort();
 await assert.rejects(pending,{name:'AbortError'});
});
