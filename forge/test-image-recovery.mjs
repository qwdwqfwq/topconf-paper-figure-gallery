import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'node:http';
import {requestImageWithRecovery} from './image-api.mjs';

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
test('screenshot 500 retries once with original references',async()=>{
  const h=harness([[500,upstreamError],[200,'{}']]);
  const r=await h.run();
  assert.equal(r.usedReferences,true);assert.equal(r.referenceFallback,false);
  assert.deepEqual(h.requests,[body,body]);assert.deepEqual(h.events,['upstream']);
});
test('persistent 500 stops after two requests and returns latest error',async()=>{
  const h=harness([[500,upstreamError],[500,upstreamError+' latest-request-id']]);
  assert.match((await h.run()).text,/latest-request-id/);assert.equal(h.requests.length,2);
});
test('combined recovery is bounded to three attempts and reports final failure',async()=>{
  const h=harness([[422,referenceError],[500,upstreamError],[403,'account denied']]);
  const r=await h.run();assert.equal(r.status,403);assert.equal(r.text,'account denied');
  assert.equal(h.requests.length,3);assert.ok(!h.requests[2].image);
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
test('deadline includes recovery backoff and prevents a later request',async()=>{
  const h=harness([[500,upstreamError]],{timeoutMs:20,sleep:()=>new Promise(()=>{})});
  await assert.rejects(h.run(),{name:'TimeoutError'});assert.equal(h.requests.length,1);
});
test('successful first request is never repeated',async()=>{
  const h=harness([[200,'{"data":[{"b64_json":"AA=="}]}']]);
  assert.equal((await h.run()).ok,true);assert.equal(h.requests.length,1);
});
