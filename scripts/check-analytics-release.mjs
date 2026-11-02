// Narrow analytics exception, authorized 2026-11-02. Original freeze manifests stay unchanged.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const base='187901c9f2f95a75ed1d08576ef530982477a999';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:20*1024*1024});
const normalize=s=>s.replace(/\r\n/g,'\n');
const before=p=>normalize(git('show',base+':'+p));
const current=p=>normalize(readFileSync(p,'utf8'));
const allowed=['.github/workflows/deploy.yml','assets/analytics.js','forge/index.html','index.html','scripts/check-analytics-release.mjs'].sort();
const changed=git('diff','--cached','--name-only',base).trim().split(/\r?\n/).filter(Boolean).sort();
assert.deepEqual(changed,allowed,'Release must contain exactly the five authorized analytics files');
git('diff','--exit-code');
function once(source,needle,replacement){assert.equal(source.split(needle).length,2,'Expected one integration point');return source.replace(needle,replacement);}
assert.equal(current('index.html'),before('index.html').replace('</head>','  <script defer src="assets/analytics.js?v=20261102"></script>\n</head>'));
let forge=before('forge/index.html').replace('</head>','  <script defer src="../assets/analytics.js?v=20261102"></script>\n</head>');
const hook='      try{ globalThis.GalleryAnalytics?.generation(mode); }catch{} // analytics: isolated task start\n';
const actual=current('forge/index.html');
// Removing exactly the two hooks must reproduce the baseline plus the isolated script tag.
assert.equal(actual.split(hook).length,3,'Exactly two guarded task-start hooks required');
assert.equal(actual.replaceAll(hook,''),forge,'Generation, export, retrieval and bitmap code must otherwise be identical');
// Pin hook placement too; analytics must execute only at the accepted SVG/image task boundaries.
const hookedLines=actual.split('\n');
for(let i=0;i<hookedLines.length;i++)if(hookedLines[i]===hook.trimEnd())assert.match(hookedLines[i+1],/^      (?:if\(useAnthropic\) await genAnthropicSVG|await genOaiImage)/);
const workflow=before('.github/workflows/deploy.yml');
assert.equal(current('.github/workflows/deploy.yml'),once(workflow,' || node scripts/check-retrieval-boot-release-20261031.mjs',' || node scripts/check-retrieval-boot-release-20261031.mjs || node scripts/check-analytics-release.mjs'));
assert.equal(createHash('sha256').update(current('assets/analytics.js')).digest('hex'),'d3414eee647ebd6e91cf634e4df0622fd47554a14ca13de89f7387781779e783','Only reviewed anonymous tracker allowed');
console.log('Authorized analytics exception verified: original workflow, bitmap and export baselines preserved.');
