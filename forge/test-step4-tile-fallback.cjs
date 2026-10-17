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
        .replace('function reconstructionProgressText(', 'window.__testReconstructionProgressText=function reconstructionProgressText(')
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
      return {calls,strategy:audit.strategy,wholeAudit:audit.tiles[0],mergedTiles:audit.mergedTiles,completedTiles:audit.completedTiles,
        nodes:scene.nodes.length,types:scene.nodes.map(n=>n.type),ids:scene.nodes.map(n=>n.id)};
    },source);
    assert.equal(result.strategy,'tiled-fallback');
    assert.equal(result.mergedTiles,4);
    assert.equal(result.completedTiles,4);
    assert.equal(result.calls,5);
    assert.equal(result.wholeAudit.maxAttempts,2);
    assert.equal(result.wholeAudit.timeoutMsOverride,240000);
    assert.equal(result.wholeAudit.maxTotalMs,240000);
    assert(result.nodes>0);
    assert(result.types.includes('rect'));
    assert(result.types.includes('text'));
    assert.equal(new Set(result.ids).size,result.ids.length);
    const progress=await page.evaluate(()=>{
      const now=Date.now();
      return window.__testReconstructionProgressText({phase:'regions',startedAt:now-62000,
        completedTiles:1,totalTiles:5,fallbackTiles:1,revisions:[],tiles:[
          {wholeImage:true,state:'succeeded'},
          {state:'pending',timeoutMs:240000,attemptStartedAt:now-60000},
          {state:'queued'}]});
    });
    assert.match(progress,/0\/4/);
    assert.match(progress,/1:0[12]/);
    assert(!progress.includes('NaN'));
    console.log(JSON.stringify(result));
    const sparse=await page.evaluate(async src=>{
      const im=new Image();im.src=src;await im.decode();
      const canvas=document.createElement('canvas');canvas.width=im.width;canvas.height=im.height;
      canvas.getContext('2d').drawImage(im,0,0);
      const audit={tiles:[],completedTiles:0,totalTiles:1,fallbackTiles:0};
      let calls=0;
      const request=async (_image,w,h)=>{
        calls++;
        return {canvas:{width:w,height:h},nodes:Array.from({length:w===canvas.width?1:4},(_,i)=>
          ({id:'node-'+i,type:'rect',x:30+i*45,y:30,w:30,h:30,fill:'#ffffff'}))};
      };
      const measure=async (_canvas,scene)=>({score:scene.nodes.length>4?.85:.65,
        darkRecall:scene.nodes.length>4?.86:.6,localRecall:scene.nodes.length>4?.75:.5,
        edgeF1:scene.nodes.length>4?.8:.6,colorSimilarity:.9});
      const scene=await window.__testReconstructCatalogWithFallback(canvas,src,request,audit,null,measure);
      return {calls,strategy:audit.strategy,selected:audit.selectedTiledDetail,nodes:scene.nodes.length};
    },source);
    assert.equal(sparse.strategy,'whole-then-tiled');
    assert.equal(sparse.selected,true);
    assert(sparse.nodes>1);
    assert.equal(sparse.calls,5);
    console.log(JSON.stringify(sparse));
    const stalled=await page.evaluate(async src=>{
      const im=new Image();im.src=src;await im.decode();
      const canvas=document.createElement('canvas');canvas.width=im.width;canvas.height=im.height;
      canvas.getContext('2d').drawImage(im,0,0);
      const audit={tiles:[],completedTiles:0,totalTiles:1,fallbackTiles:0};
      const calls=[];
      const request=async (_image,w,h,detail)=>{
        calls.push({w,h,depth:detail.depth,timeout:detail.timeoutMsOverride,
          context:!!detail.detailCatalog});
        if(detail.tile===1&&detail.depth===0){
          const error=new Error('Vision request timed out');error.visionTimeout=true;throw error;
        }
        return {canvas:{width:w,height:h},nodes:[
          {id:'shape',type:'rect',x:20,y:20,w:50,h:50,fill:'#000000'}]};
      };
      const measure=async (_canvas,scene)=>({score:scene.nodes.length>1?.82:.70,
        darkRecall:scene.nodes.length>1?.82:.70,
        localRecall:scene.nodes.length>1?.75:.60,
        edgeF1:scene.nodes.length>1?.8:.7,colorSimilarity:.9});
      const scene=await window.__testReconstructCatalogWithFallback(canvas,src,request,audit,null,measure);
      return {calls,mergedTiles:audit.mergedTiles,totalTiles:audit.totalTiles,
        completedTiles:audit.completedTiles,fallbackTiles:audit.fallbackTiles,
        strategy:audit.strategy,nodes:scene.nodes.length,tilePassComplete:audit.tilePassComplete};
    },source);
    assert.equal(stalled.strategy,'whole-then-tiled');
    assert(stalled.fallbackTiles>=1);
    assert(stalled.calls.some(call=>call.depth===1&&call.w<stalled.calls[1].w));
    assert(stalled.calls.filter(call=>call.depth===0).every(call=>call.timeout===240000));
    assert(stalled.calls.filter(call=>call.depth===1).every(call=>call.timeout===180000));
    assert(stalled.calls.slice(1).some(call=>call.context));
    assert.equal(stalled.completedTiles,stalled.totalTiles);
    assert.equal(stalled.tilePassComplete,true);
    assert(stalled.nodes>0);
    console.log(JSON.stringify(stalled));
    const cached=await page.evaluate(async src=>{
      const im=new Image();im.src=src;await im.decode();
      const canvas=document.createElement('canvas');canvas.width=im.width;canvas.height=im.height;
      canvas.getContext('2d').drawImage(im,0,0);
      const audit={tiles:[],completedTiles:0,totalTiles:1,fallbackTiles:0};
      const old={canvas:{width:im.width,height:im.height},nodes:[
        {id:'old',type:'rect',x:10,y:10,w:50,h:50,fill:'#ffffff'}]};
      let calls=0;
      const request=async (_image,w,h)=>{
        calls++;
        return {canvas:{width:w,height:h},nodes:[
          {id:'weak',type:'rect',x:10,y:10,w:10,h:10,fill:'#ffffff'}]};
      };
      const measure=async (_canvas,scene)=>({score:scene.nodes[0]?.id==='old' ? .70 : .55,
        darkRecall:scene.nodes[0]?.id==='old' ? .70 : .55,
        localRecall:scene.nodes[0]?.id==='old' ? .60 : .45,
        edgeF1:scene.nodes[0]?.id==='old' ? .70 : .55,colorSimilarity:.9});
      const scene=await window.__testReconstructCatalogWithFallback(canvas,src,request,audit,old,measure);
      return {calls,strategy:audit.strategy,nodes:scene.nodes.length,kept:scene.nodes[0]?.id};
    },source);
    assert.equal(cached.calls,4);
    assert.equal(cached.strategy,'cached-catalog');
    assert.equal(cached.kept,'old');
    console.log(JSON.stringify(cached));
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
