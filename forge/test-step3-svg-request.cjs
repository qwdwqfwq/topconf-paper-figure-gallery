// Real browser DOMParser + synthetic network faults, no API keys or paid calls.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
(async()=>{
  const moduleSource=fs.readFileSync(path.join(__dirname,'step3-svg-request.mjs'));
  const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
  const generationSource=html.slice(html.indexOf('async function genOaiSVG('),html.indexOf('async function genAnthropicSVG('));
  const server=http.createServer((req,res)=>{
    res.setHeader('Content-Type',req.url==='/module.mjs'?'text/javascript':'text/html');
    res.end(req.url==='/module.mjs'?moduleSource:'<!doctype html><title>SVG recovery tests</title>');
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let browser;
  try{
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    const page=await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const results=await page.evaluate(async generationSource=>{
      const {requestStep3Svg,completeStep3Svg}=await import('/module.mjs');
      const parseXML=code=>new DOMParser().parseFromString(code,'image/svg+xml');
      const svg='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><text>完整中文</text><svg><rect width="1" height="1"/></svg></svg>';
      const body={model:'fixture',temperature:0.3,max_tokens:96000,messages:[{role:'user',content:[{type:'image_url',image_url:{url:'data:image/png;base64,fixture'}},{type:'text',text:'original prompt'}]}]};
      const results=[];
      const check=(ok,msg)=>{if(!ok)throw new Error(msg);};
      async function test(name,fn){await fn();results.push(name);}
      const frame=data=>`data: ${typeof data==='string'?data:JSON.stringify(data)}\r\n\r\n`;
      const sse=(chunks,closed=()=>{})=>{
        const bytes=new TextEncoder().encode(': heartbeat\r\n\r\n'+chunks.map(frame).join(''));
        let offset=0;
        return new Response(new ReadableStream({pull(controller){
          if(offset===bytes.length){controller.close();return;}
          // Byte-by-byte deliberately splits UTF-8 and CRLF boundaries.
          controller.enqueue(bytes.slice(offset,++offset));
        },cancel:closed}),{headers:{'content-type':'text/event-stream'}});
      };
      const success=()=>sse([null,{choices:[null,{index:1,delta:{content:'ignore'}},{index:0,delta:{content:null,tool_calls:[null,{function:null}]}}]},
        {choices:[{index:0,delta:{content:svg.slice(0,60)}}]},
        {choices:[{index:0,delta:{content:svg.slice(60)},finish_reason:'stop'}]},'[DONE]']);
      const opts={base:'https://fixture.invalid/v1/',modelBody:body,key:'fixture-only',parseXML,sleep:async()=>{}};
      const json=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
      await test('null-safe fragmented SSE and nested SVG',async()=>{
        const result=await requestStep3Svg({...opts,fetchImpl:async()=>success()});
        check(result.code===svg && !result.truncated,'must preserve full XML/UTF-8');
      });
      await test('typed upstream timeout recovers with identical references',async()=>{
        const sent=[],delays=[],notices=[];
        const result=await requestStep3Svg({...opts,sleep:async ms=>delays.push(ms),onRetry:n=>notices.push(n),fetchImpl:async(url,init)=>{
          check(url==='https://fixture.invalid/v1/chat/completions','url');sent.push(init.body);
          return sent.length===1?sse([{type:'error',message:'NoneLinear upstream timed out',code:'upstream_timeout'}]):success();
        }});
        check(result.code===svg && sent.length===2 && sent[0]===sent[1],'recovery');
        check(JSON.stringify(JSON.parse(sent[0]).messages)===JSON.stringify(body.messages),'reference loss');
        check(JSON.parse(sent[0]).stream===true && !('stream' in body),'stream isolated');
        check(delays[0]===1000 && notices[0].nextAttempt===2,'backoff/status');
      });
      await test('HTTP 200 error envelope exhaustion retains request id',async()=>{
        let count=0;
        try{await requestStep3Svg({...opts,fetchImpl:async()=>{count++;return json({error:{message:'NoneLinear upstream timed out',code:'upstream_timeout',attempts:3,request_id:'req_fixture'}});}});throw Error('accepted error');}
        catch(e){check(count===3 && e.message.includes('req_fixture') && e.code==='upstream_timeout','bounded error recovery');}
      });
      await test('truncation and malformed XML trigger full regeneration',async()=>{
        let count=0;
        const result=await requestStep3Svg({...opts,fetchImpl:async()=>{
          count++;return count===1?sse([{choices:[{delta:{content:'<svg><text>partial'},finish_reason:'length'}]},'[DONE]']):
            count===2?json({choices:[{message:{content:'<svg><g></svg>'},finish_reason:'stop'}]}):success();
        }});
        check(count===3 && result.code===svg,'invalid/truncated SVG accepted');
      });
      await test('missing finish is rejected; DONE closes an open connection',async()=>{
        let count=0,cancelled=0;
        const result=await requestStep3Svg({...opts,fetchImpl:async()=>{
          count++;
          if(count===1)return sse([{choices:[{delta:{content:svg},finish_reason:null}]},'[DONE]']);
          return new Response(new ReadableStream({start(controller){
            controller.enqueue(new TextEncoder().encode(frame({choices:[{message:{content:[null,{type:'text',text:svg}]},finish_reason:'stop'}]})+frame('[DONE]')));
            // Intentionally remain open after the terminal event.
          },cancel(){cancelled++;}}),{headers:{'content-type':'text/event-stream'}});
        }});
        check(count===2 && cancelled===1 && result.code===svg,'terminal handling');
      });
      await test('null/missing/wrong-shaped JSON content never throws null iteration',async()=>{
        for(const data of [null,{choices:null},{choices:{}},{choices:[null]},{choices:['invalid']},{choices:[{message:null}]},{choices:[{message:{content:[null,{type:'text',text:null}]}}]}]){
          try{await requestStep3Svg({...opts,maxAttempts:1,fetchImpl:async()=>json(data)});throw Error('accepted null');}
          catch(e){check(e.code==='empty_completion','unexpected '+e);}
        }
      });
      await test('auth and rate errors are not replayed',async()=>{
        for(const status of [400,401,403,429]){
          let count=0;
          try{await requestStep3Svg({...opts,fetchImpl:async()=>{count++;return new Response('',{status});}});throw Error('accepted HTTP failure');}
          catch(e){check(count===1 && e.code===status,'permanent error replayed');}
        }
      });
      await test('transient HTTP and fetch disconnect recover',async()=>{
        let count=0;
        const result=await requestStep3Svg({...opts,fetchImpl:async()=>{
          count++;if(count===1)return new Response('',{status:504});if(count===2)throw new TypeError('Failed to fetch');return success();
        }});
        check(count===3 && result.code===svg,'network recovery');
      });
      await test('relay-wrapped disconnect and transient status recover',async()=>{
        let count=0;
        const result=await requestStep3Svg({...opts,fetchImpl:async()=>{
          count++;if(count===1)return sse([{error:{message:'NoneLinear upstream connection interrupted',type:'upstream_stream_error'}}]);
          if(count===2)return sse([{error:{message:'NoneLinear upstream HTTP 503',code:503}}]);return success();
        }});
        check(count===3 && result.code===svg,'relay recovery');
      });
      await test('deadline aborts a stalled stream and retries',async()=>{
        let count=0;
        const result=await requestStep3Svg({...opts,attemptTimeoutMs:20,fetchImpl:async(url,init)=>{
          count++;if(count>1)return success();
          return new Response(new ReadableStream({start(controller){init.signal.addEventListener('abort',()=>controller.error(init.signal.reason));}}),{headers:{'content-type':'text/event-stream'}});
        }});
        check(count===2 && result.code===svg,'deadline recovery');
      });
      await test('user cancellation never retries',async()=>{
        let count=0;const controller=new AbortController();
        try{await requestStep3Svg({...opts,signal:controller.signal,fetchImpl:async()=>{count++;controller.abort();throw controller.signal.reason;}});throw Error('accepted abort');}
        catch(e){check(count===1 && e.name==='AbortError','cancellation replayed');}
      });
      await test('complete XML requires real parse, no auto-closing',async()=>{
        for(const bad of ['<svg><g>','<svg><g></svg>','<svg></svg><svg></svg>']){
          let rejected=false;try{completeStep3Svg(bad,parseXML);}catch{rejected=true;}check(rejected,'accepted '+bad);
        }
        check(completeStep3Svg('<svg><!-- ---- title ---- --><text>A</text></svg >',parseXML).code==='<svg><text>A</text></svg >','decorative comments and XML whitespace');
        check(completeStep3Svg('```svg\n'+svg+'\n```',parseXML).code===svg,'code fences');
      });
      await test('actual genOaiSVG renders only after recovery and audit',async()=>{
        let calls=0,renders=0;const notes=[];
        const dependencies={
          requestStep3Svg:o=>requestStep3Svg({...o,sleep:async()=>{},fetchImpl:async()=>++calls===1?json({error:{message:'timed out'}}):success()}),
          SVG_SYS:'fixture system prompt',refs:new Set(['ref1']),buildPrompt:()=> 'prompt',refDataURIs:async()=>['data:image/png;base64,fixture'],relayBase:()=>'',
          setGenNote:n=>notes.push(n),postJSON:()=>{throw Error('must bypass shared request');},tt:k=>k,diagnoseConnection:()=>'',friendlyHttp:()=>'',extractSvgCode:()=>{throw Error('must not auto-close');},
          auditAndRepair:async code=>{check(code===svg,'audit sees partial');return {svg:code};},revisionGallery:{leave(){}},
          renderSVG:(code,vision,ids,truncated)=>{check(code===svg && vision && ids[0]==='ref1' && !truncated,'render arguments');renders++;}
        };
        const generate=new Function(...Object.keys(dependencies),'return ('+generationSource+')')(...Object.values(dependencies));
        await generate('https://fixture.invalid/v1','fixture','fixture-only','content','nonelinear');
        check(calls===2 && renders===1 && notes.length===1,'integration recovery');
        dependencies.requestStep3Svg=async()=>{throw Error('provider unavailable');};
        const fail=new Function(...Object.keys(dependencies),'return ('+generationSource+')')(...Object.values(dependencies));
        try{await fail('https://fixture.invalid','fixture','fixture-only','content','nonelinear');}catch{}
        check(renders===1,'failure overwrote previous drawing');
      });
      return results;
    },generationSource);
    assert.equal(results.length,13);
    for(const name of results) console.log('PASS '+name);
  }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
