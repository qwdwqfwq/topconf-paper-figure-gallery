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
          'window.__ffReconstruct = () => runReconstruction();\nwindow.__ffTestParseScene = parseEditableSceneResponse; window.__ffTestRecover = recoverBitmapResponse; window.__ffTestVisible = visibleEditableContent; window.__ffTestLongLines = filterUnsupportedLongLines; window.__ffTestMaterialize = materializeEditableScene; window.__ffTestCalibrate = calibrateEditableText; window.__ffTestGenerateBitmap = genOaiImage; window.__ffTestZip = zipStore; window.__ffTestRequestScene = requestEditableScene; window.__ffTestParseSvg = parseSvgScene; window.__ffTestParseBitmap = parseBitmapSvgScene; window.__ffTestDrawio = sceneToDrawio; window.__ffTestVsdx = sceneToVsdxFiles; window.__ffTestPptx = buildNativePptx; window.__ffTestSvgString = sceneToSvgString;')
        .replace("await boot();\ninitProviders();\nsyncSubCount();\nawait Promise.all([populateModels(), populateParserModels()]);\n$('#manifestHint').textContent = tt('manifest.hint',{d:MAN.updated});",
          "MAN=FALLBACK;\ninitProviders();\nsyncSubCount();\n$('#manifestHint').textContent = tt('manifest.hint',{d:MAN.updated});");
      data=Buffer.from(html);
    }
    res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream'});
    res.end(data);
  });
});

// Opt-in local replay: the supplied private source/response files are never committed.
const downloads=path.join(require('node:os').homedir(),'Downloads');
const sourceFile=process.env.FF_REPLAY_SOURCE||path.join(downloads,'figure-forge-draft (16).png');
const responseFile=process.env.FF_REPLAY_RESPONSE||path.join(downloads,'figure-forge-reconstruction-response (1).json');
const validationFile=process.env.FF_REPLAY_VALIDATION||path.join(downloads,'figure-forge-whole-image-validation.json');
const output=path.join(root,'_local','bitmap-resource-replay');
(async()=>{
  const responses=JSON.parse(fs.readFileSync(responseFile,'utf8')).responses;
  const original=JSON.parse(fs.readFileSync(validationFile,'utf8')).scene;
  const source='data:image/png;base64,'+fs.readFileSync(sourceFile).toString('base64');
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const page=await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/forge/`,{waitUntil:'domcontentloaded'});
    const result=await page.evaluate(async({source,responses,original})=>{
      const core=await import('./reconstruction-core.mjs'),pipeline=await import('./reconstruction-pipeline.mjs');
      const evidence=await import('./bitmap-evidence.mjs'),native=await import('./editable-native.mjs');
      const image=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=source;});
      const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;canvas.getContext('2d').drawImage(image,0,0);
      const W=canvas.width,H=canvas.height;
      const inventory=window.__ffTestRecover(responses.find(r=>r.stage==='source-inventory').content,'inventory');
      const parsed=window.__ffTestParseScene(responses.find(r=>r.stage==='whole-image').content,W,H);
      if(parsed.nodes.length!==original.nodes.length)throw Error('Saved original and parsed raw scene differ');
      async function run(input){
        const audit={tiles:[]},calls=[];
        const scene=await evidence.reconstructWithEvidence(canvas,source,async(s,w,h,t)=>{
          calls.push(t.sourceInventory?'inventory':t.wholeImage?'whole':t.defectDiagnosis?'diagnosis':'patch');
          if(t.sourceInventory)return structuredClone(input);
          if(t.wholeImage)return structuredClone(parsed);
          // The real truncated diagnosis was not saved: inject an explicit QA failure.
          if(t.defectDiagnosis)throw Error('SYNTHETIC QA failure for regression');
          throw Error('Unexpected model patch');
        },audit,async()=>({preview:source}),async()=>{},{},{...core,...pipeline,sceneToSvgString:window.__ffTestSvgString,compactQuality:q=>q,renderCrop:async()=>source});
        return {scene,audit,calls};
      }
      const raw=await run(inventory);
      // A separate, manually reviewed 11-crop fixture from the actual reference.
      // Bounds below use the displayed 2048 x 1143 reference, then explicitly
      // record native integer pixel boxes. This does NOT certify the old inventory.
      const boxes=[[1852,206,161,91],[1852,308,161,90],[581,991,128,71],
        [864,898,132,72],[1039,898,131,72],[1184,898,132,72],
        [864,999,132,72],[1039,999,131,72],[1184,999,132,72],
        [1367,892,156,74],[1558,869,177,86]];
      const confirmed={canvas:{width:W,height:H,units:'source-pixels'},items:boxes.map(([x,y,w,h],i)=>({id:'reviewed-'+(i+1),kind:'photo',description:'Manually reviewed reference photo '+(i+1),x:Math.floor(x*W/2048),y:Math.floor(y*H/1143),w:Math.ceil((x+w)*W/2048)-Math.floor(x*W/2048),h:Math.ceil((y+h)*H/1143)-Math.floor(y*H/1143),expectedCount:1,colors:[]})),layers:[],connections:[],uncertainties:['Subset regression fixture; other source content has not been accepted']};
      const repaired=await run(confirmed),images=repaired.scene.nodes.filter(n=>n.type==='image');
      const pptx=await native.buildNativePptx(repaired.scene,window.__ffTestZip);
      const back=await native.readNativePptxScene(pptx,W,H),backImages=back.nodes.filter(n=>n.type==='image');
      const decoded=await Promise.all(backImages.map(n=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=n.href;})));
      let pixelMismatches=0;
      for(let i=0;i<images.length;i++){
        if(images[i].href!==backImages[i]?.href)throw Error('Embedded image bytes changed');
        const n=images[i],c=document.createElement('canvas');c.width=n.w;c.height=n.h;c.getContext('2d').drawImage(decoded[i],0,0);
        const actual=c.getContext('2d').getImageData(0,0,n.w,n.h).data,expected=canvas.getContext('2d').getImageData(n.x,n.y,n.w,n.h).data;
        for(let j=0;j<actual.length;j++)if(actual[j]!==expected[j])pixelMismatches++;
      }
      const svg=window.__ffTestSvgString(back),renderImage=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);});
      const render=document.createElement('canvas');render.width=W;render.height=H;render.getContext('2d').drawImage(renderImage,0,0);
      const sheet=document.createElement('canvas');sheet.width=800;sheet.height=600;const ctx=sheet.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,800,600);
      decoded.forEach((im,i)=>{const x=(i%4)*200,y=Math.floor(i/4)*200;ctx.drawImage(im,x,y+22,190,160);ctx.fillStyle='black';ctx.font='16px Arial';ctx.fillText('reviewed-'+(i+1),x+3,y+18);});
      const bytes=new Uint8Array(await pptx.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
      return {raw:{items:inventory.items.length,resources:raw.audit.resourceManifest.length,unresolved:raw.audit.resourceReconciliation.length,images:raw.audit.finalNodeCounts.images,rounds:raw.audit.repairRounds,state:raw.audit.finalValidation.state,status:evidence.repairStatus(raw.audit),calls:raw.calls},confirmed:{resources:images.length,embedded:backImages.length,pixelMismatches,rounds:repaired.audit.repairRounds,state:repaired.audit.finalValidation.state,calls:repaired.calls,manifest:repaired.audit.resourceManifest},pptx:btoa(binary),render:render.toDataURL(),contact:sheet.toDataURL()};
    },{source,responses,original});
    assert.equal(result.raw.resources,16);assert.equal(result.raw.unresolved,16);assert.equal(result.raw.images,0);assert.equal(result.raw.rounds,0);assert.equal(result.raw.state,'failed');
    assert.equal(result.confirmed.resources,11);assert.equal(result.confirmed.embedded,11);assert.equal(result.confirmed.pixelMismatches,0);assert.equal(result.confirmed.rounds,1);assert.notEqual(result.confirmed.state,'passed');
    assert.equal(result.confirmed.calls.filter(c=>c==='whole').length,1);
    fs.mkdirSync(output,{recursive:true});
    fs.writeFileSync(path.join(output,'subset-regression-draft.pptx'),Buffer.from(result.pptx,'base64'));
    fs.writeFileSync(path.join(output,'pptx-readback-render.png'),Buffer.from(result.render.split(',')[1],'base64'));
    fs.writeFileSync(path.join(output,'crop-contact-sheet.png'),Buffer.from(result.contact.split(',')[1],'base64'));
    delete result.pptx;delete result.render;delete result.contact;
    // Inspect the actual export ZIP, independently of the scene and readback.
    const zip=fs.readFileSync(path.join(output,'subset-regression-draft.pptx'));let at=0,media=0,pictures=0;
    while(at+30<=zip.length&&zip.readUInt32LE(at)===0x04034b50){const size=zip.readUInt32LE(at+18),len=zip.readUInt16LE(at+26),extra=zip.readUInt16LE(at+28),name=zip.subarray(at+30,at+30+len).toString(),start=at+30+len+extra;if(name.startsWith('ppt/media/'))media++;if(name==='ppt/slides/slide1.xml')pictures=(zip.subarray(start,start+size).toString().match(/<p:pic>/g)||[]).length;at=start+size;}
    assert.equal(media,11);assert.equal(pictures,11);result.export={media,pictures,renderer:'OOXML readback rendered by Chromium; NOT PowerPoint/Office'};
    fs.writeFileSync(path.join(output,'replay-report.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify({...result,confirmed:{...result.confirmed,manifest:undefined},output},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
