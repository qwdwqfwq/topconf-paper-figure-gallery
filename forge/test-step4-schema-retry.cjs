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
    console.log(JSON.stringify(result));
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
