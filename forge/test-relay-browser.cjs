// Run with: node forge/test-relay-browser.cjs
// Optional live verification reads INFISTAR_TEST_KEY from the environment only.
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
        .replace("await boot();\ninitProviders();\nsyncSubCount();\nawait Promise.all([populateModels(), populateParserModels()]);\n$('#manifestHint').textContent = tt('manifest.hint',{d:MAN.updated});",
          "window.__testGenImage=genOaiImage; runReconstruction=async()=>false; MAN=FALLBACK;\ninitProviders();\nsyncSubCount();\n$('#manifestHint').textContent = tt('manifest.hint',{d:MAN.updated});");
      data=Buffer.from(html);
    }
    res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream'});
    res.end(data);
  });
});

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-proxy-server']});
  try{
    const page=await browser.newPage({serviceWorkers:'block'});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/forge/`);
    await page.locator('#useRelay').check();
    await page.locator('#relayPreset').selectOption('https://infistar.cc/v1');
    assert.equal(await page.locator('#provider').inputValue(),'infistar');
    assert.equal(await page.locator('#key').inputValue(),'');
    assert.equal(await page.locator('#baseOverride').inputValue(),'https://infistar.cc/v1');
    await page.locator('#relayPreset').selectOption('https://infistar.ai/v1');
    await page.reload();
    assert.equal(await page.locator('#provider').inputValue(),'infistar');
    assert.equal(await page.locator('#baseOverride').inputValue(),'https://infistar.ai/v1');
    await page.locator('#relayPreset').selectOption('https://infistar.cc/v1');
    let requested=[];
    await page.route('https://infistar.cc/v1/**',route=>{
      requested.push({url:route.request().url(),headers:route.request().headers()});
      return route.fulfill({json:{data:[{id:'gpt-4o-mini'},{id:'text-embedding-v4'},{id:'wan3.0-video'},{id:'gpt-image-2'}]}});
    });
    await page.locator('#key').fill('test-key');
    await page.locator('#refreshModels').click();
    await page.waitForFunction(()=>document.querySelector('#parseModel').value==='gpt-4o-mini');
    assert.deepEqual(await page.locator('#parseModel option').evaluateAll(xs=>xs.map(x=>x.value)),['gpt-4o-mini']);
    assert.ok(requested.every(r=>r.url==='https://infistar.cc/v1/models' && r.headers.authorization==='Bearer test-key'));
    // Claude relay uses the same OpenAI path and Bearer auth.
    await page.locator('#provider').selectOption('claude');
    await page.locator('#useRelay').check();
    await page.locator('#baseOverride').fill('https://infistar.cc/v1');
    await page.locator('#key').fill('test-key');
    requested=[];
    await page.locator('#refreshModels').click();
    await page.waitForTimeout(200);
    assert.ok(requested.length>0 && requested.every(r=>r.url==='https://infistar.cc/v1/models' && r.headers.authorization==='Bearer test-key'));
    await page.locator('#relayPreset').selectOption('https://infistar.cc/v1');
    await page.unroute('https://infistar.cc/v1/**');
    // Exercise the app's image branch and bitmap handoff to Step 4.
    // Reference payloads are covered by test-image-api.mjs; reconstruction is stubbed.
    const pixel='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    let imageRequests=[];
    await page.route('https://infistar.cc/**',route=>{
      const req=route.request();
      imageRequests.push({url:req.url(),body:req.postDataJSON(),headers:req.headers()});
      return route.fulfill({json:{candidates:[{content:{parts:[{text:'Generated image'},{inlineData:{mimeType:'image/png',data:pixel}}]},finishReason:'STOP'}]}});
    });
    await page.evaluate(()=>window.__testGenImage('https://infistar.cc/v1','gemini-3.1-flash-image','test-key','Draw a research diagram','infistar',[],''));
    assert.equal(imageRequests.length,1);
    assert.equal(imageRequests[0].url,'https://infistar.cc/v1beta/models/gemini-3.1-flash-image:generateContent');
    assert.equal(imageRequests[0].headers.authorization,'Bearer test-key');
    assert.deepEqual(imageRequests[0].body.generationConfig.responseModalities,['TEXT','IMAGE']);
    assert.ok(imageRequests[0].body.contents[0].parts[0].text.includes('Draw a research diagram'));
    assert.equal(await page.locator('#out img').getAttribute('src'),'data:image/png;base64,'+pixel);
    await page.unroute('https://infistar.cc/**');
    if(process.env.INFISTAR_IMAGE_TEST_KEY){
      await page.evaluate(async key=>window.__testGenImage('https://infistar.cc/v1','gemini-3.1-flash-image',key,'Draw two boxes labelled Input and Output, connected by an arrow.','infistar',[],''),process.env.INFISTAR_IMAGE_TEST_KEY);
      const result=await page.locator('#out img').evaluate(async img=>{await img.decode();return {width:img.naturalWidth,height:img.naturalHeight,srcLength:img.src.length}});
      assert.ok(result.width>1 && result.height>1);
      console.log('LIVE Gemini image generation and browser decode passed:',JSON.stringify(result));
      await page.locator('#out img').screenshot({path:path.join(root,'work/infistar-gemini-live.png')});
    }
    if(process.env.INFISTAR_TEST_KEY){
      await page.locator('#key').fill(process.env.INFISTAR_TEST_KEY);
      await page.locator('#refreshModels').click();
      await page.waitForFunction(()=>document.querySelector('#parseModel').options.length>20,{},{timeout:45000});
      const result=await page.evaluate(async()=>{
        const response=await fetch('https://infistar.cc/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+document.querySelector('#key').value},body:JSON.stringify({model:'gpt-4o-mini',messages:[{role:'user',content:'Reply with exactly FORGE_OK'}],max_tokens:20,stream:false})});
        const data=await response.json();
        return {status:response.status,reply:data.choices?.[0]?.message?.content,error:data.error?.message};
      });
      assert.equal(result.status,200,JSON.stringify(result));
      assert.match(result.reply,/FORGE_OK/);
      console.log('LIVE browser CORS, model discovery and chat passed:',JSON.stringify(result));
    }
    assert.deepEqual(errors,[]);
    console.log('PASS Infistar presets, persistence, credential isolation, model filtering, Claude relay routing and Gemini image generation');
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
