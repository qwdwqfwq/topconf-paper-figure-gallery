// Actual application UI, with offline provider fixtures. No live API calls.
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.REVISION_PLAYWRIGHT||'C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
(async()=>{
 let server,browser,base=process.env.REVISION_TEST_URL;
 if(!base){const {createGalleryServer}=await import(pathToFileURL(path.resolve(__dirname,'../scripts/serve-nonelinear.mjs')).href);server=createGalleryServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}/forge/`;}
 try{
  browser=await chromium.launch({headless:true,...(process.env.REVISION_BUNDLED_BROWSER==='1'?{}:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'})});
  const page=await browser.newPage({serviceWorkers:'block',viewport:{width:1440,height:1100}});
  const origin=new URL(base).origin,calls=[],unexpected=[],errors=[];let fixtures,outputIndex=1;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin===origin)return route.continue();
   if(url.pathname.endsWith('/models'))return route.fulfill({json:{data:[{id:'gpt-image-2'},{id:'gemini-3.1-flash-image'}]}});
   let prompt,images=[],native=false;
   if(/\/images\/edits$/.test(url.pathname)){
    const form=await new Response(req.postDataBuffer(),{headers:{'content-type':req.headers()['content-type']}}).formData();
    prompt=form.get('prompt');for(const [k,v] of form)if(k.startsWith('image')&&typeof v!=='string')images.push(Buffer.from(await v.arrayBuffer()).toString('base64'));
   }else if(url.pathname.endsWith(':generateContent')){
    native=true;const body=req.postDataJSON(),parts=body.contents.flatMap(c=>c.parts);
    assert.deepEqual(body.generationConfig.responseModalities,['TEXT','IMAGE']);
    prompt=parts.filter(p=>p.text).map(p=>p.text).join('\n');images=parts.filter(p=>p.inlineData).map(p=>p.inlineData.data);
   }else{unexpected.push(url.pathname);return route.fulfill({status:400,json:{error:{message:'Unexpected offline request'}}});}
   calls.push({prompt,images,native});const data=fixtures[outputIndex].split(',')[1];
   return route.fulfill({json:native?{candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data}}]}}]}:{data:[{b64_json:data}]}});
  });
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#provider')?.options.length>0);
  fixtures=await page.evaluate(()=>['#ffffff','#42aa77','#7777ee'].map((color,i)=>{const c=document.createElement('canvas');c.width=i===1?512:1024;c.height=i===1?256:1024;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,c.width,c.height);return c.toDataURL();}));
  async function configure(model){
   await page.locator('#provider').selectOption('infistar');await page.locator('#key').fill('offline-fixture-no-secret');
   await page.locator('#modeTabs [data-mode="image"]').click();
   await page.waitForFunction(model=>Array.from(document.querySelector('#model').options).some(o=>o.value===model),model);
   await page.locator('#model').selectOption(model);await page.locator('#passTabs [data-pass="direct"]').click();
   await page.locator('#figureRatio').selectOption('1:1');await page.locator('#imageResolution').selectOption('1K');
  }
  async function records(){return page.evaluate(()=>new Promise(resolve=>{const q=indexedDB.open('figureforge-revisions',1);q.onsuccess=()=>{const d=q.result,r=d.transaction('versions').objectStore('versions').getAll();r.onsuccess=()=>{d.close();resolve(r.result.sort((a,b)=>a.number-b.number));};};}));}
  async function waitCount(n){await page.waitForFunction(n=>new Promise(resolve=>{const q=indexedDB.open('figureforge-revisions',1);q.onsuccess=()=>{const d=q.result,r=d.transaction('versions').objectStore('versions').count();r.onsuccess=()=>{d.close();resolve(r.result===n);};};}),n);}
  async function begin(index,prompt){await page.locator('.ff-version').nth(index).locator('[data-modify]').click();await page.locator('.ff-revision-editor textarea').fill(prompt);await page.locator('[data-submit]').click();await waitCount(calls.length+1);assert.equal(await page.locator('[data-scope-review]').count(),0);assert.equal(await page.locator('[data-revision-accept]').count(),0);assert.equal(await page.locator('.ff-revision-review').count(),0);}
  await configure('gpt-image-2');
  await page.locator('[data-original-file]').setInputFiles({name:'original.png',mimeType:'image/png',buffer:Buffer.from(fixtures[0].split(',')[1],'base64')});await waitCount(1);
  await page.locator('[data-files]').setInputFiles({name:'reference.png',mimeType:'image/png',buffer:Buffer.from(fixtures[2].split(',')[1],'base64')});
  await page.waitForSelector('.ff-revision-attachment');
  const prompt='重新排版 C 区域，删除 Executed、Defended 和 Partial，把内容移到左侧并允许调整画布';
  await begin(0,prompt);assert.equal(calls.length,1);assert.equal((await records()).length,2);
  assert.ok(!calls[0].prompt.includes('Keep everything outside the confirmed region unchanged'));
  assert.equal(calls[0].images[0],fixtures[0].split(',')[1]);assert.equal(calls[0].images[1],fixtures[2].split(',')[1]);
  let rows=await records();assert.equal(rows[1].width,512);assert.equal(rows[1].height,256);assert.equal(rows[1].revisionAudit.review,'automatic');
  // Identical pixels also save automatically, without opening any review UI.
  outputIndex=0;await begin(0,'保留这个版本，自动完成');
  outputIndex=2;await configure('gemini-3.1-flash-image');await begin(0,prompt);
  assert.equal(calls.length,3);assert.equal(calls[2].native,true);assert.equal(calls[2].images[0],fixtures[0].split(',')[1]);
  rows=await records();assert.deepEqual(rows.map(r=>r.parentId),[null,rows[0].id,rows[0].id,rows[0].id]);
  assert.equal(rows[0].image,fixtures[0]);assert.equal(rows[3].revisionAudit.apiRequestCount,1);assert.equal(rows[3].revisionAudit.editingPolicy,'user-directed');
  assert.ok(rows.slice(1).every(r=>r.revisionAudit.review==='automatic'));
  // Optional manual scope: adjust the confirmed rectangle, use one image request,
  // then compare all output pixels outside that final rectangle against the source.
  await page.locator('.ff-version').nth(0).locator('[data-modify]').click();
  async function drawRect(){const box=await page.locator('[data-scope-canvas]').boundingBox();await page.mouse.move(box.x+box.width*.2,box.y+box.height*.2);await page.mouse.down();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.up();}
  await page.locator('[data-select-regions]').click();await drawRect();await page.getByRole('button',{name:'使用这些区域',exact:true}).click();
  await page.locator('.ff-revision-editor textarea').fill('框内自由重排并替换颜色');await page.locator('[data-manual-revision]').click();
  await page.getByRole('button',{name:'调整范围',exact:true}).click();await page.getByRole('button',{name:'清空框选',exact:true}).click();
  const box=await page.locator('[data-scope-canvas]').boundingBox();await page.mouse.move(box.x+box.width*.6,box.y+box.height*.6);await page.mouse.down();await page.mouse.move(box.x+box.width*.8,box.y+box.height*.8);await page.mouse.up();
  await page.locator('[data-confirm-scope]').click();await waitCount(5);assert.equal(await page.locator('[data-revision-accept]').count(),0);
  rows=await records();const manual=rows[4].revisionAudit;
  assert.equal(calls.length,4);assert.equal(manual.apiRequestCount,1);assert.equal(manual.scopePlan.adjusted,true);assert.equal(manual.changedOutside,0);assert.ok(manual.changedInside>0);
  assert.ok(calls[3].prompt.includes(JSON.stringify(manual.regions)));assert.ok(manual.regions[0].x>600);
  const outside=await page.evaluate(async({before,after,regions})=>{const load=src=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=src;});const c=document.createElement('canvas');c.width=c.height=1024;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(await load(before),0,0);const a=x.getImageData(0,0,1024,1024).data;x.drawImage(await load(after),0,0);const b=x.getImageData(0,0,1024,1024).data;let outside=0;for(let y=0;y<1024;y++)for(let z=0;z<1024;z++)if(!regions.some(r=>z>=r.x&&z<r.x+r.width&&y>=r.y&&y<r.y+r.height)){const i=(y*1024+z)*4;if([0,1,2,3].some(k=>a[i+k]!==b[i+k]))outside++;}return outside;},{before:fixtures[0],after:rows[4].image,regions:manual.regions});assert.equal(outside,0);
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.ff-version');assert.equal(await page.locator('.ff-version').count(),5);
  await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('[data-submit]').isVisible());
  assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,actualApplicationUI:true,liveAPICalls:0,imageRequests:calls.length,semanticPlannerOrAuditRequests:0,automaticSave:true,noContentChecklist:true,noScopeChecklistByDefault:true,unchangedResultSaved:true,dimensionChangeSaved:true,geminiSingleRequest:true,manualAdjustedScope:true,changedOutside:outside,reloadPersistence:true,mobileUI:true}));
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
