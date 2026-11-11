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
  async function modify(index,prompt,n){await bitmap(n);await cards.nth(index).locator('[data-modify]').click();await page.locator('.ff-revision-editor textarea').fill(prompt);await page.locator('.ff-revision-editor button').click();}
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
  await modify(2,'优化标题',4);await page.waitForFunction(()=>document.querySelectorAll('.ff-version').length===4);
  const count=requests.length;fail=true;await modify(0,'再次修改',5);
  await page.waitForFunction(()=>document.querySelector('.ff-revision-error').textContent.includes('失败'));
  assert.equal(await cards.count(),4);assert.equal(requests.length,count+1);assert.deepEqual(requests.at(-1).image,[v1]);
  fail=false;await page.locator('.ff-revision-editor button').click();await page.waitForFunction(()=>document.querySelectorAll('.ff-version').length===5);
  await page.waitForFunction(async()=> (await window.__revisionTest.records()).length===5);
  const records=await page.evaluate(()=>window.__revisionTest.records());
  assert.equal(records.find(v=>v.number===1).state.scene.version,1);assert.equal(records.find(v=>v.number===2).state.scene.version,2);
  assert.equal(records.find(v=>v.number===5).parentId,records.find(v=>v.number===1).id);
  assert.equal(JSON.stringify(records).includes('offline-only'),false);
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
  await resolve(0);
  assert.ok(errors.every(message=>message.includes("Service worker is disabled because the context is sandboxed")));
  console.log('Revision browser integration passed: continuous/branched edits during conversion; manual revisions; per-version results; failures; reload persistence; SVG return; mobile layout. Zero live API calls.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
