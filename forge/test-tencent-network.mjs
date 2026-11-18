import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {ANALYSIS_JOB_BASE,ANALYSIS_JOB_BASES,requestReferenceAnalysis,analysisUpstream} from './step3-analysis-job.mjs';
import {usesInfistarImageJob,INFISTAR_JOBS} from './step3-infistar-job.mjs';
import {internationalGalleryBase,internationalInitialImageUrl} from './step3-international-image-route.mjs';
import {fetchBitmapSource} from './nonelinear-source.mjs';
const origin='https://analysis.topconf-paper-figure-gallery.cn';
function browser(){
 const calls=[];const window={location:{href:'https://qwdwqfwq.github.io/topconf-paper-figure-gallery/forge/'},fetch:async(...args)=>{calls.push(args);return new Response('ok');}};
 vm.runInNewContext(readFileSync(new URL('./nonelinear-config.js',import.meta.url),'utf8'),{window,URL,Request,Headers});
 return {window,calls};
}
test('Nonelinear request families retain fixed Tencent routes',async()=>{
 const {window,calls}=browser();assert.equal(window.FF_NONELINEAR_BASE,origin+'/v1');
 for(const [url,method,path] of [
  ['https://api.nonelinear.com.cn/v1/chat/completions','POST','/v1/chat/completions'],
  ['https://gallery-nonelinear-relay.lixiao-gallery.workers.dev/v1/images/edits','POST','/v1/images/edits'],
  ['https://nonelinear.com.cn/models?offset=0&limit=100','GET','/providers/nonelinear/models?offset=0&limit=100'],
  ['https://nonelinear.com.cn/api/upload-file','POST','/providers/nonelinear/api/upload-file']
 ]){
  const body=method==='POST'?'unchanged request bytes':undefined;
  await window.fetch(url,{method,body,headers:{Authorization:'Bearer fixture'}});
  const [target,init]=calls.at(-1);assert.equal(target,origin+path);assert.equal(init.body,body);assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');
 }
});

test('temporary bypass leaves every Infistar request family browser-direct',async()=>{
 const {window,calls}=browser();
 for(const [url,method] of [
  ['https://infistar.cc/v1/models','GET'],
  ['https://infistar.ai/v1/chat/completions','POST'],
  ['https://infistar.cc/v1/messages','POST','/providers/infistar-cc/v1/messages'],
  ['https://infistar.ai/v1/responses','POST','/providers/infistar-ai/v1/responses'],
  ['https://infistar.cc/v1beta/models/gemini-fixture:streamGenerateContent?alt=sse','POST','/providers/infistar-cc/v1beta/models/gemini-fixture:streamGenerateContent?alt=sse'],
  ['https://infistar.cc/v1/images/generations','POST','/providers/infistar-cc/v1/images/generations'],
  ['https://infistar.cc/pricing','GET','/providers/infistar-cc/pricing']
 ]){
  const init={method,body:method==='POST'?'unchanged request bytes':undefined,headers:{Authorization:'Bearer fixture'}};
  await window.fetch(url,init);
  assert.equal(calls.at(-1)[0],url);assert.equal(calls.at(-1)[1],init);
 }
});
test('custom endpoints and unsupported URL variants are never redirected',async()=>{
 const {window,calls}=browser();
 for(const url of ['https://custom.invalid/v1/images/generations','https://infistar.cc:8443/v1/models','https://infistar.cc/v1/models?secret=1','https://infistar.cc.evil.invalid/v1/models','https://nonelinear.com.cn/models?limit=bad','http://infistar.cc/v1/models','https://infistar.cc/v1/models#fragment']){
  const init={method:'GET'};await window.fetch(url,init);assert.equal(calls.at(-1)[0],url);assert.equal(calls.at(-1)[1],init);
 }
});
test('FormData upload is preserved and Request retains headers, bytes and cancellation',async()=>{
 const {window,calls}=browser();const form=new FormData();form.append('file',new Blob(['reference bytes']),'ref.png');
 const controller=new AbortController();
 await window.fetch('https://nonelinear.com.cn/api/upload-file',{method:'POST',body:form,signal:controller.signal});
 assert.equal(calls.at(-1)[1].body,form);assert.equal(calls.at(-1)[1].signal,controller.signal);
 const request=new Request('https://infistar.cc/v1/images/edits',{method:'POST',body:'exact JSON bytes',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},signal:controller.signal});
 await window.fetch(request);const redirected=calls.at(-1)[0];
 assert.equal(redirected,request);assert.equal(redirected.url,request.url);assert.equal(await redirected.text(),'exact JSON bytes');assert.equal(redirected.headers.get('Authorization'),'Bearer fixture');
 controller.abort();assert.equal(redirected.signal.aborted,true);
});
test('both providers use Tencent jobs and keep the configured upstream entrance',()=>{
 assert.deepEqual([...ANALYSIS_JOB_BASES],[origin+'/analysis']);assert.equal(INFISTAR_JOBS,origin+'/initial');
 for(const host of ['api.nonelinear.com.cn','infistar.cc','infistar.ai']){
  const url='https://'+host+'/v1/images/generations';assert.equal(usesInfistarImageJob(url),true);
  assert.equal(internationalInitialImageUrl(url,{model:'gpt-image-fixture'}),url);
 }
 for(const host of ['cc','ai']){
  const base='https://infistar.'+host+'/v1';assert.equal(internationalGalleryBase(base,{provider:'infistar',stage:'visual',model:'gpt-image-fixture'}),base);
  assert.equal(analysisUpstream('infistar',base+'/chat/completions'),'infistar-'+host);
 }
});
test('a pre-migration analysis ID missing from Tencent is retained without a paid resubmission',async()=>{
 const old='https://gallery-nonelinear-relay.lixiao-gallery.workers.dev/v1/chat/completions';
 const body=JSON.stringify({model:'unchanged',messages:[{role:'user',content:'unchanged reference'}]});
 const authorization='Bearer fixture';const hash=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(old+'\n'+authorization+'\n'+body))).toString('hex');
 const id='12345678-1234-1234-1234-123456789abc';const map=new Map([['gallery.reference-analysis.v1.'+hash,JSON.stringify({id,created:1,accepted:true})]]);const methods=[];
 const response=await requestReferenceAnalysis({provider:'nonelinear',url:origin+'/v1/chat/completions',init:{method:'POST',headers:{Authorization:authorization},body},storage:{getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)},now:()=>2,probe:false,fetchImpl:async(url,init)=>{methods.push(init.method||'GET');assert.ok(url.startsWith(ANALYSIS_JOB_BASE+'/jobs/'+id));return new Response(JSON.stringify({error:'NOT_FOUND'}),{status:404});}});
 assert.equal(response.status,409);assert.equal((await response.json()).error.code,'analysis_legacy_job_unavailable');assert.deepEqual(methods,['GET']);assert.equal(JSON.parse([...map.values()][0]).id,id);
});
test('NoneLinear original image bytes use Tencent for new and historical gallery contexts',async()=>{
 const url='https://imagen-nonelinear-2025.tos-cn-beijing.volces.com/fixture.png';const bytes=new Uint8Array([137,80,78,71]);
 for(const base of [origin+'/v1','https://gallery-nonelinear-relay.lixiao-gallery.workers.dev/v1']){
  const response=await fetchBitmapSource(url,{provider:'nonelinear',base,key:'fixture'},async(target,init)=>{assert.equal(target,origin+'/v1/source-image');assert.deepEqual(JSON.parse(init.body),{url});return new Response(bytes);});
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
 }
});
