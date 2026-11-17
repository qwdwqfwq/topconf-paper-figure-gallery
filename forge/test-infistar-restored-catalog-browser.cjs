// Actual Step 3 UI; fake keys and mocked discovery only. Optional keyless live CORS check.
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.REVISION_PLAYWRIGHT||'C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
(async()=>{
 let browser,server;
 try{
  const {createGalleryServer}=await import(pathToFileURL(path.resolve(__dirname,'../scripts/serve-nonelinear.mjs')).href);
  server=createGalleryServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}/forge/`,origin=new URL(base).origin;
  browser=await chromium.launch({headless:true,...(process.env.REVISION_BUNDLED_BROWSER==='1'?{}:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'})});
  let models=['gpt-image-2.6-flare','gpt-image-2.6-sunburst','gpt-image-2.5-flare','future-brand'],offline=false,keyFailure=false,delay=0;
  const calls=[],errors=[];
  async function fresh(live=false){
   const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
   await page.clock.install();
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.pathname==='/pricing'&&['infistar.cc','infistar.ai'].includes(url.hostname)){
     calls.push({url:req.url(),headers:req.headers()});
     if(live)return route.continue();
     if(offline)return route.abort('failed');
     const snapshot=[...models];if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
     return route.fulfill({contentType:'text/html',body:`<script id="public-site-pricing-data" type="application/json">${JSON.stringify({success:true,data:[...snapshot.map(model_name=>({model_name,supported_endpoint_types:['image-generation']})),{model_name:'gpt-4o',supported_endpoint_types:['openai']}]})}</script>`});
    }
    if(url.pathname.endsWith('/models'))return keyFailure?route.fulfill({status:401,json:{error:'no access'}}):route.fulfill({json:{data:['gpt-4o','gpt-image-private','gpt-image-2.6-flare','gpt-image-2.6-sunburst','qwen-image-edit-plus'].map(id=>({id}))}});
    if(url.origin===origin)return route.continue();
    return route.abort('blockedbyclient');
   });
   await page.goto(base,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('#provider')?.options.length>1);
   await page.locator('#provider').selectOption('infistar');
   await page.locator('#modeTabs [data-mode="image"]').click();
   return {page,context};
  }
  const values=(p,id='model')=>p.locator(`#${id} option`).evaluateAll(options=>options.map(o=>o.value).filter(Boolean));
  const waitOfficial=p=>p.waitForFunction(()=>document.querySelector('#step3CatalogStatus').textContent.includes('已同步官网最新模型'));
  let {context,page}=await fresh();await waitOfficial(page);
  assert.deepEqual(await values(page),['gpt-image-2.5-flare','future-brand']); // Only image2.6 is hidden from image discovery.
  const recon=await values(page,'reconModel');
  await page.locator('#key').fill('fixture-only');
  await page.waitForFunction(()=>[...document.querySelector('#model').options].some(o=>o.value==='gpt-image-private'));
  assert.deepEqual(await values(page),['gpt-image-2.5-flare','future-brand','gpt-image-private','qwen-image-edit-plus']);assert.deepEqual(await values(page,'reconModel'),recon);
  assert.equal(await page.locator('#step3CatalogStatus').textContent(),'已同步官网最新模型：4 个图像模型。');
  await page.locator('#model').selectOption('future-brand');assert.equal(await page.locator('#model').inputValue(),'future-brand');
  assert.deepEqual(await values(page,'analyzeModel'),['gpt-4o']);
  for(const call of calls){assert.equal(call.headers.authorization,undefined);assert.equal(call.headers.cookie,undefined);assert.equal(new URL(call.url).search,'');}
  // Manual refresh discovers additions and removes delisted models, preserving a valid selection.
  await page.locator('#model').selectOption('gpt-image-2.5-flare');models=['gpt-image-2.5-flare','gemini-nano-banana-2.1','brand-new-image','gpt-image-2.6-flare'];
  await page.locator('#refreshModels').click();await page.waitForFunction(()=>[...document.querySelector('#model').options].some(o=>o.value==='gemini-nano-banana-2.1'));
  assert.equal(await page.locator('#model').inputValue(),'gpt-image-2.5-flare');assert.ok((await values(page)).includes('brand-new-image'));
  // Polling discovers image models while keeping image2.6 hidden.
  models=['gpt-image-2.5-flare','next-image-release','gpt-image-2.6-sunburst'];await page.clock.fastForward(300001);
  await page.waitForFunction(()=>![...document.querySelector('#model').options].some(o=>o.value==='gemini-nano-banana-2.1'));await page.clock.resume();
  assert.deepEqual(await values(page),['gpt-image-2.5-flare','next-image-release','gpt-image-private','qwen-image-edit-plus']);
  keyFailure=true;const deniedResponse=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/models')&&response.status()===401);await page.locator('#key').fill('denied-fixture');await deniedResponse;
  await page.waitForFunction(()=>document.querySelector('#step3CatalogStatus').textContent==='已同步官网最新模型：2 个图像模型。'&&![...document.querySelector('#model').options].some(o=>o.value==='gpt-image-private'));
  assert.deepEqual(await values(page),['gpt-image-2.5-flare','next-image-release']);
  // Offline fallback is explicitly dated and never presented as live.
  offline=true;await page.locator('#refreshModels').click();
  await page.waitForFunction(()=>document.querySelector('#step3CatalogStatus').textContent.includes('官网目录暂时无法读取'));
  assert.match(await page.locator('#model optgroup').getAttribute('label'),/官网缓存.*非实时/);
  assert.deepEqual(await values(page),['gpt-image-2.5-flare','next-image-release']);
  assert.ok(!(await page.evaluate(()=>JSON.stringify(Object.entries(localStorage).filter(([k])=>k.startsWith('ff_step3_'))))).includes('fixture'));
  // A delayed official response cannot overwrite another provider or mode.
  offline=false;delay=1500;models=['gpt-image-STALE'];await page.locator('#refreshModels').click();await page.waitForTimeout(100);
  await page.locator('#provider').selectOption('nonelinear');await page.waitForTimeout(1900);
  assert.ok(!(await values(page)).includes('gpt-image-STALE'));await context.close();
  // No cached directory: public outage is explicit, not a fabricated live catalog.
  offline=true;({page,context}=await fresh());await page.waitForFunction(()=>document.querySelector('#step3CatalogStatus').textContent.includes('官网目录暂时无法读取'));
  assert.ok(!(await page.locator('#step3CatalogStatus').getAttribute('data-catalog-source')).includes('实时目录'));await context.close();
  if(process.env.STEP3_LIVE_OFFICIAL==='1'){
   ({page,context}=await fresh(true));await waitOfficial(page);
   const list=await values(page);assert.ok(list.includes('gpt-image-2.5-flare'));assert.ok(!list.some(id=>id.startsWith('gpt-image-2.6')));
   console.log('LIVE browser CORS verified: '+list.length+' official image models; image2.6 hidden; no key');await context.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS official Step 3 catalog: public/key/cache image models restored, image2.6 hidden, concise status, denied keys, polling, provider isolation; Step 4 unchanged');
 }finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
