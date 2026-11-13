import test from 'node:test';
import assert from 'node:assert/strict';
import {reconstructionResponsesBody,fetchReconstructionResponses,usesReconstructionResponses} from './infistar-reconstruction-responses.mjs';

const body={model:'gpt-6-astra',max_completion_tokens:128000,reasoning_effort:'high',messages:[{role:'system',content:'Exact system'},{role:'user',content:[{type:'text',text:'Exact prompt'},{type:'image_url',image_url:{url:'data:image/png;base64,original',detail:'high'}}]}]};
const scene='{"nodes":[{"text":"中文图形"}]}';
const completed={id:'r1',model:body.model,status:'completed',usage:{input_tokens:5,output_tokens:20},output:[{type:'reasoning'},{type:'message',status:'completed',content:[{type:'output_text',text:scene}]}]};
const event=x=>'data: '+JSON.stringify(x)+'\r\n\r\n';
const stream=event({type:'response.output_text.delta',output_index:1,content_index:0,delta:scene})+event({type:'response.completed',response:completed});
const options={method:'POST',body:JSON.stringify(body)};
function fixture(text,{status=200,type='text/event-stream',keepOpen=false}={}){
  let cancelled=false;
  const bytes=new TextEncoder().encode(text);
  const response=new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=3)c.enqueue(bytes.slice(i,i+3));if(!keepOpen)c.close();},cancel(){cancelled=true;}}),{status,headers:{'Content-Type':type}});
  return {fetch:async()=>response,cancelled:()=>cancelled};
}
test('routing is limited to Infistar GPT whole-image reconstruction',()=>{
  assert.equal(usesReconstructionResponses('infistar','gpt-6-astra',true),true);
  for(const args of [['infistar','gpt-6-astra',false],['nonelinear','gpt-6-astra',true],['infistar','gemini-3.1-pro-preview',true]])assert.equal(usesReconstructionResponses(...args),false);
});
test('preserves exact prompt, original image, detail, token budget and reasoning effort',()=>{
  assert.deepEqual(reconstructionResponsesBody(body),{model:body.model,stream:true,max_output_tokens:128000,reasoning:{effort:'high'},instructions:'Exact system',input:[{role:'user',content:[{type:'input_text',text:'Exact prompt'},{type:'input_image',image_url:'data:image/png;base64,original',detail:'high'}]}]});
  const {reasoning_effort,...defaultBody}=body;
  assert.equal('reasoning' in reconstructionResponsesBody(defaultBody),false);
});
test('handles UTF8/CRLF byte boundaries and completes without waiting for connection close',async()=>{
  const f=fixture(stream,{keepOpen:true});
  const r=await fetchReconstructionResponses('/responses',options,Infinity,f.fetch);
  assert.equal(JSON.parse(r.text).choices[0].message.content,scene);
  assert.equal(JSON.parse(r.text).usage.completion_tokens,20);
  assert.equal(f.cancelled(),true);
});
test('rejects truncated stream even when text is valid JSON',async()=>{
  await assert.rejects(fetchReconstructionResponses('/responses',options,Infinity,fixture(event({type:'response.output_text.delta',output_index:1,content_index:0,delta:scene})+'data: [DONE]\n\n').fetch),/提前中断/);
});
test('rejects failed and incomplete terminal events',async()=>{
  for(const type of ['response.failed','response.incomplete','error'])await assert.rejects(fetchReconstructionResponses('/responses',options,Infinity,fixture(event({type,response:{error:{message:'upstream failed'}}})).fetch),/重建失败/);
});
test('rejects corrupted text and malformed events',async()=>{
  await assert.rejects(fetchReconstructionResponses('/responses',options,Infinity,fixture(stream.replace('中文图形','wrong')).fetch),/不一致/);
  await assert.rejects(fetchReconstructionResponses('/responses',options,Infinity,fixture('data: {broken}\n\n').fetch),SyntaxError);
});
test('preserves HTTP error body and accepts a completed buffered Responses envelope',async()=>{
  const r=await fetchReconstructionResponses('/responses',options,Infinity,fixture('{"error":"capacity"}',{status:500,type:'application/json'}).fetch);
  assert.equal(r.status,500);assert.equal(r.ok,false);assert.equal(r.text,'{"error":"capacity"}');
  const success=await fetchReconstructionResponses('/responses',options,Infinity,fixture(JSON.stringify(completed),{type:'application/json'}).fetch);
  assert.equal(JSON.parse(success.text).choices[0].message.content,scene);
});
test('propagates caller cancellation',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(fetchReconstructionResponses('/responses',{...options,signal:controller.signal},Infinity,async(url,opts)=>{opts.signal.throwIfAborted();}),{name:'AbortError'});
});
