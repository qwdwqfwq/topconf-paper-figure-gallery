const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
(async()=>{
 const {createGalleryServer}=await import(pathToFileURL(path.resolve(__dirname,'../scripts/serve-nonelinear.mjs')).href);
 const server=createGalleryServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;let browser,output=1;const requests=[],errors=[];
 const svg=n=>`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400"><rect width="800" height="400" fill="white"/><text x="20" y="60">Version ${n}</text></svg>`;
 try{
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage({serviceWorkers:'block'});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();
   if(url.pathname==='/forge/'){
    const response=await route.fetch();let html=await response.text();
    html=html.replace('window.__ffReconstruct = () => runReconstruction();',`window.__ffReconstruct = () => runReconstruction();
     window.__svgTest={recon:0,configure:(m='svg',model='gpt-4o',key='offline-only')=>{mode=m;$('#provider').value='nonelinear';$('#key').value=key;$('#model').add(new Option(model,model));$('#model').value=model;revisionGallery.refresh();},state:()=>ensureExportState(),records:()=>new Promise(resolve=>{const r=indexedDB.open('figureforge-revisions',1);r.onsuccess=()=>{const q=r.result.transaction('versions').objectStore('versions').getAll();q.onsuccess=()=>resolve(q.result);};})};
     runReconstruction=()=>{window.__svgTest.recon++;throw new Error('SVG revision must not reconstruct bitmap');};`);
    return route.fulfill({response,body:html});
   }
   if(url.pathname.startsWith('/api/nonelinear/v1/')){
    if(req.method()==='GET')return route.fulfill({json:{data:[{id:'gpt-4o'}]}});
    requests.push(req.postDataJSON());return route.fulfill({json:{choices:[{message:{content:typeof output==='string'?output:svg(output).replace('width="800" height="400" viewBox="0 0 800 400"','width="99" height="55" viewBox="0 0 99 55"')}}]}});
   }
   return route.continue();
  });
  await page.goto(origin+'/forge/');await page.waitForFunction(()=>window.__svgTest&&document.querySelector('#provider option[value="nonelinear"]'));
  await page.evaluate(()=>window.__svgTest.configure());await page.evaluate(s=>window.__ffRenderSVG(s),svg(1));
  const cards=page.locator('.ff-version'),editor=page.locator('.ff-revision-editor'),submit=editor.locator('[data-submit]');
  await cards.first().waitFor();assert.match(await editor.locator('[data-model]').innerText(),/gpt-4o/);
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
  });assert.equal(moduleChecks.path,'/v1/messages');assert.equal(moduleChecks.body.messages[0].content[1].type,'image');assert.deepEqual(errors,[]);
  console.log('SVG browser integration passed: vision model routing/display/preflight; full original + locator payload; repeated and branched edits; preserved canvas; review; invalid/unchanged response rejection; IndexedDB reload/deletion; editable SVG without bitmap reconstruction; Anthropic protocol and SVG safety. Zero live API calls.');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

