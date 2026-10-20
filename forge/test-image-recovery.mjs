import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'node:http';
import {requestImageWithRecovery,compatibleImageRequest} from './image-api.mjs';

const referenceError='现在没有线路支持这次要求的生成方式（用参考图生成）。可以改用 只用文字生成，或稍后再试。';
const upstreamError=JSON.stringify({error:{message:'context canceled',type:'read_response_body_failed',code:'read_response_body_failed'}});
const body={model:'gpt-image-2.5-sunburst',prompt:'paper and layout',size:'3840x2160',image:['data:image/png;base64,AA==']};
function harness(responses,options={}){
  const requests=[],events=[];
  return {requests,events,run:()=>requestImageWithRecovery({
    url:'https://example.invalid/v1/images/generations',body,key:'test-key',usedReferences:true,
    allowReferenceFallback:true,sleep:async()=>{},onRecovery:kind=>events.push(kind),
    fetchImpl:async(_,init)=>{
      requests.push(JSON.parse(init.body));
      const response=responses.shift();
      assert.ok(response,'Unexpected extra request');
      if(response instanceof Error)throw response;
      return new Response(response[1],{status:response[0]});
    },...options})};
}
test('screenshot 422 falls back once without changing prompt, model or size',async()=>{
  const h=harness([[422,referenceError],[200,'{"data":[]}']]);
  const r=await h.run();
  assert.equal(r.ok,true);assert.equal(r.usedReferences,false);assert.equal(r.referenceFallback,true);
  assert.deepEqual(h.requests,[body,{model:body.model,prompt:body.prompt,size:body.size}]);
  assert.ok(body.image);assert.deepEqual(h.events,['reference']);
});
test('screenshot 500 stops without repeating a possibly billed request',async()=>{
  const h=harness([[500,upstreamError],[200,'{}']]);
  const r=await h.run();
  assert.equal(r.usedReferences,true);assert.equal(r.referenceFallback,false);
  assert.deepEqual(h.requests,[body]);assert.deepEqual(h.events,[]);
});
test('persistent 500 returns the original failure without a retry',async()=>{
  const h=harness([[500,upstreamError],[500,upstreamError+' latest-request-id']]);
  assert.equal((await h.run()).text,upstreamError);assert.equal(h.requests.length,1);
});
test('reference fallback stops immediately on ambiguous upstream failure',async()=>{
  const h=harness([[422,referenceError],[500,upstreamError],[403,'account denied']]);
  const r=await h.run();assert.equal(r.status,500);assert.equal(r.text,upstreamError);
  assert.equal(h.requests.length,2);assert.ok(!h.requests[1].image);
});
test('network failure on fallback is not swallowed or automatically retried',async()=>{
  const h=harness([[422,referenceError],new TypeError('response connection lost')]);
  await assert.rejects(h.run(),/response connection lost/);assert.equal(h.requests.length,2);
});
test('auth, quota, invalid size, moderation and unrelated server errors do not retry',async()=>{
  for(const [status,text] of [[401,'key invalid'],[403,'denied'],[429,'quota'],
    [422,'size unsupported'],[400,'reference image rejected for safety'],[500,'internal error']]){
    const h=harness([[status,text]]);assert.equal((await h.run()).status,status);
    assert.equal(h.requests.length,1);
  }
});
test('text-only and native Gemini requests cannot use OpenAI reference fallback',async()=>{
  for(const options of [{usedReferences:false},{allowReferenceFallback:false}]){
    const h=harness([[422,referenceError]],options);
    assert.equal((await h.run()).status,422);assert.equal(h.requests.length,1);
  }
});
test('deadline includes stalled response body after headers, using a real HTTP socket',async()=>{
  let received=false;
  const server=createServer((req,res)=>{
    received=true;res.writeHead(200,{'Content-Type':'application/json'});res.flushHeaders();res.write('{"data":');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    await assert.rejects(requestImageWithRecovery({url:`http://127.0.0.1:${server.address().port}`,
      body,key:'test',timeoutMs:150}),{name:'TimeoutError'});
    assert.equal(received,true);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('deadline bounds an unanswered request',async()=>{
  const h=harness([],{timeoutMs:20,fetchImpl:()=>new Promise(()=>{})});
  await assert.rejects(h.run(),{name:'TimeoutError'});
});
test('successful first request is never repeated',async()=>{
  const h=harness([[200,'{"data":[{"b64_json":"AA=="}]}']]);
  assert.equal((await h.run()).ok,true);assert.equal(h.requests.length,1);
});
test('multipart reference fallback is opt-in and switches edits to generations without sending pixels',async()=>{
  for(const allowReferenceFallback of [false,true]){
    const original=compatibleImageRequest(body).body,requests=[];
    const result=await requestImageWithRecovery({url:'https://example.invalid/v1/images/edits',
      body:original,key:'test',usedReferences:true,allowReferenceFallback,
      fetchImpl:async(url,init)=>{
        requests.push({url,init});
        return new Response(requests.length===1?referenceError:'{}',{status:requests.length===1?422:200});
      }});
    assert.equal(requests.length,allowReferenceFallback?2:1);
    assert.equal(result.referenceFallback,allowReferenceFallback);
    assert.ok(original.has('image[]'),'original references must remain intact');
    if(allowReferenceFallback){
      assert.equal(requests[1].url,'https://example.invalid/v1/images/generations');
      assert.deepEqual(JSON.parse(requests[1].init.body),{model:body.model,prompt:body.prompt,size:body.size});
      assert.equal(requests[1].init.headers['Content-Type'],'application/json');
    }
  }
});
