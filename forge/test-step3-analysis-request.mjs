import test from 'node:test';
import assert from 'node:assert/strict';
import {requestStep3Analysis} from './step3-analysis-request.mjs';

const config={model:'gemini-4-carbon',url:'https://relay.example/v1/chat/completions?key=fixture-secret',key:'fixture-secret'};
const invoke=request=>requestStep3Analysis({...config,request});

test('transport failure retains the original cause and never probes or repeats',async()=>{
  const original=new TypeError('Failed to fetch fixture-secret');let calls=0;
  await assert.rejects(invoke(async()=>{calls++;throw original;}),error=>{
    assert.equal(error.cause,original);
    assert.match(error.message,/transport.*gemini-4-carbon.*Failed to fetch/);
    assert.doesNotMatch(error.message,/fixture-secret|\?key=/);
    assert.equal(error.analysisDiagnostic.kind,'transport');return true;
  });
  assert.equal(calls,1);
});

test('HTTP 200 relay error keeps the upstream status, message and request ID',async()=>{
  await assert.rejects(invoke(async()=>Response.json({error:{message:'NoneLinear upstream HTTP 524',type:'upstream_http_error',code:524,request_id:'req-fixture'}})),error=>{
    assert.match(error.message,/HTTP 200.*upstream=524.*req-fixture.*NoneLinear upstream HTTP 524/);
    assert.equal(error.analysisDiagnostic.httpStatus,200);
    assert.equal(error.analysisDiagnostic.upstreamCode,'524');return true;
  });
});

test('HTTP errors redact credentials and preserve provider details',async()=>{
  await assert.rejects(invoke(async()=>Response.json({error:{message:'Invalid key fixture-secret Bearer token-example sk-example-secret',code:'invalid_api_key'}},{status:401,headers:{'x-request-id':'header-fixture'}})),error=>{
    assert.match(error.message,/HTTP 401.*invalid_api_key.*header-fixture.*Invalid key/);
    assert.doesNotMatch(error.message,/fixture-secret|token-example|sk-example-secret/);return true;
  });
});

test('truncated response reads retain the read error',async()=>{
  const original=new TypeError('terminated');
  await assert.rejects(invoke(async()=>({status:200,text:async()=>{throw original;}})),error=>{
    assert.equal(error.cause,original);assert.equal(error.analysisDiagnostic.kind,'response-read');assert.match(error.message,/terminated/);return true;
  });
});

test('invalid and empty responses fail before analysis is treated as successful',async()=>{
  await assert.rejects(invoke(async()=>new Response('<h1>Gateway unavailable</h1>')),/invalid-response.*Gateway unavailable/);
  await assert.rejects(invoke(async()=>Response.json({choices:[{message:{content:''}}]})),/empty-response/);
});

test('OpenAI and Anthropic analysis bodies are returned unchanged; length handling stays with the caller',async()=>{
  for(const data of [
    {choices:[{message:{content:'{"layout":"rows"}'},finish_reason:'stop'}]},
    {content:[{type:'text',text:'{"layout":"rows"}'}]},
    {choices:[{message:{content:''},finish_reason:'length'}]}
  ])assert.deepEqual(await invoke(async()=>Response.json(data)),data);
});

test('timeout and cancellation remain distinguishable',async()=>{
  for(const [name,kind] of [['TimeoutError','timeout'],['AbortError','cancelled']]){
    await assert.rejects(invoke(async()=>{throw new DOMException('fixture',name);}),error=>error.analysisDiagnostic.kind===kind);
  }
});

test('body disconnect after HTTP headers retains status and request ID without claiming CORS failure',async()=>{
  let calls=0;
  await assert.rejects(invoke(async()=>{
    calls++;
    return new Response(new ReadableStream({pull(c){c.error(new TypeError('connection reset fixture-secret'));}}),{status:502,headers:{'x-oneapi-request-id':'read-fixture'}});
  }),error=>{
    assert.equal(error.analysisDiagnostic.kind,'response-read');
    assert.equal(error.analysisDiagnostic.httpStatus,502);
    assert.equal(error.analysisDiagnostic.requestId,'read-fixture');
    assert.match(error.message,/HTTP 502.*read-fixture/);
    assert.doesNotMatch(error.message,/未取得 HTTP|CORS|fixture-secret/);
    return true;
  });
  assert.equal(calls,1);
});
