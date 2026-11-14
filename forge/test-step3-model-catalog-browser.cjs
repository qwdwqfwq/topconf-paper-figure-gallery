// Actual UI, fresh storage, mocked discovery only. Never uses real keys/inference.
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.REVISION_PLAYWRIGHT||'C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
(async()=>{
  let browser,server,base=process.env.REVISION_TEST_URL;
  try{
    if(!base){const {createGalleryServer}=await import(pathToFileURL(path.resolve(__dirname,'../scripts/serve-nonelinear.mjs')).href);server=createGalleryServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}/forge/`;}
    browser=await chromium.launch({headless:true,...(process.env.REVISION_BUNDLED_BROWSER==='1'?{}:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'})});
    const origin=new URL(base).origin,errors=[],calls=[];
    const visual=['gpt-6.1-terra','claude-sonnet-4-6','gemini-2.5-pro'];
    const image=['gpt-image-1','Qwen-Image','gemini-3.1-flash-image'];
    const fixture=[...visual,'Qwen3-8B-nothink:free',...image,'text-embedding-3-large','tts-1','video-seedance'];
    let response='live';
    async function fresh(){
      const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',async route=>{
        const req=route.request(),url=new URL(req.url());
        if(url.pathname.endsWith('/models')){
          const key=req.headers().authorization||'';calls.push({key,response,url:req.url()});
          if(response==='offline')return route.abort('failed');
          if(response==='401')return route.fulfill({status:401,json:{error:{message:'secret upstream details'}}});
          if(response==='schema')return route.fulfill({json:{unexpected:fixture}});
          if(response==='empty')return route.fulfill({json:{data:[]}});
          if(key.includes('old-fixture')){await new Promise(resolve=>setTimeout(resolve,1800));return route.fulfill({json:{data:['gpt-4o-OLD','gpt-image-OLD']}});}
          const rows=key.includes('new-fixture')?['gpt-4o-NEW','gpt-image-NEW']:response==='partial'?visual:fixture;
          return route.fulfill({json:{models:[...rows,...rows].map((id,i)=>i%3===0?id:i%3===1?{id}:{name:id})}});
        }
        if(url.origin===origin)return route.continue();
        return route.abort('blockedbyclient');
      });
      await page.goto(base,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.querySelector('#provider')?.options.length>1);
      await page.locator('#provider').selectOption('nonelinear');
      return {context,page};
    }
    const values=(page,id)=>page.locator(`#${id} option`).evaluateAll(options=>options.map(o=>o.value).filter(Boolean));
    const status=page=>page.locator('#step3CatalogStatus');
    const waitLive=page=>page.waitForFunction(()=>document.querySelector('#step3CatalogStatus').textContent.includes('已刷新步骤三'));
    async function families(page,id){const list=await values(page,id);for(const re of [/^gpt-/i,/^claude-/i,/^gemini-/i])assert.ok(list.some(x=>re.test(x)),id+' missing '+re);assert.equal(new Set(list).size,list.length);}
    let {context,page}=await fresh();
    await families(page,'model');await families(page,'analyzeModel');
    assert.ok((await values(page,'model')).length>100);
    assert.match(await page.locator('#model optgroup').getAttribute('label'),/非实时/);
    const reconBefore=await values(page,'reconModel');
    // Key input automatically refreshes Step 1 and Step 3, but never Step 4.
    const before=calls.length;await page.locator('#key').fill('fresh-fixture');await waitLive(page);
    await page.waitForFunction(()=>document.querySelector('#parserCatalogStatus').textContent.includes('已刷新'));
    assert.equal(calls.length-before,2);
    assert.deepEqual(await values(page,'model'),[...visual,'Qwen3-8B-nothink:free']);
    assert.deepEqual(await values(page,'analyzeModel'),[...visual,'gemini-3.1-flash-image']);
    assert.deepEqual(await values(page,'reconModel'),reconBefore);
    assert.deepEqual(await values(page,'parseModel'),[...visual,'Qwen3-8B-nothink:free']);
    await page.locator('#modeTabs [data-mode="image"]').click();await waitLive(page);
    await page.waitForFunction(()=>!document.querySelector('#analyzeModelRow').hidden);
    assert.deepEqual(await values(page,'model'),image);
    await page.locator('#model').selectOption('gpt-image-1');await page.locator('#analyzeModel').selectOption(visual[1]);
    await page.locator('#refreshModels').click();await waitLive(page);
    assert.equal(await page.locator('#model').inputValue(),'gpt-image-1');
    assert.equal(await page.locator('#analyzeModel').inputValue(),visual[1]);
    const caches=await page.evaluate(()=>Object.entries(localStorage).filter(([k])=>k.startsWith('ff_step3_catalog_')));
    assert.equal(caches.length,1);assert.ok(!JSON.stringify(caches).includes('fresh-fixture'));
    // Cached directory survives a transient failure and explicit retry recovers.
    response='offline';await page.locator('#refreshModels').click();
    await page.waitForFunction(()=>document.querySelector('#step3CatalogStatus').textContent.includes('网络或跨域'));
    for(const id of image)assert.ok((await values(page,'model')).includes(id));
    await families(page,'analyzeModel');assert.match(await status(page).textContent(),/上次成功.*非实时/);
    response='live';await page.locator('#refreshModels').click();await waitLive(page);
    // Partial live catalogs use a compatible fallback for the missing category.
    response='partial';await page.locator('#refreshModels').click();await waitLive(page);
    assert.ok((await values(page,'model')).includes('gpt-image-1'));
    assert.match(await status(page).textContent(),/图像目录无适用项/);
    assert.deepEqual(await values(page,'analyzeModel'),visual);
    response='schema';await page.locator('#refreshModels').click();
    await page.waitForFunction(()=>document.querySelector('#step3CatalogStatus').textContent.includes('目录格式异常'));
    response='empty';await page.locator('#refreshModels').click();
    await page.waitForFunction(()=>document.querySelector('#step3CatalogStatus').textContent.includes('返回空目录'));
    // New keys never inherit old key caches. 401 is not retried by either controller.
    response='401';const invalidBefore=calls.length;await page.locator('#key').fill('invalid-fixture');
    await page.waitForFunction(()=>document.querySelector('#step3CatalogStatus').textContent.includes('HTTP 401'));
    await page.waitForFunction(()=>document.querySelector('#parserCatalogStatus').textContent.includes('HTTP 401'));
    assert.equal(calls.length-invalidBefore,2);assert.match(await status(page).textContent(),/内置目录/);
    assert.ok(!(await status(page).textContent()).includes('secret upstream details'));
    response='live';await page.locator('#key').fill('old-fixture');await page.waitForTimeout(800);
    await page.locator('#key').fill('new-fixture');await waitLive(page);
    await page.waitForTimeout(1500);
    assert.deepEqual(await values(page,'model'),['gpt-image-NEW']);assert.deepEqual(await values(page,'analyzeModel'),['gpt-4o-NEW']);
    // Mode races cannot put image models into the SVG list.
    await page.locator('#key').fill('old-fixture');await page.waitForTimeout(800);
    await page.locator('#modeTabs [data-mode="svg"]').click();await waitLive(page);
    assert.deepEqual(await values(page,'model'),['gpt-4o-OLD']);
    // A different endpoint must not use the provider-specific public fallback/cache.
    await page.locator('#key').fill('old-fixture');await page.waitForTimeout(800);
    // Legacy relay switch is intentionally hidden; exercise its configuration event.
    await page.evaluate(()=>{const relay=document.querySelector('#useRelay');relay.checked=true;relay.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.locator('#baseOverride').fill('https://other-endpoint.invalid/v1');
    response='401';await page.waitForFunction(()=>document.querySelector('#step3CatalogStatus').textContent.includes('HTTP 401'));
    assert.ok(!(await values(page,'model')).includes('gpt-4o-OLD'));assert.match(await status(page).textContent(),/预设模型/);
    await page.locator('#provider').selectOption('oai');await page.waitForTimeout(1900);
    assert.ok(!(await values(page,'model')).includes('gpt-4o-OLD'));await context.close();
    // New visitors with no cache see all three visual families even when discovery is blocked.
    response='offline';({context,page}=await fresh());await page.locator('#key').fill('first-visit-offline');
    await page.waitForFunction(()=>document.querySelector('#step3CatalogStatus').textContent.includes('网络或跨域'));
    await families(page,'model');await families(page,'analyzeModel');
    await page.locator('#modeTabs [data-mode="image"]').click();
    assert.ok((await values(page,'model')).some(x=>/^gpt-image/i.test(x)));
    assert.match(await status(page).textContent(),/目录不代表.*调用权限/);
    await context.close();assert.deepEqual(errors,[]);
    console.log('PASS Step 3: fresh/offline visitors, SVG/image/vision classification, all families, automatic refresh, retries, saved choices, cache/key/endpoint/mode/provider isolation; Step 1 preserved; no Step 4 auto-refresh');
  }finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
