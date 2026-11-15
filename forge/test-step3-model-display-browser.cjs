// Current selection/display contract. No real keys or generation requests.
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const {chromium}=require(process.env.REVISION_PLAYWRIGHT||'C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
(async()=>{
 const {createGalleryServer}=await import(pathToFileURL(path.resolve(__dirname,'../scripts/serve-nonelinear.mjs')).href);
 const server=createGalleryServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;let browser,posts=0;
 try{
  browser=await chromium.launch({headless:true,...(process.env.REVISION_BUNDLED_BROWSER==='1'?{}:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'})});
  for(const locale of ['zh-CN','en-US']){
   const context=await browser.newContext({serviceWorkers:'block',locale}),page=await context.newPage(),errors=[];
   let offline=false;
   const images=['gpt-image-2.6-flare','gemini-nano-banana-2.1','gemini-3.1-flash-image','gemini-3.1-flash-lite-image','gemini-3-pro-image','future-image-2027'];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(req.method()!=='GET'){posts++;return route.abort();}
    if(url.pathname==='/pricing'&&['infistar.cc','infistar.ai'].includes(url.hostname)){
     if(offline)return route.abort();
     const rows=[...images,'gemini-4-carbon'].map(model_name=>({model_name,supported_endpoint_types:model_name.startsWith('gemini')?['gemini','openai']:['image-generation'],price_presentation:{kind:model_name.startsWith('gemini')?'text':'image'}}));
     return route.fulfill({contentType:'text/html',body:`<script id="public-site-pricing-data" type="application/json">${JSON.stringify({success:true,data:rows})}</script>`});
    }
    if(url.origin===origin)return route.continue();
    return route.abort();
   });
   await page.goto(origin+'/forge/');await page.waitForFunction(()=>document.querySelector('#provider')?.options.length>1);
   await page.locator('#provider').selectOption('infistar');await page.locator('#modeTabs [data-mode="image"]').click();
   await page.waitForFunction(()=>/Official catalog synchronized|已同步官网最新目录/.test(document.querySelector('#step3CatalogStatus').textContent));
   const values=()=>page.locator('#imageResolution option').evaluateAll(list=>list.map(o=>o.value));
   assert.deepEqual(await page.locator('#model option').evaluateAll(list=>list.map(o=>o.value)),images);
   const step4=()=>page.evaluate(()=>['reconModel','reconReasoningEffort','reconBtn','reconStatus'].map(id=>{const e=document.getElementById(id);return {id,html:e.outerHTML,value:e.value};}));
   const before=await step4();
   for(const ratio of ['16:9','1:1','3:2','4:3']){
    await page.locator('#figureRatio').selectOption(ratio);
    for(const model of images){
     await page.locator('#model').selectOption(model);
     assert.deepEqual(await values(),model.includes('flash-lite')?['1K']:['1K','2K','4K']);
     assert.equal(await page.locator('#imageResolution').isEnabled(),true);
     await page.waitForFunction(()=>document.querySelector('#imageRatioWarn').hidden&&document.querySelector('#imageRatioWarn').textContent==='');
    }
   }
   // Existing page writes audit status during later change events too.
   await page.evaluate(()=>{const w=document.querySelector('#imageRatioWarn');w.textContent='fixture verified/untested audit status';w.hidden=false;});
   await page.waitForFunction(()=>document.querySelector('#imageRatioWarn').hidden&&document.querySelector('#imageRatioWarn').textContent==='');
   // Repair a pre-release cache that incorrectly classified Gemini as chat.
   await page.evaluate(()=>{const key='ff_step3_official_v1_infistar',cache=JSON.parse(localStorage.getItem(key));for(const id of cache.models)if(id.startsWith('gemini-'))cache.kinds[id]='chat';localStorage.setItem(key,JSON.stringify(cache));});
   offline=true;await page.locator('#refreshModels').click();
   await page.waitForFunction(()=>/Official cache:|官网缓存时间/.test(document.querySelector('#step3CatalogStatus').textContent));
   assert.deepEqual(await page.locator('#model option').evaluateAll(list=>list.map(o=>o.value)),images);
   assert.deepEqual(await step4(),before);assert.deepEqual(errors,[]);assert.equal(posts,0);
   console.log('PASS '+locale+': token-billed Gemini, all presets without audit gate, Lite 1K, old cache repair, no audit messages, Step 4 DOM unchanged, zero inference requests');
   await context.close();
  }
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
