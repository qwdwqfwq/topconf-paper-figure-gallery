// Real application guards; synthetic public catalogs; no inference or real keys.
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.REVISION_PLAYWRIGHT||'C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const images=['gpt-image-2.6-flare','gpt-image-2.5-sunburst','gpt-image-2.5-flare','gpt-image-2','gemini-nano-banana-2.1','gemini-3.1-flash-image','gemini-3.1-flash-lite-image','gemini-3-pro-image','qwen-image-3.0-pro','wan2.7-image-pro','wan2.7-image','qwen-image-2.0-pro','qwen-image-2.0','qwen-image-3.0','doubao-seedream-5-0-pro','doubao-seedream-5-0-260128','doubao-seedream-5-0-flash','doubao-seedream-4-5','doubao-seedream-4-0-250828','grok-imagine-image','grok-imagine-image-quality','jimeng-image-4.6','jimeng-image-4.0','future-brand-9000','video-future-image-output'];
(async()=>{
 const {createGalleryServer}=await import(pathToFileURL(path.resolve(__dirname,'../scripts/serve-nonelinear.mjs')).href);
 const server=createGalleryServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;let browser,inference=0;
 try{
  browser=await chromium.launch({headless:true,...(process.env.REVISION_BUNDLED_BROWSER==='1'?{}:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'})});
  for(const provider of ['infistar','nonelinear']){
   const page=await browser.newPage({serviceWorkers:'block'});let offline=false;
   await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(!['GET','HEAD'].includes(req.method())){inference++;return route.abort();}
    if(url.pathname==='/pricing'){
     if(offline)return route.abort();
     const data=[...images.map(model_name=>({model_name,supported_endpoint_types:['image-generation']})),{model_name:'image-named-chat-only',supported_endpoint_types:['openai']},{model_name:'ordinary-chat',supported_endpoint_types:['openai']}];
     return route.fulfill({contentType:'text/html',body:`<script id="public-site-pricing-data" type="application/json">${JSON.stringify({success:true,data})}</script>`});
    }
    if(['nonelinear.com.cn','www.nonelinear.com.cn'].includes(url.hostname)&&url.pathname==='/models'){
     if(offline)return route.abort();
     const row=(id,kind)=>[id,'vendor','No','/','/','/','/','Yes','','2026-11-15',kind];
     const data=[...images.map(id=>row(id,'image')),row('image-named-chat-only','LMM'),row('ordinary-chat','LMM')];
     return route.fulfill({json:{headers:Array(11).fill('column'),total:data.length,data}});
    }
    if(url.pathname.endsWith('/models'))return route.fulfill({json:{data:[{id:'ordinary-chat'}]}});
    if(url.origin===origin&&url.pathname==='/forge/'){
     const response=await route.fetch();let html=await response.text();
     html=html.replace('window.FF_NONELINEAR_BASE='+JSON.stringify(origin+'/api/nonelinear/v1'),'window.FF_NONELINEAR_BASE="https://gallery-nonelinear-relay.lixiao-gallery.workers.dev/v1"');
     html=html.replace("      imageRequestDimensions(p,model,$('#figureRatio').value,$('#imageResolution').value,usesInfistarGemini(base,model));","      throw Error('PASSED_IMAGE_CLASSIFICATION');");
     // Expose module-local application functions only in this test response.
     html=html.replace('window.__ffReconstruct = () => runReconstruction();',`window.__ffReconstruct = () => runReconstruction();
      window.__classificationTest={catalog:step3Catalog,revisionConfiguration,kindOf,async guards(model){
       await revisionGallery.ready;$('#paper').value='Offline classification fixture';refs.add('fixture');$('#key').value='offline-classification';
       if(!Array.from($('#model').options).some(o=>o.value===model))$('#model').add(new Option(model,model));$('#model').value=model;
       let revision;try{revision=revisionConfiguration({source:'image'}).route.model;}catch(e){revision=e.message;}
       await $('#genBtn').onclick();
       return {revision,generation:$('#genErr').textContent,accepted:step3Catalog().isImageModel(model)};
      }};`);
     return route.fulfill({response,body:html});
    }
    return url.origin===origin?route.continue():route.abort();
   });
   await page.goto(origin+'/forge/');await page.waitForFunction(()=>window.__classificationTest&&document.querySelector('#provider option[value="infistar"]'));
   await page.locator('#provider').selectOption(provider);await page.locator('#modeTabs [data-mode="image"]').click();
   await page.locator('#key').fill('offline-classification');await page.locator('#refreshModels').click();
   const synced=()=>page.waitForFunction(()=>/Official catalog synchronized|已同步官网最新目录/.test(document.querySelector('#step3CatalogStatus').textContent));
   await synced();
   const check=async()=>{
    const listed=await page.evaluate(()=>window.__classificationTest.catalog().getState().main);
    assert.deepEqual(new Set(listed),new Set(images));
    for(const model of listed){
     const r=await page.evaluate(m=>window.__classificationTest.guards(m),model);
     assert.deepEqual(r,{revision:model,generation:'PASSED_IMAGE_CLASSIFICATION',accepted:true},provider+': '+model);
    }
    for(const model of ['image-named-chat-only','ordinary-chat','']){
     const r=await page.evaluate(m=>window.__classificationTest.guards(m),model);
     assert.equal(r.accepted,false);assert.match(r.revision,/请选择|选择图像模型/);assert.notEqual(r.generation,'PASSED_IMAGE_CLASSIFICATION');
    }
   };
   await check();
   assert.equal(await page.evaluate(()=>window.__classificationTest.kindOf('gemini-nano-banana-2.1')),'chat','Shared frozen heuristic must remain untouched');
   offline=true;await page.locator('#refreshModels').click();
   await page.waitForFunction(()=>/官网目录暂时无法读取|Official catalog is temporarily unavailable/.test(document.querySelector('#step3CatalogStatus').textContent));
   await check(); // Cached official types must support the same two guards.
   const isolated=await page.evaluate(()=>{
    const t=window.__classificationTest,c=t.catalog(),base=document.querySelector('#baseOverride'),key=document.querySelector('#key');
    const accepted=()=>c.isImageModel('future-brand-9000');
    const savedBase=base.value,savedKey=key.value;key.value='different-key';const keyChanged=accepted();key.value=savedKey;
    const relay=document.querySelector('#useRelay'),savedRelay=relay.checked;relay.checked=true;
    base.value='https://different.invalid/v1';const baseChanged=accepted();base.value=savedBase;relay.checked=savedRelay;
    const provider=document.querySelector('#provider'),savedProvider=provider.value;provider.value='oai';const providerChanged=accepted();provider.value=savedProvider;
    return {keyChanged,baseChanged,providerChanged};
   });
   assert.deepEqual(isolated,{keyChanged:false,baseChanged:false,providerChanged:false});
   await page.locator('#modeTabs [data-mode="svg"]').click();
   assert.equal(await page.evaluate(()=>window.__classificationTest.catalog().isImageModel('gemini-nano-banana-2.1')),false);
   console.log('PASS '+provider+': 23 current image models and 2 future names pass both guards, chat rejected, cache and config isolation preserved');
   await page.close();
  }
  assert.equal(inference,0);
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
