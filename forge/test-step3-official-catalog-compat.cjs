// Keep the existing revision assertions intact while supplying the new public
// discovery fixture. Every request other than these two exact public GET URLs
// still reaches the original test's strict unexpected-request assertions.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.REVISION_PLAYWRIGHT||'C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const launch=chromium.launch.bind(chromium);
chromium.launch=async function(...args){
 const browser=await launch(...args),newPage=browser.newPage.bind(browser),close=browser.close.bind(browser);
 let publicRequests=0;
 browser.newPage=async function(...options){
  const page=await newPage(...options),route=page.route.bind(page);
  page.route=async function(pattern,handler,...rest){
   return route(pattern,async (requestRoute,request)=>{
    const req=requestRoute.request();
    if(['https://infistar.cc/pricing','https://infistar.ai/pricing'].includes(req.url())){
     assert.equal(req.method(),'GET');
     assert.equal(req.headers().authorization,undefined);
     assert.equal(req.headers().cookie,undefined);
     publicRequests++;
     return requestRoute.fulfill({contentType:'text/html',body:'<script id="public-site-pricing-data" type="application/json">'+JSON.stringify({success:true,data:[{model_name:'gpt-image-2',supported_endpoint_types:['image-generation']},{model_name:'gemini-3.1-flash-image',supported_endpoint_types:['image-generation']}]})+'</script>'});
    }
    return handler(requestRoute,request);
   },...rest);
  };
  return page;
 };
 browser.close=async function(){
  await close();
  assert.ok(publicRequests>0,'The unchanged current revision UI must exercise public discovery');
  console.log(JSON.stringify({officialDiscoveryFixture:true,publicRequests,originalRevisionAssertionsUnchanged:true}));
 };
 return browser;
};
require('./test-revision-user-directed-r2.cjs');
