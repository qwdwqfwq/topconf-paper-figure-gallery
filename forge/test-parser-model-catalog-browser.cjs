// Fresh browser storage; only /models is mocked. No inference or real API keys.
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.REVISION_PLAYWRIGHT||'C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
(async()=>{
  let browser,server;let base=process.env.REVISION_TEST_URL;
  try{
    if(!base){const {createGalleryServer}=await import(pathToFileURL(path.resolve(__dirname,'../scripts/serve-nonelinear.mjs')).href);server=createGalleryServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}/forge/`;}
    browser=await chromium.launch({headless:true,...(process.env.REVISION_BUNDLED_BROWSER==='1'?{}:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'})});
    const errors=[],calls=[],origin=new URL(base).origin;
    let mode='live';
    const ids=['gpt-4o','claude-sonnet-4-6','gemini-2.5-pro'];
    async function fresh(){
      const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',async route=>{
        const req=route.request(),url=new URL(req.url());
        if(url.pathname.endsWith('/models')){
          const key=req.headers().authorization||'';calls.push({key,mode,url:req.url()});
          if(mode==='offline')return route.abort('failed');
          if(mode==='forbidden')return route.fulfill({status:401,json:{error:{message:'private upstream response'}}});
          if(key.includes('old-fixture')){await new Promise(resolve=>setTimeout(resolve,2000));return route.fulfill({json:{data:[{id:'OLD_STALE_MODEL'}]}});}
          const list=key.includes('new-fixture')?['NEW_CURRENT_MODEL']:ids;
          return route.fulfill({json:{data:[...list,...list,'gpt-image-1','text-embedding-3-large'].map(id=>({id}))}});
        }
        if(url.origin===origin)return route.continue();
        return route.abort('blockedbyclient');
      });
      await page.goto(base,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.querySelector('#provider')?.options.length>1);
      await page.locator('#provider').selectOption('nonelinear');
      return {context,page};
    }
    async function models(page){return page.locator('#parseModel option').evaluateAll(options=>options.map(o=>o.value));}
    async function assertFamilies(page){const list=await models(page);for(const family of [/^gpt-/i,/^claude-/i,/^gemini-/i])assert.ok(list.some(id=>family.test(id)));assert.equal(new Set(list).size,list.length);}
    // A brand new visitor sees a same-origin public directory before typing a key.
    let {context,page}=await fresh();
    await assertFamilies(page);assert.ok((await models(page)).length>100);
    assert.match(await page.locator('#parseModel optgroup').getAttribute('label'),/非实时/);
    assert.equal(calls.length,0);
    await page.locator('#key').fill('fresh-fixture-key');
    await page.waitForFunction(()=>document.querySelector('#parserCatalogStatus').textContent.includes('已刷新 3'));
    assert.deepEqual(await models(page),ids);assert.equal(calls.length,1);
    await page.locator('#parseModel').selectOption(ids[1]);
    await page.locator('#refreshModels').click();
    await page.waitForFunction(()=>document.querySelector('#parserCatalogStatus').textContent.includes('已刷新 3'));
    assert.equal(await page.locator('#parseModel').inputValue(),ids[1]);
    // Persist only catalog data and a one-way fingerprint, never the key in discovery caches.
    const cache=await page.evaluate(()=>Object.entries(localStorage).filter(([key])=>key.startsWith('ff_parser_catalog_')));
    assert.equal(cache.length,1);assert.ok(!JSON.stringify(cache).includes('fresh-fixture-key'));
    mode='offline';await page.locator('#refreshModels').click();
    await page.waitForFunction(()=>document.querySelector('#parserCatalogStatus').textContent.includes('网络或跨域'));
    assert.deepEqual(await models(page),ids);assert.match(await page.locator('#parseModel optgroup').getAttribute('label'),/上次成功/);
    mode='forbidden';await page.locator('#key').fill('other-account-fixture');
    await page.waitForFunction(()=>document.querySelector('#parserCatalogStatus').textContent.includes('HTTP 401'));
    assert.ok((await models(page)).length>100);assert.match(await page.locator('#parseModel optgroup').getAttribute('label'),/内置目录/);
    await context.close();
    // A first visit with a blocked relay still lists GPT, Claude and Gemini without a warm cache.
    mode='offline';({context,page}=await fresh());await page.locator('#key').fill('offline-fixture-key');
    await page.waitForFunction(()=>document.querySelector('#parserCatalogStatus').textContent.includes('网络或跨域'));
    await assertFamilies(page);assert.ok((await models(page)).length>100);
    assert.match(await page.locator('#parserCatalogStatus').textContent(),/非实时/);
    mode='live';await page.locator('#refreshModels').click();
    await page.waitForFunction(()=>document.querySelector('#parserCatalogStatus').textContent.includes('已刷新 3'));
    assert.deepEqual(await models(page),ids);await context.close();
    // A new key cannot inherit another key's cached catalog, and 401 is not retried.
    mode='forbidden';({context,page}=await fresh());const before=calls.length;
    await page.locator('#key').fill('invalid-fixture');
    await page.waitForFunction(()=>document.querySelector('#parserCatalogStatus').textContent.includes('HTTP 401'));
    assert.equal(calls.length-before,1);await assertFamilies(page);
    assert.ok(!(await page.locator('#parserCatalogStatus').textContent()).includes('private upstream response'));
    mode='live';await page.locator('#key').fill('old-fixture');
    await page.waitForTimeout(850);assert.ok(calls.some(call=>call.key.includes('old-fixture')));
    await page.locator('#key').fill('new-fixture');
    await page.waitForFunction(()=>document.querySelector('#parseModel').value==='NEW_CURRENT_MODEL');
    await page.waitForTimeout(1400);assert.deepEqual(await models(page),['NEW_CURRENT_MODEL']);
    // Changing provider while a request is running must never repaint the new provider.
    await page.locator('#key').fill('old-fixture');await page.waitForTimeout(850);
    await page.locator('#provider').selectOption('oai');
    await page.waitForTimeout(2200);assert.ok(!(await models(page)).includes('OLD_STALE_MODEL'));
    await context.close();assert.deepEqual(errors,[]);
    console.log('PASS: fresh users, automatic refresh, all families, offline fallback, retry recovery, saved choice, cache isolation, key/provider races');
  }finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
