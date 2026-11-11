// Offline browser integration. Only image responses and reconstruction are stubbed.
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const {chromium}=require('C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
(async()=>{
 const {createGalleryServer}=await import(pathToFileURL(path.resolve(__dirname,'../scripts/serve-nonelinear.mjs')).href);
 const server=createGalleryServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;
 let browser,image='',fail=false;const requests=[],errors=[];
 try{
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage({serviceWorkers:'block',viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin!==origin)return route.abort();
   if(url.pathname==='/forge/'){
    const response=await route.fetch();let html=await response.text();
    html=html.replace('window.__ffReconstruct = () => runReconstruction();',`window.__ffReconstruct = () => runReconstruction();
     const testJobs=[];
     runReconstruction=async()=>{const st=ensureExportState(),number=testJobs.length+1;
      await new Promise(resolve=>testJobs.push({resolve,bitmap:st.bitmap}));
      const svg='<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="1152"><text x="20" y="40">Result '+number+'</text></svg>';
      Object.assign(st,{scene:{width:2048,height:1152,nodes:[],version:number},svg,baseSvg:svg,vectorSvg:svg,recon:{audit:{pipeline:'direct-whole-image-v1',state:'succeeded'},qualityState:'not-run'}});
      return true;};
     window.__revisionTest={jobs:testJobs,state:()=>ensureExportState(),
      configure:()=>{mode='image';$('#provider').value='nonelinear';$('#key').value='offline-only';const m='gemini-3.1-flash-image-preview';$('#model').add(new Option(m,m));$('#model').value=m;$('#figureRatio').value='16:9';$('#imageResolution').value='2K';syncImageRatioSupport();},
      generate:()=>genOaiImage(window.FF_NONELINEAR_BASE,'gemini-3.1-flash-image-preview','offline-only','Synthetic paper.','nonelinear',[],''),
      records:()=>new Promise(resolve=>{const r=indexedDB.open('figureforge-revisions',1);r.onsuccess=()=>{const q=r.result.transaction('versions').objectStore('versions').getAll();q.onsuccess=()=>resolve(q.result);};})
     };`);
    return route.fulfill({response,body:html});
   }
   if(url.pathname.startsWith('/api/nonelinear/v1/')){
    if(req.method()==='GET')return route.fulfill({json:{data:[{id:'gemini-3.1-flash-image-preview'}]}});
    requests.push(req.postDataJSON());
    return fail?route.fulfill({status:400,json:{error:{message:'Invalid reference image'}}}):route.fulfill({json:{data:[{b64_json:image}]}});
   }
   return route.continue();
  });
  await page.goto(origin+'/forge/');
  await page.waitForFunction(()=>window.__revisionTest&&document.querySelector('#provider option[value="nonelinear"]'));
  await page.evaluate(()=>window.__revisionTest.configure());
  async function bitmap(n){image=await page.evaluate(n=>{const c=document.createElement('canvas');c.width=2048;c.height=1152;const x=c.getContext('2d');x.fillStyle='#f8f7ff';x.fillRect(0,0,c.width,c.height);x.fillStyle='#7351df';x.font='bold 68px sans-serif';x.fillText('FigureForge · V'+n,110,150);for(let i=0;i<3;i++){x.fillStyle=['#d8ebf7','#e6ddf6','#dbf0e0'][i];x.fillRect(110+i*640,300,560,650);x.fillStyle='#41445c';x.font='44px sans-serif';x.fillText(['Input','Method','Results'][i],160+i*640,400);}return c.toDataURL().split(',')[1];},n);}
  const cards=page.locator('.ff-version');
  async function modify(index,prompt,n){await bitmap(n);await cards.nth(index).locator('[data-modify]').click();await page.locator('.ff-revision-editor textarea').fill(prompt);await page.locator('.ff-revision-editor [data-submit]').click();}
  async function resolve(index){await page.evaluate(i=>window.__revisionTest.jobs[i].resolve(),index);await page.waitForFunction(()=>!window.__revisionTest.state().reconPending);}
  await bitmap(1);await page.evaluate(()=>window.__revisionTest.generate());
  await page.waitForFunction(()=>window.__revisionTest.jobs.length===1);
  assert.equal(await cards.count(),1);
  const v1=await cards.nth(0).locator('img').getAttribute('src');
  await modify(0,'删除多余内容',2);await page.waitForFunction(()=>document.querySelectorAll('.ff-version').length===2);
  assert.deepEqual(requests.at(-1).image,[v1]);assert.equal(await page.evaluate(()=>window.__revisionTest.jobs.length),1);
  assert.equal(await cards.nth(1).locator('[data-build]').isDisabled(),true);
  await resolve(0);await cards.nth(1).locator('[data-build]').click();
  await page.waitForFunction(()=>window.__revisionTest.jobs.length===2);
  const v2=await cards.nth(1).locator('img').getAttribute('src');
  assert.equal(await page.evaluate(()=>window.__revisionTest.jobs[1].bitmap),v2);
  await modify(1,'调整排版',3);await page.waitForFunction(()=>document.querySelectorAll('.ff-version').length===3);
  assert.deepEqual(requests.at(-1).image,[v2]);assert.equal(await page.evaluate(()=>window.__revisionTest.jobs.length),2);
  await resolve(1);assert.equal(await page.evaluate(()=>window.__revisionTest.jobs.length),2);
  await cards.nth(0).locator('[data-build]').click();assert.equal(await page.evaluate(()=>window.__revisionTest.state().scene.version),1);
  await cards.nth(1).locator('[data-build]').click();assert.equal(await page.evaluate(()=>window.__revisionTest.state().scene.version),2);
  // Screenshot drafts stay with their source version and all three intake paths agree.
  await cards.nth(2).locator('[data-modify]').click();
  const screenshot=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=50;c.getContext('2d').fillRect(5,5,50,30);return c.toDataURL();});
  await page.locator('[data-files]').setInputFiles({name:'region.png',mimeType:'image/png',buffer:Buffer.from(screenshot.split(',')[1],'base64')});
  await page.waitForFunction(()=>document.querySelectorAll('[data-preview]').length===1);
  await page.locator('[data-preview]').click();assert.equal(await page.locator('dialog[open] img').getAttribute('src'),screenshot);
  await page.locator('dialog[open] button').click();
  await page.evaluate(data=>{const bytes=Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0));const dt=new DataTransfer();dt.items.add(new File([bytes],'paste.png',{type:'image/png'}));document.querySelector('textarea[aria-label="你希望改哪里？"]').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt}));},screenshot);
  await page.waitForFunction(()=>document.querySelectorAll('[data-preview]').length===2);
  await page.evaluate(data=>{const bytes=Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0));const dt=new DataTransfer();dt.items.add(new File([bytes],'drop.png',{type:'image/png'}));document.querySelector('.ff-revision-editor').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));},screenshot);
  await page.waitForFunction(()=>document.querySelectorAll('[data-preview]').length===3);
  await page.locator('[data-remove]').nth(1).click();assert.equal(await page.locator('[data-preview]').count(),2);
  await cards.nth(1).locator('[data-modify]').click();assert.equal(await page.locator('[data-preview]').count(),0);
  await cards.nth(2).locator('[data-modify]').click();assert.equal(await page.locator('[data-preview]').count(),2);
  await page.locator('.ff-revision-editor').screenshot({path:path.join(require('node:os').tmpdir(),'figureforge-screenshot-editor.png')});
  const v3=await cards.nth(2).locator('img').getAttribute('src');
  await modify(2,'优化标题，参考截图中的位置',4);await page.waitForFunction(()=>document.querySelectorAll('.ff-version').length===4);
  assert.deepEqual(requests.at(-1).image,[v3,screenshot,screenshot]);
  assert.ok(requests.at(-1).prompt.includes('The first image is the complete figure'));
  assert.equal(await page.locator('[data-preview]').count(),0);
  // A failed request retains screenshots for a manual retry.
  await cards.nth(0).locator('[data-modify]').click();
  await page.locator('[data-files]').setInputFiles({name:'retry.png',mimeType:'image/png',buffer:Buffer.from(screenshot.split(',')[1],'base64')});
  await page.waitForFunction(()=>document.querySelectorAll('[data-preview]').length===1);
  const count=requests.length;fail=true;await modify(0,'再次修改',5);
  await page.waitForFunction(()=>document.querySelector('.ff-revision-error').textContent.includes('失败'));
  assert.equal(await cards.count(),4);assert.equal(requests.length,count+1);assert.deepEqual(requests.at(-1).image,[v1,screenshot]);
  assert.equal(await page.locator('[data-preview]').count(),1);
  fail=false;await page.locator('.ff-revision-editor [data-submit]').click();await page.waitForFunction(()=>document.querySelectorAll('.ff-version').length===5);
  await page.waitForFunction(async()=> (await window.__revisionTest.records()).length===5);
  const records=await page.evaluate(()=>window.__revisionTest.records());
  assert.equal(records.find(v=>v.number===1).state.scene.version,1);assert.equal(records.find(v=>v.number===2).state.scene.version,2);
  assert.equal(records.find(v=>v.number===5).parentId,records.find(v=>v.number===1).id);
  assert.equal(JSON.stringify(records).includes('offline-only'),false);
  assert.equal(records.some(v=>'attachmentsDraft' in v||'attachments' in v),false);
  const formats=await page.evaluate(async({source,shot})=>{
   const {generateRevision}=await import('./revision-gallery.mjs?v=20261112');const originalFetch=window.fetch,seen=[];
   try{
    for(const route of [
     {base:'https://infistar.cc/v1',model:'gemini-3.1-flash-image-preview',p:'infistar',ratio:'16:9',resolution:'2K'},
     {base:'https://api.example.test/v1',model:'gpt-image-2',p:'oai',ratio:'16:9',resolution:'2K'},
     {base:'https://api.example.test/v1',model:'image-model',p:'sf',ratio:'1:1',resolution:'1K'}]){
     window.fetch=async(url,options)=>{
      if(options.body instanceof FormData){seen.push({kind:'multipart',url,images:await Promise.all(options.body.getAll('image[]').map(file=>new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(file);}))),size:options.body.get('size')});}
      else{const body=JSON.parse(options.body);seen.push({kind:body.contents?'native':'json',url,body});}
      return new Response(JSON.stringify({data:[{b64_json:source.split(',')[1]}],candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:source.split(',')[1]}}]}}]}));
     };
     await generateRevision({image:source,route,attachments:[{data:shot}]},'change the marked area',{key:'offline-only',toDataURL:async x=>x,loadImage:async()=>({width:route.p==='sf'?1024:2048,height:route.p==='sf'?1024:1152})});
    }
   }finally{window.fetch=originalFetch;}
   return seen;
  },{source:v1,shot:screenshot});
  assert.deepEqual(formats[0].body.contents[0].parts.slice(1).map(x=>'data:image/png;base64,'+x.inlineData.data),[v1,screenshot]);
  assert.deepEqual(formats[0].body.generationConfig.imageConfig,{aspectRatio:'16:9',imageSize:'2K'});
  assert.deepEqual(formats[1].images,[v1,screenshot]);assert.equal(formats[1].size,'2048x1152');assert.ok(formats[1].url.endsWith('/images/edits'));
  assert.deepEqual(formats[2].body.image,[v1,screenshot]);assert.equal(formats[2].body.image_size,'1024x1024');
  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.ff-version').length===5);
  await cards.nth(1).locator('[data-build]').click();assert.equal(await page.evaluate(()=>window.__revisionTest.state().scene.version),2);
  await cards.nth(4).locator('[data-modify]').click();
  await page.locator('.ff-revisions').screenshot({path:path.join(require('node:os').tmpdir(),'figureforge-revision-preview.png')});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.locator('.ff-revisions').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
  await page.locator('.ff-revision-editor').screenshot({path:path.join(require('node:os').tmpdir(),'figureforge-revision-mobile.png')});
  assert.deepEqual(errors,[]);
  // Existing SVG output may replace #out; the next bitmap must restore the gallery.
  await page.evaluate(()=>window.__ffRenderSVG('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="80" height="80"/></svg>',false,[],false));
  await page.evaluate(()=>window.__revisionTest.configure());await bitmap(6);await page.evaluate(()=>window.__revisionTest.generate());
  await page.waitForFunction(()=>document.querySelectorAll('.ff-version').length===6);
  await cards.nth(0).locator('[data-modify]').click();
  assert.equal(await page.evaluate(()=>window.__revisionTest.jobs.length),1);
  assert.equal(await cards.nth(0).locator('[data-delete]').isDisabled(),true);
  await resolve(0);
  await page.waitForFunction(()=>!document.querySelector('[data-delete]').disabled);
  await page.waitForFunction(async()=> (await window.__revisionTest.records()).length===6);
  const beforeDelete=await page.evaluate(()=>window.__revisionTest.records());
  page.once('dialog',dialog=>dialog.dismiss());await cards.nth(1).locator('[data-delete]').click();
  assert.equal(await cards.count(),6);
  // Failed storage deletion keeps both the card and its persisted result.
  await page.evaluate(()=>{window.originalDelete=IDBObjectStore.prototype.delete;IDBObjectStore.prototype.delete=function(){throw Error('offline failure');};});
  page.once('dialog',dialog=>dialog.accept());await cards.nth(1).locator('[data-delete]').click();
  await page.waitForFunction(()=>document.querySelector('.ff-revision-storage').textContent.includes('删除失败'));
  assert.equal(await cards.count(),6);
  await page.evaluate(()=>{IDBObjectStore.prototype.delete=window.originalDelete;});
  page.once('dialog',dialog=>dialog.accept());await cards.nth(1).locator('[data-delete]').click();
  await page.waitForFunction(()=>document.querySelectorAll('.ff-version').length===5);
  const afterDelete=await page.evaluate(()=>window.__revisionTest.records());
  assert.deepEqual(afterDelete,beforeDelete.filter(v=>v.number!==2));
  assert.equal(afterDelete.some(v=>v.parentId===beforeDelete.find(x=>x.number===2).id),true);
  // Active-version deletion chooses a surviving version without reconstruction.
  page.once('dialog',dialog=>dialog.accept());await cards.nth(4).locator('[data-delete]').click();
  await page.waitForFunction(()=>document.querySelectorAll('.ff-version').length===4);
  assert.equal(await page.evaluate(()=>window.__revisionTest.jobs.length),1);
  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.ff-version').length===4);
  assert.deepEqual((await page.evaluate(()=>window.__revisionTest.records())).map(v=>v.number).sort((a,b)=>a-b),[1,3,4,5]);
  await page.locator('.ff-revisions').screenshot({path:path.join(require('node:os').tmpdir(),'figureforge-version-delete.png')});
  for(let remaining=4;remaining>0;remaining--){
    page.once('dialog',dialog=>dialog.accept());await cards.nth(0).locator('[data-delete]').click();
    if(remaining>1)await page.waitForFunction(n=>document.querySelectorAll('.ff-version').length===n,remaining-1);
    else await page.waitForFunction(()=>document.querySelectorAll('.ff-version').length===0);
  }
  await page.waitForFunction(()=>!!window.__revisionTest);
  assert.equal((await page.evaluate(()=>window.__revisionTest.records())).length,0);
  await page.reload();await page.waitForFunction(()=>!!window.__revisionTest);
  assert.equal(await cards.count(),0);
  assert.equal(await page.evaluate(()=>window.__revisionTest.state().bitmap||''),'');
  assert.ok(errors.every(message=>message.includes("Service worker is disabled because the context is sandboxed")));
  console.log('Screenshot upload/paste/drop/preview/removal/draft isolation/payload order passed. Revision browser integration passed: continuous/branched edits during conversion; manual revisions; per-version results; failures; reload persistence; deletion/cancel/failure/isolation/final-version cleanup; SVG return; mobile layout. Zero live API calls.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
