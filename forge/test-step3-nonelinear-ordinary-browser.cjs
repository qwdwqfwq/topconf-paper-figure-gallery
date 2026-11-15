const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const {chromium}=require(process.env.REVISION_PLAYWRIGHT||'C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
(async()=>{
 const {createGalleryServer}=await import(pathToFileURL(path.resolve(__dirname,'../scripts/serve-nonelinear.mjs')).href);
 const server=createGalleryServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,...(process.env.REVISION_BUNDLED_BROWSER==='1'?{}:{executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'})});
  const context=await browser.newContext({serviceWorkers:'block'});await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const page=await context.newPage();
  const prepare=async()=>{await page.goto(origin+'/forge/step3-image-stream.mjs');await page.evaluate(async()=>{
   window.requestImage=(await import('/forge/step3-image-stream.mjs')).requestStep3ImageStream;
   window.options={url:'https://api.nonelinear.com.cn/v1/images/generations',body:{model:'future-nonelinear-model',prompt:'fixture',image:['https://example.com/ref.png'],stream:true},key:'offline-browser-key'};
  });};
  await prepare();
  for(let reload=0;reload<2;reload++){
   if(reload)await prepare();
   assert.deepEqual(await page.evaluate(async()=>{
    const calls=[];const result=await requestImage({...options,fetchImpl:async(url,init)=>{
     calls.push(JSON.parse(init.body));return new Response(JSON.stringify({data:[{b64_json:'fixture'}]}));
    }});return {calls,mode:result.compatibility.mode,cached:result.compatibility.cached};
   }),{calls:[{model:'future-nonelinear-model',prompt:'fixture',image:['https://example.com/ref.png']}],mode:'ordinary',cached:!!reload});
  }
  assert.deepEqual(await page.evaluate(async()=>{
   const calls=[];await requestImage({...options,body:{...options.body,model:'uncertain-nonelinear-model'},fetchImpl:async(url,init)=>{
    calls.push(Object.hasOwn(JSON.parse(init.body),'stream'));throw Error('disconnect after submission');
   }}).catch(()=>{});return calls;
  }),[false]);
  await prepare();
  assert.deepEqual(await page.evaluate(async()=>{
   const calls=[];const result=await requestImage({...options,body:{...options.body,model:'uncertain-nonelinear-model'},fetchImpl:async(u,i)=>{calls.push(Object.hasOwn(JSON.parse(i.body),'stream'));return Response.json({data:[{b64_json:'fixture'}]});}});return {calls,ok:result.ok};}),{calls:[false],ok:true});
  assert.equal(await page.evaluate(()=>Object.values(localStorage).some(v=>v.includes('offline-browser-key'))),false);
  console.log('PASS browser: NoneLinear omits stream on first request and after reload; disconnect fails once; explicit request after reload succeeds; references preserved; credential absent from persisted values');
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
