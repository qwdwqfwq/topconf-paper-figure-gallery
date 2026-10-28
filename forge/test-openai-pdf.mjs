import test from 'node:test';
import assert from 'node:assert/strict';
import {requestOpenAIPdf} from './pdf-openai-api.mjs';

const base='https://api.openai.com/v1';
const summary={selectedSections:[{section:'Method',summary:'Paper method summary.'}]};
const complete=()=>new Response(JSON.stringify({status:'completed',output:[
  {type:'reasoning',summary:[]},
  {type:'message',content:[{type:'output_text',text:JSON.stringify(summary)}]}
]}));
const incomplete=()=>new Response(JSON.stringify({status:'incomplete',
  incomplete_details:{reason:'max_output_tokens'},output:[]}));
const failure=(status,code,headers={})=>new Response(JSON.stringify({error:{code,message:code}}),{status,headers});
const bodyFor=content=>({model:'gpt-6.1-sol',reasoning:{effort:'high'},
  input:[{role:'user',content}],max_output_tokens:5000});

for(const content of [
  [{type:'input_file',filename:'paper.pdf',file_data:'data:application/pdf;base64,PDF_FIXTURE'}],
  [{type:'input_text',text:'PAPER_FIXTURE'}],
  [{type:'input_image',image_url:'data:image/jpeg;base64,PIXEL_FIXTURE'}]
]) {
  test('Responses recovery preserves '+content[0].type+' and chosen reasoning/model',async()=>{
    const original=bodyFor(content),before=structuredClone(original),requests=[];
    const result=await requestOpenAIPdf(base,original,'test-key',{fetchImpl:async(url,options)=>{
      assert.equal(url,base+'/responses');
      assert.equal(options.headers.Authorization,'Bearer test-key');
      requests.push(JSON.parse(options.body));
      return requests.length===1?incomplete():complete();
    }});
    assert.deepEqual(result,summary);
    assert.equal(requests.length,2);
    assert.equal(requests[0].max_output_tokens,25000);
    assert.equal(requests[1].max_output_tokens,100000);
    assert.deepEqual(requests[1].input.slice(0,-1),original.input);
    assert.equal(requests[1].model,original.model);
    assert.deepEqual(requests[1].reasoning,original.reasoning);
    assert.deepEqual(original,before,'caller body must not be mutated');
  });
}

test('successful default-effort request needs no recovery',async()=>{
  const body=bodyFor([{type:'input_text',text:'JSON summary'}]);delete body.reasoning;
  let count=0;
  assert.deepEqual(await requestOpenAIPdf(base,body,'key',{fetchImpl:async(_url,options)=>{
    count++;assert.equal(JSON.parse(options.body).reasoning,undefined);return complete();
  }}),summary);
  assert.equal(count,1);
});

test('recovery stays within legacy model output limits',async()=>{
  for(const [model,first,second] of [['gpt-4o',16384,16384],
    ['gpt-4o-mini',16384,16384],['gpt-4o-2024-05-13',4096,4096],
    ['gpt-4.1-2025-04-14',25000,32768],['gpt-4-turbo',4096,4096]]) {
    const body=bodyFor([]);body.model=model;delete body.reasoning;
    const requests=[];
    await requestOpenAIPdf(base,body,'key',{fetchImpl:async(_url,options)=>{
      requests.push(JSON.parse(options.body));return requests.length===1?incomplete():complete();
    }});
    assert.deepEqual(requests.map(r=>r.max_output_tokens),[first,second],model);
  }
});

test('exhausted recovery cannot accept partial content or trigger other PDF channels',async()=>{
  let count=0;
  await assert.rejects(requestOpenAIPdf(base,bodyFor([]),'key',{fetchImpl:async()=>{
    count++;return incomplete();
  }}),e=>e.pdfFormatFailure&&e.truncated&&e.stopPdfFallback);
  assert.equal(count,2);
});

test('malformed final JSON receives one bounded recovery',async()=>{
  let count=0;
  await assert.rejects(requestOpenAIPdf(base,bodyFor([]),'key',{fetchImpl:async()=>{
    count++;return new Response(JSON.stringify({status:'completed',output_text:'not JSON'}));
  }}),e=>e.pdfFormatFailure);
  assert.equal(count,2);
});

test('quota, key and model permissions fail once with useful errors',async()=>{
  for(const [status,code,message] of [[429,'insufficient_quota',/额度不足/],
    [401,'invalid_api_key',/API Key/],[403,'permission_denied',/权限/],[404,'model_not_found',/模型/]]) {
    let count=0;
    await assert.rejects(requestOpenAIPdf(base,bodyFor([]),'key',{fetchImpl:async()=>{
      count++;return failure(status,code,{'x-request-id':'req_test'});
    },sleep:()=>assert.fail('must not retry permanent failures')}),e=>
      e.stopPdfFallback&&e.status===status&&message.test(e.message)&&/req_test/.test(e.message));
    assert.equal(count,1);
  }
});

test('explicit transient rate limit waits once and preserves request',async()=>{
  const requests=[],delays=[];
  const result=await requestOpenAIPdf(base,bodyFor([]),'key',{
    fetchImpl:async(_url,options)=>{
      requests.push(JSON.parse(options.body));
      return requests.length===1?failure(429,'rate_limit_exceeded',{'retry-after':'2'}):complete();
    },sleep:async ms=>delays.push(ms)
  });
  assert.deepEqual(result,summary);assert.deepEqual(delays,[2000]);
  assert.deepEqual(requests[1],requests[0]);
});

test('persistent or long rate limits stop instead of switching PDF channels',async()=>{
  for(const retryAfter of ['0','120']){
    let count=0;
    await assert.rejects(requestOpenAIPdf(base,bodyFor([]),'key',{
      fetchImpl:async()=>{count++;return failure(429,'rate_limit_exceeded',{'retry-after':retryAfter});},
      sleep:async()=>{}
    }),e=>e.stopPdfFallback&&/限流/.test(e.message));
    assert.equal(count,retryAfter==='0'?2:1);
  }
});

test('content filter failure is not mistaken for a token limit',async()=>{
  let count=0;
  await assert.rejects(requestOpenAIPdf(base,bodyFor([]),'key',{fetchImpl:async()=>{
    count++;return new Response(JSON.stringify({status:'incomplete',incomplete_details:{reason:'content_filter'}}));
  }}),e=>e.stopPdfFallback&&/content_filter/.test(e.message));
  assert.equal(count,1);
});

test('refuses to send credentials to an unofficial host',async()=>{
  for(const url of ['https://api.openai.com.evil.example/v1','http://api.openai.com/v1']){
    await assert.rejects(requestOpenAIPdf(url,bodyFor([]),'key',{fetchImpl:()=>assert.fail('must not send')}),/必须使用/);
  }
});
