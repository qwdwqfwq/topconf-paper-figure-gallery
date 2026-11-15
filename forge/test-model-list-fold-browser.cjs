// Real UI, synthetic catalogs, no paid inference or real credentials.
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
   const context=await browser.newContext({serviceWorkers:'block',locale}),page=await context.newPage();
   let offline=false,future=false,inference=0;const errors=[],publicHeaders=[];
   const chats=['5.3','5.4','5.5','5.6','6','6.1','6.2'].flatMap(v=>['sol','terra'].map(t=>`gpt-${v}-${t}`));
   const images=['1','1.5','2','2.3','2.4','2.5','2.6'].map(v=>'gpt-image-'+v).concat(['gemini-3.1-flash-image','gemini-3.1-flash-lite-image','wan2.2-t2i-plus']);
   const catalogs=()=>({chat:[...chats.filter(id=>!future||!id.startsWith('gpt-5.4-')),...(future?['gpt-6.10-sol']:[])],image:[...images.filter(id=>!future||id!=='gpt-image-1.5'),...(future?['gpt-image-2.7']:[])]});
   const row=(id,kind)=>[id,'vendor','No','/','/','/','/','Yes','','2026-11-15',kind];
   await context.addInitScript(p=>{
    if(localStorage.getItem('fold-fixture-'+p))return;
    localStorage.setItem('fold-fixture-'+p,'1');
    localStorage.setItem('ff_parse_model_'+p,'gpt-5.3-sol');
    localStorage.setItem('ff_amodel_'+p,'gpt-5.3-terra');
    localStorage.setItem('ff_model_'+p,'gpt-image-1');
   },provider);
   await page.clock.install();page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(!['GET','HEAD'].includes(req.method())){inference++;return route.abort();}
    const publicPage=(['nonelinear.com.cn','www.nonelinear.com.cn'].includes(url.hostname)&&url.pathname==='/models')||(['infistar.cc','infistar.ai'].includes(url.hostname)&&url.pathname==='/pricing');
    if(publicPage){
     publicHeaders.push(req.headers());if(offline)return route.abort();const c=catalogs();
     if(url.pathname==='/models'){
      const rows=[...c.chat.map(id=>row(id,'LMM')),...c.image.map(id=>row(id,'image'))],offset=Number(url.searchParams.get('offset'));
      return route.fulfill({json:{headers:Array(11).fill('column'),total:rows.length,data:rows.slice(offset,offset+11)}});
     }
     const data=[...c.chat.map(model_name=>({model_name,supported_endpoint_types:['openai']})),...c.image.map(model_name=>({model_name,supported_endpoint_types:['image-generation']}))];
     return route.fulfill({contentType:'text/html',body:`<script id="public-site-pricing-data" type="application/json">${JSON.stringify({success:true,data})}</script>`});
    }
    if(url.pathname.endsWith('/models'))return route.fulfill({json:{data:[{id:'gpt-6.2-sol'}]}}); // Partial key cannot hide public models.
    if(url.origin===origin&&url.pathname==='/forge/'){
     const response=await route.fetch(),html=await response.text();
     return route.fulfill({response,body:html.replace('window.FF_NONELINEAR_BASE='+JSON.stringify(origin+'/api/nonelinear/v1'),'window.FF_NONELINEAR_BASE="https://gallery-nonelinear-relay.lixiao-gallery.workers.dev/v1"')});
    }
    if(url.origin===origin)return route.continue();return route.abort();
   });
   await page.goto(origin+'/forge/');await page.waitForFunction(()=>document.querySelector('#provider')?.options.length>1);
   await page.locator('#provider').selectOption(provider);await page.locator('#modeTabs [data-mode="image"]').click();
   const synced=()=>page.waitForFunction(()=>['parserCatalogStatus','step3CatalogStatus'].every(id=>/Official catalog synchronized|已同步官网最新目录/.test(document.getElementById(id).textContent)));
   await synced();
   const values=id=>page.locator('#'+id+' option').evaluateAll(options=>options.map(o=>o.value).filter(Boolean));
   const step4=()=>page.evaluate(()=>['reconModel','reconReasoningEffort','reconBtn','reconStatus'].map(id=>{const e=document.getElementById(id);return {id,html:e.outerHTML,value:e.value};}));
   let before=await step4();
   const visualChats=provider==='infistar'?[...chats,'gemini-3.1-flash-image']:chats;
   for(const [id,saved,old,all] of [['parseModel','gpt-5.3-sol','gpt-5.4-sol',chats],['analyzeModel','gpt-5.3-terra','gpt-5.4-terra',visualChats],['model','gpt-image-1','gpt-image-1.5',images]]){
    assert.equal(await page.locator('#'+id).inputValue(),saved);
    assert.ok(!(await values(id)).includes(old));assert.ok((await values(id)).includes(saved));
    const toggle=page.locator('#'+id+'ShowAllModels');assert.equal(await toggle.isVisible(),true);
    await toggle.click();assert.deepEqual(new Set(await values(id)),new Set(all));
    await page.locator('#'+id).selectOption(old);await toggle.click();assert.equal(await page.locator('#'+id).inputValue(),old);
    assert.ok((await values(id)).includes(old));
   }
   assert.deepEqual(await step4(),before);
   await page.locator('#key').fill('fixture-list-only');await page.locator('#refreshModels').click();await synced();
   // The frozen page also refreshes its own Step 4 Key options on this existing button.
   // Snapshot that existing behavior before testing automatic display-only updates.
   await page.waitForFunction(()=>document.querySelector('#reconModel option[value="gpt-6.2-sol"]'));
   before=await step4();
   assert.ok((await values('model')).includes('gemini-3.1-flash-image'));
   // Five-minute automatic update, numeric version order, no manual refresh.
   future=true;await page.clock.fastForward(300001);
   await page.waitForFunction(()=>document.querySelector('#parseModel option[value="gpt-6.10-sol"]')&&document.querySelector('#model option[value="gpt-image-2.7"]'));
   assert.equal((await values('parseModel')).filter(id=>id!=='gpt-5.4-sol')[0],'gpt-6.10-sol');
   assert.equal(await page.locator('#parseModel').inputValue(),'gpt-5.4-sol');
   assert.equal(await page.locator('#analyzeModel').inputValue(),'gpt-5.4-terra');
   assert.equal(await page.locator('#model').inputValue(),'gpt-image-1.5');
   // SVG uses the same folding contract, without leaking image selections.
   await page.locator('#modeTabs [data-mode="svg"]').click();await synced();
   assert.ok((await values('model')).includes('gpt-6.10-sol'));assert.ok(!(await values('model')).some(id=>id.startsWith('gpt-image')));
   await page.locator('#modeTabs [data-mode="image"]').click();await synced();
   // This ID needs official metadata: the frozen heuristic calls it chat.
   // A temporary loading fallback must not replace its saved image selection.
   const imageToggle=page.locator('#modelShowAllModels');
   if(await imageToggle.getAttribute('aria-expanded')!=='true')await imageToggle.click();
   await page.locator('#model').selectOption('wan2.2-t2i-plus');
   await page.locator('#refreshModels').click();await synced();
   assert.equal(await page.locator('#model').inputValue(),'wan2.2-t2i-plus');
   await page.reload();await synced();
   await page.locator('#modeTabs [data-mode="image"]').click();await synced();
   assert.equal(await page.locator('#model').inputValue(),'wan2.2-t2i-plus');
   await page.waitForFunction(()=>document.querySelector('#reconModel option[value="gpt-6.2-sol"]'));
   assert.deepEqual(await step4(),before);
   offline=true;await page.locator('#refreshModels').click();
   await page.waitForFunction(()=>/Official cache|官网缓存/.test(document.querySelector('#parserCatalogStatus').textContent+' '+document.querySelector('#parseModel optgroup')?.label));
   assert.ok((await values('parseModel')).includes('gpt-6.10-sol'));assert.ok((await values('model')).includes('gpt-image-2.7'));
   assert.equal(await page.locator('#parseModel').inputValue(),'gpt-5.4-sol');
   await page.setViewportSize({width:390,height:844});
   for(const id of ['parseModel','model']){const toggle=page.locator('#'+id+'ShowAllModels');await toggle.scrollIntoViewIfNeeded();assert.equal(await toggle.isVisible(),true);}
   assert.deepEqual(await step4(),before);assert.equal(inference,0);assert.deepEqual(errors,[]);
   for(const headers of publicHeaders){assert.equal(headers.authorization,undefined);assert.equal(headers.cookie,undefined);}
   console.log(`PASS ${provider} ${locale}: latest generations, all-model toggle, saved/changed old selection, automatic future release, partial Key + offline cache, SVG, mobile, Step 4 unchanged, no inference`);
   await context.close();
  }
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
