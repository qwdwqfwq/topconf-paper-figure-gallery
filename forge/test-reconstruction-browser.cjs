// Run with: node forge/test-reconstruction-browser.cjs
// Uses the bundled Playwright runtime and installed Chrome; no live API key.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core');

const root = path.resolve(__dirname, '..');
const mime = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
const server = http.createServer((req,res)=>{
  let pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname.endsWith('/')) pathname += 'index.html';
  const filename = path.resolve(root,'.'+pathname);
  if (!filename.startsWith(root+path.sep)) {res.writeHead(403); return res.end();}
  fs.readFile(filename,(err,data)=>{
    if(err) {res.writeHead(404); return res.end();}
    // The sparse local checkout omits the heavyweight model runtime and
    // manifest. Replace startup only in this test response, never in the app.
    if(pathname==='/forge/index.html'){
      const html=data.toString('utf8')
        .replace("import * as T from './vendor/transformers.min.js';",'const T={};')
        .replace("await boot();\ninitProviders();\nsyncSubCount();\nawait Promise.all([populateModels(), populateParserModels()]);\n$('#manifestHint').textContent = tt('manifest.hint',{d:MAN.updated});",
          "MAN=FALLBACK;\ninitProviders();\nsyncSubCount();\n$('#manifestHint').textContent = tt('manifest.hint',{d:MAN.updated});");
      data=Buffer.from(html);
    }
    res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream'});
    res.end(data);
  });
});

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const page=await browser.newPage({serviceWorkers:'block',acceptDownloads:true});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400 && /\.(?:m?js|html)(?:\?|$)/.test(r.url())) errors.push(`HTTP ${r.status()} ${r.url()}`);});
    page.on('requestfailed',r=>errors.push(`Request failed ${r.url()}: ${r.failure()?.errorText}`));
    await page.goto(`http://127.0.0.1:${server.address().port}/forge/`,{waitUntil:'domcontentloaded'});
    assert.equal(await page.evaluate(()=>typeof window.__ffReconstruct),'function',JSON.stringify(errors));
    const result=await page.evaluate(async()=>{
      document.querySelector('#provider').value='ark';
      document.querySelector('#key').value='browser-test-key';
      const select=document.querySelector('#analyzeModel');
      select.add(new Option('doubao-vision-test','doubao-vision-test'));
      select.value='doubao-vision-test';
      const original=window.fetch;
      let calls=0;
      window.fetch=async(url,options)=>{
        if(String(url).endsWith('/chat/completions')){
          calls++;
          const body=JSON.parse(options.body);
          const match=body.messages[1].content[0].text.match(/"width":(\d+),"height":(\d+)/);
          const w=Number(match[1]),h=Number(match[2]);
          const nodes=Array.from({length:8},(_,i)=>({type:'rect',x:20+i*45,y:30,w:35,h:35,fill:'#abcdef',stroke:'#123456'}));
          nodes.push({type:'text',x:15,y:90,w:200,h:30,text:'Editable test'});
          return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({canvas:{width:w,height:h},nodes})}}]}),{status:200,headers:{'Content-Type':'application/json'}});
        }
        return original(url,options);
      };
      const canvas=document.createElement('canvas'); canvas.width=1200; canvas.height=500;
      canvas.getContext('2d').fillStyle='#ffffff'; canvas.getContext('2d').fillRect(0,0,1200,500);
      window.__ffLastGeneratedImage=canvas.toDataURL('image/png');
      const ok=await window.__ffReconstruct();
      const scene=window.__ffExportState.scene;
      return {ok,calls,nodes:scene&&scene.nodes.length,svg:window.__ffExportState.svg,
        status:document.querySelector('#reconStatus').textContent};
    });
    assert.equal(result.ok,true,JSON.stringify(result));
    assert.equal(result.calls,2,'1200px bitmap must use two vision requests');
    assert.ok(result.nodes>=16,'editable primitives must survive tile merge');
    assert.match(result.svg,/<svg/);
    for(const format of ['svg','pptx','vsdx','drawio']){
      await page.locator(`#exportActions [data-export="${format}"]`).click();
      const downloadPromise=page.waitForEvent('download',{timeout:30000});
      await page.locator('#exportConfirm').click();
      const download=await downloadPromise;
      assert.equal(download.suggestedFilename(),`figure-forge-editable.${format}`);
      const bytes=fs.readFileSync(await download.path());
      assert.ok(bytes.length>100,`${format} download must contain content`);
      if(format==='pptx' || format==='vsdx') assert.equal(bytes.subarray(0,2).toString(),'PK',`${format} must be a ZIP package`);
      if(format==='svg') assert.match(bytes.toString('utf8'),/<svg/);
      if(format==='drawio') assert.match(bytes.toString('utf8'),/<mxfile/);
      assert.match(await page.locator('#exportStatus').innerText(),/已生成|完成|finished|ready/i);
    }
    const failed=await page.evaluate(async()=>{
      const original=window.fetch;
      window.fetch=async(url,options)=>{
        if(String(url).endsWith('/chat/completions')) return new Response(JSON.stringify({error:{message:'Provider temporarily unavailable'}}),{status:503});
        return original(url,options);
      };
      const ok=await window.__ffReconstruct();
      return {ok,status:document.querySelector('#exportStatus').textContent};
    });
    assert.equal(failed.ok,false);
    assert.match(failed.status,/503|temporarily unavailable/i);
    assert.deepEqual(errors,[],'page JavaScript errors');
    console.log('Browser rebuild with mocked vision API: OK');
  }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;}).finally(()=>server.close());
