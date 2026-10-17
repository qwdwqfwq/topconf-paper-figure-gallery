// Run with PLAYWRIGHT_CORE_PATH=<path to playwright-core> node forge/test-step4-tile-fallback.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core');

const root=path.resolve(__dirname,'..');
const image=process.env.STEP4_TEST_IMAGE || 'C:/Users/黎枭/Downloads/figure-forge-draft (3).png';
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json'};
const server=http.createServer((req,res)=>{
  let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname.endsWith('/')) pathname+='index.html';
  const filename=path.resolve(root,'.'+pathname);
  if(!filename.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(filename,(err,data)=>{
    if(err){res.writeHead(404);return res.end();}
    if(pathname==='/forge/index.html'){
      const html=data.toString('utf8').replace(/\r\n/g,'\n')
        .replace("import * as T from './vendor/transformers.min.js';",'const T={};')
        .replace('async function reconstructCatalogWithFallback(', 'window.__testReconstructCatalogWithFallback=async function reconstructCatalogWithFallback(')
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
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const page=await browser.newPage({serviceWorkers:'block'});
    await page.goto(`http://127.0.0.1:${server.address().port}/forge/`,{waitUntil:'domcontentloaded'});
    const source='data:image/png;base64,'+fs.readFileSync(image).toString('base64');
    const result=await page.evaluate(async src=>{
      const im=new Image();im.src=src;await im.decode();
      const canvas=document.createElement('canvas');canvas.width=im.width;canvas.height=im.height;
      canvas.getContext('2d').drawImage(im,0,0);
      const audit={tiles:[],completedTiles:0,totalTiles:1,fallbackTiles:0};
      let calls=0;
      const request=async (_image,w,h)=>{
        calls++;
        if(w===canvas.width && h===canvas.height){
          const error=new Error('Vision model returned JSON without an editable nodes array');
          error.sceneFormatFailure=true;throw error;
        }
        return {canvas:{width:w,height:h},nodes:[
          {id:'background',type:'rect',x:20,y:20,w:Math.min(w-40,200),h:100,fill:'#ffffff'},
          {id:'label',type:'text',x:40,y:40,w:100,h:30,text:'Editable label',fontSize:18}
        ]};
      };
      const scene=await window.__testReconstructCatalogWithFallback(canvas,src,request,audit);
      return {calls,strategy:audit.strategy,mergedTiles:audit.mergedTiles,completedTiles:audit.completedTiles,
        nodes:scene.nodes.length,types:scene.nodes.map(n=>n.type),ids:scene.nodes.map(n=>n.id)};
    },source);
    assert.equal(result.strategy,'tiled-fallback');
    assert.equal(result.mergedTiles,4);
    assert.equal(result.completedTiles,4);
    assert.equal(result.calls,5);
    assert(result.nodes>0);
    assert(result.types.includes('rect'));
    assert(result.types.includes('text'));
    assert.equal(new Set(result.ids).size,result.ids.length);
    console.log(JSON.stringify(result));
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
