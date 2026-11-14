import {test} from 'node:test';
import assert from 'node:assert/strict';
import {officialCatalogUrls,parseOfficialCatalog,fetchOfficialCatalog} from './step3-official-catalog.mjs';
const config={provider:'infistar',base:'https://infistar.cc/v1',key:'never-transmit-this'};
const html=data=>`<script type="application/json" id="public-site-pricing-data">${JSON.stringify({success:true,data})}</script>`;
const rows=[{model_name:'gpt-image-2.6-flare',supported_endpoint_types:['image-generation']},{model_name:'future-brand',price_presentation:{kind:'image'}},{model_name:'claude-test',supported_endpoint_types:['anthropic']}];
test('official discovery accepts only exact official providers and bases',()=>{
 assert.equal(officialCatalogUrls(config)[0],'https://infistar.cc/pricing');
 for(const base of ['https://other.invalid/v1','http://infistar.cc/v1','https://infistar.cc:8443/v1','https://infistar.cc/v1?x=1','https://secret@infistar.cc/v1','https://infistar.cc.evil/v1'])assert.deepEqual(officialCatalogUrls({...config,base}),[]);
 assert.deepEqual(officialCatalogUrls({...config,provider:'custom'}),[]);
});
test('parse only the official JSON script and retain exact IDs and capabilities',()=>{
 const parsed=parseOfficialCatalog(html([...rows,rows[0]]));
 assert.deepEqual(parsed.list,rows.map(r=>r.model_name));assert.equal(parsed.kinds['future-brand'],'image');
 for(const body of ['<script>throw 1</script>','<html>login</html>',html([]),html([{model_name:'a\nb'}]),html([{name:'wrong-schema'}])])assert.throws(()=>parseOfficialCatalog(body));
});
test('official fetch is keyless, uncached and falls back to the second official domain',async()=>{
 const calls=[];
 const result=await fetchOfficialCatalog(config,{fetchImpl:async(url,options)=>{calls.push({url,options});if(calls.length===1)throw new Error('CORS');return {ok:true,text:async()=>html(rows)};}});
 assert.equal(result.ok,true);assert.equal(result.url,'https://infistar.ai/pricing');assert.equal(calls.length,2);
 for(const {url,options} of calls){assert.equal(new URL(url).search,'');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');assert.equal(options.referrerPolicy,'no-referrer');assert.equal(options.headers,undefined);assert.ok(!JSON.stringify({url,options}).includes(config.key));}
});
test('every refresh replaces the public list and discovers future models without deployment',async()=>{
 let current=rows;
 const fetchImpl=async()=>({ok:true,text:async()=>html(current)});
 const first=await fetchOfficialCatalog(config,{fetchImpl});current=[{model_name:'new-image-next',supported_endpoint_types:['image-generation']}];
 const second=await fetchOfficialCatalog(config,{fetchImpl});assert.equal(first.list.length,3);assert.deepEqual(second.list,['new-image-next']);
});
test('deadlines cover stalled response bodies and malformed pages never become a catalog',async()=>{
 const result=await fetchOfficialCatalog(config,{timeoutMs:10,fetchImpl:async()=>({ok:true,text:()=>new Promise(()=>{})})});assert.equal(result.ok,false);
 const malformed=await fetchOfficialCatalog(config,{fetchImpl:async()=>({ok:true,text:async()=>'<html>maintenance</html>'})});assert.equal(malformed.ok,false);
});
