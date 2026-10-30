import {test} from 'node:test';
import assert from 'node:assert/strict';
import {waitingSSE} from './live-chat.mjs';
import {fetchReconstructionStream} from '../forge/infistar-reconstruction-stream.mjs';
const enc=new TextEncoder();
const headers={'Access-Control-Allow-Origin':'https://qwdwqfwq.github.io'};
const opts={body:JSON.stringify({model:'same-model',max_tokens:128000,messages:[{role:'user',content:[{type:'image_url',image_url:{url:'data:image/jpeg;base64,UNCHANGED',detail:'original'}}]}]})};
test('SSE headers and periodic heartbeat arrive before upstream headers',async()=>{
 let resolve;const p=new Promise(r=>resolve=r),r=waitingSSE(p,headers,5),reader=r.body.getReader();
 assert.match(r.headers.get('Content-Type'),/text\/event-stream/);
 assert.equal(r.headers.get('Access-Control-Allow-Origin'),headers['Access-Control-Allow-Origin']);
 assert.match(new TextDecoder().decode((await reader.read()).value),/relay connected/);
 assert.match(new TextDecoder().decode((await reader.read()).value),/keepalive/);
 resolve(new Response('error',{status:524}));
 let text='';for(;;){const x=await reader.read();if(x.done)break;text+=new TextDecoder().decode(x.value);}assert.match(text,/"code":524/);
});
test('heartbeats during slow split events cannot corrupt UTF8, content, usage or completion',async()=>{
 let upstream;
 const source=new Response(new ReadableStream({start(c){upstream=c;}}),{headers:{'Content-Type':'text/event-stream'}});
 const result=fetchReconstructionStream('test',opts,1000,async()=>waitingSSE(Promise.resolve(source),headers,3));
 const text='data: '+JSON.stringify({choices:[{index:0,delta:{content:'原尺寸中文'},finish_reason:'stop'}],usage:{total_tokens:20}})+'\r\n\r\ndata: [DONE]\n\n';
 const bytes=enc.encode(text);
 for(let i=0;i<bytes.length;i+=7){upstream.enqueue(bytes.slice(i,i+7));await new Promise(r=>setTimeout(r,1));}
 const r=await result,d=JSON.parse(r.text);assert.equal(d.choices[0].message.content,'原尺寸中文');assert.equal(d.usage.total_tokens,20);assert.equal(r.transport.events,1);
});
test('HTTP failures, rejected fetches, truncated streams and invalid fallback never succeed',async()=>{
 for(const source of [()=>Promise.resolve(new Response('524',{status:524})),()=>Promise.reject(new Error('secret')),()=>Promise.resolve(new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n',{headers:{'Content-Type':'text/event-stream'}})),()=>Promise.resolve(new Response('invalid'))]){
  await assert.rejects(fetchReconstructionStream('test',opts,1000,async()=>waitingSSE(source(),headers,5)));
 }
});
test('complete JSON fallback and downstream cancellation work',async()=>{
 const content={choices:[{index:0,message:{content:'{}'},finish_reason:'stop'}]};
 const r=await fetchReconstructionStream('test',opts,1000,async()=>waitingSSE(Promise.resolve(Response.json(content)),headers));assert.equal(JSON.parse(r.text).choices[0].message.content,'{}');
 let cancelled=false;const source=new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'Content-Type':'text/event-stream'}});
 const reader=waitingSSE(Promise.resolve(source),headers).body.getReader();await reader.read();await new Promise(r=>setTimeout(r,0));await reader.cancel();assert.ok(cancelled);
});

