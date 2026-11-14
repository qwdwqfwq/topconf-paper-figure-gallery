import {test} from 'node:test';
import assert from 'node:assert/strict';
import {officialCatalogUrls,parseNonelinearOfficialCatalog,fetchOfficialCatalog} from './step3-official-catalog.mjs';
const config={provider:'nonelinear',base:'https://gallery-nonelinear-relay.lixiao-gallery.workers.dev/v1',key:'never-send-fixture-key'};
const row=(id,kind)=>[id,'vendor','No','/','/','/','/','Yes','<b>untrusted</b>','2026-11-15',kind];
const body=(data,total=data.length)=>JSON.stringify({headers:Array(11).fill('column'),data,total});
const reply=text=>({ok:true,text:async()=>text});
test('only exact NoneLinear API or owned relay bases enable public discovery',()=>{
 for(const base of [config.base,'https://api.nonelinear.com.cn/v1/'])assert.equal(officialCatalogUrls({...config,base})[0],'https://nonelinear.com.cn/models?offset=0&limit=500');
 for(const base of ['https://other.invalid/v1','http://api.nonelinear.com.cn/v1','https://api.nonelinear.com.cn:8443/v1','https://secret@api.nonelinear.com.cn/v1','https://api.nonelinear.com.cn/v1?key=secret','https://api.nonelinear.com.cn/v1#x','https://api.nonelinear.com.cn.evil/v1'])assert.deepEqual(officialCatalogUrls({...config,base}),[]);
 assert.deepEqual(officialCatalogUrls({...config,provider:'custom'}),[]);
});
test('official modalities classify unfamiliar exact IDs without executing table markup',()=>{
 const result=parseNonelinearOfficialCatalog(body([row('Brand.New:Image','image'),row('unknown-vision','LMM'),row('unknown-chat','LLM'),row('gpt-embedding','embedding'),row('__proto__','video')]));
 assert.equal(result.kinds['Brand.New:Image'],'image');assert.equal(result.visual['unknown-vision'],true);assert.equal(result.kinds['unknown-chat'],'chat');assert.equal(result.visual['unknown-chat'],false);assert.equal(result.kinds['gpt-embedding'],'other');assert.equal(result.kinds.__proto__,'other');
 for(const text of ['<html>login</html>',body([]),body([row('a\nb','image')]),body([row('same','image'),row('same','image')]),body([row('one','image')],10001),JSON.stringify({data:[{id:'wrong API'}]})])assert.throws(()=>parseNonelinearOfficialCatalog(text));
});
test('all official pages are loaded using no key, cookies or referrer, including under server page limits',async()=>{
 const calls=[],rows=[row('new-image','image'),row('new-visual','LMM'),row('new-chat','LLM')];
 const result=await fetchOfficialCatalog(config,{fetchImpl:async(url,options)=>{calls.push({url,options});const offset=Number(new URL(url).searchParams.get('offset'));return reply(body(rows.slice(offset,offset+1),rows.length));}});
 assert.equal(result.ok,true);assert.deepEqual(result.list,rows.map(r=>r[0]));assert.equal(calls.length,3);
 for(const {url,options} of calls){assert.equal(new URL(url).hostname,'nonelinear.com.cn');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');assert.equal(options.referrerPolicy,'no-referrer');assert.equal(options.headers,undefined);assert.ok(!JSON.stringify({url,options}).includes(config.key));}
});
test('partial, unstable or repeated pages never become a complete live directory',async()=>{
 for(const failure of ['empty','changed-total','repeated','timeout']){
  const result=await fetchOfficialCatalog(config,{timeoutMs:15,fetchImpl:async url=>{
   if(Number(new URL(url).searchParams.get('offset'))===0)return reply(body([row('first','image')],2));
   if(failure==='timeout')return {ok:true,text:()=>new Promise(()=>{})};
   return reply(failure==='empty'?body([],2):failure==='repeated'?body([row('first','image')],2):body([row('second','image')],3));
  }});assert.equal(result.ok,false,failure);
 }
});
test('official-domain fallback restarts pagination and refresh replaces delisted entries',async()=>{
 let rows=[row('old','image')],calls=[];
 const fetchImpl=async url=>{calls.push(url);if(new URL(url).hostname==='nonelinear.com.cn')throw Error('CORS');return reply(body(rows));};
 assert.deepEqual((await fetchOfficialCatalog(config,{fetchImpl})).list,['old']);rows=[row('brand-new','image')];
 assert.deepEqual((await fetchOfficialCatalog(config,{fetchImpl})).list,['brand-new']);assert.equal(calls.length,4);
});
