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
    if(pathname==='/forge/index.html') data=Buffer.from(data.toString('utf8')
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
    const source=process.env.PRECISION_BITMAP;
    let bitmap=source?`data:image/jpeg;base64,${fs.readFileSync(source).toString('base64')}`:null;
    if(!bitmap) bitmap=await page.evaluate(([w,h])=>{const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').fillStyle='white';canvas.getContext('2d').fillRect(0,0,w,h);return canvas.toDataURL('image/png');},scene.canvas_px);
    const result=await page.evaluate(async({scene,bitmap})=>{
      const imported=await window.__ffImportPrecisionScene(scene,bitmap);
      const state=window.__ffExportState;
      return {nodes:imported.nodes.length,images:imported.nodes.filter(n=>n.type==='image').length,
        texts:imported.nodes.filter(n=>n.type==='text').length,svg:state.svg,
        status:document.querySelector('#precisionImportStatus').textContent};
    },{scene,bitmap});
    assert.equal(result.nodes,scene.objects.length);
    assert.equal(result.images,scene.objects.filter(o=>o.kind==='image').length);
    assert.match(result.svg,/<text/);
    assert.match(result.svg,/<image/);
    assert.match(result.status,/已导入/);
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
