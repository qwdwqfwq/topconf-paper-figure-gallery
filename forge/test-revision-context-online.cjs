// Exercise the unmodified application via its public controls. Optional URL tests
// deployed modules; only provider API responses are fixtures (never live billing).
const assert=require('node:assert/strict');
const {chromium}=require(process.env.REVISION_PLAYWRIGHT||'C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const fs=require('node:fs');
(async()=>{
 let server,browser;
 try{
  let base=process.env.REVISION_TEST_URL;
  if(!base){const {createGalleryServer}=await import(pathToFileURL(path.resolve(__dirname,'../scripts/serve-nonelinear.mjs')).href);server=createGalleryServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}/forge/`;}
  const origin=new URL(base).origin;
  browser=await chromium.launch({headless:true,...(process.env.REVISION_BUNDLED_BROWSER==='1'?{}:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'})});
  const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1100}}),page=await ctx.newPage();
  const errors=[],requests=[],modules=new Set();let fixtures,initialResolve,releaseInitial;
  const initialSeen=new Promise(r=>initialResolve=r),initialGate=new Promise(r=>releaseInitial=r);
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(/revision-(?:context|gallery|layout)\.mjs/.test(r.url()))modules.add(new URL(r.url()).pathname);});
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin===origin)return route.continue(); // HTML and application code untouched.
   if(url.pathname.endsWith('/models'))return route.fulfill({json:{data:[{id:'gpt-image-2'},{id:'gemini-3.1-pro-preview'}]}});
   if(/\/images\/(generations|edits)$/.test(url.pathname)){
    let prompt,images=[];
    if(req.headers()['content-type']?.includes('multipart/form-data')){
     const form=await new Response(req.postDataBuffer(),{headers:{'content-type':req.headers()['content-type']}}).formData();
     prompt=form.get('prompt');for(const [k,v] of form)if(k.startsWith('image')&&typeof v!=='string')images.push(Buffer.from(await v.arrayBuffer()).toString('base64'));
    }else{const data=req.postDataJSON();prompt=data.prompt;images=[data.image].flat().filter(Boolean).map(s=>s.replace(/^data:[^,]+,/,''));}
    const initial=!prompt.includes('STEP 1 SNAPSHOT');
    if(initial){initialResolve();await initialGate;}
    const n=requests.filter(r=>r.kind==='image').length;
    requests.push({kind:'image',prompt,images,initial});
    return route.fulfill({json:{data:[{b64_json:fixtures[n%fixtures.length].split(',')[1]}]}});
   }
   if(url.pathname.endsWith('/chat/completions')){
    const data=req.postDataJSON(),text=data.messages.flatMap(m=>Array.isArray(m.content)?m.content.map(p=>p.text||''):[m.content]).join('\n');
    if(text.includes('scientific figure edit scope planner')){
     requests.push({kind:'planner',text});
     return route.fulfill({json:{choices:[{message:{content:JSON.stringify({mode:'local',scopeType:'element-group',summary:'智能体替换为带名称的机器人',preserve:'选区外全部内容',regions:[{x:125,y:125,width:750,height:750}],coordinateSpace:'normalized-1000',needsClarification:false})}}]}});
    }
   }
   // Automatic Step 4 is deliberately not exercised or changed by this test.
   return route.fulfill({status:400,json:{error:{message:'Offline provider fixture: reconstruction not exercised'}}});
  });
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#provider')?.options.length>0);
  fixtures=await page.evaluate(()=>['#e7edf7','#d7e8d0','#f7ddca','#e3d3ed','#c3e5e5'].map(color=>{const c=document.createElement('canvas');c.width=c.height=1024;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,1024,1024);x.fillStyle='#333';x.font='40px sans-serif';x.fillText('Planner → Critic → Refiner → Judger',100,500);return c.toDataURL();}));
  await page.locator('#provider').selectOption('infistar');
  await page.locator('#key').fill('offline-fixture-no-secret');
  await page.locator('#modeTabs [data-mode="image"]').click();
  await page.waitForFunction(()=>Array.from(document.querySelector('#model').options).some(o=>o.value==='gpt-image-2'));
  await page.locator('#model').selectOption('gpt-image-2');
  await page.locator('#passTabs [data-pass="direct"]').click();
  await page.locator('#figureRatio').selectOption('1:1');await page.locator('#imageResolution').selectOption('1K');
  await page.locator('#refsUpload').setInputFiles({name:'reference.png',mimeType:'image/png',buffer:Buffer.from(fixtures[0].split(',')[1],'base64')});
  await page.waitForFunction(()=>!document.querySelector('#refsUploadBtn').disabled&&!!document.querySelector('#refsClearBtn')&&!document.querySelector('#refsClearBtn').hidden);
  const paper=process.env.REVISION_PAPER_FILE?fs.readFileSync(process.env.REVISION_PAPER_FILE,'utf8').trim():'绘图提示词：Vision Wormhole. Frozen heterogeneous agents: Planner → Critic → Refiner → Judger. Shared reference-space memory. Preserve the communication logic. Initial panel coordinate x=900 is obsolete for subsequent edits.';
  await page.locator('#paper').fill(paper);await page.locator('#genBtn').click();
  await Promise.race([initialSeen,new Promise((_,reject)=>setTimeout(()=>reject(Error('Initial image request absent')),30000))]);
  await page.locator('#paper').fill('UNRELATED CURRENT FORM MUST NOT BE INHERITED');releaseInitial();
  async function records(){return page.evaluate(()=>new Promise((resolve,reject)=>{const q=indexedDB.open('figureforge-revisions',1);q.onerror=()=>reject(q.error);q.onsuccess=()=>{const d=q.result,r=d.transaction('versions').objectStore('versions').getAll();r.onsuccess=()=>{d.close();resolve(r.result.sort((a,b)=>a.number-b.number));};};}));}
  async function waitCount(n){await page.waitForFunction(n=>new Promise(resolve=>{const q=indexedDB.open('figureforge-revisions',1);q.onsuccess=()=>{const d=q.result,r=d.transaction('versions').objectStore('versions').count();r.onsuccess=()=>{d.close();resolve(r.result===n);};};}),n);}
  await waitCount(1);await page.waitForFunction(()=>!document.querySelector('#genBtn').disabled);
  const first=(await records())[0];assert.equal(first.step1Context.paperText,paper);
  async function revise(index,n){
   await page.locator('.ff-version').nth(index).locator('[data-modify]').click({timeout:30000});
   await page.locator('[data-revision-mode]').selectOption('local');
   await page.locator('.ff-revision-editor textarea').fill('将几个智能体换成机器人标识，并标注 Planner、Critic、Refiner、Judger 的名字');
   await page.locator('[data-submit]').click();try{await page.locator('[data-confirm-scope]').click({timeout:30000});}catch(e){console.error(JSON.stringify({requests:requests.map(r=>({kind:r.kind,initial:r.initial})),errors,ui:await page.locator('.ff-revision-editor').innerText()}));throw e;}
   try{await page.locator('[data-revision-accept]').click({timeout:30000});}catch(e){console.error(JSON.stringify({requests:requests.map(r=>({kind:r.kind,initial:r.initial})),errors,ui:await page.locator('.ff-revision-editor').innerText()}));throw e;}await waitCount(n);
  }
  await revise(0,2);await revise(1,3);await revise(0,4);
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.ff-version');
  await page.locator('#provider').selectOption('infistar');
  await page.locator('#key').fill('offline-fixture-no-secret');
  await page.locator('#modeTabs [data-mode="image"]').click();
  await page.waitForFunction(()=>Array.from(document.querySelector('#model').options).some(o=>o.value==='gpt-image-2'));
  await page.locator('#model').selectOption('gpt-image-2');
  await page.locator('#passTabs [data-pass="direct"]').click();
  await page.locator('#figureRatio').selectOption('1:1');await page.locator('#imageResolution').selectOption('1K');
  await revise(1,5);
  const rows=await records(),images=requests.filter(r=>r.kind==='image'),planners=requests.filter(r=>r.kind==='planner');
  assert.equal(rows.length,5);assert.deepEqual(rows.map(r=>r.parentId),[null,rows[0].id,rows[1].id,rows[0].id,rows[1].id]);
  for(const row of rows)assert.deepEqual(row.step1Context,first.step1Context);
  for(const req of images.slice(1)){assert.ok(req.prompt.includes(JSON.stringify(paper)));assert.ok(!req.prompt.includes('UNRELATED CURRENT FORM'));assert.ok(req.prompt.includes('Keep everything outside the confirmed region unchanged'));}
  for(const req of planners){assert.ok(req.text.includes(JSON.stringify(paper)));assert.ok(!req.text.includes('UNRELATED CURRENT FORM'));}
  // Local mode must send the exact full selected version, including accepted edits.
  assert.equal(images.length,5);for(const [i,parent] of [0,1,0,1].entries())assert.equal(images[i+1].images[0],rows[parent].image.split(',')[1]);
  for(const row of rows.slice(1)){assert.equal(row.revisionAudit.changedOutside,0);assert.ok(row.revisionAudit.changedInside>0);}
  assert.deepEqual(errors,[]);assert.equal(modules.size,3);
  const report={passed:true,url:base,unmodifiedApplication:true,loadedRevisionModules:[...modules],versions:rows.length,generationTimeSnapshot:true,descendantInheritance:true,branchInheritance:true,reloadPersistence:true,selectedParentImageBytes:true,plannerRequests:planners.length,revisionRequests:images.length-1,changedOutside:0,providerResponses:'intercepted fixtures',liveModelCalls:0};
  if(process.env.REVISION_REPORT)fs.writeFileSync(process.env.REVISION_REPORT,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
 }finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
