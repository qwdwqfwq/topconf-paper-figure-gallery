import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import access from './worker.mjs';
test('alternate ingress forwards the identical request to the existing production service',async()=>{
 const config=JSON.parse(readFileSync(new URL('./wrangler.jsonc',import.meta.url)));
 assert.deepEqual(config.services,[{binding:'ANALYSIS',service:'gallery-reference-analysis-jobs'}]);
 assert.equal(config.durable_objects,undefined);assert.equal(config.migrations,undefined);
 for(const method of ['GET','PUT','OPTIONS']){
  const req=new Request('https://alternate.invalid/jobs/12345678-1234-1234-1234-123456789abc/result',{method,headers:{Authorization:'Bearer offline-test','X-Analysis-Upstream':'infistar-cc'},...(method==='PUT'?{body:'original model and pictures'}:{})});
  const response=new Response('saved result');let calls=0;
  assert.equal(await access.fetch(req,{ANALYSIS:{fetch:received=>{calls++;assert.equal(received,req);return response;}}}),response);
  assert.equal(calls,1);
 }
});
