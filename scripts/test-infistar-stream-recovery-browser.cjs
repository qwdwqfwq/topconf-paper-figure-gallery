// Browser integration of the actual Step 4 caller, parser, export state and IndexedDB.
// All external requests are intercepted. No credentials or paid API calls.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require(process.env.REVISION_PLAYWRIGHT||'C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const root=path.resolve(process.env.INFISTAR_TEST_ROOT||path.join(__dirname,'..'));
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{const target=fs.statSync(file).isDirectory()?path.join(file,'index.html'):file;
  res.setHeader('Content-Type',/\.m?js$/.test(target)?'text/javascript':target.endsWith('.html')?'text/html':target.endsWith('.json')?'application/json':'application/octet-stream');
  res.end(fs.readFileSync(target));
 }catch{res.writeHead(404).end();}
});
const scene=JSON.stringify({canvas:{width:640,height:400},nodes:[{id:'box',type:'rect',x:20,y:20,w:100,h:80,fill:'#112233'}]});
const event=(content,finish_reason=null)=>'data: '+JSON.stringify({choices:[{index:0,delta:{content},finish_reason}]})+'\n\n';
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=process.env.INFISTAR_TEST_ORIGIN||'http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.REVISION_BUNDLED_BROWSER==='1'?{}:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'})});
 const report=[];
 try{
  for(const [name,provider,model,mode,expected] of [
   ['complete JSON missing finish, then success','infistar','gpt-6.1-sol','recover',2],
   ['partial event at EOF, then success','infistar','gpt-6.1-sol','tail',2],
   ['continuous interruption is bounded','infistar','gpt-6.1-sol','broken',3],
   ['cancel during backoff','infistar','gpt-6.1-sol','cancel',1],
   ['delimited malformed event has no retry','infistar','gpt-6.1-sol','malformed',1],
   ['output token limit has no retry','infistar','gpt-6.1-sol','length',1],
   ['HTTP authentication error has no retry','infistar','gpt-6.1-sol','auth',1],
   ['NoneLinear remains single attempt','nonelinear','gpt-6.1-sol','broken',1],
   ['Infistar Responses remains single attempt','infistar','gpt-6.2','responses',1],
  ]){
   const context=await browser.newContext();const page=await context.newPage();const requests=[];
   await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin===origin)return route.continue();
    if(req.method()==='POST'&&/\/(chat\/completions|responses)$/.test(url.pathname)){
     requests.push({url:req.url(),body:req.postData()});
     const ok=requests.length>1&&(mode==='recover'||mode==='tail');
     const body=ok?event(scene,'stop'):mode==='tail'?'data: {"choices":':mode==='malformed'?'data: invalid\n\n':mode==='length'?event(scene,'length'):mode==='auth'?'unauthorized':event(mode==='recover'?scene:'{"nodes":');
     return route.fulfill({status:mode==='auth'?401:200,contentType:mode==='auth'?'text/plain':'text/event-stream',headers:{'x-request-id':'fixture-'+requests.length,'access-control-allow-origin':'*'},body});
    }
    if(url.pathname.endsWith('/models'))return route.fulfill({json:{data:[{id:model}]}});
    return route.abort();
   });
   await page.goto(origin+'/forge/',{waitUntil:'load'});
   await page.waitForFunction(()=>typeof window.__ffReconstruct==='function');
   await page.selectOption('#provider',provider);
   await page.evaluate(({model})=>{
    const select=document.querySelector('#reconModel');if(![...select.options].some(o=>o.value===model))select.add(new Option(model,model));select.value=model;
    document.querySelector('#reconReasoningEffort').value='xhigh';document.querySelector('#key').value='fixture-credential';
    const canvas=Object.assign(document.createElement('canvas'),{width:640,height:400});canvas.getContext('2d').fillRect(20,20,100,80);
    window.__ffLastGeneratedImage=canvas.toDataURL();window.__ffStep3Bitmap=window.__ffLastGeneratedImage;
    Object.assign(window.__ffExportState,{bitmap:window.__ffLastGeneratedImage,reconBitmap:window.__ffLastGeneratedImage,source:'bitmap',hasStep3Output:true});
    window.__fixtureRun=window.__ffReconstruct();
   },{model});
   if(mode==='cancel'){
    await page.waitForFunction(()=>window.__ffDirectTiming.tiles[0]?.state==='retrying');
    await page.evaluate(()=>document.querySelector('#stopReconBtn').click());
   }
   const result=await page.evaluate(async()=>{
    const ok=await window.__fixtureRun;
    return {ok,state:window.__ffExportState,audit:window.__ffDirectTiming,archive:window.__ffReconArchive,persisted:window.__ffLatestReconArchive};
   });
   assert.equal(requests.length,expected,name);
   const success=['recover','tail'].includes(mode);
   assert.equal(result.ok,success,name);
   assert.equal(result.audit.state,success?'succeeded':mode==='cancel'?'cancelled':'failed',name);
   assert.equal(!!result.state.scene,success,name);
   assert.equal(result.persisted.status,result.audit.state,name+' persisted');
   if(provider==='infistar'&&model==='gpt-6.1-sol'){
    assert.equal(result.archive.responses.length,expected);
    for(const record of result.archive.responses.filter(r=>r.incomplete)){
     assert.equal(record.content,'');assert.equal(record.envelope,'');assert.ok(record.transport.failureCode);
     assert.ok(!JSON.stringify(record).includes('fixture-credential'));
    }
   }
   for(const request of requests.slice(1))assert.equal(request.body,requests[0].body,'retry must resend identical payload');
   if(model==='gpt-6.1-sol'){
    const body=JSON.parse(requests[0].body);assert.equal(body.max_completion_tokens,128000);assert.equal(body.reasoning_effort,'xhigh');
    assert.equal(body.messages[1].content[1].image_url.detail,'original');
   }
   if(mode==='recover')assert.equal(result.archive.responses[0].transport.failureCode,'missing_terminal');
   if(mode==='broken'&&provider==='infistar')assert.match(result.state.reconError,/已请求 3 次/);
   report.push({case:name,requests:requests.length,state:result.audit.state,diagnostics:result.archive.responses.length});
   await context.close();
  }
  console.log(JSON.stringify({cases:report,liveAPICalls:0},null,2));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
