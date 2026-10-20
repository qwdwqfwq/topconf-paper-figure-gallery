// Run with PLAYWRIGHT_CORE_PATH=<path to playwright-core> node forge/test-step4-schema-retry.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core');

const root = path.resolve(__dirname, '..');
const image = process.env.STEP4_TEST_IMAGE || 'C:/Users/黎枭/Downloads/figure-forge-draft (3).png';
const mime = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.json':'application/json' };
const server = http.createServer((req, res) => {
  let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';
  const filename = path.resolve(root, '.' + pathname);
  if (!filename.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(filename, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    if (pathname === '/forge/index.html') {
      const html = data.toString('utf8').replace(/\r\n/g, '\n')
        .replace("import * as T from './vendor/transformers.min.js';", 'const T={};')
        .replace('async function requestEditableScene(', 'window.__testRequestEditableScene=async function requestEditableScene(')
        .replace('function editableReconstructionModel(', 'window.__testParseEditableSceneResponse=parseEditableSceneResponse;\nfunction editableReconstructionModel(')
        .replace("await boot();\ninitProviders();\nsyncSubCount();\nawait Promise.all([populateModels(), populateParserModels()]);\n$('#manifestHint').textContent = tt('manifest.hint',{d:MAN.updated});",
          "MAN=FALLBACK;\ninitProviders();\nsyncSubCount();\n$('#manifestHint').textContent = tt('manifest.hint',{d:MAN.updated});");
      data = Buffer.from(html);
    }
    res.writeHead(200, { 'Content-Type':mime[path.extname(filename)] || 'application/octet-stream' });
    res.end(data);
  });
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless:true, executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const page = await browser.newPage({ serviceWorkers:'block' });
    const prompts = [];
    await page.route('**/chat/completions', async route => {
      const body = route.request().postDataJSON();
      prompts.push(body.messages[1].content[0].text);
      const content = prompts.length === 1 ? JSON.stringify({summary:'A figure without editable nodes'}) :
        JSON.stringify({canvas:{width:1376,height:768},nodes:[{id:'panel-1',type:'rect',x:20,y:20,w:200,h:100,fill:'#ffffff'}]});
      await route.fulfill({status:200, contentType:'application/json', body:JSON.stringify({choices:[{finish_reason:'stop',message:{content}}],usage:{completion_tokens:100}})});
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/forge/`, { waitUntil:'domcontentloaded' });
    const imageDataUri = 'data:image/png;base64,' + fs.readFileSync(image).toString('base64');
    const result = await page.evaluate(async source => {
      document.querySelector('#provider').value = 'custom';
      document.querySelector('#baseOverride').value = 'https://mock.example.test';
      document.querySelector('#key').value = 'test-only';
      const model = document.querySelector('#model');
      model.add(new Option('test-vision', 'test-vision'));
      model.value = 'test-vision';
      const audit = {};
      const scene = await window.__testRequestEditableScene(source,1376,768,audit);
      const recovered = window.__testParseEditableSceneResponse(
        '{"status":"analyzed"}\n' + JSON.stringify({sections:[
          {shapes:[{type:'rect',x:1,y:1,w:10,h:10}],labels:[{type:'text',x:2,y:2,text:'A'}]},
          {shapes:[{type:'line',x:1,y:1,x2:10,y2:10}]}
        ]}),1376,768);
      return {nodes:scene.nodes.length,attempts:audit.attempts,state:audit.state,
        recoveredNodes:recovered.nodes.length,
        captured:window.__ffReconResponses?.[0]?.content};
    }, imageDataUri);
    assert.deepEqual(result, {nodes:1,attempts:2,state:'succeeded',recoveredNodes:3,
      captured:JSON.stringify({summary:'A figure without editable nodes'})});
    assert.equal(prompts.length, 2);
    assert.match(prompts[1], /previous answer could not be used/i);
    assert.match(prompts[1], /A figure without editable nodes/);
    const timeouts=await page.evaluate(async source=>{
      document.querySelector('#reconTimeoutMinutes').value='60';
      const whole={wholeImage:true,timeoutMsOverride:1500000,maxTotalMs:1500000,maxAttempts:1};
      const omission={omissionCheck:true,catalog:{canvas:{width:1376,height:768},nodes:[]},
        timeoutMsOverride:180000,maxAttempts:1};
      const region={tile:1,timeoutMsOverride:240000,maxAttempts:1};
      await window.__testRequestEditableScene(source,1376,768,whole);
      await window.__testRequestEditableScene(source,1376,768,omission);
      await window.__testRequestEditableScene(source,1376,768,region);
      return {whole:whole.timeoutMs,omission:omission.timeoutMs,region:region.timeoutMs,
        states:[whole.state,omission.state,region.state]};
    },imageDataUri);
    assert.ok(timeouts.whole>1490000 && timeouts.whole<=1500000);
    assert.equal(timeouts.omission,180000);
    assert.equal(timeouts.region,240000);
    assert.deepEqual(timeouts.states,['succeeded','succeeded','succeeded']);
    await page.unroute('**/chat/completions');
    await page.route('**/chat/completions', async route => {
      assert.match(route.request().postDataJSON().messages[1].content[0].text,/Real photographic regions/);
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
        choices:[{finish_reason:'stop',message:{content:JSON.stringify({operations:[
          {op:'add',node:{type:'image',x:10,y:5,w:20,h:10}}
        ]})}}]
      })});
    });
    const photo=await page.evaluate(async()=>{
      const source=document.createElement('canvas');source.width=80;source.height=40;
      const ctx=source.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(0,0,80,40);
      ctx.fillStyle='#00ff00';ctx.fillRect(20,10,40,20);
      const audit={regionPatch:true,detailCatalog:{nodes:[]},ownership:{},maxAttempts:1};
      const result=await window.__testRequestEditableScene(source.toDataURL(),40,20,audit);
      const node=result.operations[0].nodes[0],im=new Image();im.src=node.href;await im.decode();
      const crop=document.createElement('canvas');crop.width=im.width;crop.height=im.height;
      crop.getContext('2d').drawImage(im,0,0);
      return {width:im.width,height:im.height,pixel:Array.from(crop.getContext('2d').getImageData(10,5,1,1).data),
        crop:node.crop,nodeCount:audit.nodeCount};
    });
    assert.deepEqual(photo,{width:20,height:10,pixel:[0,255,0,255],
      crop:{x:.25,y:.25,w:.5,h:.5},nodeCount:1});
    console.log(JSON.stringify(result));
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
