import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareChat,bufferedChat,waitingChat} from './chat-stream.mjs';
const headers={'Content-Type':'text/event-stream','Access-Control-Allow-Origin':'https://qwdwqfwq.github.io'};
test('headers and heartbeat precede upstream headers; upstream failure remains an error envelope',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r);
 const response=waitingChat(pending,headers,5),reader=response.body.getReader();
 assert.match(response.headers.get('Content-Type'),/application\/json/);
 assert.equal(new TextDecoder().decode((await reader.read()).value),' ');
 assert.equal(new TextDecoder().decode((await reader.read()).value),' ');
 resolve(new Response('error code: 524',{status:524}));
 let text='';for(;;){const {done,value}=await reader.read();if(done)break;text+=new TextDecoder().decode(value);}
 assert.equal(JSON.parse(text).error.code,524);
});
function sse(chunks){const bytes=new TextEncoder().encode(chunks);return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=3)c.enqueue(bytes.slice(i,i+3));c.close();}}),{headers});}
test('only adds stream flag; original dimensions, token budget, model and prompt survive',()=>{
 const request={model:'vision',max_tokens:128000,temperature:.2,messages:[{role:'user',content:[{type:'image_url',image_url:{url:'data:image/jpeg;base64,/9j/',detail:'high'}},{type:'text',text:'original prompt'}]}]};
 assert.deepEqual(JSON.parse(prepareChat(JSON.stringify(request)).body),{...request,stream:true});
 assert.equal(prepareChat(JSON.stringify({...request,stream:true})).aggregate,false);
});
test('chunked UTF8 SSE aggregates content, reasoning, tool calls, usage and CORS into JSON',async()=>{
 const events=[{id:'test',model:'vision',choices:[{index:0,delta:{role:'assistant',reasoning_content:'思考',content:'你',tool_calls:[{index:0,id:'t',type:'function',function:{name:'draw',arguments:'{'}}]}}]},
 {choices:[{index:0,delta:{content:'好',tool_calls:[{index:0,function:{arguments:'}'}}]},finish_reason:'stop'}]}, {choices:[],usage:{total_tokens:50}}];
 const response=bufferedChat(sse(events.map(e=>'data: '+JSON.stringify(e)+'\r\n\r\n').join('')+'data: [DONE]\r\n\r\n'),headers);
 assert.match(response.headers.get('Content-Type'),/application\/json/);
 assert.equal(response.headers.get('Access-Control-Allow-Origin'),headers['Access-Control-Allow-Origin']);
 const result=await response.json();assert.equal(result.choices[0].message.content,'你好');assert.equal(result.choices[0].message.reasoning_content,'思考');assert.deepEqual(result.choices[0].message.tool_calls[0].function,{name:'draw',arguments:'{}'});assert.equal(result.usage.total_tokens,50);
});
test('upstream HTTP errors remain errors',async()=>{const r=bufferedChat(new Response('quota',{status:429}),headers);assert.equal(r.status,429);assert.equal(await r.text(),'quota');});

test('nullable provider delta fields aggregate through the gallery JSON transport',async()=>{
 for(const nullable of [{function_call:null},{tool_calls:null},{function_call:null,tool_calls:null}]){
  const events=[
   {id:'nullable-provider',choices:[{index:0,delta:{role:'assistant',content:'',...nullable},finish_reason:null}]},
   {choices:[{index:0,delta:{content:'{"ok":',reasoning_content:null,...nullable},finish_reason:null}]},
   {choices:[{index:0,delta:{content:'true}',...nullable},finish_reason:'stop'}]},
   {choices:[],usage:{total_tokens:23}},
  ];
  const payload=events.map(e=>'data: '+JSON.stringify(e)+'\r\n\r\n').join('')+'data: [DONE]\r\n\r\n';
  const result=await waitingChat(Promise.resolve(sse(payload)),headers).json();
  assert.equal(result.error,undefined);
  assert.deepEqual(JSON.parse(result.choices[0].message.content),{ok:true});
  assert.equal(result.choices[0].finish_reason,'stop');
  assert.equal(result.usage.total_tokens,23);
  assert.equal(Object.hasOwn(result.choices[0].message,'tool_calls'),false);
  assert.equal(Object.hasOwn(result.choices[0].message,'function_call'),false);
 }
});

test('nullable delta fields do not interfere with legacy function-call fragments',async()=>{
 const events=[
  {choices:[{index:0,delta:{function_call:null,tool_calls:null}}]},
  {choices:[{index:0,delta:{function_call:{name:'lookup',arguments:'{"a":'},tool_calls:null}}]},
  {choices:[{index:0,delta:{function_call:{arguments:'1}'},tool_calls:null},finish_reason:'function_call'}]},
 ];
 const result=await bufferedChat(sse(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')+'data: [DONE]\n\n'),headers).json();
 assert.equal(result.error,undefined);
 assert.deepEqual(result.choices[0].message.function_call,{name:'lookup',arguments:'{"a":1}'});
 assert.equal(result.choices[0].finish_reason,'function_call');
});
test('truncated or error SSE is never accepted as a completed response',async()=>{
 for(const payload of ['data: {"choices":[{"index":0,"delta":{"content":"partial"}}]}\n\n','data: {"error":{"message":"failure"}}\n\n'])assert.equal((await bufferedChat(sse(payload),headers).json()).error.type,'upstream_stream_error');
});
test('JSON whitespace heartbeats keep a slow response active and cancellation reaches upstream',async()=>{
 let cancelled=false;const upstream=new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers});
 const response=bufferedChat(upstream,headers,5), reader=response.body.getReader();
 assert.equal(new TextDecoder().decode((await reader.read()).value),' ');
 assert.equal(new TextDecoder().decode((await reader.read()).value),' ');
 await reader.cancel();assert.equal(cancelled,true);
});

const event=(content,finish)=>'data: '+JSON.stringify({id:'test-id',choices:[{index:0,delta:{content},finish_reason:finish}]})+'\n\ndata: [DONE]\n\n';
test('DONE never substitutes for finish_reason, including role-only and partial SVG streams',async()=>{
 for(const content of [null,'','<svg><g>']){
  const data=await bufferedChat(sse(event(content,null)),headers).json();
  assert.equal(data.error.code,'incomplete_stream');assert.equal(data.choices,undefined);
 }
 assert.equal((await bufferedChat(sse(event('','stop')),headers).json()).error.code,'empty_completion');
});
test('incomplete paid request is never automatically resubmitted',async()=>{
 let attempts=0;
 const response=waitingChat(async()=>sse(++attempts<3?event('<svg>',null):event('<svg></svg>','stop')),headers,5);
 const data=await response.json();assert.equal(attempts,1);assert.equal(data.choices,undefined);assert.equal(data.error.code,'incomplete_stream');assert.equal(data.error.attempts,1);
});
test('incomplete completion retains its upstream request ID after one submission',async()=>{
 let calls=0;const data=await waitingChat(async()=>{calls++;const response=sse(event(null,null));response.headers.set('x-request-id','original-request');return response;},headers,5).json();
 assert.equal(calls,1);assert.equal(data.error.code,'incomplete_stream');assert.equal(data.error.attempts,1);assert.equal(data.error.request_id,'original-request');
});
test('quota, malformed SSE, length and refusal are not replayed',async()=>{
 for(const make of [()=>new Response('quota',{status:429}),()=>sse('data: broken\n\n'),()=>sse(event('<svg>','length')),()=>sse('data: '+JSON.stringify({choices:[{delta:{refusal:'refused'},finish_reason:'stop'}]})+'\n\n')]){
  let calls=0;await waitingChat(async()=>{calls++;return make();},headers,5).json();assert.equal(calls,1);
 }
});
test('cancellation aborts a pending upstream request and prevents retries',async()=>{
 let signal,calls=0;
 const response=waitingChat(s=>{signal=s;calls++;return new Promise((resolve,reject)=>s.addEventListener('abort',()=>reject(new Error('cancelled'))));},headers,5);
 const reader=response.body.getReader();await reader.read();await reader.cancel();
 assert.equal(signal.aborted,true);await new Promise(r=>setTimeout(r,20));assert.equal(calls,1);
});
test('cancellation during upstream body reading cancels that body without retry',async()=>{
 let calls=0,cancelled=false;
 const response=waitingChat(async()=>{calls++;return new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers});},headers,5);
 const reader=response.body.getReader();await reader.read();await new Promise(r=>setTimeout(r,10));await reader.cancel();await new Promise(r=>setTimeout(r,10));assert.equal(cancelled,true);assert.equal(calls,1);
});

test('provider timeout and quota errors preserve details without a second paid submission',async()=>{
 for(const message of ['The read operation timed out','quota exceeded']){
  let calls=0;const data=await waitingChat(async()=>{calls++;return sse(calls===1?'data: '+JSON.stringify({type:'error',message,code:500})+'\n\ndata: [DONE]\n\n':event('<svg></svg>','stop'));},headers,5).json();
  assert.equal(calls,1);assert.equal(data.choices,undefined);assert.equal(data.error.message,message);assert.equal(data.error.code,500);assert.equal(data.error.attempts,1);
 }
});

test('HTTP JSON, wrapped plaintext and SSE errors preserve provider diagnostics',async()=>{
 const detail={message:'Image processing blocked due to content policy violation.',type:'invalid_request_error',param:'input',code:'content_policy_violation'};
 const wrapped="请求格式错误或输入不符合安全审查：Error code: 400 - {'error': {'message': 'Image processing blocked due to content policy violation.', 'type': 'invalid_request_error', 'param': 'input', 'code': 'content_policy_violation'}}";
 for(const make of [()=>new Response(JSON.stringify({error:detail}),{status:400}),()=>new Response(wrapped,{status:400}),()=>sse('data: '+JSON.stringify({error:detail})+'\n\n')]){
  let calls=0;const data=await waitingChat(()=>{calls++;const response=make();response.headers.set('x-request-id','policy-request');return response;},headers,5).json();
  assert.equal(calls,1);assert.equal(data.error.code,detail.code);assert.equal(data.error.type,detail.type);assert.equal(data.error.param,'input');assert.match(data.error.message,/Image processing blocked/);assert.equal(data.error.request_id,'policy-request');assert.equal(data.error.attempts,1);
 }
});

test('rate limit retains HTTP status and Retry-After without replay',async()=>{
 let calls=0;const data=await waitingChat(()=>{calls++;return new Response(JSON.stringify({error:{message:'wait for capacity',code:'rate_limit_exceeded'}}),{status:429,headers:{'retry-after':'28','x-request-id':'limited'}});},headers,5).json();
 assert.equal(calls,1);assert.equal(data.error.status,429);assert.equal(data.error.code,'rate_limit_exceeded');assert.equal(data.error.retry_after,'28');assert.equal(data.error.request_id,'limited');
});

test('bounded diagnostics redact bearer keys and do not forward provider objects',async()=>{
 let cancelled=false;const payload=JSON.stringify({error:{message:'Bearer secret-value sk-example-secret '+ 'x'.repeat(30000),extra:'private'}});
 const response=new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(payload));},cancel(){cancelled=true;}}),{status:400});
 const data=await waitingChat(Promise.resolve(response),headers,5).json();
 assert.equal(cancelled,true);assert.ok(data.error.message.length<=4096);assert.doesNotMatch(data.error.message,/secret-value|sk-example-secret/);assert.equal(data.error.extra,undefined);
});

test('network failure and empty completion never reissue a paid request',async()=>{
 for(const make of [()=>{throw new TypeError('fetch failed');},()=>sse(event('','stop'))]){
  let calls=0;const data=await waitingChat(()=>{calls++;return make();},headers,5).json();assert.equal(calls,1);assert.equal(data.error.attempts,1);assert.equal(data.choices,undefined);
 }
});

test('an interrupted HTTP error body retains status and request ID without replay',async()=>{
 let calls=0;
 const data=await waitingChat(()=>{
  calls++;
  return new Response(new ReadableStream({pull(c){c.error(new TypeError('connection reset'));}}),{status:504,headers:{'x-request-id':'broken-error-body'}});
 },headers,5).json();
 assert.equal(calls,1);assert.equal(data.error.status,504);assert.equal(data.error.code,504);assert.equal(data.error.body_read_failed,true);assert.equal(data.error.request_id,'broken-error-body');
});

test('DONE finishes without socket EOF or a settled cancellation, but still requires finish_reason',async()=>{
 for(const finish of ['stop',null]){
  let cancelled=false,calls=0;
  const response=waitingChat(()=>{
   calls++;
   return new Response(new ReadableStream({
    start(c){c.enqueue(new TextEncoder().encode(event('{"ok":true}',finish)));},
    cancel(){cancelled=true;return new Promise(()=>{});}
   }),{headers});
  },headers,5);
  let timer;
  const data=await Promise.race([response.json(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('waited for socket EOF')),1000);})]).finally(()=>clearTimeout(timer));
  assert.equal(calls,1);assert.equal(cancelled,true);
  if(finish)assert.equal(data.choices[0].message.content,'{"ok":true}');
  else{assert.equal(data.error.code,'incomplete_stream');assert.equal(data.choices,undefined);}
 }
});

test('JSON error bodies on HTTP 200 retain safe provider details without replay',async()=>{
 let calls=0;
 const data=await waitingChat(()=>{calls++;return Response.json({error:{message:'provider rejected Bearer private',type:'invalid_request_error',code:'model_not_found',extra:'private'}});},headers,5).json();
 assert.equal(calls,1);assert.equal(data.error.code,'model_not_found');assert.equal(data.error.type,'invalid_request_error');assert.equal(data.error.attempts,1);assert.equal(data.error.extra,undefined);assert.doesNotMatch(data.error.message,/private/);
});
