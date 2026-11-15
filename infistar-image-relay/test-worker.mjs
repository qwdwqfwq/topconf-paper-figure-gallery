import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openBrowserImageFetch,usesBrowserImageTransport} from './browser-image-fetch.mjs';
import worker,{ImageJob,validateSubmission,backgroundTarget} from './worker.mjs';
const origin='https://qwdwqfwq.github.io',jobId='c3c04790-cd04-47e2-bb09-546aa8fcd7fe';
const input={url:'https://infistar.cc/v1/images/generations',body:{model:'gpt-image-2.5-sunburst',prompt:'fixture'},usedReferences:false};
test('overseas image gateway is selected before the one request; other routes are unchanged',()=>{
 assert.equal(backgroundTarget(input.url),'https://infistar.ai/v1/images/generations');
 for(const url of ['https://infistar.cc/v1beta/models/gemini-3.1-flash-lite-image:generateContent','https://api.openai.com/v1/images/edits','https://api.nonelinear.com.cn/v1/images/generations'])assert.equal(backgroundTarget(url),url);
});
function fixture(){
 const map=new Map();let lock=Promise.resolve();const storage={
  async get(k){return structuredClone(map.get(k));},async put(k,v){map.set(k,structuredClone(v));},
  async delete(k){for(const key of Array.isArray(k)?k:[k])map.delete(key);},
  async list({prefix,limit}){return new Map([...map].filter(([k])=>k.startsWith(prefix)).slice(0,limit));},
  async setAlarm(t){this.alarm=t;},async deleteAlarm(){this.alarm=null;},
  async transaction(fn){const before=structuredClone(map);try{return await fn(this);}catch(e){map.clear();for(const [k,v]of before)map.set(k,v);throw e;}}
 };
 const ctx={storage,blockConcurrencyWhile(fn){const p=lock.then(fn);lock=p.catch(()=>{});return p;}};
 const env={ALLOWED_ORIGINS:origin,BROWSER:fakeBrowser(),JOB_ENCRYPTION_KEY:btoa('01234567890123456789012345678901')};const objects=new Map();
 env.IMAGE_JOBS={idFromName:x=>x,get:id=>{if(!objects.has(id))objects.set(id,new ImageJob(ctx,env));return objects.get(id);}};
 const req=(method='GET',key='test-key',body=input,suffix='')=>new Request('https://jobs.test/jobs/'+jobId+suffix,{method,headers:{Origin:origin,Authorization:'Bearer '+key,'Content-Type':'application/json'},...(method==='PUT'?{body:JSON.stringify(body)}:{})});
 return {storage,map,ctx,env,req,job:new ImageJob(ctx,env)};
}

test('Infistar Banana 2.1 durable task uses ordinary Gemini exactly once, retaining 4K and three references',async()=>{
 const f=fixture(),old=globalThis.fetch;let posts=0;
 const body={contents:[{role:'user',parts:[{text:'fixture'},...Array.from({length:3},()=>({inlineData:{mimeType:'image/png',data:'aGVsbG8='}}))]}],generationConfig:{responseModalities:['TEXT','IMAGE'],imageConfig:{aspectRatio:'16:9',imageSize:'4K'}}};
 const submission={url:'https://infistar.cc/v1beta/models/gemini-nano-banana-2.1:generateContent',body,usedReferences:true};
 globalThis.fetch=async(url,init)=>{
  posts++;assert.equal(url,submission.url);assert.deepEqual(JSON.parse(init.body),body);
  return Response.json({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII='}}]},finishReason:'STOP'}]});
 };
 try{
  assert.equal((await f.job.fetch(f.req('PUT','test-key',submission))).status,202);
  await f.job.alarm();await f.job.alarm();await f.job.fetch(f.req('PUT','test-key',submission));
  assert.equal(posts,1);assert.equal(f.env.BROWSER.posts,0);assert.equal((await f.storage.get('meta')).state,'succeeded');
  assert.equal((await f.job.fetch(f.req('GET','test-key',submission,'/result'))).status,200);
 }finally{globalThis.fetch=old;}
});

test('other Infistar Gemini durable tasks retain SSE and recover results without another generation',async()=>{
 const f=fixture(),old=globalThis.fetch;let posts=0;
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

test('NoneLinear durable task uploads local references before one synchronous generation',async()=>{
 const f=fixture(),old=globalThis.fetch,calls=[];
 const submission={url:'https://api.nonelinear.com.cn/v1/images/generations',body:{model:'gemini-3.1-flash-image-preview',prompt:'fixture',size:'4K',aspect_ratio:'16:9',image:['data:image/png;base64,aGVsbG8=']},usedReferences:true};
 globalThis.fetch=async(url,init)=>{
  calls.push(url);const body=JSON.parse(init.body);
  if(url==='https://nonelinear.com.cn/api/upload-file'){assert.deepEqual(body,{image:'aGVsbG8=',type:'.png'});return Response.json({url:'https://images.example.com/reference.png'});}
  assert.equal(url,submission.url);assert.deepEqual(body,{...submission.body,image:['https://images.example.com/reference.png']});
  return Response.json({data:[{b64_json:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII='}]});
 };
 try{
  assert.equal((await f.job.fetch(f.req('PUT','test-key',submission))).status,202);await f.job.alarm();await f.job.alarm();
  assert.deepEqual(calls,['https://nonelinear.com.cn/api/upload-file',submission.url]);assert.equal(f.env.BROWSER.posts,0);assert.equal((await f.storage.get('meta')).state,'succeeded');
 }finally{globalThis.fetch=old;}
});
test('duplicate concurrent submissions, completed replay and expiry never issue another upstream POST',async()=>{
 const f=fixture();let posts=0;const old=globalThis.fetch;
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
test('restart after durable claim and upstream disconnect preserve unknown state without retry',async()=>{
 const old=globalThis.fetch;let posts=0;globalThis.fetch=async()=>{posts++;throw Error('socket closed');};
 try{
  const f=fixture();await f.job.fetch(f.req('PUT'));await f.job.alarm();assert.equal(posts,1);
  assert.equal((await f.storage.get('meta')).state,'unknown');assert.equal((await f.storage.get('meta')).encrypted,undefined);
  await new ImageJob(f.ctx,f.env).alarm();await f.job.fetch(f.req('PUT'));await f.job.alarm();assert.equal(posts,1);
  const g=fixture();await g.job.fetch(g.req('PUT'));await g.storage.put('meta',{...await g.storage.get('meta'),state:'running',upstreamAttempts:1});
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

test('received response survives a post-processing/storage crash and restart without a second POST',async()=>{
 const f=fixture(),old=globalThis.fetch;let posts=0,fail=true;
 globalThis.fetch=async()=>{posts++;return new Response(JSON.stringify({data:[{b64_json:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII='}]}),{headers:{'x-request-id':'received-id'}});};
 const originalPut=f.storage.put;
 f.storage.put=async(k,v)=>{if(k==='meta'&&v.state==='succeeded'&&fail){fail=false;throw Error('simulated storage failure after response');}return originalPut.call(f.storage,k,v);};
 try{
  await f.job.fetch(f.req('PUT'));await f.job.alarm();
  assert.equal((await f.storage.get('meta')).state,'response_received');assert.equal((await f.storage.get('meta')).encrypted,undefined);assert.equal(posts,1);
  await new ImageJob(f.ctx,f.env).alarm();assert.equal(posts,1);assert.equal((await f.storage.get('meta')).state,'succeeded');
  const result=await (await f.job.fetch(f.req('GET','test-key',input,'/result'))).json();assert.equal(result.requestId,'received-id');assert.equal(JSON.parse(result.text).data[0].mimeType,'image/png');
 }finally{globalThis.fetch=old;}
});

test('image URL recovery retries only GET; error responses redact the actual credential',async()=>{
 const f=fixture(),old=globalThis.fetch;let posts=0,downloads=0;
 globalThis.fetch=async(url,init)=>{
  if(init?.method==='POST'){posts++;return new Response(JSON.stringify({data:[{url:'https://images.example.com/result'}]}));}
  downloads++;if(downloads===1)throw Error('download disconnected');
  return new Response(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=','base64'));
 };
 try{
  await f.job.fetch(f.req('PUT'));await f.job.alarm();assert.equal((await f.storage.get('meta')).error,'download disconnected');
  const result=await (await f.job.fetch(f.req('GET','test-key',input,'/result'))).json();assert.equal(result.downloadError,undefined);assert.equal(posts,1);assert.equal(downloads,2);assert.equal((await f.storage.get('meta')).error,null);
  const g=fixture();globalThis.fetch=async()=>new Response('credential test-key Bearer test-key',{status:400});await g.job.fetch(g.req('PUT'));await g.job.alarm();
  const rejected=await (await g.job.fetch(g.req('GET','test-key',input,'/result'))).json();assert.equal(rejected.ok,false);assert.doesNotMatch(JSON.stringify(rejected),/test-key/);assert.equal((await g.storage.get('meta')).state,'rejected');
 }finally{globalThis.fetch=old;}
});

test('gateway failures preserve uncertain task and never replay via another host',async()=>{
 const f=fixture(),old=globalThis.fetch;let posts=0;globalThis.fetch=async url=>{posts++;assert.equal(url,'https://infistar.ai/v1/images/generations');return new Response('error code: 520',{status:520});};
 try{await f.job.fetch(f.req('PUT'));await f.job.alarm();const meta=await f.storage.get('meta');assert.equal(meta.state,'unknown');assert.equal(meta.error,'UPSTREAM_HTTP_520_NO_RESUBMIT');assert.ok(meta.resultCount);await f.job.fetch(f.req('PUT'));await f.job.alarm();assert.equal(posts,1);assert.equal((await f.job.fetch(f.req('GET','test-key',input,'/result'))).status,409);}finally{globalThis.fetch=old;}
});

function fakeBrowser(){
 let origin='',listener,closed=0,posts=0;
 const binding={
  get closed(){return closed;},get posts(){return posts;},
  async acquire(){return {sessionId:'fixture-session'};},
  devtools:{async listTargets(){return [{id:'fixture-page',type:'page'}];}},
  async connectSession(id,{targetId}){
   assert.equal(id,'fixture-session');assert.equal(targetId,'fixture-page');
   return {webSocket:{async fetch(){return {webSocket:{accept(){},close(){},addEventListener(type,fn){if(type==='message')listener=fn;},send(text){
    const command=JSON.parse(text);
    void (async()=>{let result;
     try{
      if(command.method==='Page.navigate'){origin=new URL(command.params.url).origin;result={};}
      else if(command.params.expression==='location.origin')result={result:{value:origin}};
      else if(command.params.expression==='Date.now()')result={result:{value:Date.now()}};
      else {
       const payload=JSON.parse(command.params.expression.match(/\)\((\{"url":.*)\)$/s)[1]);posts++;
       const response=await globalThis.fetch(payload.url,{method:'POST',headers:payload.headers,body:payload.body});
       result={result:{value:{status:response.status,headers:[...response.headers],text:await response.text()}}};
      }
      listener({data:JSON.stringify({id:command.id,result})});
     }catch{listener({data:JSON.stringify({id:command.id,result:{exceptionDetails:{text:'fixture disconnect'}}})});}
    })();
   }}};}}};
  },
  async closeSession(){closed++;}
 };
 return binding;
}
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
 }finally{globalThis.fetch=old;}
});
test('browser capacity failures remain queued with zero paid attempts; recovery submits once',async()=>{
 const f=fixture(),old=globalThis.fetch;let posts=0;
 f.env.BROWSER={async acquire(){throw Error('capacity');}};
 globalThis.fetch=async()=>{posts++;return new Response('invalid fixture',{status:400});};
 try{
  await f.job.fetch(f.req('PUT'));await f.job.alarm();await new ImageJob(f.ctx,f.env).alarm();
  const meta=await f.storage.get('meta');assert.equal(meta.state,'queued');assert.equal(meta.upstreamAttempts,0);assert.equal(posts,0);assert.ok(meta.encrypted);assert.equal(meta.preparationFailures,2);
  f.env.BROWSER=fakeBrowser();await f.job.alarm();assert.equal(posts,1);assert.equal((await f.storage.get('meta')).state,'rejected');assert.equal(f.env.BROWSER.closed,1);
 }finally{globalThis.fetch=old;}
});
