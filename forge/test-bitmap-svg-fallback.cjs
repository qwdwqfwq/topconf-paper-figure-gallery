const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req,res)=>{
  let pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname.endsWith('/')) pathname += 'index.html';
  const filename = path.resolve(root,'.'+pathname);
  if(!filename.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(filename,(err,data)=>{
    if(err){res.writeHead(404);return res.end();}
    if(pathname==='/forge/index.html') data=Buffer.from(data.toString('utf8').replace(/\r\n/g,'\n')
      .replace("import * as T from './vendor/transformers.min.js';",'const T={};')
      .replace('/* ---------------- go ---------------- */\nawait boot();', '/* ---------------- go ---------------- */\nwindow.__parseBitmapSvgScene = parseBitmapSvgScene;\nMAN=FALLBACK;'));
    res.writeHead(200,{'Content-Type':/\.m?js$/.test(filename)?'text/javascript':filename.endsWith('.html')?'text/html':'application/octet-stream'});res.end(data);
  });
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const page=await browser.newPage({serviceWorkers:'block'});
    await page.goto(`http://127.0.0.1:${server.address().port}/forge/`);
    await page.waitForFunction(()=>typeof window.__parseBitmapSvgScene==='function');
    const result=await page.evaluate(()=>window.__parseBitmapSvgScene(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><defs><marker id="tip"/></defs><style>.connector {stroke:blue;stroke-dasharray:6 3;marker-start:url(#tip);marker-end:url(#tip);fill:none}</style><g class="connector"><line x1="10" y1="10" x2="100" y2="10"/><path d="M10 30 L100 30"/><polyline points="10,50 100,50"/><path d="M10 60 L50 80 Z" marker-start="none" marker-end="none"/></g></svg>`));
    assert.equal(result.nodes.length,4,'flat paths and polylines must survive');
    for(const n of result.nodes.slice(0,3)){
      assert.equal(n.arrowStart,true,'inherited CSS start marker');
      assert.equal(n.arrow,true,'inherited CSS end marker');
      assert.deepEqual(n.dash,[6,3]);
      assert.equal(n.stroke,'0000FF');
    }
    assert.equal(result.nodes[1].closed,false,'open path must stay open');
    assert.equal(result.nodes[3].closed,true);
    assert.equal(result.nodes[3].arrowStart,false,'marker none is not an arrow');
    assert.equal(result.nodes[3].arrow,false);
    console.log('bitmap SVG fallback: inherited style, both arrowheads, dash, flat paths and open paths passed');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
