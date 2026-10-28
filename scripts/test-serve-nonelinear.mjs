import assert from 'node:assert/strict';
import http from 'node:http';
import { createGalleryServer, normalizeVisionMediaType } from './serve-nonelinear.mjs';
import { imageRequestDimensions, verifyImageRatio, verifyImageResolution } from '../forge/aspect-ratio.mjs';
assert.deepEqual(imageRequestDimensions('nonelinear','Qwen-Image','1:1','1K'),{field:'size',value:'1024x1024'});
assert.equal(verifyImageRatio(1024,1024,'1:1'),true);
assert.equal(verifyImageResolution(1024,1024,'1K','1024x1024'),true);
assert.throws(()=>imageRequestDimensions('nonelinear','Qwen-Image','16:9','2K'),/no verified/);
for(const [mime,magic] of [['image/png','89504e470d0a1a0a0000000d49484452'],['image/jpeg','ffd8ffe000104a464946'],['image/webp','524946460000000057454250']]){
 const encoded=Buffer.from(magic,'hex').toString('base64');
 const body={model:'qwen3-vl-32b-instruct',max_tokens:128000,messages:[{role:'system',content:'unchanged prompt'},{role:'user',content:[{type:'image_url',image_url:{url:'data:application/octet-stream;base64,'+encoded,detail:'high'}}]}]};
 const result=JSON.parse(normalizeVisionMediaType(Buffer.from(JSON.stringify(body))));
 body.messages[1].content[0].image_url.url=`data:${mime};base64,${encoded}`;
 assert.deepEqual(result,body);
 const valid=Buffer.from(JSON.stringify(body));assert.equal(normalizeVisionMediaType(valid),valid);
}
const realFetch=globalThis.fetch,calls=[];
globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response('{"data":[]}',{headers:{'content-type':'application/json'}})};
const server=createGalleryServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
function request(path,opts={}){return new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path,...opts},res=>{let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,body}));});req.on('error',reject);req.end(opts.body);});}
try{
 const home=await request('/forge/');assert.equal(home.status,200);assert.ok(home.body.includes(`window.FF_NONELINEAR_BASE="http://127.0.0.1:${port}/api/nonelinear/v1"`));
 const body=JSON.stringify({model:'Qwen3-8B-nothink:free',messages:[]});
 assert.equal((await request('/api/nonelinear/v1/chat/completions',{method:'POST',headers:{authorization:'Bearer test-only','content-type':'application/json'},body})).status,200);
 assert.equal(calls.length,1);assert.equal(calls[0].url,'https://api.nonelinear.com.cn/v1/chat/completions');assert.equal(calls[0].options.headers.authorization,'Bearer test-only');assert.equal(calls[0].options.body.toString(),body);assert.equal(calls[0].options.redirect,'error');
 for(const path of ['/api/nonelinear/v1/anything','/api/nonelinear/v1/models?url=https://example.com'])assert.equal((await request(path)).status,404);
 assert.equal((await request('/api/nonelinear/v1/models',{headers:{origin:'https://example.com'}})).status,403);
 assert.equal((await request('/forge/',{headers:{host:'example.com'}})).status,403);
 for(const path of ['/.git/config','/scripts/serve-nonelinear.mjs','/%2e%2e%5csecret'])assert.equal((await request(path)).status,403);
 assert.equal(calls.length,1);
 assert.equal((await request('/images/aaai/final/example.jpg',{headers:{authorization:'Bearer must-not-leak'}})).status,200);assert.equal(calls.length,2);assert.equal(calls[1].options.headers,undefined);assert.equal(calls[1].url,'https://qwdwqfwq.github.io/topconf-paper-figure-gallery/images/aaai/final/example.jpg');
 console.log('PASS loopback relay: exact request forwarding, origin/host validation, endpoint allowlist, traversal protection, public assets without credentials');
}finally{globalThis.fetch=realFetch;await new Promise(r=>server.close(r));}
