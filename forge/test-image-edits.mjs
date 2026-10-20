import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'node:http';
import {compatibleImageRequest,requestImageWithRecovery,fetchBufferedWithTimeout} from './image-api.mjs';

test('analysis deadline covers stalled response bodies and aborts the request',async()=>{
  let signal;
  await assert.rejects(fetchBufferedWithTimeout('https://example.invalid',{},25,async(_url,options)=>{
    signal=options.signal;
    return {arrayBuffer:()=>new Promise(()=>{})};
  }),{name:'TimeoutError'});
  assert.equal(signal.aborted,true);
});
test('buffered analysis responses preserve error status, headers and JSON',async()=>{
  const response=await fetchBufferedWithTimeout('https://example.invalid',{},1000,async()=>
    new Response('{"error":"upstream"}',{status:422,headers:{'x-request-id':'test-id'}}));
  assert.equal(response.status,422);assert.equal(response.headers.get('x-request-id'),'test-id');
  assert.deepEqual(await response.json(),{error:'upstream'});
});

test('GPT reference generation uploads all ten files on edits, preserving content across retry',async()=>{
  const uploads=[];
  const server=createServer(async(req,res)=>{
    const chunks=[];
    for await(const chunk of req) chunks.push(chunk);
    const form=await new Response(Buffer.concat(chunks),{headers:{'Content-Type':req.headers['content-type']}}).formData();
    const files=await Promise.all(form.getAll('image[]').map(async f=>({
      name:f.name,type:f.type,bytes:[...new Uint8Array(await f.arrayBuffer())]
    })));
    uploads.push({url:req.url,auth:req.headers.authorization,model:form.get('model'),
      prompt:form.get('prompt'),size:form.get('size'),files});
    res.writeHead(uploads.length===1?500:200,{'Content-Type':'application/json'});
    res.end(uploads.length===1?'{"error":{"code":"read_response_body_failed","message":"context canceled"}}':'{"data":[]}');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const body={model:'gpt-image-2.5-sunburst',prompt:'论文结构与中文标签',size:'3840x2160',
      image:Array.from({length:10},(_,i)=>`data:image/png;base64,${Buffer.from([137,80,78,71,i]).toString('base64')}`)};
    const request=compatibleImageRequest(body);
    const result=await requestImageWithRecovery({url:`http://127.0.0.1:${server.address().port}/v1${request.endpoint}`,
      body:request.body,key:'test-key',usedReferences:true,sleep:async()=>{}});
    assert.equal(result.ok,true);assert.equal(result.usedReferences,true);
    assert.equal(uploads.length,2);assert.deepEqual(uploads[0],uploads[1]);
    assert.equal(uploads[0].url,'/v1/images/edits');
    assert.equal(uploads[0].auth,'Bearer test-key');
    assert.equal(uploads[0].prompt,body.prompt);assert.equal(uploads[0].size,body.size);
    assert.equal(uploads[0].files.length,10);
    uploads[0].files.forEach((file,i)=>assert.deepEqual(file,{name:`reference-${i+1}.png`,type:'image/png',bytes:[137,80,78,71,i]}));
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('text generation and provider-specific JSON reference protocols stay intact',()=>{
  for(const body of [
    {model:'gpt-image-2.5-sunburst',prompt:'draw',size:'3840x2160'},
    {model:'doubao-seedream-5-0',prompt:'draw',image:['data:image/png;base64,AA==']},
    {model:'flux.1-kontext-pro',prompt:'draw',image:'data:image/png;base64,AA=='}
  ]){
    const request=compatibleImageRequest(body);
    assert.equal(request.endpoint,'/images/generations');assert.equal(request.body,body);
  }
});
test('invalid GPT reference data fails locally rather than becoming text-only generation',()=>{
  for(const image of ['https://example.com/a.png','data:image/png;base64,','data:text/plain;base64,AA=='])
    assert.throws(()=>compatibleImageRequest({model:'gpt-image-2',image}));
});
test('422 on multipart edits is returned without discarding references or submitting again',async()=>{
  let count=0;
  const request=compatibleImageRequest({model:'gpt-image-2',prompt:'draw',image:['data:image/png;base64,AA==']});
  const result=await requestImageWithRecovery({url:'https://example.invalid'+request.endpoint,body:request.body,
    key:'test',usedReferences:true,fetchImpl:async()=>{count++;return new Response('没有线路支持用参考图生成',{status:422});}});
  assert.equal(count,1);assert.equal(result.status,422);assert.equal(result.usedReferences,true);
});
