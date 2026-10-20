// Apply the gallery's source-pixel line guard to a saved live run, then export
// the corrected editable scene using the same SVG and PPTX builders.
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'playwright-core');
const bitmap=path.resolve(process.argv[2]||'');
const input=path.resolve(process.argv[3]||'');
const output=path.resolve(process.argv[4]||'');
if(!fs.existsSync(bitmap)||!fs.existsSync(input)||!output)throw Error('Pass input PNG, scene JSON, and output directory');
fs.mkdirSync(output,{recursive:true});
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const relative=pathname.endsWith('/')?pathname+'index.html':pathname;
  const filename=path.resolve(root,'.'+relative);
  if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(filename,(error,bytes)=>{
    if(error){res.writeHead(404);res.end();return;}
    if(relative==='/forge/index.html'){
      bytes=Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n')
        .replace("import * as T from './vendor/transformers.min.js';",'const T={};')
        .replace('window.__ffReconstruct = () => runReconstruction();',
          'window.__ffReconstruct = () => runReconstruction(); window.__ffFilterLines=filterUnsupportedLongLines; window.__ffStructure=repairStructuralLayers; window.__ffInk=recoverDocumentInk; window.__ffTestPptx=buildNativePptx; window.__ffTestSvg=sceneToSvgString; window.__ffTestZip=zipStore; window.__ffTestCompare=compareEditableRender;')
        .replace("await boot();\ninitProviders();\nsyncSubCount();\nawait Promise.all([populateModels(), populateParserModels()]);\n$('#manifestHint').textContent = tt('manifest.hint',{d:MAN.updated});",
          "MAN=FALLBACK;\ninitProviders();\nsyncSubCount();\n$('#manifestHint').textContent = tt('manifest.hint',{d:MAN.updated});"));
    }
    res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream'});res.end(bytes);
  });
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const page=await browser.newPage();
    page.on('pageerror',error=>console.error('Page error:',error.message));
    await page.goto('http://127.0.0.1:'+server.address().port+'/forge/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof window.__ffFilterLines==='function',{timeout:30000});
    const scene=JSON.parse(fs.readFileSync(input,'utf8'));
    const data='data:image/png;base64,'+fs.readFileSync(bitmap).toString('base64');
    const result=await page.evaluate(async({scene,data})=>{
      const image=new Image();image.src=data;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
      canvas.getContext('2d').drawImage(image,0,0);
      const filtered=window.__ffStructure(window.__ffInk(window.__ffFilterLines(canvas,scene,scene),canvas),canvas);
      const removed=scene.nodes.filter(node=>!filtered.nodes.some(n=>n.id===node.id)).map(node=>node.id);
      const pptx=await window.__ffTestPptx(filtered,window.__ffTestZip);
      const quality=await window.__ffTestCompare(canvas,filtered);
      return {scene:filtered,removed,quality,svg:window.__ffTestSvg(filtered),pptx:Array.from(new Uint8Array(await pptx.arrayBuffer()))};
    },{scene,data});
    fs.writeFileSync(path.join(output,'scene.json'),JSON.stringify(result.scene));
    fs.writeFileSync(path.join(output,'reconstructed.svg'),result.svg);
    fs.writeFileSync(path.join(output,'reconstructed.pptx'),Buffer.from(result.pptx));
    fs.writeFileSync(path.join(output,'postprocess-audit.json'),JSON.stringify({removed:result.removed,quality:result.quality},null,2));
    console.log('Removed unsupported lines:',JSON.stringify(result.removed));
    console.log('Exported nodes:',result.scene.nodes.length,'score:',result.quality.score);
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
