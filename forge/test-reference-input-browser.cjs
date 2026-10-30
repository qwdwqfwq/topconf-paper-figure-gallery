// Real browser / image decoding, with offline gallery and model fixtures.
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');

(async()=>{
  const {createGalleryServer}=await import(pathToFileURL(path.resolve(__dirname,'../scripts/serve-nonelinear.mjs')).href);
  const server=createGalleryServer(); await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin=`http://127.0.0.1:${server.address().port}`;
  let browser; const errors=[];
  try{
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    const page=await browser.newPage({serviceWorkers:'block'});
    page.on('pageerror',e=>errors.push(e.message));
    let png;
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin!==origin) return route.abort();
      if(url.pathname==='/fixture.png') return route.fulfill({contentType:'image/png',body:png});
      if(url.pathname==='/forge/'){
        const response=await route.fetch(); let html=await response.text();
        assert.equal(html.split('\nawait boot();').length,2);
        html=html.replace('\nawait boot();', `
          await loadManifest();
          window.__referenceTest={
            seed:()=>{clearReferences();data.figs=Array.from({length:4},(_,i)=>({id:'gallery-'+i,title:'Gallery '+i,venue:'iclr',year:2026,pattern:'architecture',image:'fixture.png'}));results=data.figs;renderGrid(results);},
            state:()=>({ids:[...refs],uploads:uploadedRefs.size,catalog:data.figs.map(f=>f.id)}),
            read:()=>refDataURIs(),original:()=>refDataURIsOriginal(),
            analyze:async()=>{
              $('#model').add(new Option('offline-test','offline-test'));$('#model').value='offline-test';
              cfg=()=>({proto:'oai'});baseURL=()=>'/offline-model';
              postJSON=async(_base,_path,body)=>{
                window.__analysisImages=body.messages[1].content.filter(p=>p.type==='image_url').length;
                return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({representative:[...refs].slice(0,4),imageRefIds:[...refs].slice(-3),refinedPrompt:'Fixture layout'})}}]}));
              };
              const a=await analyzeReferences();return {reps:a.repIds,imageIds:a.imageRefIds,images:window.__analysisImages};
            },
            clear:clearReferences,
          };
        `);
        return route.fulfill({response,body:html});
      }
      return route.continue();
    });
    await page.goto(origin+'/forge/');
    await page.waitForFunction(()=>window.__referenceTest);
    const images=await page.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;
      const c=canvas.getContext('2d');c.fillStyle='#4f46e5';c.fillRect(0,0,160,90);
      return ['image/png','image/jpeg','image/webp'].map(type=>({type,data:canvas.toDataURL(type).split(',')[1]}));
    });
    png=Buffer.from(images[0].data,'base64');
    const file=(i,name='reference-'+i)=>({name:name+'.'+['png','jpg','webp'][i%3],mimeType:images[i%3].type,buffer:Buffer.from(images[i%3].data,'base64')});
    async function upload(files){
      await page.locator('#refsUpload').setInputFiles(files);
      await page.waitForFunction(()=>!document.querySelector('#refsUploadBtn').disabled);
    }
    async function verify(count,uploads){
      const state=await page.evaluate(()=>window.__referenceTest.state());
      assert.equal(state.ids.length,count);assert.equal(state.uploads,uploads);
      assert.equal(state.catalog.length,4);assert.ok(state.catalog.every(id=>id.startsWith('gallery-')));
      const uris=await page.evaluate(()=>window.__referenceTest.read());
      assert.equal(uris.length,count);assert.ok(uris.every(u=>u.startsWith('data:image/jpeg;base64,')));
      const originals=await page.evaluate(()=>window.__referenceTest.original());
      assert.equal(originals.length,count);assert.ok(originals.every(u=>u.startsWith('data:image/')));
      const analyzed=await page.evaluate(()=>window.__referenceTest.analyze());
      assert.equal(analyzed.images,count);
      assert.deepEqual(analyzed.reps,state.ids.slice(0,4));
      assert.deepEqual(analyzed.imageIds,state.ids.slice(-3));
      assert.equal(await page.locator('#analyzeBox .rep-chip img').count(),Math.min(count,4));
      await page.waitForFunction(()=>[...document.querySelectorAll('#analyzeBox .rep-chip img')].every(i=>i.complete&&i.naturalWidth>0));
    }
    await page.evaluate(()=>window.__referenceTest.seed());
    for(let i=0;i<4;i++) await page.locator('#grid .rc[data-id="gallery-'+i+'"] .pick').click();
    await verify(4,0); // all gallery
    await page.locator('#refsClearBtn').click();
    await upload([file(0),file(1),file(2),file(0,'<unsafe-name>')]);
    await verify(4,4); // all uploaded, including all three supported formats
    assert.equal(await page.locator('#refsStrip .refmini b').last().textContent(),'<unsafe-name>.png');
    await page.locator('#refsClearBtn').click();
    for(let i=0;i<2;i++) await page.locator('#grid .rc[data-id="gallery-'+i+'"] .pick').click();
    await upload([file(0),file(2)]);
    await verify(4,2); // mixed, same reading and representative selection
    const removedURL=await page.locator('#refsStrip .refmini img').last().getAttribute('src');
    await page.locator('#refsStrip .x').last().click();
    assert.equal((await page.evaluate(()=>window.__referenceTest.state())).uploads,1);
    assert.equal(await page.evaluate(async url=>{try{await fetch(url);return false;}catch{return true;}},removedURL),true);
    await upload(Array.from({length:9},(_,i)=>file(i%3,'extra-'+i)));
    assert.equal((await page.evaluate(()=>window.__referenceTest.state())).ids.length,10);
    assert.match(await page.locator('#refsUploadStatus').textContent(),/10/);
    await page.locator('#clearBtn').click();
    assert.equal((await page.evaluate(()=>window.__referenceTest.state())).uploads,0);
    await upload([{name:'broken.png',mimeType:'image/png',buffer:Buffer.from('invalid')}, {name:'invalid.txt',mimeType:'text/plain',buffer:png}, {name:'large.png',mimeType:'image/png',buffer:Buffer.alloc(20*1024*1024+1)}]);
    assert.equal((await page.evaluate(()=>window.__referenceTest.state())).ids.length,0);
    assert.match(await page.locator('#refsUploadStatus').textContent(),/broken.png/);
    assert.match(await page.locator('#refsUploadStatus').textContent(),/20 MB/);
    await upload([file(0)]);
    await page.locator('#langToggle').click();
    assert.match(await page.locator('#refsUploadBtn').textContent(),/Upload/);
    await page.setViewportSize({width:390,height:844});
    const bounds=await page.locator('#refsUploadBtn').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390);
    const screenshot=process.env.REFERENCE_SCREENSHOT;
    if(screenshot){await page.setViewportSize({width:1440,height:1000});await page.locator('#refsStrip').locator('..').screenshot({path:screenshot});}
    assert.deepEqual(errors,[]);
    console.log('PASS: gallery-only, upload-only, mixed; real decoding and analysis IDs; remove/revoke, clear, max 10, validation, language and mobile button.');
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
