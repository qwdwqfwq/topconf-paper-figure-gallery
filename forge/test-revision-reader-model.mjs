import assert from 'node:assert/strict';
import {selectRedrawReaderModel as select,discoverRedrawReaderModel as discover} from './revision-reader-model.mjs';

assert.equal(select(['gpt-4.1','gpt-6-sol','gpt-6.1-terra','gpt-6.1-sol','gpt-image-9','gpt-99-codex']),'gpt-6.1-sol');
assert.equal(select(['gpt-6.9','gpt-6.10','gpt-7-mini']),'gpt-7-mini');
assert.equal(select(['gpt-6.9','gpt-6.10']),'gpt-6.10');
assert.equal(select([{id:'gpt-6.1-sol',created:1},{id:'gpt-6-sol',created:999999}]),'gpt-6.1-sol');
assert.equal(select(['gpt-6.1-mini','gpt-6.1-sol-2026-10-01','gpt-6.1-sol']),'gpt-6.1-sol');
assert.equal(select(['gpt-4o','gpt-4.1']),'gpt-4.1');
assert.equal(select(['gpt-3.5-turbo','gpt-4','gpt-4o']),'gpt-4o');
assert.equal(select([{id:'gpt-7',input_modalities:['text']},{id:'gpt-6.1',supports_vision:false},'gpt-6']),'gpt-6');
assert.equal(select([{id:'gpt-7',supported_endpoint_types:['openai-response']},'gpt-6']),'gpt-6');
assert.equal(select([{id:'gpt-7-special',input_modalities:['text','image'],supported_endpoint_types:['openai']},'gpt-6']),'gpt-7-special');
assert.equal(select([{model_name:'gpt-6.1-sol',supported_endpoint_types:['openai','openai-response']},'gpt-6.1-terra']),'gpt-6.1-sol');
assert.throws(()=>select(['gpt-image-2','gpt-7-audio','gpt-7-realtime','gpt-7-codex','gpt-7-search','gpt-7-pro','gemini-3']),/未列出/);
assert.throws(()=>select({data:[]}),/格式无效/);

const calls=[];
const fetchModels=async(url,options)=>{
  calls.push({url,options});
  const data=options.headers.Authorization==='Bearer provider-a'?['gpt-6.1-sol','gpt-4.1']:['gpt-6.2','gpt-6.1-sol'];
  return new Response(JSON.stringify({data:data.map(id=>({id}))}));
};
assert.equal(await discover({base:'https://provider-a.test/v1/',key:'provider-a',fetchModels}),'gpt-6.1-sol');
assert.equal(await discover({base:'https://provider-b.test/v1',key:'provider-b',fetchModels}),'gpt-6.2');
assert.equal(await discover({base:'https://provider-a.test/v1',key:'provider-a',fetchModels}),'gpt-6.1-sol');
assert.equal(calls.length,3,'Every redraw re-queries its current provider/key; no stale catalogue cache');
assert.equal(calls[0].url,'https://provider-a.test/v1/models');
assert.equal(calls[1].url,'https://provider-b.test/v1/models');
for(const {options} of calls){assert.equal(options.method,'GET');assert.equal(options.body,undefined);assert.equal(options.cache,'no-store');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');}
let pages=0;
assert.equal(await discover({base:'https://provider.test/v1',key:'fixture',fetchModels:async(url)=>{
  pages++;
  if(pages===1)return new Response(JSON.stringify({data:[{id:'gpt-4.1'}],has_more:true,last_id:'gpt-4.1'}));
  assert.equal(new URL(url).searchParams.get('after'),'gpt-4.1');
  return new Response(JSON.stringify({data:[{id:'gpt-6.1-sol'}],has_more:false}));
}}),'gpt-6.1-sol');
assert.equal(pages,2);
for(const response of [new Response('{}',{status:403}),new Response('not json'),new Response('{"data":[]}'),new Response('{"data":[{"id":"gpt-4.1"}],"total":2}')]){
  let attempts=0;
  await assert.rejects(discover({base:'https://provider.test/v1',key:'fixture',fetchModels:async()=>{attempts++;return response;}}));
  assert.equal(attempts,1,'Do not retry or silently fall back to a hardcoded reader');
}
await assert.rejects(discover({base:'https://provider.test/v1',key:'sk-secret-fixture',fetchModels:async()=>{throw Error('sk-secret-fixture failed');}}),error=>!error.message.includes('sk-secret-fixture'));
console.log(JSON.stringify({passed:true,liveAPICalls:0,numericLatest:true,providerKeyScoped:true,noCacheOrFallback:true,pagination:true,capabilityRestrictions:true}));
