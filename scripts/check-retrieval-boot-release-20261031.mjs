// Owner-authorized first-load/retrieval exception only. Original freeze baselines stay intact.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const base='340fd10ce5a22162a66e7fbe4b4dac5ee3f75557';
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:50*1024*1024});
const normalize=s=>s.replace(/\r\n/g,'\n');
const expected={
  ".github/workflows/deploy.yml": "d1602aa01ba392839d36421f45424ffb217fb3e5bf079af5cbef46430b989201",
  "forge/index.html": "a5a446572088d1977d2e9effdf1444ea673d645bf93b0426a48ff686a037cec6",
  "forge/retrieval.mjs": "249cb4a8e91fc78c903a65fac05d51987f7ec4b176cd3613d597b01dbf4cc04c",
  "forge/test-openai-pdf-browser.cjs": "6fbd9a4c0980944a2056b0bcd0ca4f66a4d14c1767b4ebf126c43a4328ca2c12",
  "forge/test-reasoning-browser.cjs": "a40566953c0b4b0bfd3417556eb47b0aabeb421b3565d5a956300b87ed44cfab",
  "forge/test-reconstruction-browser.cjs": "e6034a97b6771c1e48b7ceab18f2b98f92c11aa9c6b38a5298326b24bef38e21",
  "forge/retrieval-boot.mjs": "b2db14ee0487f743d438fad979e015f1c16ed5445a39b7a71ec83d1a2f5160d7",
  "forge/retrieval-worker.mjs": "be157e9cf15a09e318900426651e6e7cfdf45bca675d11623257b14b2bb3f03b",
  "forge/test-retrieval-boot.mjs": "667cac0b47678f7d556d623fbac91b31ed2a219ade4015b7ddbfcc17502913e6",
  "forge/test-retrieval-boot-browser.cjs": "15e165a029fdc51e5f9916c689ccda784102f5fcb2dc317506f58d6baa9220b6"
};
const self='scripts/check-retrieval-boot-release-20261031.mjs';
assert.deepEqual(git('diff','--cached','--name-only',base).trim().split(/\r?\n/).sort(),[...Object.keys(expected),self].sort(),'Only owner-authorized retrieval initialization, fixtures and release checks may change');
git('diff','--exit-code');
const read=name=>normalize(readFileSync(join(root,name),'utf8'));
const original=name=>normalize(git('show',base+':'+name));
for(const [name,digest] of Object.entries(expected))assert.equal(createHash('sha256').update(read(name)).digest('hex'),digest,name);
function maskIndex(text){
 const regions=[
  /^  <div id="bootBanner"[^\n]*$/m,
  /^import (?:\* as T|\{createRetrievalBoot,createSemanticWorker\}) from [^\n]*$/m,
  /^let (?:clip =|semanticWorker =)[^\n]*$/m,
  /\/\* ---------------- (?:boot: manifest \+ data \+ local CLIP|isolated retrieval initialization) ---------------- \*\/[\s\S]*?(?=\/\* ---------------- tokenize \+ BM25)/,
  /(?<=    const modelQuery=prepared.clipText;\n)[\s\S]*?(?=    scored=rank\(retrievalIndex,prepared,candidates,images,texts\);)/,
  /(?<=\/\* ---------------- go ---------------- \*\/\n)[\s\S]*?(?=<\/script>)/
 ];
 for(const [i,re] of regions.entries()){assert.ok(re.test(text),'Missing authorized initialization region '+i);text=text.replace(re,'AUTHORIZED_RETRIEVAL_'+i+'\n');}
 return text;
}
assert.equal(maskIndex(read('forge/index.html')),maskIndex(original('forge/index.html')),'Generation, reconstruction, exports and all other UI must remain identical');
assert.equal(read('forge/retrieval.mjs'),original('forge/retrieval.mjs').replace('IE.length !== ids.length * 512 || TE.length !== ids.length * 512 ||','(IE != null && IE.length !== ids.length * 512) || (TE != null && TE.length !== ids.length * 512) ||'),'Only optional semantic embeddings validation may change');
const oldStartup='await boot();\\ninitProviders();\\nsyncSubCount();\\nawait Promise.all([populateModels(), populateParserModels()]);';
const newStartup='onBootState(bootStatus);\\nawait loadManifest();\\ninitProviders();\\nsyncSubCount();\\nconst startupModels=Promise.all([populateModels(), populateParserModels()]);\\nawait boot();\\nawait startupModels;';
for(const name of ['forge/test-reconstruction-browser.cjs','forge/test-openai-pdf-browser.cjs','forge/test-reasoning-browser.cjs']){
 assert.ok(original(name).includes(oldStartup),name+' fixture must match original');
 assert.equal(read(name),original(name).replace(oldStartup,newStartup),'Only startup fixture needle may change; all assertions stay intact');
}
let workflow=original('.github/workflows/deploy.yml').replace(' || node scripts/check-nonelinear-step4-stream-release-20261031.mjs',' || node scripts/check-nonelinear-step4-stream-release-20261031.mjs || node scripts/check-retrieval-boot-release-20261031.mjs').replace('      - name: Verify PDF parsing regression tests','      - name: Verify retrieval initialization regression tests\n        run: node --test forge/test-retrieval-boot.mjs\n      - name: Verify PDF parsing regression tests');
assert.equal(read('.github/workflows/deploy.yml'),workflow,'Existing protection and regression tests remain intact');
console.log('Verified isolated first-load/retrieval repair; generation, reconstruction, dimensions, API settings and all exports unchanged from current online baseline.');
