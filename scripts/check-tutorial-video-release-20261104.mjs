// Owner-authorized tutorial-only release, 2026-11-04. Original locks remain unchanged.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const base='5fe162fd6ba730036f3fe03a4ba26d893c873be7';
const self='scripts/check-tutorial-video-release-20261104.mjs';
const workflow='.github/workflows/deploy.yml';
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:20*1024*1024});
const normalize=s=>s.replace(/\r\n/g,'\n');
const before=p=>normalize(git('show',base+':'+p));
const current=p=>normalize(readFileSync(resolve(root,p),'utf8'));
const media={
  'assets/figureforge-demo-poster.jpg':'eb146205a8916a8bd9bc800d5df6e0c4215217596a7b908d1315ff6166bf0f1a',
  'assets/figureforge-demo.mp4':'d48ea930713b196ca6c52a36f0714f7278bad26159a2e4528437b350f6fdb0bb',
};
const allowed=['README.md','docs/demo.html',...Object.keys(media),workflow,self].sort();
const changed=git('diff','--cached','--name-only',base).trim().split(/\r?\n/).filter(Boolean).sort();
assert.deepEqual(changed,allowed,'Only the four tutorial files and these two authorized release-protection files may change');
git('diff','--exit-code');
// Pin index modes as well as working bytes; no symlinks or executable files allowed.
for(const p of allowed) assert.match(git('ls-files','--stage','--',p),/^100644 [0-9a-f]{40} 0\t/,'Expected a regular non-executable file: '+p);
function once(source,needle,replacement){
  assert.equal(source.split(needle).length,2,'Expected one tutorial integration point: '+needle);
  return source.replace(needle,replacement);
}
let readme=once(before('README.md'),'1:58 with audio','3:23 with audio');
readme=once(readme,'1 分 58 秒','3 分 23 秒');
assert.equal(current('README.md'),readme,'Only the two tutorial duration labels may change');
assert.equal(current('docs/demo.html'),once(before('docs/demo.html'),'1 分 58 秒','3 分 23 秒'),'Only the tutorial duration may change on the player page');
for(const [p,hash] of Object.entries(media)){
  assert.equal(createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex'),hash,'Only the reviewed tutorial media may ship: '+p);
}
assert.equal(current(workflow),once(before(workflow),' || node scripts/check-analytics-release.mjs',' || node scripts/check-analytics-release.mjs || node '+self),'Only append this narrow release check; preserve all existing guards, tests and deployment settings');
console.log('Verified tutorial-only release: four tutorial files plus two authorized protection files; all other tracked files match the current online baseline, including FigureForge, bitmap workflows, exports and original locks.');
