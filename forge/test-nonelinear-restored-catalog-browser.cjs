// Current UI, fake keys and public-discovery fixtures; no inference calls.
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
  let images=['gpt-image-2.5-flare','future-painter','gemini-nano-banana-2.1','qwen-image-3.0','Qwen-Image',...Array.from({length:16},(_,i)=>'official-image-'+i)],offline=false,keyFailure=false,delay=0;
  const calls=[],errors=[],vision=['qwen3-vl-32b-instruct','gpt-6.1-terra','claude-opus-5.5','gemini-4-carbon','unfamiliar-vision'];
  const row=(id,kind)=>[id,'vendor','No','/','/','/','/','Yes','<script>throw 1</script>','2026-11-15',kind];
  async function fresh(live=false,loopback=false){
   const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
   await page.clock.install();page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(['nonelinear.com.cn','www.nonelinear.com.cn'].includes(url.hostname)&&url.pathname==='/models'){
     calls.push({url:req.url(),headers:req.headers()});
     if(live)return route.continue();if(offline)return route.abort('failed');
     const rows=[...images.map(id=>row(id,'image')),...vision.map(id=>row(id,'LMM')),row('Qwen3-8B-nothink:free','LLM'),row('unknown-text','LLM'),row('gpt-embedding-only','embedding'),row('gpt-video-only','video')];
     if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
     const offset=Number(url.searchParams.get('offset'));
     return route.fulfill({json:{headers:Array(11).fill('column'),total:rows.length,data:rows.slice(offset,offset+3)}});
    }
    if(url.pathname==='/pricing'&&['infistar.cc','infistar.ai'].includes(url.hostname))return route.fulfill({contentType:'text/html',body:'<script id="public-site-pricing-data" type="application/json">'+JSON.stringify({success:true,data:[{model_name:'infistar-only',supported_endpoint_types:['image-generation']}]})+'</script>'});
    if(url.pathname.endsWith('/models'))return keyFailure?route.fulfill({status:401,json:{error:'no access'}}):route.fulfill({json:{data:[{id:'gpt-4o'},{id:'gpt-image-private'}]}});
    if(url.origin===origin&&url.pathname==='/forge/'){
     // The development server injects a loopback API. Restore the deployed
     // fixed relay in this response only, without editing the shared entry.
     const response=await route.fetch(),html=await response.text();
     const injected='window.FF_NONELINEAR_BASE='+JSON.stringify(origin+'/api/nonelinear/v1');
     assert.ok(html.includes(injected));
     return route.fulfill({response,body:loopback?html:html.replace(injected,'window.FF_NONELINEAR_BASE="https://gallery-nonelinear-relay.lixiao-gallery.workers.dev/v1"')});
    }
    if(url.origin===origin)return route.continue();return route.abort('blockedbyclient');
   });
   await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#provider')?.options.length>1);
   await page.locator('#provider').selectOption('nonelinear');await page.locator('#modeTabs [data-mode="image"]').click();return {page,context};
  }
  const values=(p,id='model')=>p.locator(`#${id} option`).evaluateAll(options=>options.map(o=>o.value).filter(Boolean));
  const waitOfficial=p=>p.waitForFunction(()=>document.querySelector('#step3CatalogStatus').textContent.includes('已同步官网最新模型'));
  let {page,context}=await fresh();await waitOfficial(page);
  assert.deepEqual(await values(page),images);assert.deepEqual(await values(page,'analyzeModel'),vision);
  assert.equal(await page.locator('#step3CatalogStatus').textContent(),'已同步官网最新模型：21 个图像模型。');
  await page.locator('#model').selectOption('future-painter');assert.equal(await page.locator('#model').inputValue(),'future-painter');
  const recon=await values(page,'reconModel');
  await page.locator('#key').fill('fixture-key-only');await page.waitForFunction(()=>document.querySelector('#step3CatalogStatus').textContent==='已同步官网最新模型：22 个图像模型。');
  assert.deepEqual(await values(page),[...images,'gpt-image-private']);assert.deepEqual(await values(page,'reconModel'),recon);
  await page.locator('#modeTabs [data-mode="svg"]').click();await page.waitForFunction(()=>document.querySelector('#step3CatalogStatus').textContent.includes('已合并当前 Key'));
  assert.deepEqual((await values(page)).sort(),[...vision,'Qwen3-8B-nothink:free','unknown-text','gpt-4o'].sort());assert.ok(!(await values(page)).includes('gpt-embedding-only'));
  await page.locator('#modeTabs [data-mode="image"]').click();await waitOfficial(page);
  await page.locator('#model').selectOption(images[0]);images=[images[0],'brand-new-painter'];
  await page.locator('#refreshModels').click();await page.waitForFunction(()=>[...document.querySelector('#model').options].some(o=>o.value==='brand-new-painter'));
  assert.equal(await page.locator('#model').inputValue(),images[0]);assert.ok(!(await values(page)).includes('future-painter'));
  images.push('next-automatic-release');await page.clock.fastForward(300001);await page.waitForFunction(()=>[...document.querySelector('#model').options].some(o=>o.value==='next-automatic-release'));await page.clock.resume();
  keyFailure=true;await page.locator('#key').fill('denied-fixture');await page.waitForFunction(()=>document.querySelector('#step3CatalogStatus').textContent==='已同步官网最新模型：3 个图像模型。'&&![...document.querySelector('#model').options].some(o=>o.value==='gpt-image-private'));assert.ok((await values(page)).includes('next-automatic-release'));
  offline=true;await page.locator('#refreshModels').click();await page.waitForFunction(()=>document.querySelector('#step3CatalogStatus').textContent.includes('官网目录暂时无法读取'));
  assert.deepEqual(await values(page),images);assert.deepEqual(await values(page,'analyzeModel'),vision);
  assert.match(await page.locator('#model optgroup').getAttribute('label'),/非实时/);
  // Separate public provider caches, including an offline return to NoneLinear.
  await page.locator('#provider').selectOption('infistar');await waitOfficial(page);assert.deepEqual(await values(page),['infistar-only']);
  await page.locator('#provider').selectOption('nonelinear');await page.waitForFunction(()=>document.querySelector('#step3CatalogStatus').textContent.includes('官网目录暂时无法读取'));assert.deepEqual(await values(page),images);
  assert.ok(!(await page.evaluate(()=>JSON.stringify(Object.entries(localStorage).filter(([k])=>k.startsWith('ff_step3_'))))).includes('fixture'));
  offline=false;delay=1200;images=['gpt-image-STALE'];await page.locator('#refreshModels').click();await page.waitForTimeout(100);await page.locator('#provider').selectOption('infistar');await waitOfficial(page);await page.waitForTimeout(1700);assert.ok(!(await values(page)).includes('gpt-image-STALE'));await context.close();
  offline=true;delay=0;({page,context}=await fresh());await page.waitForFunction(()=>document.querySelector('#step3CatalogStatus').textContent.includes('官网目录暂时无法读取'));assert.match(await page.locator('#model optgroup').getAttribute('label'),/非实时/);await context.close();
  for(const {url,headers} of calls){assert.equal(headers.authorization,undefined);assert.equal(headers.cookie,undefined);assert.equal(headers.referer,undefined);assert.deepEqual([...new URL(url).searchParams.keys()],['offset','limit']);}
  // Older/custom relay configuration uses the same concise image display.
  // No public-discovery routing or analysis-selection change is introduced.
  offline=false;delay=0;keyFailure=false;
  ({page,context}=await fresh(false,true));
  const keyRequest=page.waitForRequest(req=>req.url().startsWith(origin+'/api/nonelinear/v1/models'));
  await page.locator('#key').fill('relay-fixture-only');await keyRequest;
  await page.waitForFunction(()=>document.querySelector('#step3CatalogStatus').textContent==='已同步官网最新模型：1 个图像模型。');
  assert.ok((await values(page)).includes('gpt-image-private'));
  assert.deepEqual(await values(page,'reconModel'),recon);await context.close();
  if(process.env.STEP3_LIVE_NONELINEAR==='1'){
   offline=false;({page,context}=await fresh(true));await waitOfficial(page);
   const list=await values(page);assert.ok(list.includes('gpt-image-2.5-flare'));assert.ok(list.includes('gemini-nano-banana-2.1'));
   const analysis=await values(page,'analyzeModel');for(const prefix of ['gpt-','claude-','gemini-'])assert.ok(analysis.some(id=>id.startsWith(prefix)));
   console.log('LIVE NoneLinear CORS, keyless: '+list.length+' image and '+analysis.length+' visual models');await context.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS restored NoneLinear images: exact concise status, all official modalities, keyless/partial/denied keys, SVG/vision unchanged, relay display, add/remove/poll, dated cache, provider/key/race isolation; Step 4 unchanged');
 }finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
