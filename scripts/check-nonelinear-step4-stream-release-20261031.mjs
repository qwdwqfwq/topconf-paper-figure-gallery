// Owner-authorized NoneLinear Step 4 streaming transport exception. Baselines stay intact.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const base='99a5a1b8f08c08f3b7f2649b021811341bd97887';
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:50*1024*1024});
const normalize=s=>s.replace(/\r\n/g,'\n');
const expected={
  "forge/infistar-reconstruction-stream.mjs": "0f2a4cbb8db82ff9a883f3f5a0b131fde7d6df12a251257507c6541236d2e8c5",
  "forge/test-infistar-reconstruction-stream.mjs": "91ff6322d561272f16108d5dcc01bd792e7400ba037c08d38e62f68f983457e6",
  "nonelinear-relay/worker.mjs": "9584dc0a1b6380b148f772b9ce8559b844c0254ed464998b080d88e789d75172",
  "nonelinear-relay/live-chat.mjs": "a0b641222a42a8fd61bab37d254cbaa5a811d8899c2fd5a5f551da3755e8ba2c",
  "nonelinear-relay/test-live-chat.mjs": "4a7fea3b02655388371abca61364b4ea17dc3b83d4afba30d0d4aa668b27e887",
  ".github/workflows/deploy.yml": "d1cc6df8ad59f1b991e8751151885cd739dfa7902e34130a6151b2d56b2192ae"
};
const self='scripts/check-nonelinear-step4-stream-release-20261031.mjs';
assert.deepEqual(git('diff','--cached','--name-only',base).trim().split(/\r?\n/).sort(),[...Object.keys(expected),self].sort(),'Only authorized transport, tests and release validation may change');
git('diff','--exit-code');
for(const [name,digest] of Object.entries(expected))assert.equal(createHash('sha256').update(normalize(readFileSync(join(root,name),'utf8'))).digest('hex'),digest,name);
const helper='forge/infistar-reconstruction-stream.mjs';
assert.equal(normalize(readFileSync(join(root,helper),'utf8')),normalize(git('show',base+':'+helper)).replace("provider==='infistar';","provider==='infistar'||provider==='nonelinear';"),'Only NoneLinear streaming dispatch may change');
for(const name of git('ls-tree','-r','--name-only',base,'forge/').trim().split(/\r?\n/)){
 if(name===helper||name==='forge/test-infistar-reconstruction-stream.mjs')continue;
 assert.equal(git('rev-parse',base+':'+name).trim(),git('rev-parse',':'+name).trim(),name+' must remain byte-for-byte unchanged');

}
console.log('Verified isolated NoneLinear streaming transport; original dimensions, reconstruction, other APIs and four exports unchanged.');
