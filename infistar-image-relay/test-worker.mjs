import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {runInNewContext} from 'node:vm';
import {openBrowserImageFetch,usesBrowserImageTransport} from './browser-image-fetch.mjs';
import worker,{ImageJob,validateSubmission,backgroundTarget} from './worker.mjs';
import {resultDiagnostics,exceptionDiagnostics,responseDiagnostics} from './job-diagnostics.mjs';
import {imageResponseStream,storeImage} from './streamed-image-result.mjs';
import {sqliteImagePayloads} from './sqlite-image-payloads.mjs';
import {payloadObject} from './job-payloads.mjs';
const origin='https://qwdwqfwq.github.io',jobId='c3c04790-cd04-47e2-bb09-546aa8fcd7fe';
const input={url:'https://infistar.cc/v1/images/generations',body:{model:'gpt-image-2.5-sunburst',prompt:'fixture'},usedReferences:false};
const png64='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=';
test('streamed result preserves image bytes across arbitrary binary chunk boundaries',async()=>{
 for(const size of [1,2,3,24577,65536]){
  const bytes=Buffer.alloc(90001);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;
  let offset=0;const body=new ReadableStream({pull(c){if(offset===bytes.length)return c.close();const end=Math.min(bytes.length,offset+size);c.enqueue(bytes.subarray(offset,end));offset=end;}});
  const result=await new Response(imageResponseStream(body,{mime:'image/png',encoding:'binary'},{ok:true,status:200})).json();
  assert.deepEqual(Buffer.from(JSON.parse(result.text).data[0].b64_json,'base64'),bytes);
 }
});
for(const r2 of [false,true])test(`two five-reference jobs bypass nested relay and stream durable images (${r2?'R2':'DO'})`,async()=>{
 const fixtures=[fixture({r2,stream:true}),fixture({r2,stream:true})],old=globalThis.fetch;let posts=0;const large64=largePng().toString('base64');
 const submission={url:'https://gallery-nonelinear-relay.lixiao-gallery.workers.dev/v1/images/generations',body:{model:'gemini-nano-banana-2.1',prompt:'five refs',size:'4K',aspect_ratio:'16:9',image:Array.from({length:5},(_,i)=>`https://images.example.com/ref-${i}.png`)},usedReferences:true};
 globalThis.fetch=async(url,init)=>{assert.equal(url,'https://api.nonelinear.com.cn/v1/images/generations');assert.deepEqual(JSON.parse(init.body),submission.body);posts++;return Response.json({data:[{b64_json:large64}]},{headers:{'cf-ray':'fixture-ray','x-request-id':'five-refs'}});};
 try{
  await Promise.all(fixtures.map(f=>f.job.fetch(f.req('PUT','test-key',submission))));
  await Promise.all(fixtures.map(f=>f.job.alarm()));
  for(const f of fixtures){
   const meta=await f.storage.get('meta');assert.equal(meta.state,'succeeded');assert.equal(meta.resultFormat,'image-v2');assert.equal(meta.diagnostic.cfRay,'fixture-ray');assert.equal(meta.diagnostic.imageBytes,Buffer.from(large64,'base64').length);
   const result=await(await f.job.fetch(f.req('GET','test-key',submission,'/result'))).json();assert.equal(JSON.parse(result.text).data[0].b64_json,large64);
   assert.ok([...f.payloads].filter(([k])=>/\/(raw|result)\.json$/.test(k)).every(([,v])=>v.text.length<2500));
   const writes=f.stats.rowWrites;
   await f.job.fetch(f.req());await f.job.fetch(f.req());assert.equal(f.stats.rowWrites,writes);
   await new ImageJob(f.ctx,f.env).alarm();
   f.map.set('meta',{...await f.storage.get('meta'),expires:Date.now()-1});
   await f.job.alarm();assert.deepEqual([...f.map.keys()],['meta']);assert.equal(f.payloads.size,0);
  }assert.equal(posts,2);
 }finally{globalThis.fetch=old;}
});
for(const r2 of [false,true])test(`URL image uses bounded multipart storage and streams exact large binary (${r2?'R2':'DO'})`,async()=>{
 const f=fixture({r2,stream:true}),meta={payloadStore:r2?'r2-v1':'do-stream-v1',owner:'a'.repeat(64),id:jobId,expires:Date.now()+10000},bytes=Buffer.alloc(6*1024*1024+17,119);Buffer.from(png64,'base64').copy(bytes);
 const descriptor=await storeImage(f.job.env,meta,{url:'https://images.example.com/result.png'},async()=>new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=65537)c.enqueue(bytes.subarray(i,i+65537));c.close();}})));
 assert.equal(descriptor.bytes,bytes.length);
 const stored=await payloadObject(f.job.env,meta,'image');
 const result=await new Response(imageResponseStream(stored.body,descriptor,{ok:true})).json();assert.deepEqual(Buffer.from(JSON.parse(result.text).data[0].b64_json,'base64'),bytes);
});
test('DO streamed payload survives restart with Unicode across chunk boundaries and bypasses image cache',async()=>{
 const f=fixture(),value='x'.repeat(31999)+'😀'+'字'.repeat(32001),options=[];
 const put=f.storage.put,get=f.storage.get;
 f.storage.put=async(k,v,o)=>{if(typeof v==='string'||v instanceof Uint8Array){assert.equal(o?.noCache,true);options.push(o);}return put(k,v);};
 f.storage.get=async(k,o)=>{if(!k.endsWith('manifest'))assert.equal(o?.noCache,true);return get(k);};
 await sqliteImagePayloads(f.storage).put('unicode',value);
 assert.ok(options.length>1);assert.equal(await(await sqliteImagePayloads(f.storage).get('unicode')).text(),value);
 await sqliteImagePayloads(f.storage).delete('unicode');assert.equal(f.map.size,0);
});
for(const status of [200,524])test(`streaming failure remains unresolved and never replays generation (${status})`,async()=>{
 const f=fixture({r2:true,stream:true}),old=globalThis.fetch;let posts=0;
 const submission={url:'https://api.nonelinear.com.cn/v1/images/generations',body:{model:'gemini-nano-banana-2.1',prompt:'fixture'},usedReferences:false};
 globalThis.fetch=async()=>{posts++;return new Response(JSON.stringify({error:{message:'gateway test-key'}}),{status,headers:{'cf-ray':'test-ray','x-request-id':'failed-request','cf-error-type':'524','cf-error-origin':'origin','date':'Mon, 16 Nov 2026 17:00:00 GMT'}});};
 try{await f.job.fetch(f.req('PUT','test-key',submission));await f.job.alarm();await f.job.alarm();
  const meta=await f.storage.get('meta');assert.equal(meta.state,'unknown');assert.equal(meta.diagnostic.cfRay,'test-ray');assert.equal(meta.diagnostic.cfErrorType,'524');assert.equal(meta.diagnostic.cfErrorOrigin,'origin');assert.equal(meta.diagnostic.upstreamDate,'Mon, 16 Nov 2026 17:00:00 GMT');assert.equal(meta.diagnostic.headersMs,135001);assert.equal(meta.diagnostic.transport,'browser');assert.ok(!JSON.stringify(meta).includes('test-key'));assert.equal(posts,1);
 }finally{globalThis.fetch=old;}
});
test('image storage failure keeps raw response and does not repeat a paid request',async()=>{
 const f=fixture({r2:true,stream:true}),old=globalThis.fetch;let posts=0;const put=f.bucket.put;
 f.bucket.put=async(k,...args)=>{if(k.endsWith('/image.json'))throw Error('R2_IMAGE_UNAVAILABLE');return put(k,...args);};
 globalThis.fetch=async()=>{posts++;return Response.json({data:[{b64_json:png64}]});};
 try{await f.job.fetch(f.req('PUT'));await f.job.alarm();await f.job.alarm();const meta=await f.storage.get('meta');assert.equal(meta.state,'response_received');assert.equal(meta.resultStage,'raw');assert.ok(meta.diagnostic.recoveryError.includes('R2_IMAGE_UNAVAILABLE'));assert.equal(posts,1);f.bucket.put=put;await new ImageJob(f.ctx,f.env).alarm();assert.equal((await f.storage.get('meta')).state,'succeeded');const result=await(await f.job.fetch(f.req('GET','test-key',input,'/result'))).json();assert.equal(JSON.parse(result.text).data[0].b64_json,png64);assert.equal(posts,1);}finally{globalThis.fetch=old;}
});
test('overseas image gateway is selected before the one request; other routes are unchanged',()=>{
 assert.equal(backgroundTarget(input.url),'https://infistar.ai/v1/images/generations');
 for(const url of ['https://infistar.cc/v1beta/models/gemini-3.1-flash-lite-image:generateContent','https://api.openai.com/v1/images/edits','https://api.nonelinear.com.cn/v1/images/generations'])assert.equal(backgroundTarget(url),url);
});
function fixture({r2=false,stream=false}={}){
 const map=new Map(),payloads=new Map(),stats={rowWrites:0,r2Puts:0,r2Gets:0,r2Deletes:0};let lock=Promise.resolve();const storage={
  async get(k){return structuredClone(map.get(k));},async put(k,v){stats.rowWrites++;map.set(k,structuredClone(v));},
  async delete(k){for(const key of Array.isArray(k)?k:[k])if(map.delete(key))stats.rowWrites++;},
  async list({prefix,limit}){return new Map([...map].filter(([k])=>k.startsWith(prefix)).slice(0,limit));},
  async setAlarm(t){stats.rowWrites++;this.alarm=t;},async deleteAlarm(){stats.rowWrites++;this.alarm=null;},
  async transaction(fn){const before=structuredClone(map);try{return await fn(this);}catch(e){map.clear();for(const [k,v]of before)map.set(k,v);throw e;}}
 };
 const ctx={storage,blockConcurrencyWhile(fn){const p=lock.then(fn);lock=p.catch(()=>{});return p;}};
 const env={ALLOWED_ORIGINS:origin,BROWSER:fakeBrowser(),JOB_ENCRYPTION_KEY:btoa('01234567890123456789012345678901')};const objects=new Map();
 const bucket={
  async put(k,text,options){stats.r2Puts++;payloads.set(k,{text,options:structuredClone(options)});return {key:k};},
  async get(k){stats.r2Gets++;const stored=payloads.get(k);return stored?{body:new Response(stored.text).body,async text(){if(k.endsWith('/image.json'))throw Error('IMAGE_MUST_STREAM');return stored.text;}}:null;},
  async createMultipartUpload(k,options){const parts=[];return {
   async uploadPart(partNumber,data){parts[partNumber-1]=Buffer.from(data);return {partNumber,etag:String(partNumber)};},
   async complete(){stats.r2Puts++;payloads.set(k,{text:Buffer.concat(parts),options});return {key:k};},async abort(){}
  };},
  async delete(keys){for(const key of Array.isArray(keys)?keys:[keys]){stats.r2Deletes++;payloads.delete(key);}}
 };
 if(r2)env.IMAGE_PAYLOADS=bucket;
 if(stream)env.STREAM_IMAGE_RESULTS='true';
 env.IMAGE_JOBS={idFromName:x=>x,get:id=>{if(!objects.has(id)){
  const cache=new Map(),cacheStorage={async get(k){return structuredClone(cache.get(k));},async put(k,v){cache.set(k,structuredClone(v));}};
  objects.set(id,new ImageJob(id.startsWith('compat:')?{storage:cacheStorage}:ctx,env));
 }return objects.get(id);}};
 const req=(method='GET',key='test-key',body=input,suffix='')=>new Request('https://jobs.test/jobs/'+jobId+suffix,{method,headers:{Origin:origin,Authorization:'Bearer '+key,'Content-Type':'application/json'},...(method==='PUT'?{body:JSON.stringify(body)}:{})});
 return {storage,map,ctx,env,req,payloads,bucket,stats,job:new ImageJob(ctx,env)};
}

for(const r2 of [false,true])test(`Infistar Nano Banana 2.1 retains 4K and three references (${r2?'R2':'legacy'})`,async()=>{
 const f=fixture({r2}),old=globalThis.fetch;let posts=0;
 const body={contents:[{role:'user',parts:[{text:'fixture'},...Array.from({length:3},()=>({inlineData:{mimeType:'image/png',data:'aGVsbG8='}}))]}],generationConfig:{responseModalities:['TEXT','IMAGE'],imageConfig:{aspectRatio:'16:9',imageSize:'4K'}}};
 const submission={url:'https://infistar.cc/v1beta/models/gemini-nano-banana-2.1:generateContent',body,usedReferences:true};
 globalThis.fetch=async(url,init)=>{
  posts++;assert.deepEqual(JSON.parse(init.body),body);
  assert.equal(url,submission.url);
  return Response.json({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII='}}]},finishReason:'STOP'}]});
 };
 try{
  assert.equal((await f.job.fetch(f.req('PUT','test-key',submission))).status,202);
  await f.job.alarm();await f.job.alarm();await f.job.fetch(f.req('PUT','test-key',submission));
  assert.equal(posts,1);assert.equal(f.env.BROWSER.posts,1);assert.equal((await f.storage.get('meta')).upstreamAttempts,1);assert.equal((await f.storage.get('meta')).state,'succeeded');
  assert.equal((await f.job.fetch(f.req('GET','test-key',submission,'/result'))).status,200);
  const next=fixture({r2});next.env.IMAGE_JOBS=f.env.IMAGE_JOBS;await next.job.fetch(next.req('PUT','test-key',submission));await next.job.alarm();assert.equal(posts,2);assert.equal((await next.storage.get('meta')).upstreamAttempts,1);assert.equal((await next.storage.get('meta')).state,'succeeded');
 }finally{globalThis.fetch=old;}
});

for(const r2 of [false,true])test(`other Infistar Gemini tasks retain SSE and return their result once (${r2?'R2':'legacy'})`,async()=>{
 const f=fixture({r2}),old=globalThis.fetch;let posts=0;
 const submission={url:'https://infistar.cc/v1beta/models/gemini-3.1-flash-image:generateContent',body:{contents:[{role:'user',parts:[{text:'fixture'}]}]},usedReferences:false};
 globalThis.fetch=async(url,init)=>{
  posts++;assert.equal(url,submission.url.replace(':generateContent',':streamGenerateContent')+'?alt=sse');assert.deepEqual(JSON.parse(init.body),submission.body);
  const image={candidates:[{index:0,content:{parts:[{inlineData:{mimeType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII='}}]}}]};
  const stop={candidates:[{index:0,finishReason:'STOP',content:{parts:[]}}]};
  return new Response('data: '+JSON.stringify(image)+'\n\ndata: '+JSON.stringify(stop)+'\n\n',{headers:{'Content-Type':'text/event-stream'}});
 };
 try{
  assert.equal((await f.job.fetch(f.req('PUT','test-key',submission))).status,202);await f.job.alarm();
  await new ImageJob(f.ctx,f.env).alarm();await f.job.fetch(f.req('PUT','test-key',submission));
  assert.equal(posts,1);assert.equal((await f.storage.get('meta')).state,'succeeded');
  const result=await (await f.job.fetch(f.req('GET','test-key',submission,'/result'))).json();assert.equal(result.streaming,true);assert.ok(JSON.parse(result.text).data[0].b64_json);
 }finally{globalThis.fetch=old;}
});

for(const r2 of [false,true])test(`NoneLinear uploads references before one synchronous generation (${r2?'R2':'legacy'})`,async()=>{
 const f=fixture({r2}),old=globalThis.fetch,calls=[];
 const submission={url:'https://api.nonelinear.com.cn/v1/images/generations',body:{model:'gemini-3.1-flash-image-preview',prompt:'fixture',size:'4K',aspect_ratio:'16:9',image:['data:image/png;base64,aGVsbG8=']},usedReferences:true};
 globalThis.fetch=async(url,init)=>{
  calls.push(url);const body=JSON.parse(init.body);
  if(url==='https://nonelinear.com.cn/api/upload-file'){assert.deepEqual(body,{image:'aGVsbG8=',type:'.png'});return Response.json({url:'https://images.example.com/reference.png'});}
  assert.equal(url,submission.url);assert.deepEqual(body,{...submission.body,image:['https://images.example.com/reference.png']});
  return Response.json({data:[{b64_json:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII='}]});
 };
 try{
  assert.equal((await f.job.fetch(f.req('PUT','test-key',submission))).status,202);await f.job.alarm();await f.job.alarm();
  assert.deepEqual(calls,['https://nonelinear.com.cn/api/upload-file',submission.url]);assert.equal(f.env.BROWSER.posts,1);assert.equal(f.env.BROWSER.closed,1);assert.equal((await f.storage.get('meta')).upstreamAttempts,1);assert.equal((await f.storage.get('meta')).state,'succeeded');
 }finally{globalThis.fetch=old;}
});
for(const r2 of [false,true])test(`duplicate submissions, replay and expiry never issue another POST (${r2?'R2':'legacy'})`,async()=>{
 const f=fixture({r2});let posts=0;const old=globalThis.fetch;
 globalThis.fetch=async(url)=>{assert.equal(url,'https://infistar.ai/v1/images/generations');posts++;return new Response(JSON.stringify({data:[{b64_json:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII='}]}),{headers:{'Content-Type':'application/json','x-request-id':'fixture-id'}});};
 try{
  const r=await Promise.all([f.job.fetch(f.req('PUT')),f.job.fetch(f.req('PUT'))]);assert.deepEqual(r.map(x=>x.status),[202,202]);
  assert.equal((await f.storage.get('meta')).upstreamAttempts,0);assert.equal(posts,0);
  await f.job.alarm();await f.job.alarm();assert.equal(posts,1);assert.equal((await f.storage.get('meta')).state,'succeeded');
  assert.equal((await f.job.fetch(f.req('GET','test-key',input,'/result'))).status,200);
  await f.job.fetch(f.req('PUT'));await f.job.alarm();assert.equal(posts,1);
  assert.equal((await f.job.fetch(f.req('PUT','test-key',{...input,body:{...input.body,prompt:'different'}}))).status,409);
  assert.equal((await f.job.fetch(f.req('GET','other-key'))).status,404);
  await f.storage.put('meta',{...await f.storage.get('meta'),expires:Date.now()-1});
  assert.equal((await f.job.fetch(f.req('PUT'))).status,410);assert.equal(posts,1);
  assert.deepEqual([...f.map.keys()],['meta']);assert.equal((await f.storage.get('meta')).encrypted,undefined);
 }finally{globalThis.fetch=old;}
});
for(const r2 of [false,true])test(`restart and upstream disconnect preserve unknown state without retry (${r2?'R2':'legacy'})`,async()=>{
 const old=globalThis.fetch;let posts=0;globalThis.fetch=async()=>{posts++;throw Error('socket closed');};
 try{
  const f=fixture({r2});await f.job.fetch(f.req('PUT'));await f.job.alarm();assert.equal(posts,1);
  assert.equal((await f.storage.get('meta')).state,'unknown');assert.equal((await f.storage.get('meta')).encrypted,undefined);
  await new ImageJob(f.ctx,f.env).alarm();await f.job.fetch(f.req('PUT'));await f.job.alarm();assert.equal(posts,1);
  const g=fixture({r2});await g.job.fetch(g.req('PUT'));await g.storage.put('meta',{...await g.storage.get('meta'),state:'running',upstreamAttempts:1});
  await new ImageJob(g.ctx,g.env).alarm();assert.equal((await g.storage.get('meta')).state,'unknown');assert.equal(posts,1);
 }finally{globalThis.fetch=old;}
});
test('origin, credentials and upstream target are constrained',async()=>{
 const f=fixture();assert.equal((await worker.fetch(new Request('https://jobs.test/jobs/'+jobId),f.env)).status,403);
 const r=f.req();r.headers.delete('Authorization');assert.equal((await worker.fetch(r,f.env)).status,401);
 assert.throws(()=>validateSubmission({...input,url:'https://infistar.cc.evil.test/v1/images/generations'}));
 assert.throws(()=>validateSubmission({...input,url:'https://infistar.cc/v1/images/generations?proxy=1'}));
 assert.throws(()=>validateSubmission({...input,usedReferences:true}));
 const preflight=new Request('https://jobs.test/jobs/'+jobId,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'authorization,content-type'}});
 assert.equal((await worker.fetch(preflight,f.env)).status,204);
});

for(const r2 of [false,true])test(`post-processing failure never makes a second POST (${r2?'R2':'legacy'})`,async()=>{
 const f=fixture({r2}),old=globalThis.fetch;let posts=0,fail=true;
 globalThis.fetch=async()=>{posts++;return new Response(JSON.stringify({data:[{b64_json:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII='}]}),{headers:{'x-request-id':'received-id'}});};
 const originalPut=f.storage.put;
 f.storage.put=async(k,v)=>{if(k==='meta'&&v.state==='succeeded'&&fail){fail=false;throw Error('simulated storage failure after response');}return originalPut.call(f.storage,k,v);};
 try{
  await f.job.fetch(f.req('PUT'));await f.job.alarm();
  assert.equal((await f.storage.get('meta')).state,'response_received');assert.ok((await f.storage.get('meta')).encrypted);assert.equal(posts,1);
  await new ImageJob(f.ctx,f.env).alarm();assert.equal(posts,1);assert.equal((await f.storage.get('meta')).state,'succeeded');assert.equal((await f.storage.get('meta')).encrypted,undefined);
  const result=await(await f.job.fetch(f.req('GET','test-key',input,'/result'))).json();assert.equal(JSON.parse(result.text).data[0].b64_json,png64);
 }finally{globalThis.fetch=old;}
});

for(const r2 of [false,true])test(`download failure never regenerates; errors redact credentials (${r2?'R2':'legacy'})`,async()=>{
 const f=fixture({r2}),old=globalThis.fetch;let posts=0,downloads=0;
 globalThis.fetch=async(url,init)=>{
  if(init?.method==='POST'){posts++;return new Response(JSON.stringify({data:[{url:'https://images.example.com/result'}]}));}
  downloads++;if(downloads===1)throw Error('download disconnected');
  return new Response(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=','base64'));
 };
 try{
  await f.job.fetch(f.req('PUT'));await f.job.alarm();assert.equal((await f.storage.get('meta')).state,'unknown');
  assert.equal((await f.job.fetch(f.req('GET','test-key',input,'/result'))).status,409);assert.equal(posts,1);assert.equal(downloads,1);await new ImageJob(f.ctx,f.env).alarm();assert.equal(downloads,1);
  const g=fixture({r2});globalThis.fetch=async()=>new Response('credential test-key Bearer test-key',{status:400});await g.job.fetch(g.req('PUT'));await g.job.alarm();
  const rejected=await (await g.job.fetch(g.req('GET','test-key',input,'/result'))).json();assert.equal(rejected.ok,false);assert.doesNotMatch(JSON.stringify(rejected),/test-key/);assert.equal((await g.storage.get('meta')).state,'rejected');
 }finally{globalThis.fetch=old;}
});

test('gateway failures preserve uncertain task and never replay via another host',async()=>{
 const f=fixture(),old=globalThis.fetch;let posts=0;globalThis.fetch=async url=>{posts++;assert.equal(url,'https://infistar.ai/v1/images/generations');return new Response('error code: 520',{status:520});};
 try{await f.job.fetch(f.req('PUT'));await f.job.alarm();const meta=await f.storage.get('meta');assert.equal(meta.state,'unknown');assert.equal(meta.error,'UPSTREAM_HTTP_520_NO_RESUBMIT');assert.ok(meta.resultCount);await f.job.fetch(f.req('PUT'));await f.job.alarm();assert.equal(posts,1);assert.equal((await f.job.fetch(f.req('GET','test-key',input,'/result'))).status,409);}finally{globalThis.fetch=old;}
});

test('timeout and accepted-but-incomplete responses retain their task and never resubmit',async()=>{
 const old=globalThis.fetch;
 try{
  for(const [status,text] of [[408,'timeout'],[200,JSON.stringify({id:'accepted-task'})],[200,'incomplete JSON']]){
   const f=fixture();let posts=0;globalThis.fetch=async()=>{posts++;return new Response(text,{status});};
   await f.job.fetch(f.req('PUT'));await f.job.alarm();
   assert.equal((await f.storage.get('meta')).state,'unknown');
   await f.job.fetch(f.req('PUT'));await new ImageJob(f.ctx,f.env).alarm();
   assert.equal(posts,1);assert.equal((await f.job.fetch(f.req('GET','test-key',input,'/result'))).status,409);
  }
 }finally{globalThis.fetch=old;}
});

function fakeBrowser(evaluate){
 let origin='',closed=0,posts=0,released=0,maxReplyBytes=0,chunkCalls=0,nextObject=0;const objects=new Map(),slots=new Map(),connections=[];
 const binding={
  disconnect(){for(const c of connections)c.close();},
  get closed(){return closed;},get posts(){return posts;},get released(){return released;},get maxReplyBytes(){return maxReplyBytes;},get chunkCalls(){return chunkCalls;},
  async acquire(){return {sessionId:'fixture-session'};},
  devtools:{async listTargets(){return [{id:'fixture-page',type:'page'}];}},
  async connectSession(id,{targetId}){
   assert.equal(id,'fixture-session');assert.equal(targetId,'fixture-page');
   const listeners=new Map();let disconnected=false;
   const listener=event=>{if(!disconnected)listeners.get('message')?.(event);};
   const connection={close(){if(disconnected)return;disconnected=true;listeners.get('close')?.({});}};connections.push(connection);
   return {webSocket:{async fetch(){return {webSocket:{accept(){},close(){connection.close();},addEventListener(type,fn){listeners.set(type,fn);},send(text){
    const command=JSON.parse(text);
    void (async()=>{let result;
     try{
      if(command.method==='Page.navigate'){origin=new URL(command.params.url).origin;result={};}
      else if(command.method==='Runtime.releaseObject'){assert.ok(objects.delete(command.params.objectId));released++;result={};}
      else if(command.method==='Runtime.callFunctionOn'){
       const value=objects.get(command.params.objectId);assert.ok(value);
       if(command.params.arguments)chunkCalls++;
       result={result:{value:runInNewContext('('+command.params.functionDeclaration+')').apply(value,command.params.arguments?.map(a=>a.value)||[])}};
      }
      else if(command.params.expression==='location.origin')result={result:{value:origin}};
      else if(command.params.expression==='Date.now()')result={result:{value:Date.now()}};
      else {
       const expression=command.params.expression;
       if(expression.startsWith('delete globalThis[')){slots.delete(JSON.parse(expression.slice(18,-1)));result={result:{value:true}};listener({data:JSON.stringify({id:command.id,result})});return;}
       const resumed=expression.startsWith('globalThis['),slot=expression.match(/globalThis\[("[^"]+")\]/)?.[1];
       const payload=resumed?null:JSON.parse(expression.slice(expression.indexOf('({"url":')+1,expression.endsWith('))')?-2:-1));
       if(!resumed)posts++;
       let value;
       if(resumed)value=await slots.get(slot);
       else if(evaluate){const promise=evaluate(command.params.expression);slots.set(slot,promise);value=await promise;}
       else {const promise=(async()=>{const response=await globalThis.fetch(payload.url,{method:'POST',headers:payload.headers,body:payload.body});return {status:response.status,headers:[...response.headers],text:await response.text(),transport:{headersMs:135001,firstBodyChunkMs:135002,responseBytes:32,elapsedMs:135003,stage:'response_received'}};})();slots.set(slot,promise);value=await promise;}
       if(value===undefined)result={result:{type:'undefined'}};
       else if(command.params.returnByValue===false){const objectId='fixture-object-'+(++nextObject);objects.set(objectId,value);result={result:{objectId,type:'object'}};}
       else result={result:{value}};
      }
      const reply=JSON.stringify({id:command.id,result});maxReplyBytes=Math.max(maxReplyBytes,Buffer.byteLength(reply));listener({data:reply});
     }catch{listener({data:JSON.stringify({id:command.id,result:{exceptionDetails:{text:'fixture disconnect'}}})});}
    })();
   }}};}}};
  },
  async closeSession(){closed++;}
 };
 return binding;
}

for(const options of [{},{r2:true},{stream:true}])test(`connection reset reattaches the original pending request (${JSON.stringify(options)})`,async()=>{
 const f=fixture(options),old=globalThis.fetch;let posts=0,complete,started;
 const ready=new Promise(resolve=>{started=resolve;});
 globalThis.fetch=async()=>{posts++;started();return new Promise(resolve=>{complete=()=>resolve(Response.json({data:[{b64_json:png64}]}));});};
 try{
  await f.job.fetch(f.req('PUT'));const first=f.job.alarm();await ready;
  const descriptor=(await f.storage.get('meta')).browserSession;assert.ok(descriptor.slot);
  f.env.BROWSER.disconnect();await first;
  assert.equal((await f.storage.get('meta')).state,'running');assert.equal(f.env.BROWSER.closed,0);
  const resumed=new ImageJob(f.ctx,f.env).alarm();await new Promise(resolve=>setImmediate(resolve));complete();await resumed;
  const meta=await f.storage.get('meta');assert.equal(meta.state,'succeeded');assert.equal(meta.diagnostic.recoveries,1);assert.equal(meta.browserSession,undefined);
  const result=await(await f.job.fetch(f.req('GET','test-key',input,'/result'))).json();assert.equal(JSON.parse(result.text).data[0].b64_json,png64);
  assert.equal(posts,1);assert.equal(f.env.BROWSER.posts,1);assert.equal(f.env.BROWSER.closed,1);
 }finally{globalThis.fetch=old;}
});
test('browser transport only selects supported synchronous image targets',()=>{
 for(const host of ['api.nonelinear.com.cn','infistar.ai','infistar.cc'])assert.equal(usesBrowserImageTransport('https://'+host+'/v1/images/generations'),true);
 for(const url of ['https://api.nonelinear.com.cn.evil.test/v1/images/generations','https://api.nonelinear.com.cn/api/upload-file','https://api.nonelinear.com.cn/v1/images/edits','https://api.nonelinear.com.cn/v1/images/generations?proxy=1'])assert.equal(usesBrowserImageTransport(url),false);
});

test('NoneLinear browser 524 is retained without a Worker fallback or replay',async()=>{
 const f=fixture(),old=globalThis.fetch;let posts=0;
 const submission={url:'https://api.nonelinear.com.cn/v1/images/generations',body:{model:'gemini-nano-banana-2.1',prompt:'fixture',size:'4K',aspect_ratio:'16:9'},usedReferences:false};
 globalThis.fetch=async(url,init)=>{posts++;assert.equal(url,submission.url);assert.deepEqual(JSON.parse(init.body),submission.body);return new Response('error code: 524',{status:524,headers:{'cf-error-origin':'origin','cf-error-type':'52x'}});};
 try{
  await f.job.fetch(f.req('PUT','test-key',submission));await f.job.alarm();await new ImageJob(f.ctx,f.env).alarm();await f.job.fetch(f.req('PUT','test-key',submission));
  const meta=await f.storage.get('meta');assert.equal(meta.state,'unknown');assert.equal(meta.upstreamAttempts,1);assert.equal(meta.diagnostic.transport,'browser');assert.equal(meta.diagnostic.errorSource,'cloudflare:origin');assert.equal(f.env.BROWSER.posts,1);assert.equal(posts,1);
 }finally{globalThis.fetch=old;}
});

test('browser transport issues one POST, rejects reuse and releases its session',async()=>{
 const binding=fakeBrowser(),old=globalThis.fetch;let count=0;
 globalThis.fetch=async()=>{count++;return new Response('fixture',{headers:{'x-request-id':'browser-fixture'}});};
 try{
  const browser=await openBrowserImageFetch(binding,'https://infistar.ai/v1/images/generations');
  const init={method:'POST',headers:{Authorization:'Bearer test-key'},body:'{}'};
  const response=await browser.fetch('https://infistar.ai/v1/images/generations',init);
  assert.equal(await response.text(),'fixture');assert.equal(response.headers.get('x-request-id'),'browser-fixture');
  await assert.rejects(browser.fetch('https://infistar.ai/v1/images/generations',init));
  assert.equal(count,1);await browser.close();await browser.close();assert.equal(binding.closed,1);
  assert.equal(usesBrowserImageTransport('https://infistar.ai.evil.test/v1/images/generations'),false);
  for(const url of ['http://api.nonelinear.com.cn/v1/images/generations','https://api.nonelinear.com.cn:444/v1/images/generations','https://api.nonelinear.com.cn/v1/images/generations?proxy=1','https://infistar.cc/v1beta/models/gemini-3.1-flash-image:generateContent'])assert.equal(usesBrowserImageTransport(url),false);
  assert.equal(usesBrowserImageTransport('https://api.nonelinear.com.cn/v1/images/generations'),true);
  assert.equal(usesBrowserImageTransport('https://infistar.cc/v1beta/models/gemini-nano-banana-2.1:generateContent'),true);
  assert.equal(response.imageTransport.headersMs,135001);
  assert.equal(usesBrowserImageTransport('https://infistar.ai/v1beta/models/gemini-nano-banana-2.1:generateContent'),true);
  assert.equal(usesBrowserImageTransport('https://infistar.ai/v1beta/models/gemini-nano-banana-2.1:generateContent#x'),false);
 }finally{globalThis.fetch=old;}
});
test('serialized browser request accepts a simulated 180-second origin wait and records timing',async()=>{
 let now=0,posts=0;const binding=fakeBrowser(expression=>runInNewContext(expression,{
  performance:{now:()=>now},AbortSignal,TextDecoder,
  fetch:async()=>{posts++;now=180000;return new Response('complete image response',{headers:{'x-request-id':'slow-origin'}});}
 }));
 const browser=await openBrowserImageFetch(binding,'https://infistar.ai/v1/images/generations');
 try{
  const init={method:'POST',headers:{Authorization:'Bearer test-key'},body:'{}'};
  const response=await browser.fetch('https://infistar.ai/v1/images/generations',init);
  assert.equal(await response.text(),'complete image response');assert.equal(posts,1);
  assert.equal(response.imageTransport.headersMs,180000);assert.equal(response.imageTransport.firstBodyChunkMs,180000);
  assert.equal(responseDiagnostics(response).remoteElapsedMs,180000);
  await assert.rejects(browser.fetch('https://infistar.ai/v1/images/generations',init),/ALREADY_CLAIMED/);assert.equal(posts,1);
 }finally{await browser.close();}
});

test('4K raw JSON exceeding 32 MiB is normalized remotely and transferred in bounded CDP chunks',async()=>{
 const b64=Buffer.alloc(18*1024*1024,73).toString('base64');
 const raw=JSON.stringify({candidates:[{content:{parts:[{thought:true,inlineData:{data:'ignored'}},{inlineData:{data:b64,mimeType:'image/png'}}]}}],duplicate:{b64_json:b64}});
 assert.ok(Buffer.byteLength(raw)>32*1024*1024);
 const binding=fakeBrowser(expression=>runInNewContext(expression,{performance,AbortSignal,TextDecoder,fetch:async()=>new Response(raw,{headers:{'content-length':String(raw.length),'content-encoding':'gzip'}})}));
 const browser=await openBrowserImageFetch(binding,'https://infistar.ai/v1beta/models/gemini-nano-banana-2.1:generateContent');
 try{
  const response=await browser.fetch('https://infistar.ai/v1beta/models/gemini-nano-banana-2.1:generateContent',{method:'POST',headers:{Authorization:'Bearer test-key'},body:'{}'});
  assert.equal(response.headers.get('content-length'),null);assert.equal(response.headers.get('content-encoding'),null);
  assert.equal(response.imageTransport.responseBytes,Buffer.byteLength(raw));
  const text=await response.text();assert.equal(response.imageTransport.normalizedResponseChars,text.length);
  assert.equal(JSON.parse(text).data[0].b64_json,b64);assert.equal(binding.posts,1);
  assert.ok(binding.chunkCalls>500);assert.ok(binding.maxReplyBytes<64*1024);assert.equal(binding.released,1);
 }finally{await browser.close();}
});

test('remote response chunks preserve surrogate pairs and release the handle on cancellation',async()=>{
 const raw='x'.repeat(48*1024-1)+'😀'+'尾'.repeat(300);
 const binding=fakeBrowser(expression=>runInNewContext(expression,{performance,AbortSignal,TextDecoder,fetch:async()=>new Response(raw)}));
 const browser=await openBrowserImageFetch(binding,'https://infistar.ai/v1/images/generations');
 try{
  const response=await browser.fetch('https://infistar.ai/v1/images/generations',{method:'POST',headers:{},body:'{}'});
  assert.equal(await response.text(),raw);assert.equal(binding.released,1);
 }finally{await browser.close();}
 const canceled=fakeBrowser();const previous=globalThis.fetch;globalThis.fetch=async()=>new Response('fixture');
 const transport=await openBrowserImageFetch(canceled,'https://infistar.ai/v1/images/generations');
 try{
  const response=await transport.fetch('https://infistar.ai/v1/images/generations',{method:'POST',headers:{},body:'{}'});
  await response.body.cancel();assert.equal(canceled.released,1);assert.equal(canceled.posts,1);
 }finally{await transport.close();globalThis.fetch=previous;}
});

test('remote image bound remains 32 MiB of binary data and never replays an oversized image',async()=>{
 const raw=JSON.stringify({data:[{b64_json:'A'.repeat(Math.ceil(32*1024*1024*4/3)+4)}]});
 const binding=fakeBrowser(expression=>runInNewContext(expression,{performance,AbortSignal,TextDecoder,fetch:async()=>new Response(raw)}));
 const browser=await openBrowserImageFetch(binding,'https://infistar.ai/v1/images/generations');
 try{
  const init={method:'POST',headers:{},body:'{}'};
  await assert.rejects(browser.fetch('https://infistar.ai/v1/images/generations',init),e=>e.transportDiagnostics.errorCode==='IMAGE_TOO_LARGE');
  assert.equal(binding.released,1);assert.equal(binding.chunkCalls,0);
  await assert.rejects(browser.fetch('https://infistar.ai/v1/images/generations',init),/ALREADY_CLAIMED/);assert.equal(binding.posts,1);
 }finally{await browser.close();}
});

test('remote browser body loss retains 524 source and refuses a second paid request',async()=>{
 let now=0,posts=0;const binding=fakeBrowser(expression=>runInNewContext(expression,{
  performance:{now:()=>now},AbortSignal,TextDecoder,
  fetch:async()=>{posts++;now=125100;return new Response(new ReadableStream({pull(c){c.error(Error('secret-key socket lost'));}}),{status:524,headers:{'cf-error-origin':'origin','cf-error-type':'52x','cf-ray':'fixture-ray','authorization':'secret-key'}});}
 }));
 const browser=await openBrowserImageFetch(binding,'https://infistar.ai/v1/images/generations');
 try{
  const init={method:'POST',headers:{Authorization:'Bearer secret-key'},body:'{}'};
  await assert.rejects(browser.fetch('https://infistar.ai/v1/images/generations',init),error=>{
   const d=exceptionDiagnostics(error,'secret-key');assert.equal(d.remoteStage,'reading_response');assert.equal(d.remoteHeadersMs,125100);
   assert.equal(d.cfRay,'fixture-ray');assert.equal(d.upstreamStatus,524);assert.equal(d.remoteErrorCode,'BROWSER_FETCH_FAILED');assert.doesNotMatch(JSON.stringify(d),/secret-key|authorization|socket lost/);return true;
  });
  await assert.rejects(browser.fetch('https://infistar.ai/v1/images/generations',init),/ALREADY_CLAIMED/);assert.equal(posts,1);
 }finally{await browser.close();}
});

test('524 attribution requires Cloudflare error headers and saves only redacted allowlisted data',()=>{
 const plain=responseDiagnostics(new Response('error',{status:524,headers:{server:'nginx','cf-ray':'ray'}}));
 assert.equal(plain.errorSource,'unattributed-upstream');
 const marked=responseDiagnostics(new Response('error',{status:524,headers:{'cf-error-origin':'origin','cf-error-type':'52x','cf-ray':'test-key','x-request-id':'Bearer test-key','set-cookie':'session=test-key'}}),'test-key');
 assert.equal(marked.errorSource,'cloudflare:origin');assert.equal(marked.cfErrorType,'52x');assert.doesNotMatch(JSON.stringify(marked),/test-key|set-cookie|session/);
});

test('browser capacity failures stop with zero paid attempts and no background retry',async()=>{
 const f=fixture(),old=globalThis.fetch;let posts=0;
 f.env.BROWSER={async acquire(){throw Error('capacity');}};
 globalThis.fetch=async()=>{posts++;return new Response('invalid fixture',{status:400});};
 try{
  await f.job.fetch(f.req('PUT'));await f.job.alarm();await new ImageJob(f.ctx,f.env).alarm();
  const meta=await f.storage.get('meta');assert.equal(meta.state,'unknown');assert.equal(meta.error,'IMAGE_PREPARATION_FAILED');assert.equal(meta.upstreamAttempts,0);assert.equal(posts,0);assert.equal(meta.encrypted,undefined);
  f.env.BROWSER=fakeBrowser();await f.job.alarm();assert.equal(posts,0);assert.equal((await f.storage.get('meta')).state,'unknown');assert.equal(f.env.BROWSER.closed,0);
 }finally{globalThis.fetch=old;}
});

test('legacy uncertain records expose stored provider errors using read-only GETs',async()=>{
 const f=fixture();await f.job.fetch(f.req('PUT'));
 const raw={ok:false,status:520,text:JSON.stringify({error:{message:'provider failed test-key Bearer test-key',code:'upstream_error'}}),requestId:'old-trace',transport:{stage:'response_received'}};
 await f.storage.put('result:0',JSON.stringify(raw));
 await f.storage.put('meta',{...await f.storage.get('meta'),state:'unknown',error:'UPSTREAM_HTTP_520_NO_RESUBMIT',resultCount:1,upstreamAttempts:1});
 const before=structuredClone(f.map);
 for(const suffix of ['', '/result']){
  const response=await f.job.fetch(f.req('GET','test-key',input,suffix));assert.equal(response.status,suffix?409:200);
  const result=await response.json();assert.equal(result.error,'UPSTREAM_HTTP_520_NO_RESUBMIT');
  assert.equal(result.diagnostic.upstreamStatus,520);assert.equal(result.diagnostic.requestId,'old-trace');
  assert.match(result.diagnostic.upstreamMessage,/provider failed/);assert.doesNotMatch(JSON.stringify(result),/test-key/);
  assert.equal(result.text,undefined);assert.equal(result.encrypted,undefined);
 }
 assert.deepEqual(f.map,before);
});

test('diagnosis distinguishes missing images, invalid JSON, download errors and gateway HTML',()=>{
 assert.equal(resultDiagnostics({status:200,resultError:'NO_IMAGE',text:JSON.stringify({candidates:[{finishReason:'IMAGE_SAFETY'}]})}).upstreamMessage,'IMAGE_SAFETY');
 assert.equal(resultDiagnostics({status:200,resultError:'INVALID_JSON',text:'incomplete JSON'}).resultError,'INVALID_JSON');
 assert.equal(resultDiagnostics({downloadError:'IMAGE_DOWNLOAD_HTTP_403'}).resultError,'IMAGE_DOWNLOAD_HTTP_403');
 assert.equal(resultDiagnostics({text:'<html><title>520: origin error</title><body>long page</body></html>'}).upstreamMessage,'520: origin error');
 const error=Object.assign(Error('test-key disconnected'),{imageDiagnostics:{stage:'reading_response',status:200,errorCode:'UND_ERR_SOCKET',requestId:'trace'}});
 assert.deepEqual(exceptionDiagnostics(error,'test-key'),{message:'[redacted] disconnected',errorCode:'UND_ERR_SOCKET',stage:'reading_response',requestId:'trace',upstreamStatus:200});
});

// A valid 1024-square RGB PNG, stored without compression (~3 MiB). Compare
// actual image bytes, not just a short string with an image signature.
function largePng(){
 const chunk=(name,data)=>{
  const type=Buffer.from(name),length=Buffer.alloc(4),checksum=Buffer.alloc(4);
  length.writeUInt32BE(data.length);let crc=0xffffffff;
  for(const byte of Buffer.concat([type,data])){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  checksum.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([length,type,data,checksum]);
 };
 const header=Buffer.alloc(13);header.writeUInt32BE(1024,0);header.writeUInt32BE(1024,4);header[8]=8;header[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.alloc(1024*(1024*3+1)),{level:0})),chunk('IEND',Buffer.alloc(0))]);
}

test('large edit input and image result keep exact bytes while R2 removes chunk row writes',async t=>{
 const png=largePng(),b64=png.toString('base64'),old=globalThis.fetch,measurements=[];
 const submission={url:'https://infistar.cc/v1beta/models/gemini-nano-banana-2.1:generateContent',body:{contents:[{parts:[{text:'edit fixture'},{inlineData:{mimeType:'image/png',data:b64}}]}],generationConfig:{imageConfig:{imageSize:'4K',aspectRatio:'16:9'}}},usedReferences:true};
 try{
  for(const r2 of [false,true]){
   const f=fixture({r2});let posts=0;
   globalThis.fetch=async(url,init)=>{posts++;assert.deepEqual(JSON.parse(init.body),submission.body);return Response.json({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:b64}}]},finishReason:'STOP'}]});};
   await f.job.fetch(f.req('PUT','test-key',submission));await f.job.alarm();assert.equal(posts,1);
   const before=f.stats.rowWrites,puts=f.stats.r2Puts;
   for(let i=0;i<3;i++){
    await f.job.fetch(f.req());
    const result=await (await new ImageJob(f.ctx,f.env).fetch(f.req('GET','test-key',input,'/result'))).json();
    const image=JSON.parse(result.text).data[0];assert.equal(image.mimeType,'image/png');assert.deepEqual(Buffer.from(image.b64_json,'base64'),png);
   }
   assert.equal(f.stats.rowWrites,before);assert.equal(f.stats.r2Puts,puts);
   if(r2){
    assert.deepEqual([...f.map.keys()],['meta']);assert.equal(f.payloads.size,3);assert.equal(puts,3);
    for(const [key,value]of f.payloads){assert.match(key,/^step3\/[a-f0-9]{64}\/[a-f0-9-]{36}\/(input|raw|result)\.json$/);assert.doesNotMatch(value.text,/test-key/);}
   }
   // Change the mocked clock without charging the measurement for test setup.
   f.map.set('meta',{...await f.storage.get('meta'),expires:Date.now()-1});
   assert.equal((await f.job.fetch(f.req())).status,410);
   const expiredWrites=f.stats.rowWrites;
   for(let i=0;i<3;i++){assert.equal((await f.job.fetch(f.req('PUT','test-key',submission))).status,410);assert.equal((await f.job.fetch(f.req())).status,410);}
   assert.equal(f.stats.rowWrites,expiredWrites);assert.equal(posts,1);assert.equal(f.payloads.size,0);assert.deepEqual([...f.map.keys()],['meta']);
   measurements.push({store:r2?'R2':'legacy',imageBytes:png.length,rowWrites:f.stats.rowWrites,r2Puts:puts});
  }
  assert.ok(measurements[1].rowWrites<measurements[0].rowWrites*.02);
  t.diagnostic(JSON.stringify(measurements));
 }finally{globalThis.fetch=old;}
});

test('R2 input must persist before acknowledgement; failed write makes zero upstream attempts',async()=>{
 const f=fixture({r2:true}),old=globalThis.fetch,put=f.bucket.put;let posts=0;
 globalThis.fetch=async()=>{posts++;throw Error('must not generate');};
 try{
  f.bucket.put=async()=>{throw Error('R2 unavailable');};
  await assert.rejects(f.job.fetch(f.req('PUT')),/R2 unavailable/);
  assert.equal(await f.storage.get('meta'),undefined);await f.job.alarm();assert.equal(posts,0);
  let release;const ready=new Promise(resolve=>{release=resolve;});
  f.bucket.put=async(...args)=>{await ready;return put(...args);};
  let acknowledged=false;const submission=f.job.fetch(f.req('PUT')).then(response=>{acknowledged=true;return response;});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(acknowledged,false);assert.equal(await f.storage.get('meta'),undefined);
  release();assert.equal((await submission).status,202);assert.equal(f.payloads.size,1);assert.equal(posts,0);
 }finally{globalThis.fetch=old;}
});

for(const stage of ['raw','result'])test(`R2 ${stage} failure after generation never repeats the paid POST`,async()=>{
 const f=fixture({r2:true}),old=globalThis.fetch,put=f.bucket.put;let posts=0;
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=';
 globalThis.fetch=async()=>{posts++;return Response.json({data:[{b64_json:png}]});};
 f.bucket.put=async(key,...args)=>{if(key.endsWith('/'+stage+'.json'))throw Error('R2 stage unavailable');return put(key,...args);};
 try{
  await f.job.fetch(f.req('PUT'));await f.job.alarm();
  assert.equal((await f.storage.get('meta')).state,stage==='raw'?'running':'response_received');assert.ok((await f.storage.get('meta')).encrypted);
  if(stage==='result')assert.equal((await f.storage.get('meta')).resultStage,'raw');
  await new ImageJob(f.ctx,f.env).alarm();await f.job.fetch(f.req('PUT'));assert.equal(posts,1);f.bucket.put=put;await new ImageJob(f.ctx,f.env).alarm();
  const result=await(await f.job.fetch(f.req('GET','test-key',input,'/result'))).json();assert.equal(JSON.parse(result.text).data[0].b64_json,png);assert.equal(posts,1);assert.equal((await f.storage.get('meta')).state,'succeeded');
  f.map.set('meta',{...await f.storage.get('meta'),expires:Date.now()-1});await f.job.alarm();assert.equal(f.payloads.size,0);
 }finally{globalThis.fetch=old;}
});

test('legacy jobs finish in their original store after enabling R2; temporary image URLs retain exact bytes',async()=>{
 const f=fixture(),old=globalThis.fetch;let posts=0,downloads=0;
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=','base64');
 globalThis.fetch=async(url,init)=>{
  if(init?.method==='POST'){posts++;return Response.json({data:[{url:'https://images.example.com/temporary.png'}]});}
  downloads++;assert.equal(url,'https://images.example.com/temporary.png');assert.equal(init?.headers,undefined);return new Response(png);
 };
 try{
  for(const legacy of [true,false]){
   const task=legacy?f:fixture({r2:true});
   await task.job.fetch(task.req('PUT'));task.env.IMAGE_PAYLOADS=task.bucket;
   await new ImageJob(task.ctx,task.env).alarm();
   const result=await (await task.job.fetch(task.req('GET','test-key',input,'/result'))).json();
   assert.deepEqual(Buffer.from(JSON.parse(result.text).data[0].b64_json,'base64'),png);
   assert.equal(task.payloads.size,legacy?0:3);await task.job.alarm();
  }
  assert.equal(posts,2);assert.equal(downloads,2);
 }finally{globalThis.fetch=old;}
});

test('missing R2 binding or object fails closed without regenerating',async()=>{
 const old=globalThis.fetch;let posts=0;globalThis.fetch=async()=>{posts++;throw Error('must not generate');};
 try{
  for(const missing of ['binding','object']){
   const f=fixture({r2:true});await f.job.fetch(f.req('PUT'));
   if(missing==='binding')delete f.env.IMAGE_PAYLOADS;else f.payloads.clear();
   await new ImageJob(f.ctx,f.env).alarm();assert.equal((await f.storage.get('meta')).state,'unknown');assert.equal((await f.storage.get('meta')).upstreamAttempts,0);
   f.env.IMAGE_PAYLOADS=f.bucket;await f.job.alarm();await f.job.fetch(f.req('PUT'));assert.equal(posts,0);
  }
 }finally{globalThis.fetch=old;}
});

test('input saved before a failed metadata commit can be safely submitted again under the same ID',async()=>{
 const f=fixture({r2:true}),old=globalThis.fetch,put=f.storage.put;let posts=0;
 globalThis.fetch=async()=>{posts++;throw Error('upstream disconnected');};
 try{
  f.storage.put=async()=>{throw Error('metadata commit failed');};
  await assert.rejects(f.job.fetch(f.req('PUT')),/metadata commit failed/);
  assert.equal(f.payloads.size,1);assert.equal(await f.storage.get('meta'),undefined);
  await f.job.alarm();assert.equal(posts,0);
  f.storage.put=put;assert.equal((await f.job.fetch(f.req('PUT'))).status,202);
  assert.equal(f.payloads.size,1);await f.job.alarm();await f.job.fetch(f.req('PUT'));await f.job.alarm();assert.equal(posts,1);
 }finally{globalThis.fetch=old;}
});

test('failed R2 expiry deletion remains retryable and never reopens a generation',async()=>{
 const f=fixture({r2:true}),old=globalThis.fetch,remove=f.bucket.delete;let posts=0;
 globalThis.fetch=async()=>{posts++;throw Error('must not generate');};
 try{
  await f.job.fetch(f.req('PUT'));f.map.set('meta',{...await f.storage.get('meta'),expires:Date.now()-1});
  f.bucket.delete=async()=>{throw Error('R2 delete unavailable');};
  await assert.rejects(f.job.alarm(),/R2 delete unavailable/);
  assert.equal(f.payloads.size,1);assert.equal((await f.storage.get('meta')).payloadStore,'r2-v1');
  f.bucket.delete=remove;await new ImageJob(f.ctx,f.env).alarm();assert.equal(f.payloads.size,0);
  assert.equal((await f.job.fetch(f.req('PUT'))).status,410);assert.equal(posts,0);
 }finally{globalThis.fetch=old;}
});
