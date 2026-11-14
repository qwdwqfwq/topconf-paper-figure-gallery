const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const {chromium}=require(process.env.REVISION_PLAYWRIGHT||'C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
(async()=>{
 const {createGalleryServer}=await import(pathToFileURL(path.resolve(__dirname,'../scripts/serve-nonelinear.mjs')).href);
 const server=createGalleryServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;let browser,posts=0;
 try{
  browser=await chromium.launch({headless:true,...(process.env.REVISION_BUNDLED_BROWSER==='1'?{}:{executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'})});
  const page=await browser.newPage({serviceWorkers:'block'});
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(req.method()==='POST'){posts++;return route.abort();}
   if(url.origin!==origin)return route.abort();
   if(url.pathname==='/forge/'){
    const response=await route.fetch();let html=await response.text();
    html=html.replace('window.__ffReconstruct = () => runReconstruction();',`window.__ffReconstruct = () => runReconstruction();
     window.__capabilityTest=async()=>{
      await revisionGallery.ready;mode='image';$('#provider').value='infistar';
      const change=model=>{if(!Array.from($('#model').options).some(o=>o.value===model))$('#model').add(new Option(model,model));$('#model').value=model;$('#model').dispatchEvent(new Event('change',{bubbles:true}));return {values:Array.from($('#imageResolution').options,o=>o.value),selected:$('#imageResolution').value};};
      $('#figureRatio').value='16:9';
      const gpt=change('gpt-image-2.5-sunburst');$('#imageResolution').value='2K';
      const lite=change('gemini-3.1-flash-lite-image');
      $('#figureRatio').value='1:1';$('#figureRatio').dispatchEvent(new Event('change',{bubbles:true}));const square=Array.from($('#imageResolution').options,o=>o.value);
      $('#figureRatio').value='16:9';$('#figureRatio').dispatchEvent(new Event('change',{bubbles:true}));
      $('#imageResolution').add(new Option('2K','2K'));$('#imageResolution').value='2K';
      let staleError='';try{await genOaiImage('https://infistar.cc/v1','gemini-3.1-flash-lite-image','offline-secret','fixture','infistar',[],'');}catch(e){staleError=e.message;}
      const restored=change('gpt-image-2.5-sunburst');
      $('#provider').value='oai';const unsupported=change('gpt-image-1');const disabled=$('#imageResolution').disabled;
      $('#figureRatio').value='3:2';$('#figureRatio').dispatchEvent(new Event('change',{bubbles:true}));const recovered={values:Array.from($('#imageResolution').options,o=>o.value),disabled:$('#imageResolution').disabled};
      return {gpt,lite,square,staleError,restored,unsupported,disabled,recovered};
     };`);
    return route.fulfill({response,body:html});
   }
   return route.continue();
  });
  await page.goto(origin+'/forge/');await page.waitForFunction(()=>window.__capabilityTest&&document.querySelector('#provider option[value="infistar"]'));
  const r=await page.evaluate(()=>window.__capabilityTest());
  assert.deepEqual(r.gpt.values,['1K','2K','4K']);assert.deepEqual(r.lite,{values:['1K'],selected:'1K'});
  assert.deepEqual(r.square,['1K']);assert.match(r.staleError,/不支持.*2K/);assert.deepEqual(r.restored.values,['1K','2K','4K']);
  assert.deepEqual(r.unsupported.values,[]);assert.equal(r.disabled,true);assert.deepEqual(r.recovered,{values:['1K'],disabled:false});assert.equal(posts,0);
  console.log('PASS real UI model switches, ratio changes, restored choices, stale 2K blocked before POST');
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
