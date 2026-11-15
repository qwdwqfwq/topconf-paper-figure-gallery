// Actual Steps 1/3 rows: disclosure must never squeeze selected model text.
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.REVISION_PLAYWRIGHT||'C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
(async()=>{
 const {createGalleryServer}=await import(pathToFileURL(path.resolve(__dirname,'../scripts/serve-nonelinear.mjs')).href);
 const server=createGalleryServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.REVISION_BUNDLED_BROWSER==='1'?{}:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'})});
  for(const provider of ['nonelinear','infistar'])for(const locale of ['zh-CN','en-US']){
   const context=await browser.newContext({serviceWorkers:'block',locale}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   const chats=['5.3','5.4','5.5','5.6','6','6.1','6.2'].map(v=>'gpt-'+v+'-sol');
   const images=['1','1.5','2','2.3','2.4','2.5','2.6'].map(v=>'gpt-image-'+v);
   await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(!['GET','HEAD'].includes(request.method()))return route.abort();
    if(['nonelinear.com.cn','www.nonelinear.com.cn'].includes(url.hostname)&&url.pathname==='/models'){
     const data=[...chats.map(id=>[id,'v','No','/','/','/','/','Yes','','2026-11-15','LMM']),...images.map(id=>[id,'v','No','/','/','/','/','Yes','','2026-11-15','image'])];
     return route.fulfill({json:{headers:Array(11).fill('column'),total:data.length,data}});
    }
    if(['infistar.cc','infistar.ai'].includes(url.hostname)&&url.pathname==='/pricing'){
     const data=[...chats.map(model_name=>({model_name,supported_endpoint_types:['openai']})),...images.map(model_name=>({model_name,supported_endpoint_types:['image-generation']}))];
     return route.fulfill({contentType:'text/html',body:`<script id="public-site-pricing-data" type="application/json">${JSON.stringify({success:true,data})}</script>`});
    }
    if(url.pathname.endsWith('/models'))return route.fulfill({json:{data:[]}});
    if(url.origin===origin&&url.pathname==='/forge/'){
     const response=await route.fetch(),html=await response.text();
     return route.fulfill({response,body:html.replace('window.FF_NONELINEAR_BASE='+JSON.stringify(origin+'/api/nonelinear/v1'),'window.FF_NONELINEAR_BASE="https://gallery-nonelinear-relay.lixiao-gallery.workers.dev/v1"')});
    }
    if(url.origin===origin)return route.continue();return route.abort();
   });
   await page.goto(origin+'/forge/');await page.waitForFunction(()=>document.querySelector('#provider')?.options.length>1);
   await page.locator('#provider').selectOption(provider);await page.locator('#modeTabs [data-mode="image"]').click();
   await page.waitForFunction(()=>['parserCatalogStatus','step3CatalogStatus'].every(id=>/Official catalog synchronized|已同步官网最新目录/.test(document.getElementById(id).textContent)));
   const step4=()=>page.evaluate(()=>['reconModel','reconReasoningEffort','reconBtn','reconStatus'].map(id=>{const e=document.getElementById(id);return {html:e.outerHTML,value:e.value};}));
   const before=await step4();
   for(const width of [320,390,768,1280]){
    await page.setViewportSize({width,height:900});
    for(const id of ['parseModel','model','analyzeModel']){
     const selector=page.locator('#'+id),toggle=page.locator('#'+id+'ShowAllModels');
     await selector.scrollIntoViewIfNeeded();
     const s=await selector.boundingBox(),t=await toggle.boundingBox();
     assert.ok(s.width>=170,`${provider} ${locale} ${width} ${id}: selector width ${s.width}`);
     assert.ok(t.y>=s.y+s.height-1,`${id}: disclosure must be below selector`);
     assert.ok(s.x>=0&&s.x+s.width<=width+1,`${id}: selector must fit viewport`);
     const chosen=await selector.inputValue();await toggle.click();
     assert.equal(await selector.inputValue(),chosen);assert.equal(await toggle.getAttribute('aria-expanded'),'true');
     await toggle.click();assert.equal(await selector.inputValue(),chosen);
    }
   }
   // A disclosure inside the analysis row follows the frozen row's visibility.
   await page.locator('#modeTabs [data-mode="svg"]').click();
   assert.equal(await page.locator('#analyzeModelShowAllModels').isVisible(),false);
   assert.deepEqual(await step4(),before);assert.deepEqual(errors,[]);
   console.log(`PASS ${provider} ${locale}: readable selectors at 320/390/768/1280px, disclosure below, selection stable, Step 4 unchanged`);
   await context.close();
  }
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
