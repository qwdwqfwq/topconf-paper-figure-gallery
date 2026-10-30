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
