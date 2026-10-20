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
      const html=data.toString('utf8').replace(/\r\n/g,'\n')
        .replace("import * as T from './vendor/transformers.min.js';",'const T={};')
        .replace('window.__ffReconstruct = () => runReconstruction();',
          'window.__ffReconstruct = () => runReconstruction();\nwindow.__ffTestMaterialize = materializeEditableScene; window.__ffTestCalibrate = calibrateEditableText; window.__ffTestGenerateBitmap = genOaiImage; window.__ffTestZip = zipStore; window.__ffTestRequestScene = requestEditableScene; window.__ffTestParseSvg = parseSvgScene; window.__ffTestParseBitmap = parseBitmapSvgScene; window.__ffTestDrawio = sceneToDrawio; window.__ffTestVsdx = sceneToVsdxFiles; window.__ffTestPptx = buildNativePptx; window.__ffTestSvgString = sceneToSvgString;')
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


    for(const scenario of ['recover','persistent','unauthorized','format','budget']){
      const result=await page.evaluate(async(scenario)=>{
        document.querySelector('#provider').value='ark';
        document.querySelector('#key').value='test-key';
        const select=document.querySelector('#analyzeModel');
        select.add(new Option('vision-test','vision-test'));select.value='vision-test';
        const canvas=document.createElement('canvas');canvas.width=100;canvas.height=100;
        const originalFetch=window.fetch,originalTimer=window.setTimeout;
        let calls=0;const waits=[];
        window.setTimeout=(fn,ms,...args)=>{if(ms<60000){waits.push(ms);return originalTimer(fn,0,...args);}return originalTimer(fn,ms,...args);};
        window.fetch=async()=>{
          calls++;
          const status=scenario==='unauthorized'?401:scenario==='format'?200:scenario==='recover'&&calls===3?200:500;
          const data=status!==200?{error:{message:'upstream error: do request failed (request id: quota-401)',code:'do_request_failed'}}:
            {choices:[{message:{content:scenario==='format'?'{}':JSON.stringify({nodes:[{type:'rect',x:0,y:0,w:50,h:50,fill:'#ffffff'}]})}}]};
          return new Response(JSON.stringify(data),{status,headers:scenario==='recover'?{'Retry-After':'3'}:{}});
        };
        const audit={maxAttempts:1,...(scenario==='budget'?{maxTotalMs:1500}:{})};
        try{const scene=await window.__ffTestRequestScene(canvas.toDataURL(),100,100,audit);return {calls,waits,nodes:scene.nodes.length,audit};}
        catch(error){return {calls,waits,message:error.message,status:error.status,audit};}
        finally{window.fetch=originalFetch;window.setTimeout=originalTimer;}
      },scenario);
      assert.equal(result.calls,scenario==='recover'||scenario==='persistent'?3:1,JSON.stringify(result));
      if(scenario==='recover'){assert.equal(result.nodes,1);assert.deepEqual(result.waits,[3000,4000]);assert.equal(result.audit.state,'succeeded');}
      if(scenario==='persistent'){assert.equal(result.status,500);assert.match(result.message,/原图仍保留|original image is preserved/);assert.match(result.message,/^HTTP 500/);}
      if(scenario==='unauthorized')assert.equal(result.status,401);
      console.log('PASS',scenario);
    }
    assert.deepEqual(errors,[]);
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
