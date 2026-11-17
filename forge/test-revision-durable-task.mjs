import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRevisionImageJobClient} from './revision-image-job.mjs';
import {createRevisionTaskStore,revisionTaskInput} from './revision-task-store.mjs';
import {usesBrowserImageTransport} from '../revision-image-jobs/browser-image-fetch.mjs';

const url='https://infistar.cc/v1beta/models/gemini-3.1-flash-image:streamGenerateContent?alt=sse';
const body={generationConfig:{imageConfig:{imageSize:'4K',aspectRatio:'16:9'}},contents:[]};
const input=()=>({url,body,key:'fixture-key',task:{id:crypto.randomUUID(),state:'prepared'},saveTask:async()=>{}});
test('private browser transport covers native selected Infistar hosts without broadening origins',()=>{
 assert.equal(usesBrowserImageTransport(url),true);
 assert.equal(usesBrowserImageTransport(url.replace('.cc/','.ai/')),true);
 for(const bad of [url.replace('infistar.cc','evil.example'),url+'&key=secret','https://infistar.cc/v1/images/edits','http://infistar.cc/v1/images/generations'])assert.equal(usesBrowserImageTransport(bad),false);
});
const client=fetchImpl=>createRevisionImageJobClient({fetchImpl,wait:async()=>{},pollMs:0,retryMs:0,maxReadFailures:1});

test('selected Infistar address and 4K are preserved through lost acknowledgement and reads',async()=>{
 const task=input(),calls=[];let reads=0,results=0;
 const c=client(async(u,i={})=>{calls.push([u,i.method||'GET']);
  if(i.method==='PUT'){const request=JSON.parse(i.body);assert.equal(request.url,url);assert.deepEqual(request.body,body);throw Error('lost acknowledgement');}
  if(u.endsWith('/result')){if(!results++)return new Response('{}',{status:503});return Response.json({ok:true,status:200,text:'image response'});}
  if(!reads++)throw Error('offline');return Response.json({state:'succeeded'});
 });
 const raw=await c.request(task);assert.equal(raw.job.recovered,true);assert.equal(task.task.raw,raw);
 assert.equal(calls.filter(x=>x[1]==='PUT').length,1);
 await c.request({...task,task:structuredClone(task.task)});
 assert.equal(calls.filter(x=>x[1]==='PUT').length,1);assert.equal(calls.length,5);
});

test('refresh resumes the same accepted task using GET only',async()=>{
 const a=input();a.task.submitted=true;let reads=0;
 const c=client(async(u,i={})=>{assert.equal(i.method,undefined);assert.ok(u.includes(a.task.id));reads++;return Response.json(u.endsWith('/result')?{ok:true,status:200,text:'saved response'}:{state:'succeeded'});});
 await c.request(a);assert.equal(reads,2);
});

test('storage failure stops before any submission and leaves task unsubmitted',async()=>{
 const a=input();let calls=0;a.saveTask=async()=>{throw Error('disk full');};
 await assert.rejects(client(async()=>{calls++;}).request(a),/disk full/);
 assert.equal(calls,0);assert.equal(a.task.submitted,undefined);assert.equal(a.task.state,'prepared');
 await assert.rejects(createRevisionTaskStore(null).write({id:'x'}),/本次未提交/);
});

test('real 400 four_k_disabled is durably retained, never downgraded or replayed',async()=>{
 const a=input();let puts=0,saves=0;a.saveTask=async()=>{saves++;};
 const raw={ok:false,status:400,text:JSON.stringify({error:{code:'four_k_disabled',message:'暂时供应不足'}})};
 const c=client(async(u,i={})=>{if(i.method==='PUT'){puts++;return Response.json({state:'rejected'});}return Response.json(raw);});
 assert.equal((await c.request(a)).status,400);assert.equal(a.task.state,'rejected');assert.equal(saves,2);
 assert.equal((await c.request(a)).text,raw.text);assert.equal(puts,1);
});

test('unknown or missing task never causes another paid request',async()=>{
 for(const state of ['unknown','missing']){const a=input();a.task.submitted=true;let puts=0;
  await assert.rejects(client(async(u,i={})=>{if(i.method==='PUT')puts++;return Response.json({state},{status:state==='missing'?404:200});}).request(a));assert.equal(puts,0);
 }
});

test('task snapshot retains source, prompt inputs, screenshots and scope without credentials',()=>{
 const parent={id:'v1',image:'data:image/png;base64,a',route:{base:'https://infistar.cc/v1',model:'gemini-3.1-flash-image',resolution:'4K'},attachments:[{name:'截图',data:'data:image/png;base64,b'}],editRegions:[{x:1,y:2,width:3,height:4}],manualScope:true,key:'secret',state:{scene:'frozen'}};
 const saved=revisionTaskInput(parent);assert.deepEqual(saved.attachments,parent.attachments);assert.deepEqual(saved.editRegions,parent.editRegions);assert.equal(saved.key,undefined);assert.equal(saved.state,undefined);parent.route.base='changed';assert.equal(saved.route.base,'https://infistar.cc/v1');
});

test('actual page revision configuration keeps the selected host and restores original route',()=>{
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 const fn=html.slice(html.indexOf('function revisionConfiguration('),html.indexOf('\nconst revisionGallery=',html.indexOf('function revisionConfiguration(')));
 assert.ok(fn.length<4000&&fn.length>300);
 const values={provider:'infistar',model:'gemini-3.1-flash-image',customModel:'',figureRatio:'16:9',imageResolution:'4K',key:'fixture-key'};
 const context={$:s=>({value:values[s.slice(1)]}),baseURL:()=> 'https://infistar.cc/v1',cfg:()=>({proto:'openai',vision:[]}),cleanKey:x=>x,mode:'image',step3Catalog:()=>({isImageModel:()=>true}),internationalGalleryBase:()=> 'https://infistar.ai/v1'};
 vm.createContext(context);vm.runInContext(fn+'\nthis.config=revisionConfiguration;',context);
 assert.equal(context.config({source:'image'}).route.base,'https://infistar.cc/v1');
 const route={base:'https://infistar.cc/v1',model:'old-model',resolution:'2K',ratio:'1:1'};
 context.mode='svg';assert.equal(context.config({source:'image',revisionTask:{input:{route}}}).route,route);
 assert.equal(context.config({source:'svg'},false).route.base,'https://infistar.ai/v1');
});


test('other/custom providers retain direct transport without allowing ambiguous replay',async()=>{
 const a=input();a.url='https://custom.example/v1/images/generations';let direct=0,relay=0;
 const c=createRevisionImageJobClient({fetchImpl:async()=>{relay++;},directRequest:async request=>{direct++;assert.equal(request.url,a.url);assert.equal(request.body,body);return {ok:true,status:200,text:'custom result'};}});
 assert.equal((await c.request(a)).text,'custom result');await c.request(a);assert.equal(direct,1);assert.equal(relay,0);assert.equal(a.task.transport,'direct');
 const uncertain=input();uncertain.url=a.url;
 const broken=createRevisionImageJobClient({directRequest:async()=>{direct++;throw Error('offline');}});
 await assert.rejects(broken.request(uncertain),/offline/);await assert.rejects(broken.request(uncertain),/未重复生图/);assert.equal(direct,2);
});
