import assert from 'node:assert/strict';
import {test} from 'node:test';
import {requestChat,pdfResponseJSON,pdfRepairBody} from './chat-api.mjs';

test('504 recovery preserves reference pixels, model and reasoning settings',async()=>{
  const options={method:'POST',body:JSON.stringify({model:'gpt-6-astra',reasoning_effort:'high',
    messages:[{role:'user',content:[{type:'image_url',image_url:{url:'data:image/png;base64,AA=='}}]}]})};
  const requests=[];
  const result=await requestChat('https://example.invalid',options,5000,async(_,init)=>{
    requests.push(init.body);
    return new Response(requests.length===1?'service timeout':'ok',{status:requests.length===1?504:200});
  });
  assert.equal(result.status,200);assert.deepEqual(requests,[options.body,options.body]);
});
test('authentication, request rejection and ambiguous network errors are not retried',async()=>{
  for(const status of [400,401,403,422,429]){
    let calls=0;
    const result=await requestChat('https://example.invalid',{},1000,async()=>{
      calls++;return new Response('rejected',{status});
    });
    assert.equal(result.status,status);assert.equal(calls,1);
  }
  let calls=0;
  await assert.rejects(requestChat('https://example.invalid',{},1000,async()=>{
    calls++;throw new TypeError('connection lost');
  }),/connection lost/);
  assert.equal(calls,1);
});
test('PDF normalizes chat, Responses and Anthropic final content',()=>{
  const result={selectedSections:[{section:'Method',summary:'Encoder followed by a decoder.'}]};
  const text=JSON.stringify(result);
  for(const data of [
    {choices:[{message:{content:'```json\n'+text+'\n```'},finish_reason:'stop'}]},
    {output:[{content:[{type:'output_text',text}]}]},
    {content:[{type:'text',text}]},
    {choices:[{message:{content:[{type:'text',text}]}}]}
  ]) assert.deepEqual(pdfResponseJSON(data),result);
});
test('empty, truncated, malformed or wrong-schema PDF results cannot be accepted as paper content',()=>{
  for(const data of [
    {choices:[{message:{content:'',reasoning_content:'{"selectedSections":[{"summary":"do not use reasoning"}]}'}}]},
    {choices:[{finish_reason:'length',message:{content:'{"selectedSections":[{"summary":"partial"}]}'}}]},
    {choices:[{message:{content:'not JSON'}}]},
    {choices:[{message:{content:'{"nodes":[]}'}}]},
  ]) assert.throws(()=>pdfResponseJSON(data),e=>e.pdfFormatFailure===true);
});
test('format recovery increases reasoning-inclusive budget without modifying paper or input body',()=>{
  const body={model:'deepseek-v4.1-flash',max_tokens:5000,reasoning_effort:'high',
    messages:[{role:'user',content:'Original paper'}]};
  const result=pdfRepairBody(body);
  assert.equal(result.max_tokens,12000);assert.equal(result.reasoning_effort,'high');
  assert.deepEqual(result.messages[0],body.messages[0]);assert.equal(body.messages.length,1);
  const gpt=pdfRepairBody({...body,max_tokens:undefined,max_completion_tokens:8192});
  assert.equal(gpt.max_completion_tokens,16384);
});
