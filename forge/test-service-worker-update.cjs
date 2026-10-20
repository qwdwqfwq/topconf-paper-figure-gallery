const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core');

// Exercise real HTTP caching and the real service worker, which request-routing
// mocks (and serviceWorkers:'block') cannot cover.
let release = 'old-180-seconds';
const hits = [];
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  hits.push(pathname);
  if(pathname === '/forge/sw.js'){
    res.writeHead(200, {'Content-Type':'text/javascript', 'Cache-Control':'no-store'});
    return res.end(fs.readFileSync(path.join(__dirname, 'sw.js')));
  }
  res.writeHead(200, {'Content-Type':pathname.endsWith('.mjs')?'text/javascript':'text/html',
    'Cache-Control':'public, max-age=3600'});
  res.end(pathname.endsWith('.mjs') ? `export default '${release}';` :
    `<!doctype html><body>${release}<script>navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});</script>`);
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const page=await browser.newPage(); // Service workers intentionally enabled.
    const url=`http://127.0.0.1:${server.address().port}/forge/index.html`;
    await page.goto(url);
    await page.evaluate(async()=>{
      await navigator.serviceWorker.ready;
      if(!navigator.serviceWorker.controller) await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
      await fetch('./probe.mjs');
    });
    release='new-1500-seconds';
    // Non-navigation HTML used to be cache-first; navigation also reused the
    // browser HTTP cache even though the worker claimed to be network-first.
    assert.match(await page.evaluate(()=>fetch('./probe.mjs').then(r=>r.text())),/new-1500-seconds/);
    assert.match(await page.evaluate(()=>fetch('./index.html').then(r=>r.text())),/new-1500-seconds/);
    await page.goto(url);
    assert.match(await page.locator('body').innerText(),/new-1500-seconds/);
    assert.ok(hits.filter(p=>p==='/forge/probe.mjs').length>=2);
    console.log('PASS active service worker fetches new HTML/modules despite fresh HTTP cache');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
