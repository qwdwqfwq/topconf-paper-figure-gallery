// Offline integration: real UI/request/bitmap validation, mocked model responses.
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const {chromium}=require('C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
(async()=>{
 const {createGalleryServer}=await import(pathToFileURL(path.resolve(__dirname,'../scripts/serve-nonelinear.mjs')).href);
 const server=createGalleryServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;
 let browser;const requests=[],errors=[];
 try{
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage({serviceWorkers:'block'});
  page.on('pageerror',e=>errors.push(e.message));
  let image='';
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin!==origin)return route.abort();
   if(url.pathname==='/forge/'){
    const response=await route.fetch();let html=await response.text();
    html=html.replace('window.__ffReconstruct = () => runReconstruction();',`window.__ffReconstruct = () => runReconstruction();
     runReconstruction=async()=>null;
     window.__resolutionTest={
      configure:(model,resolution)=>{mode='image';$('#provider').value='nonelinear';$('#key').value='offline-only';$('#model').add(new Option(model,model));$('#model').value=model;$('#figureRatio').value='16:9';$('#imageResolution').value=resolution;syncImageRatioSupport();return {resolution:$('#imageResolution').value,warn:!$('#imageRatioWarn').hidden,options:[...$('#imageResolution').options].map(o=>({value:o.value,disabled:o.disabled}))};},
      generate:model=>genOaiImage(window.FF_NONELINEAR_BASE,model,'offline-only','Synthetic encoder and classifier paper.','nonelinear',[],'')
     };`);
    return route.fulfill({response,body:html});
   }
   if(url.pathname.startsWith('/api/nonelinear/v1/')){
    if(req.method()==='GET')return route.fulfill({json:{data:[{id:'gemini-3.1-flash-image-preview'}]}});
    assert.equal(url.pathname,'/api/nonelinear/v1/images/generations');requests.push(req.postDataJSON());
    return route.fulfill({json:{data:[{b64_json:image}]}});
   }
   return route.continue();
  });
  await page.goto(origin+'/forge/');
  await page.waitForFunction(()=>window.__resolutionTest && document.querySelector('#provider option[value="nonelinear"]'));
  for(const model of ['gemini-3.1-flash-image-preview','gemini-3-pro-image-preview','gpt-image-2'])for(const resolution of ['2K','4K']){
   const settings=await page.evaluate(({model,resolution})=>window.__resolutionTest.configure(model,resolution),{model,resolution});
   assert.equal(settings.resolution,resolution);assert.equal(settings.warn,false);
   const width=resolution==='2K'?2048:model.startsWith('gpt-')?3840:4096,height=width*9/16;
   image=await page.evaluate(({width,height})=>{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas.toDataURL('image/png').split(',')[1];},{width,height});
   await page.evaluate(model=>window.__resolutionTest.generate(model),model);
   const request=requests.at(-1);assert.equal(request.model,model);
   if(model.startsWith('gemini-')){assert.equal(request.size,resolution);assert.equal(request.aspect_ratio,'16:9');}
   else assert.equal(request.size,`${width}x${height}`);
   const actual=await page.locator('[data-step3-output]').evaluate(img=>({width:img.naturalWidth,height:img.naturalHeight}));
   assert.deepEqual(actual,{width,height});
  }
  const old=await page.evaluate(()=>window.__resolutionTest.configure('gemini-2.5-flash-image','4K'));
  assert.equal(old.resolution,'1K');assert.equal(old.options.find(o=>o.value==='4K').disabled,true);
  assert.deepEqual(errors,[]);assert.equal(requests.length,6);
  console.log('NoneLinear browser regression passed: six real UI → mocked image API → 2K/4K bitmap validations, zero live API calls.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
