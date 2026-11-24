const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {setTimeout:sleep}=require('node:timers/promises');
const {chromium}=require(process.env.REVISION_PLAYWRIGHT||'C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');

(async()=>{
  const requests=[],source=fs.readFileSync(path.join(process.env.SVG_REVISION_TEST_ROOT||__dirname,'svg-revision.mjs'));
  const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
  const started=deferred(),release=deferred(),closed=deferred();
  const svg=title=>`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400"><text x="20" y="60">${title}</text></svg>`;
  const original=svg('Original'),updated=svg('修改后的中文标题');
  const server=http.createServer(async(req,res)=>{
    if(req.url==='/svg-revision.mjs'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(source);return;}
    if(req.url!=='/v1/chat/completions'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Offline SVG streaming test</title>');return;}
    let raw='';for await(const chunk of req)raw+=chunk;
    requests.push({body:JSON.parse(raw),authorization:req.headers.authorization,accept:req.headers.accept});
    res.on('close',closed.resolve);
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});
    const event=data=>'data: '+JSON.stringify(data)+'\r\n\r\n';
    res.write(': heartbeat\r\n\r\n'+event({choices:[{index:0,delta:{content:updated.slice(0,80)},finish_reason:null}]}));
    started.resolve();await release.promise;
    res.write(event({choices:[{index:0,delta:{reasoning_content:'ignore reasoning',content:updated.slice(80)}}]}));
    res.write(event({choices:[{index:0,delta:{},finish_reason:'stop'}]}));
    // Deliberately no [DONE] and no EOF: the client must finish and close the stream.
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin=`http://127.0.0.1:${server.address().port}`;let browser;
  try{
    browser=await chromium.launch({headless:true,...(process.env.REVISION_BUNDLED_BROWSER?{}:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'})});
    const page=await browser.newPage();
    await page.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
    await page.goto(origin);
    await page.evaluate(async({original,origin})=>{
      const module=await import('/svg-revision.mjs');window.svgModule=module;
      window.parentSVG=module.svgVersion(original);
      window.result=null;window.error=null;
      window.pending=module.generateSVGRevision(window.parentSVG,'调整标题',{
        route:{p:'infistar',proto:'oai',base:origin+'/v1',model:'gpt-6.2-sol'},key:'offline-only',
        post:()=>{throw Error('Infistar must bypass the buffered JSON callback');}
      }).then(value=>{window.result=value;},error=>{window.error=error.message;});
    },{original,origin});
    await started.promise;await sleep(50);
    assert.deepEqual(await page.evaluate(()=>({result:window.result,error:window.error})),{result:null,error:null},'Do not publish a partial SVG');
    release.resolve();
    await page.waitForFunction(()=>window.result||window.error,null,{timeout:10000});
    const network=await page.evaluate(()=>({result:window.result,error:window.error}));
    assert.equal(network.error,null);assert.match(network.result.svg,/修改后的中文标题/);
    assert.equal(network.result.width,800);assert.equal(network.result.height,400);
    await Promise.race([closed.promise,sleep(3000).then(()=>{throw Error('Stream was not cancelled after finish_reason');})]);
    assert.equal(requests.length,1);assert.equal(requests[0].body.stream,true);
    assert.equal(requests[0].body.model,'gpt-6.2-sol');assert.equal(requests[0].body.max_completion_tokens,32000);
    assert.ok(!Object.hasOwn(requests[0].body,'max_tokens'));assert.equal(requests[0].authorization,'Bearer offline-only');
    assert.equal(requests[0].accept,'text/event-stream');

    const report=await page.evaluate(async({updated,origin})=>{
      const {generateSVGRevision}=window.svgModule,realFetch=window.fetch;
      const route={p:'infistar',proto:'oai',base:origin+'/v1',model:'gpt-6.2-sol'};
      const encode=value=>new TextEncoder().encode(value);
      const event=data=>'data: '+JSON.stringify(data)+'\r\n\r\n';
      const chunk=content=>({choices:[{index:0,delta:{content},finish_reason:null}]});
      const stop=event({choices:[{index:0,delta:{},finish_reason:'stop'}]});
      const complete=event(chunk(updated));
      const attempts=[];let calls=0,postCalls=0;
      function stream(wire,{broken=false}={}){
        const bytes=encode(wire);let offset=0;
        return new Response(new ReadableStream({pull(controller){
          // Split every byte, including UTF-8 characters, CRLFs, JSON and SSE records.
          if(offset<bytes.length)controller.enqueue(bytes.slice(offset,++offset));
          else if(broken)controller.error(Error('simulated network loss'));
          else controller.close();
        }}),{headers:{'Content-Type':'text/event-stream; charset=utf-8'}});
      }
      async function run(name,response,expected,extra={}){
        const before=calls;
        window.fetch=async(url,init)=>{calls++;attempts.push(JSON.parse(init.body));return typeof response==='function'?response():response;};
        let result,error;
        try{result=await generateSVGRevision(window.parentSVG,'修改标题',{route:{...route,...extra},key:'offline-only',post:()=>{throw Error('Wrong callback');}});}catch(e){error=e.message;}
        if(calls!==before+1)throw Error(name+': duplicate request');
        if(expected instanceof RegExp){if(!expected.test(error||''))throw Error(name+': '+error);}
        else if(error||!result.svg.includes('修改后的中文标题'))throw Error(name+': '+error);
      }
      try{
        await run('byte-split SSE',()=>stream(': ping\r\n\r\n'+event({choices:[{index:0,delta:{reasoning_content:'not SVG'}}]})+event({choices:[{index:1,delta:{content:'ignore'}}]})+event({choices:[],usage:{total_tokens:1}})+complete+stop+'data: [DONE]\r\n\r\n'));
        await run('LF and multiline data',()=>stream(('data: '+JSON.stringify(chunk(updated),null,2).split('\n').join('\ndata: ')+'\n\n'+stop).replace(/\r\n/g,'\n')));
        await run('final record without newline',()=>stream(complete+stop.trimEnd()));
        await run('complete JSON from gateway',()=>new Response(JSON.stringify({choices:[{message:{content:updated},finish_reason:'stop'}]}),{headers:{'Content-Type':'application/json'}}));
        await run('legacy complete JSON',()=>new Response(JSON.stringify({choices:[{message:{content:updated}}]}),{headers:{'Content-Type':'application/json'}}));
        await run('missing finish',()=>stream(complete),/完成确认/);
        await run('DONE without finish',()=>stream(complete+'data: [DONE]\r\n\r\n'),/完成确认/);
        await run('network loss',()=>stream(complete,{broken:true}),/完成确认/);
        await run('length',()=>stream(complete+event({choices:[{index:0,delta:{},finish_reason:'length'}]})),/长度限制/);
        await run('filter',()=>stream(event({choices:[{index:0,delta:{},finish_reason:'content_filter'}]})),/过滤/);
        await run('upstream error',()=>stream(complete+event({error:{message:'secret must not leak'}})),/服务返回流式错误/);
        await run('invalid SSE',()=>stream('data: {broken}\n\n'),/无效流数据/);
        await run('HTTP 524',()=>new Response('upstream secret',{status:524}),/HTTP 524.*超时/);
        await run('incomplete SVG after stop',()=>stream(event(chunk(updated.slice(0,-6)))+stop),/完整 SVG/);
        await run('unsafe SVG after stop',()=>stream(event(chunk(updated.replace('</svg>','<script/>\u003c/svg>')))+stop),/不支持/);
        await run('non-GPT model tokens',()=>stream(complete+stop),null,{model:'qwen-test'});
        if(attempts.at(-1).max_tokens!==32000||Object.hasOwn(attempts.at(-1),'max_completion_tokens'))throw Error('Non-GPT token limit changed');
        // Other providers and Anthropic continue through the original callback.
        window.fetch=()=>{throw Error('Other providers must not use the streaming helper');};
        for(const config of [{p:'nonelinear',proto:'oai'},{p:'custom',proto:'oai'},{p:'infistar',proto:'anthropic'}]){
          const result=await generateSVGRevision(window.parentSVG,'修改标题',{route:{...route,...config},key:'offline-only',post:async(path,body,key)=>{
            postCalls++;if(Object.hasOwn(body,'stream')||body.max_tokens!==32000||key!=='offline-only')throw Error('Original callback changed');
            if(config.proto==='anthropic'){
              if(path!=='/v1/messages'||body.messages[0].content[1].type!=='image')throw Error('Anthropic path changed');
              return {content:[{type:'text',text:updated}]};
            }
            if(path!=='/chat/completions')throw Error('Chat path changed');
            return {choices:[{message:{content:updated}}]};
          }});
          if(!result.svg.includes('修改后的中文标题'))throw Error('Other provider failed');
        }
        return {cases:attempts.length,postCalls};
      }finally{window.fetch=realFetch;}
    },{updated,origin});
    assert.equal(report.cases,16);assert.equal(report.postCalls,3);
    console.log('SVG revision streaming passed: real browser HTTP stream; no partial versions; finish without DONE/EOF; byte-split UTF-8/CRLF; heartbeats; JSON compatibility; truncation/network/524/error rejection; token limits; unchanged other providers. Zero live API calls.');
  }finally{
    release.resolve();await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
