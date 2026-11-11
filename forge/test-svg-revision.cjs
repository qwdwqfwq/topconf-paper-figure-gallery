const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {chromium}=require('C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
(async()=>{
 const {createGalleryServer}=await import(pathToFileURL(path.resolve(__dirname,'../scripts/serve-nonelinear.mjs')).href);
 const server=createGalleryServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;let browser,output=1;const requests=[],errors=[];
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ff-svg-history-'));
 const launch=()=>chromium.launchPersistentContext(profile,{headless:true,serviceWorkers:'block',executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const svg=n=>`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400"><rect width="800" height="400" fill="white"/><text x="20" y="60">Version ${n}</text></svg>`;
 try{
  browser=await launch();
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.stack));
  const handleRoute=async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();
   if(url.pathname==='/forge/data/manifest.json')await new Promise(resolve=>setTimeout(resolve,1200));
   if(url.pathname==='/forge/'){
    const response=await route.fetch();let html=await response.text();
    html=html.replace('window.__ffReconstruct = () => runReconstruction();',`window.__ffReconstruct = () => runReconstruction();
     window.__svgTest={recon:0,configure:(m='svg',model='gpt-4o',key='offline-only')=>{mode=m;$('#provider').value='nonelinear';$('#key').value=key;$('#model').add(new Option(model,model));$('#model').value=model;revisionGallery.refresh();},prepare:()=>{passMode='single';$('#paper').value='Test scientific diagram';},state:()=>ensureExportState(),records:()=>new Promise(resolve=>{const r=indexedDB.open('figureforge-revisions',1);r.onsuccess=()=>{const q=r.result.transaction('versions').objectStore('versions').getAll();q.onsuccess=()=>resolve(q.result);};})};
     runReconstruction=()=>{window.__svgTest.recon++;throw new Error('SVG revision must not reconstruct bitmap');};`);
    return route.fulfill({response,body:html});
   }
   if(url.pathname.startsWith('/api/nonelinear/v1/')){
    if(req.method()==='GET')return route.fulfill({json:{data:[{id:'gpt-4o'}]}});
    requests.push(req.postDataJSON());return route.fulfill({json:{choices:[{message:{content:typeof output==='string'?output:svg(output).replace('width="800" height="400" viewBox="0 0 800 400"','width="99" height="55" viewBox="0 0 99 55"')}}]}});
   }
   return route.continue();
  };
  await browser.route('**/*',handleRoute);
  await page.goto(origin+'/forge/');await page.waitForFunction(()=>window.__svgTest&&document.querySelector('#provider option[value="nonelinear"]'));
  await page.evaluate(()=>{window.__svgTest.configure();window.__svgTest.prepare();});
  const initialPNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64');
  await page.locator('#refsUpload').setInputFiles({name:'reference.png',mimeType:'image/png',buffer:initialPNG});
  output=svg(1);await page.locator('#genBtn').click();
  await page.waitForFunction(()=>document.querySelectorAll('.ff-version').length===1,{},{timeout:30000});
  const cards=page.locator('.ff-version'),editor=page.locator('.ff-revision-editor'),submit=editor.locator('[data-submit]');
  await cards.first().waitFor();assert.equal(await editor.locator('[data-model]').innerText(),'请在步骤三选择「SVG 可编辑初稿」，并选择视觉模型。');
  async function modify(index,n){output=n;await cards.nth(index).locator('[data-modify]').click();await editor.locator('textarea').fill('调整标题 '+n);await submit.click();await page.locator('[data-revision-accept]').click();}
  const screenshot=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=40;c.height=20;return c.toDataURL();});
  await editor.locator('[data-files]').setInputFiles({name:'locator.png',mimeType:'image/png',buffer:Buffer.from(screenshot.split(',')[1],'base64')});
  await page.waitForFunction(()=>document.querySelectorAll('[data-preview]').length===1);
  await modify(0,2);await page.waitForFunction(()=>document.querySelectorAll('.ff-version').length===2);
  let body=requests.at(-1);assert.equal(body.model,'gpt-4o');assert.equal(body.messages[0].content.length,3);assert.match(body.messages[0].content[0].text,/Version 1/);assert.match(body.messages[0].content[0].text,/locator screenshots ONLY/);assert.equal(body.messages[0].content[2].image_url.url,screenshot);
  await modify(1,3);assert.match(requests.at(-1).messages[0].content[0].text,/Version 2/);
  await page.evaluate(()=>window.__svgTest.configure('svg','qwen3-vl-32b-instruct'));
  await modify(0,4);assert.equal(requests.at(-1).model,'qwen3-vl-32b-instruct');assert.match(requests.at(-1).messages[0].content[0].text,/Version 1/);
  for(const config of [['image','gemini-3.1-flash-image-preview','offline-only'],['svg','gemini-3.1-flash-image-preview','offline-only'],['svg','gpt-4o','']]){
   const before=requests.length;await page.evaluate(c=>window.__svgTest.configure(...c),config);await editor.locator('textarea').fill('必须在请求前拦截');await submit.click();await page.waitForFunction(()=>!!document.querySelector('.ff-revision-error')?.textContent);assert.equal(requests.length,before);
  }
  await page.evaluate(()=>window.__svgTest.configure());
  output='<svg><broken></svg>';await submit.click();await page.waitForFunction(()=>document.querySelector('.ff-revision-error').textContent.includes('无效'));assert.equal(await cards.count(),4);
  output=svg(4);await submit.click();await page.waitForFunction(()=>document.querySelector('.ff-revision-error').textContent.includes('相同'));assert.equal(await cards.count(),4);
  await page.waitForFunction(async()=> (await window.__svgTest.records()).length===4);
  const records=(await page.evaluate(()=>window.__svgTest.records())).sort((a,b)=>a.number-b.number);assert.equal(records[3].parentId,records[0].id);assert.ok(records.every(r=>r.source==='svg'&&r.svg.includes('width="800" height="400" viewBox="0 0 800 400"')));assert.ok(!JSON.stringify(records).includes('offline-only'));
  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.ff-version').length===4);await page.evaluate(()=>window.__svgTest.configure());
  await cards.nth(1).locator('[data-build]').click();assert.match(await page.evaluate(()=>window.__svgTest.state().baseSvg),/Version 2/);assert.equal(await page.evaluate(()=>window.__svgTest.recon),0);
  page.on('dialog',d=>d.accept());await cards.nth(1).locator('[data-delete]').click();await page.waitForFunction(()=>document.querySelectorAll('.ff-version').length===3);await page.waitForFunction(async()=> (await window.__svgTest.records()).length===3);await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.ff-version').length===3);
  const moduleChecks=await page.evaluate(async()=>{
   const {svgVersion,generateSVGRevision}=await import('./svg-revision.mjs');
   const good='<svg xmlns="http://www.w3.org/2000/svg" width="2in" height="1in"><defs><path id="p" d="M0 0L10 10"/></defs><use href="#p"/></svg>';
   const v=svgVersion(good);if(v.width!==192||v.height!==96)throw Error('units');
   for(const bad of ['<script/>','<image href="https://example.test/x"/>','<style>rect{fill:url(https://example.test/x)}</style>']){let rejected=false;try{svgVersion(good.replace('</svg>',bad+'</svg>'));}catch{rejected=true;}if(!rejected)throw Error('unsafe SVG');}
   let sent;await generateSVGRevision(v,'change',{route:{proto:'anthropic',model:'claude-test'},key:'test',post:async(path,body)=>{sent={path,body};return{content:[{type:'text',text:good.replace('M0 0L10 10','M0 0L20 20')}]};}});return sent;
  });assert.equal(moduleChecks.path,'/v1/messages');assert.equal(moduleChecks.body.messages[0].content[1].type,'image');
  await browser.close();browser=await launch();await browser.route('**/*',handleRoute);
  const reopened=await browser.newPage();reopened.on('pageerror',e=>errors.push(e.stack));
  await reopened.goto(origin+'/forge/');
  await reopened.waitForFunction(()=>document.querySelectorAll('.ff-version').length===3);
  // Restore must complete even while provider configuration is deliberately delayed.
  await reopened.waitForFunction(()=>window.__svgTest&&document.querySelector('#provider option[value="nonelinear"]'));
  await reopened.waitForFunction(()=>!document.querySelector('[data-model]').textContent.includes('加载中'));
  const restored=reopened.locator('.ff-version');
  assert.deepEqual((await reopened.evaluate(()=>window.__svgTest.records())).map(r=>r.number).sort(),[1,3,4]);
  for(const [index,number] of [1,3,4].entries()){
   await restored.nth(index).locator('[data-build]').click();
   assert.match(await reopened.evaluate(()=>window.__svgTest.state().baseSvg),new RegExp('Version '+number));
   const waiting=reopened.waitForEvent('download');await restored.nth(index).getByRole('button',{name:'下载图片',exact:true}).click();
   const download=await waiting;assert.match(fs.readFileSync(await download.path(),'utf8'),new RegExp('Version '+number));
  }
  await reopened.evaluate(()=>window.__svgTest.configure());output=5;
  await restored.first().locator('[data-modify]').click();await reopened.locator('.ff-revision-editor textarea').fill('继续修改已恢复的 V1');
  await reopened.locator('[data-submit]').click();await reopened.locator('[data-revision-accept]').click();
  await reopened.waitForFunction(()=>document.querySelectorAll('.ff-version').length===4);
  assert.match(requests.at(-1).messages[0].content[0].text,/Version 1/);
  await reopened.waitForFunction(async()=> (await window.__svgTest.records()).length===4);
  await reopened.reload();await reopened.waitForFunction(()=>document.querySelectorAll('.ff-version').length===4);
  assert.equal(await reopened.evaluate(()=>window.__svgTest.recon),0);assert.deepEqual(errors,[]);
  console.log('SVG browser integration passed: actual generation; model display/preflight; full SVG + locator payload; repeated/branched edits; delayed manifest; browser close/reopen persistence; isolated deletion; per-version download/export; modification after restore; no bitmap reconstruction; SVG safety. Zero live API calls.');
 }finally{await browser?.close();await new Promise(r=>server.close(r));fs.rmSync(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});

