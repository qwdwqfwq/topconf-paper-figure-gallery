// Owner-authorized donation-only release, 2026-11-04. Preserve all original locks.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const base='c3102d1f8158251f312c2ad8a5afd6c185bb7643';
const self='scripts/check-support-author-release-20261104.mjs';
const workflow='.github/workflows/deploy.yml';
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:20*1024*1024});
const normalize=s=>s.replace(/\r\n/g,'\n');
const hashes={
  "index.html": "a490d787690abb01119b5696bab941dac36bbf697a93525b0dd4d553866d9a45",
  "README.md": "8d909521f30b194e41e8d9cad90f25d8ca233d36221aa2bc75f83e36ad8c5439",
  "support.html": "dc85acc50a109e83fdfb5c43511cdc1f720f8884b65a1007c347a2857f35fbef",
  ".github/FUNDING.yml": "927c505ed7387d98a330522d4ea411d42b91a83bbabc69db908711a168cc627f",
  "assets/support-dialog.css": "5195b5710c8f33417abb4f37abbfdca40666a93c8837d9cb6adfd5a48e506f77",
  "assets/support-dialog.js": "993ad476e4a867e5446e69820e4f2863bbc606a2821b7cd4ff36ef78dc85a935",
  "assets/wechat-pay.jpg": "e70fc1e6fed0ce53a4ef325c85e03fe5b2ad0bdb91d5fcc77e3b43aa31844971"
};
const allowed=[...Object.keys(hashes),workflow,self].sort();
assert.deepEqual(git('diff','--cached','--name-only',base).trim().split(/\r?\n/).filter(Boolean).sort(),allowed,'Only the nine reviewed donation integration and release files may change');
git('diff','--exit-code');
for(const p of allowed) assert.match(git('ls-files','--stage','--',p),/^100644 [0-9a-f]{40} 0\t/,'Expected a regular file: '+p);
for(const [p,hash] of Object.entries(hashes)) {
 const raw=readFileSync(resolve(root,p));
 const bytes=p.endsWith('.jpg')?raw:normalize(raw.toString('utf8'));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,'Reviewed donation file changed: '+p);
}
const old=normalize(git('show',base+':'+workflow));
const anchor=' || node scripts/check-tutorial-video-release-20261104.mjs';
assert.equal(old.split(anchor).length,2);
assert.equal(normalize(readFileSync(resolve(root,workflow),'utf8')),old.replace(anchor,anchor+' || node '+self),'Preserve every existing check and deployment setting');
console.log('Verified donation-only release: all other tracked files, including the complete bitmap and FigureForge workflows, match the current online tree. Original locks and baselines are unchanged.');
