// Render a saved reconstruction scene with the same gallery SVG renderer.
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'playwright-core');
const input=path.resolve(process.argv[2]||'');
const output=path.resolve(process.argv[3]||'');
if(!fs.existsSync(input)||!output)throw Error('Pass scene.json and output SVG path');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const relative=pathname.endsWith('/')?pathname+'index.html':pathname;
  const filename=path.resolve(root,'.'+relative);
  if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(filename,(err,bytes)=>{
    if(err){console.error('Missing',filename);res.writeHead(404);res.end();return;}
    if(relative==='/forge/index.html'){
      bytes=Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n')
        .replace("import * as T from './vendor/transformers.min.js';",'const T={};')
        .replace('window.__ffReconstruct = () => runReconstruction();',
          'window.__ffReconstruct = () => runReconstruction(); window.__ffTestSvg=sceneToSvgString;')
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
    page.on('pageerror',e=>console.error('Page error:',e.message));
    page.on('console',m=>{if(m.type()==='error')console.error('Browser:',m.text());});
    await page.goto('http://127.0.0.1:'+server.address().port+'/forge/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof window.__ffTestSvg==='function',{timeout:30000});
    const svg=await page.evaluate(scene=>window.__ffTestSvg(scene),JSON.parse(fs.readFileSync(input,'utf8')));
    fs.writeFileSync(output,svg);
    console.log(output);
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
