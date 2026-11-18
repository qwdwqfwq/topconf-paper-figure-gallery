import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {allowed,payload,assertScope,assertArtifact,verifyPrevious,verifyPatch,verifyHealth} from './check-tencent-backend-release.mjs';
test('publication includes exactly the authorized network modules and preserves protected files',()=>{
 assertScope(allowed);assertArtifact(payload);
 for(const p of ['forge/index.html','forge/image-api.mjs','forge/reconstruction-core.mjs','.github/forge-workflow-lock.json','scripts/check-forge-workflow-lock.mjs']){
  assert.throws(()=>assertScope([...allowed,p]));assert.throws(()=>assertArtifact([...payload,p]));
 }
 assert.throws(()=>assertScope(allowed.slice(1)));assert.throws(()=>verifyPrevious(Buffer.from('{}')));
});
test('every payload must match both the published source and the reviewed patch',()=>{
 for(const p of payload){
  const original=execFileSync('git',['show','cf4a41bf21965096cd01568b9967b1a112997444:'+p]);
  const candidate=readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
  verifyPatch(p,original,candidate);
  assert.throws(()=>verifyPatch(p,original,original));
  assert.throws(()=>verifyPatch(p,original,candidate+'\n// extra'));
 }
});
test('deployment requires the intended durable Tencent service with proxy disabled',()=>{
 const good={service:'gallery-tencent-backend',version:'20261118-native',ready:true,proxy:false,storage:'sqlite-wal'};
 verifyHealth(good);
 for(const bad of [{proxy:true},{ready:false},{storage:'memory'},{service:'old-service'},{version:'unknown'}])assert.throws(()=>verifyHealth({...good,...bad}));
});
