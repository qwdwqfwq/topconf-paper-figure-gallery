import assert from 'node:assert/strict';
import {test} from 'node:test';
import {requestStep3ImageStream,step3StreamingRequest} from './step3-image-stream.mjs';
import {geminiImageRequest,geminiImageResult,compatibleImageRequest} from './image-api.mjs';

const body={model:'gpt-image-2',prompt:'private paper 图形',size:'2752x1536',quality:'high',image:['data:image/png;base64,AA==']};
const complete={type:'image_generation.completed',b64_json:'ZmluYWw=',output_format:'jpeg'};
const event=(value,name='')=>(name?'event: '+name+'\r\n':'')+'data: '+JSON.stringify(value)+'\r\n\r\n';
function response(text,{status=200,type='text/event-stream',chunk=7}={}){
  const bytes=new TextEncoder().encode(text);let offset=0;
  return new Response(new ReadableStream({pull(controller){
    if(offset===bytes.length){controller.close();return;}
    controller.enqueue(bytes.slice(offset,offset+=Math.min(chunk,bytes.length-offset)));
  }}),{status,headers:{'content-type':type,'x-request-id':'trace-test'}});
}
async function run(text,options={}){
  let calls=0;
  const result=await requestStep3ImageStream({url:'https://example.invalid/v1/images/generations',body,key:'offline-secret',
    fetchImpl:async()=>{calls++;return response(text,options);},...options});
  assert.equal(calls,1);return result;
}

test('stream-capable providers preserve every generation parameter',()=>{
  for(const base of ['https://infistar.cc/v1','https://api.openai.com/v1','https://api.nonelinear.com.cn.example.invalid/v1']){
    const result=step3StreamingRequest(base+'/images/generations',body);
    assert.deepEqual(result.body,{...body,stream:true});assert.equal(result.url,base+'/images/generations');
  }
  assert.equal(body.stream,undefined);
});

test('NoneLinear upstream and relays omit stream entirely, preserve 4K and three references',async()=>{
  const parameters={...body,model:'gemini-3-pro-image-preview',size:'4K',aspect_ratio:'16:9',image:['ref1','ref2','ref3']};
  for(const base of ['https://api.nonelinear.com.cn/v1','https://gallery-nonelinear-relay.lixiao-gallery.workers.dev/v1','http://127.0.0.1:1234/api/nonelinear/v1','http://localhost:1234/api/nonelinear/v1']){
    for(const stream of [true,false,undefined]){
      const original={...parameters,stream},result=step3StreamingRequest(base+'/images/generations',original);
      assert.deepEqual(result.body,parameters);assert.equal(Object.hasOwn(result.body,'stream'),false);
      assert.equal(original.stream,stream);
    }
    let calls=0;
    const text=JSON.stringify({data:[{url:'https://example.invalid/final-4K.png'}]});
    const result=await requestStep3ImageStream({url:base+'/images/generations',body:parameters,key:'offline-secret',fetchImpl:async(url,init)=>{
      calls++;assert.deepEqual(JSON.parse(init.body),parameters);
      return response(text,{type:'application/json',chunk:1});
    }});
    assert.equal(calls,1);assert.equal(result.text,text);assert.equal(result.streaming,false);
  }
  const form=new FormData();form.append('model',parameters.model);form.append('image[]',new Blob(['pixels']), 'reference.png');form.append('stream','false');
  const result=step3StreamingRequest('https://api.nonelinear.com.cn/v1/images/edits',form);
  assert.equal(result.body.has('stream'),false);assert.equal(form.get('stream'),'false');
  assert.equal(result.body.get('image[]').name,'reference.png');
});

test('Gemini changes only transport endpoint/query, keeping all references and settings',()=>{
  const original=geminiImageRequest('https://infistar.cc/v1','gemini-3.1-flash-image',body.prompt,body.image,{aspectRatio:'16:9',imageSize:'2K'});
  const result=step3StreamingRequest(original.base+original.endpoint,original.body);
  assert.equal(result.url,'https://infistar.cc/v1beta/models/gemini-3.1-flash-image:streamGenerateContent?alt=sse');
  assert.strictEqual(result.body,original.body);assert.equal(result.nativeGemini,true);
});

test('OpenAI multipart editing preserves the files and fields without mutating caller data',async()=>{
  const original=compatibleImageRequest(body,'https://api.openai.com/v1').body;
  const result=step3StreamingRequest('https://api.openai.com/v1/images/edits',original);
  assert.equal(original.has('stream'),false);assert.equal(result.body.get('stream'),'true');
  for(const [name,value] of original){
    const copy=result.body.get(name);
    if(typeof value==='string')assert.equal(copy,value);
    else{assert.equal(copy.name,value.name);assert.equal(copy.type,value.type);assert.deepEqual(await copy.arrayBuffer(),await value.arrayBuffer());}
  }
});

test('SSE survives every byte boundary, CRLF, comments, multiline JSON, UTF-8 and DONE',async()=>{
  const text=': 心跳\r\nid: 123\r\n\r\n'+'event: image_generation.completed\r\ndata: {"b64_json":"ZmluYWw=",\r\ndata: "output_format":"jpeg","note":"图形"}\r\n\r\ndata: [DONE]\r\n\r\n';
  for(const chunk of [1,2,7,1000]){
    const result=await run(text,{chunk});
    assert.equal(result.streaming,true);assert.equal(result.events,1);
    assert.deepEqual(JSON.parse(result.text),{data:[{b64_json:'ZmluYWw=',mimeType:'image/jpeg'}]});
  }
});

test('previews are discarded and only generation/edit completion is accepted',async()=>{
  for(const type of ['image_generation','image_edit']){
    const result=await run(event({type:type+'.partial_image',b64_json:'cHJldmlldw==',partial_image_index:0})+event({...complete,type:type+'.completed'}));
    assert.equal(JSON.parse(result.text).data[0].b64_json,complete.b64_json);
  }
  await assert.rejects(run(event({type:'image_generation.partial_image',b64_json:'preview'})+'data: [DONE]\n\n'),{code:'IMAGE_STREAM_INCOMPLETE'});
});

test('Gemini retains image from first event when final STOP contains only empty text',async()=>{
  const native=geminiImageRequest('https://infistar.cc/v1','gemini-3.1-flash-image',body.prompt);
  const first={candidates:[{index:0,content:{parts:[{thought:true,inlineData:{mimeType:'image/png',data:'thought'}},{inline_data:{mime_type:'image/jpeg',data:'final'}}]}}]};
  const last={candidates:[{index:0,finishReason:'STOP',content:{parts:[{text:''}]}}]};
  const result=await run(event(first)+event(last),{url:native.base+native.endpoint,body:native.body});
  assert.deepEqual(geminiImageResult(JSON.parse(result.text)),{mimeType:'image/jpeg',b64_json:'final'});
  assert.equal(result.events,2);
});

test('Gemini STOP without an image keeps its original explicit no-image diagnosis',async()=>{
  const result=await run(event({candidates:[{finishReason:'STOP',content:{parts:[{text:'No image'}]}}]}),{url:'https://infistar.cc/v1beta/models/gemini:generateContent'});
  assert.throws(()=>geminiImageResult(JSON.parse(result.text)),{code:'GEMINI_NO_IMAGE',reason:'STOP'});
});

test('final event can end at EOF; legacy image responses in SSE are supported',async()=>{
  const final=await run('data: '+JSON.stringify(complete));
  assert.equal(JSON.parse(final.text).data[0].b64_json,complete.b64_json);
  const legacy=await run(event({data:[{url:'https://example.invalid/final.png'}]}));
  assert.equal(JSON.parse(legacy.text).data[0].url,'https://example.invalid/final.png');
});

test('JSON-only providers use the same reader and never trigger a second generation',async()=>{
  const text=JSON.stringify({data:[{b64_json:'final'}],note:'图形'});
  const result=await run(text,{type:'application/json',chunk:1});
  assert.equal(result.text,text);assert.equal(result.streaming,false);
  const detected=await run(event(complete),{type:'application/octet-stream',chunk:1});
  assert.equal(detected.streaming,true);
  for(const prefix of ['id: trace\n','retry: 1000\n']){
    const identified=await run(prefix+event(complete),{type:'application/octet-stream',chunk:1});
    assert.equal(identified.streaming,true);
  }
});

test('HTTP 500 is preserved verbatim with safe request/transport metadata',async()=>{
  const text=JSON.stringify({error:{code:'do_request_failed',message:'暂时供应不足，请稍后重试'}});
  const result=await run(text,{status:500,type:'application/json'});
  assert.equal(result.ok,false);assert.equal(result.status,500);assert.equal(result.text,text);
  assert.equal(result.transport.stage,'response_received');assert.equal(result.requestId,'trace-test');
  assert.doesNotMatch(JSON.stringify([result.request,result.transport]),/offline-secret|private paper|AA==/);
});

test('stream errors, malformed events and missing completion never expose partial output or private text',async()=>{
  for(const text of [event(complete)+event({error:{message:'offline-secret private paper'}}),
    event({type:'image_generation.failed'}),'data: {broken}\n\n',': heartbeat\n\n',event({candidates:[{content:{parts:[{inlineData:{data:'incomplete'}}]}}]})]){
    await assert.rejects(run(text),error=>{
      assert.match(error.code,/^IMAGE_STREAM_/);assert.doesNotMatch(error.message,/offline-secret|private paper|incomplete"/);return true;
    });
  }
  await assert.rejects(run(event({candidates:[{content:{parts:[{inlineData:{data:'incomplete'}}]}}]}),{url:'https://infistar.cc/v1beta/models/gemini:generateContent'}),{code:'IMAGE_STREAM_INCOMPLETE'});
});

test('late safety rejection is not hidden by a previously received Gemini image',async()=>{
  const text=event({candidates:[{content:{parts:[{inlineData:{data:'pixels'}}]}}]})+event({candidates:[{finishReason:'SAFETY'}]});
  await assert.rejects(run(text,{url:'https://infistar.cc/v1beta/models/gemini:generateContent'}),{code:'IMAGE_STREAM_UPSTREAM_ERROR'});
});

test('network/body disconnect does not retry a potentially billed generation',async()=>{
  let calls=0;
  for(const atHeaders of [true,false]){
    await assert.rejects(requestStep3ImageStream({url:'https://example.invalid/v1/images/generations',body,key:'offline-secret',fetchImpl:async()=>{
      calls++;
      if(atHeaders)throw new TypeError('connection lost');
      return new Response(new ReadableStream({start(controller){controller.error(new TypeError('body lost'));}}));
    }}),error=>{assert.equal(error.imageDiagnostics.stage,atHeaders?'waiting_response':'reading_response');return true;});
  }
  assert.equal(calls,2);
});

test('deadline includes stalled response bodies, not just response headers',async()=>{
  await assert.rejects(requestStep3ImageStream({url:'https://example.invalid/v1/images/generations',body,key:'offline-secret',timeoutMs:20,
    fetchImpl:async(_,init)=>new Response(new ReadableStream({start(controller){init.signal.addEventListener('abort',()=>controller.error(new DOMException('aborted','AbortError')));}}))}),{name:'TimeoutError'});
});

test('transport diagnostics allow only known error names/codes and redact request IDs',async()=>{
  const received=await requestStep3ImageStream({url:'https://example.invalid/images/generations',body,key:'offline-secret',
    fetchImpl:async()=>new Response(event(complete),{headers:{'content-type':'text/event-stream','x-request-id':'offline-secret Bearer secret sk-otherkey'}})});
  assert.doesNotMatch(JSON.stringify(received.transport),/offline-secret|Bearer secret|sk-otherkey/);
  for(const code of ['ECONNRESET','offline-secret private paper']){
    await assert.rejects(requestStep3ImageStream({url:'https://example.invalid/images/generations',body,key:'offline-secret',
      fetchImpl:async()=>{const error=new Error('private paper');error.name='offline-secret';error.cause={code};throw error;}}),error=>{
      assert.equal(error.imageDiagnostics.errorName,'Error');
      assert.equal(error.imageDiagnostics.errorCode,code==='ECONNRESET'?code:undefined);
      assert.doesNotMatch(JSON.stringify(error.imageDiagnostics),/offline-secret|private paper/);return true;
    });
  }
});
