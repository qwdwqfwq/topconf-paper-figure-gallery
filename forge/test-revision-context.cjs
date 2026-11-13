// Offline integration: real generation-button handler, version UI, request builders
// and pixel composition. All provider responses are intercepted; no live API calls.
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.REVISION_PLAYWRIGHT||'C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
(async()=>{
 const {createGalleryServer}=await import(pathToFileURL(path.resolve(__dirname,'../scripts/serve-nonelinear.mjs')).href);
 const server=createGalleryServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;
 let browser;const errors=[],bodies=[];
 try{
  browser=await chromium.launch({headless:true,...(process.env.REVISION_BUNDLED_BROWSER==='1'?{}:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'})});
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
   if(url.pathname==='/forge/'){
    const response=await route.fetch();let html=await response.text();
    const anchor='window.__ffReconstruct = () => runReconstruction();';assert.ok(html.includes(anchor));
    // Replace only the network generator in the served test response. The on-disk
    // frozen HTML and its actual #genBtn handler are unchanged.
    html=html.replace(anchor,anchor+`
     genOaiImage=async()=>{await new Promise(resolve=>window.finishTestGeneration=resolve);
      const c=document.createElement('canvas');c.width=1024;c.height=1024;
      await revisionGallery.addInitial({image:c.toDataURL(),width:1024,height:1024,route:{}});};
     window.contextTest={configure:()=>{mode='image';passMode='one';refs.clear();refs.add('test-reference');
      $('#provider').value='nonelinear';$('#key').value='offline-test';const m='gemini-3.1-flash-image-preview';
      $('#model').add(new Option(m,m));$('#model').value=m;$('#figureRatio').value='1:1';$('#imageResolution').value='1K';},
      records:()=>new Promise(resolve=>{const q=indexedDB.open('figureforge-revisions',1);q.onsuccess=()=>{const r=q.result.transaction('versions').objectStore('versions').getAll();r.onsuccess=()=>resolve(r.result);};})};`);
    return route.fulfill({response,body:html});
   }
   if(url.pathname.startsWith('/api/'))return route.fulfill({json:{data:[]}});
   return route.continue();
  });
  await page.goto(origin+'/forge/');await page.waitForFunction(()=>window.contextTest);
  await page.evaluate(()=>window.contextTest.configure());
  const paperA='绘图提示词：Two-stage evaluation. Stage 1 → ambiguous cases → Stage 2. ASR = (Executed + Partial) / Nsc.';
  await page.locator('#paper').fill(paperA);await page.locator('#genBtn').click();
  await page.waitForFunction(()=>!!window.finishTestGeneration);
  await page.locator('#paper').fill('CHANGED WHILE GENERATING');await page.evaluate(()=>window.finishTestGeneration());
  await page.waitForFunction(async()=> (await window.contextTest.records()).length===1);
  const realRecord=(await page.evaluate(()=>window.contextTest.records()))[0];
  assert.equal(realRecord.step1Context.paperText,paperA);assert.equal(realRecord.step1Context.version,1);
  assert.equal(JSON.stringify(realRecord.state).includes(paperA),false,'export state remains separate');
  await context.close();

  // An independent adapter supplies deterministic image responses while the real
  // version UI, persistence, request builder and scoped compositor all execute.
  const c2=await browser.newContext({serviceWorkers:'block',viewport:{width:1400,height:1100}}),p=await c2.newPage();
  p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/forge/context-test')return route.fulfill({contentType:'text/html',body:`
    <textarea id="paper"></textarea><button id="genBtn">Generate</button><div id="out"></div>
    <script type="module">
     import {createRevisionGallery,generateRevision} from './revision-gallery.mjs';
     const loadImage=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});
     const route={base:'https://images.example.test/v1',model:'image-model',p:'sf',ratio:'1:1',resolution:'1K'};
     let current='',state={},sequence=0;
     const bitmap=()=>{const c=document.createElement('canvas');c.width=1024;c.height=1024;const x=c.getContext('2d');x.fillStyle=['#bd87ce','#749cde','#97bd6a','#cf9d68','#b97083','#56acac'][sequence++%6];x.fillRect(0,0,1024,1024);return c.toDataURL();};
     window.t={inputs:[],output:bitmap(),fail:false};
     const gallery=createRevisionGallery({output:document.querySelector('#out'),busy:()=>false,getState:()=>state,currentImage:()=>current,captureView:()=>({}),
      activate:v=>{current=v.image;state=v.state||{};},rebuild:()=>{},showExport:()=>{},download:()=>{},
      generate:async(parent,prompt)=>{window.t.inputs.push({image:parent.image,prompt,step1Context:parent.step1Context});
       return generateRevision({...parent,confirmScope:false,revisionMode:'local',editRegions:[{x:128,y:128,width:768,height:768}]},prompt,{key:'offline-test',loadImage,toDataURL:async s=>s});}});
     document.querySelector('#genBtn').onclick=async()=>{await gallery.ready;if(!gallery.canGenerate())return;
      const btn=document.querySelector('#genBtn');btn.disabled=true;try{await gallery.addInitial({image:bitmap(),width:1024,height:1024,route});}finally{btn.disabled=false;}};
     Object.assign(window.t,{gallery,bitmap,loadImage,route,records:()=>new Promise(resolve=>{const q=indexedDB.open('figureforge-revisions',1);q.onsuccess=()=>{const r=q.result.transaction('versions').objectStore('versions').getAll();r.onsuccess=()=>resolve(r.result.sort((a,b)=>a.number-b.number));};})});
     await gallery.ready;window.t.ready=true;
    </script>`});
   if(url.origin!==origin){
    assert.equal(url.href,'https://images.example.test/v1/images/generations');
    bodies.push(route.request().postDataJSON());
    const fixture=await p.evaluate(()=>({image:window.t.output,fail:window.t.fail}));
    return route.fulfill(fixture.fail?{status:400,json:{error:{message:'offline failure'}}}:{json:{data:[{b64_json:fixture.image.split(',')[1]}]}});
   }
   return route.continue();
  });
  await p.goto(origin+'/forge/context-test');await p.waitForFunction(()=>window.t?.ready);
  async function records(){return p.evaluate(()=>window.t.records());}
  async function waitCount(n){await p.waitForFunction(async n=>(await window.t.records()).length===n,n);}
  async function revise(index,prompt,n){
   await p.evaluate(()=>window.t.output=window.t.bitmap());
   await p.locator('.ff-version').nth(index).locator('[data-modify]').click();
   await p.locator('.ff-revision-editor textarea').fill(prompt);await p.locator('[data-submit]').click();
   await p.locator('[data-revision-accept]').click();await waitCount(n);
  }
  await p.locator('#paper').fill(paperA);await p.locator('#genBtn').click();await waitCount(1);
  const first=(await records())[0];
  await p.locator('#paper').fill('UNRELATED CURRENT FORM; 16:9; panel x=900');
  await revise(0,'重新排版 C 区域，保留内容和逻辑关系',2);
  await revise(1,'缩短连线并调整间距',3);
  await revise(0,'从最初版本重新分支修改',4);
  let rows=await records(),inputs=await p.evaluate(()=>window.t.inputs);
  assert.equal(inputs[0].image,first.image);assert.equal(inputs[1].image,rows[1].image);assert.equal(inputs[2].image,first.image);
  assert.equal(rows[3].parentId,first.id);assert.equal(rows[2].parentId,rows[1].id);
  for(const row of rows)assert.deepEqual(row.step1Context,first.step1Context);
  for(const body of bodies){assert.ok(body.prompt.includes(paperA));assert.ok(body.prompt.includes('Keep everything outside the confirmed region unchanged'));assert.ok(!body.prompt.includes('UNRELATED CURRENT FORM'));assert.equal(body.image_size,'1024x1024');}
  assert.equal(rows[1].revisionAudit.changedOutside,0);assert.ok(rows[1].revisionAudit.changedInside>0);
  assert.equal(inputs[0].prompt,'重新排版 C 区域，保留内容和逻辑关系','archived layout never enters raw request heuristics');
  await p.reload();await p.waitForFunction(()=>window.t?.ready);
  await revise(1,'刷新后继续修改历史版本',5);rows=await records();
  assert.deepEqual(rows[4].step1Context,first.step1Context);assert.equal(rows[4].parentId,rows[1].id);
  await p.locator('#paper').fill('PAPER B: separate figure facts');await p.locator('#genBtn').click();await waitCount(6);
  await revise(5,'修改第二张原图',7);rows=await records();
  assert.equal(rows[6].step1Context.paperText,'PAPER B: separate figure facts');
  assert.deepEqual(rows[0].step1Context,first.step1Context);
  // Old/uploaded versions must never borrow the current form's paper context.
  await p.evaluate(()=>window.t.gallery.addInitial({image:window.t.bitmap(),width:1024,height:1024,route:window.t.route}));await waitCount(8);
  assert.equal((await records())[7].step1Context,undefined);
  assert.match(await p.locator('[data-step1-context]').textContent(),/没有生成时/);
  await revise(7,'仅调整标题',9);rows=await records();assert.equal(rows[8].step1Context,undefined);
  assert.ok(bodies.at(-1).prompt.includes('No generation-time Step 1 snapshot'));
  assert.ok(!bodies.at(-1).prompt.includes('PAPER B'));
  await p.evaluate(()=>window.t.fail=true);await p.locator('.ff-version').nth(0).locator('[data-modify]').click();
  await p.locator('.ff-revision-editor textarea').fill('失败也应保留来源');await p.locator('[data-submit]').click();
  await p.waitForFunction(()=>document.querySelector('.ff-revision-error').textContent.includes('失败'));
  assert.equal((await records()).length,9);
  const requestChecks=await p.evaluate(async()=>{
   const {revisionPlanner}=await import('./revision-layout.mjs');const {generateRevision}=await import('./revision-gallery.mjs');
   const {copyStep1Context}=await import('./revision-context.mjs');
   const parent=(await window.t.records())[0],prior=window.fetch,seen=[];
   const copy=copyStep1Context({...parent.step1Context,apiKey:'never inherit',referenceContract:'never inherit'});
   if(Object.keys(copy).length!==3)throw Error('unapproved provenance fields inherited');
   window.fetch=async(url,init)=>{if(String(url).startsWith('data:'))return prior(url,init);seen.push(JSON.parse(init.body));
    if(String(url).includes('chat/completions'))return new Response(JSON.stringify({choices:[{message:{content:'{"ok":true}'}}]}));
    return new Response('{"error":{"message":"intentional offline stop"}}',{status:400});};
   try{
    await revisionPlanner({...parent,route:{p:'infistar',base:'https://example.invalid/v1'}},[{type:'text',text:'LATEST USER REQUEST'}],{key:'offline-test'},100);
    try{await generateRevision({...parent,route:{p:'infistar',base:'https://infistar.cc/v1',model:'gemini-3.1-flash-image-preview',ratio:'1:1',resolution:'1K'},revisionMode:'local',editRegions:[{x:0,y:0,width:1024,height:1024}]},'change title',{key:'offline-test',loadImage:window.t.loadImage,toDataURL:async s=>s});}catch(e){if(!e.message.includes('400'))throw e;}
   }finally{window.fetch=prior;}
   return seen;
  });
  assert.equal(requestChecks[0].messages[0].content[0].text,'LATEST USER REQUEST');
  assert.ok(requestChecks[0].messages[0].content.some(c=>c.text?.includes(paperA)));
  assert.ok(requestChecks[1].contents[0].parts.some(c=>c.text?.includes(paperA)),'native Gemini planning also receives the snapshot');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,realGenerateButton:true,versions:9,checks:['generation-time snapshot','changed form isolation','descendant and branch inheritance','selected image bytes','reload persistence','independent originals','legacy context absent','failure preserves source','compatible and native request context','planner context','outside changed pixels = 0'],liveAPICalls:0},null,2));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
