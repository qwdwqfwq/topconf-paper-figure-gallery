// PRECISION_BITMAP=/path/to/original.jpg node forge/test-precision-import.cjs
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core');

const root = path.resolve(__dirname, '..');
const mime = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml'};
const scene = JSON.parse(fs.readFileSync(path.join(__dirname,'examples','cdta-precise-scene.json'),'utf8'));
const server = http.createServer((req,res)=>{
  let pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname.endsWith('/')) pathname += 'index.html';
  const filename = path.resolve(root,'.'+pathname);
  if(!filename.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(filename,(err,data)=>{
    if(err){res.writeHead(404);return res.end();}
    if(pathname==='/forge/index.html') data=Buffer.from(data.toString('utf8').replace(/\r\n/g,'\n')
      .replace("import * as T from './vendor/transformers.min.js';",'const T={};')
      .replace("await boot();\ninitProviders();\nsyncSubCount();\nawait Promise.all([populateModels(), populateParserModels()]);\n$('#manifestHint').textContent = tt('manifest.hint',{d:MAN.updated});",
        "MAN=FALLBACK;\ninitProviders();\nsyncSubCount();\n$('#manifestHint').textContent = tt('manifest.hint',{d:MAN.updated});"));
    res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream'});res.end(data);
  });
});

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const page=await browser.newPage({acceptDownloads:true,serviceWorkers:'block'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/forge/`,{waitUntil:'domcontentloaded'});
    assert.equal(await page.locator('#precisionImportBtn, #precisionSceneFile, #precisionBitmapFile').count(),0);
    assert.equal(await page.locator('#exportFont').count(),1);
    const source=process.env.PRECISION_BITMAP;
    let bitmap=source?`data:image/jpeg;base64,${fs.readFileSync(source).toString('base64')}`:null;
    if(!bitmap) bitmap=await page.evaluate(([w,h])=>{const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').fillStyle='white';canvas.getContext('2d').fillRect(0,0,w,h);return canvas.toDataURL('image/png');},scene.canvas_px);
    const result=await page.evaluate(async({scene,bitmap})=>{
      const imported=await window.__ffImportPrecisionScene(scene,bitmap);
      const state=window.__ffExportState;
      return {nodes:imported.nodes.length,images:imported.nodes.filter(n=>n.type==='image').length,
        texts:imported.nodes.filter(n=>n.type==='text').length,svg:state.svg};
    },{scene,bitmap});
    assert.equal(result.nodes,scene.objects.length);
    assert.equal(result.images,scene.objects.filter(o=>o.kind==='image').length);
    assert.match(result.svg,/<text/);
    assert.match(result.svg,/<image/);
    // Replay the existing sample as the global response; crop responses may
    // refine only that catalog. This tests orchestration, not model accuracy.
    if(process.env.CATALOG_REPLAY){
      const replay=await page.evaluate(async(bitmap)=>{
        const originalNodes=window.__ffExportState.scene.nodes;
        document.querySelector('#provider').value='ark';
        document.querySelector('#key').value='fixture-only';
        const select=document.querySelector('#analyzeModel');
        select.add(new Option('doubao-vision-test','doubao-vision-test'));select.value='doubao-vision-test';
        const originalFetch=window.fetch;let globalCalls=0,detailCalls=0;
        window.fetch=async(url,options)=>{
          if(!String(url).endsWith('/chat/completions'))return originalFetch(url,options);
          const prompt=JSON.parse(options.body).messages[1].content[0].text;
          const detail=prompt.includes('Catalog in crop coordinates: ');
          const nodes=detail?JSON.parse(prompt.split('Catalog in crop coordinates: ')[1]).nodes:originalNodes;
          if(detail)detailCalls++;else globalCalls++;
          return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({nodes})}}]}),{status:200});
        };
        window.__ffLastGeneratedImage=bitmap;
        const ok=await window.__ffReconstruct();
        return {ok,globalCalls,detailCalls,audit:window.__ffApiAudit.reconstruction,
          scene:window.__ffExportState.scene,svg:window.__ffExportState.svg};
      },bitmap);
      assert.equal(replay.ok,true);assert.equal(replay.globalCalls,1);
      assert.equal(new Set(replay.scene.nodes.map(n=>n.id)).size,replay.scene.nodes.length);
      assert.ok(replay.audit.pptxLayout,'PPTX layout audit must run');
      const output=path.join(root,'work','catalog-sample-report.json');
      fs.mkdirSync(path.dirname(output),{recursive:true});
      fs.writeFileSync(output,JSON.stringify(replay,null,2));
      result.svg=replay.svg;
      console.log('Catalog sample:',replay.scene.nodes.length,'objects;',JSON.stringify(replay.audit.pptxLayout));
    }
    for(const format of ['pptx','vsdx']){
      await page.locator(`#exportActions [data-export="${format}"]`).click();
      const downloadPromise=page.waitForEvent('download',{timeout:60000});
      await page.locator('#exportConfirm').click();
      const download=await downloadPromise;
      const bytes=fs.readFileSync(await download.path());
      assert.ok(bytes.length>100000,`${format} seems incomplete`);
      const output=path.join(root,'work',`precision-import.${format}`);
      fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,bytes);
      process.stdout.write(`${format}: ${bytes.length} bytes, ${output}\n`);
    }
    if(source){
      const output=path.join(root,'work','precision-import.svg');fs.writeFileSync(output,result.svg);
      process.stdout.write(`svg: ${output}\n`);
      await page.setViewportSize({width:1200,height:900});
      await page.setContent(result.svg);
      await page.screenshot({path:path.join(root,'work','precision-import.png')});
    }
    assert.deepEqual(errors,[]);
    process.stdout.write(`imported ${result.nodes} objects, ${result.images} photos, ${result.texts} text boxes\n`);
  }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;}).finally(()=>server.close());
