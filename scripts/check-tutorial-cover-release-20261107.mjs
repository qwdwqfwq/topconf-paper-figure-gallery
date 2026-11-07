// Narrow authorization for the bilingual tutorial cover replacement only.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = '1e2e6283c48d005fbbaae81bc21b0eb6405b9e58';
const self = 'scripts/check-tutorial-cover-release-20261107.mjs';
const workflow = '.github/workflows/deploy.yml';
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
const normalize = text => text.replace(/\r\n/g, '\n');
const before = path => normalize(git('show', `${base}:${path}`));
const current = path => normalize(readFileSync(resolve(root, path), 'utf8'));
function once(source, needle, replacement) {
  assert.equal(source.split(needle).length, 2, `Expected one integration point: ${needle}`);
  return source.replace(needle, replacement);
}

const covers = {
  'assets/figureforge-demo-poster-en.png': 'c0d91d57d7e0d2c7a0875eb27c8218b1b039cd786d3f4ffab54e3b2826c8cff2',
  'assets/figureforge-demo-poster-zh.png': '28e5de8f0f692497fdccf9c8a06ab796b5307b9d5f071c30970961d3619b703b',
};
const allowed = ['README.md', 'docs/demo.html', ...Object.keys(covers), workflow, self].sort();
assert.deepEqual(git('diff', '--cached', '--name-only', base).trim().split('\n').sort(), allowed,
  'Release must contain exactly the authorized cover assets, references and new release check');
git('diff', '--exit-code');
for (const path of allowed) {
  assert.ok(git('ls-files', '--stage', '--', path).startsWith('100644 '), `Unexpected file mode: ${path}`);
}

let readme = before('README.md');
for (const [label, language] of [['▶ FigureForge demo video', 'en'], ['▶ FigureForge 演示视频', 'zh']]) {
  const oldLine = `[![${label}](assets/figureforge-demo-poster.jpg)](https://qwdwqfwq.github.io/topconf-paper-figure-gallery/docs/demo.html)`;
  readme = once(readme, oldLine, oldLine.replace('figureforge-demo-poster.jpg', `figureforge-demo-poster-${language}.png`));
}
assert.equal(current('README.md'), readme, 'README may change only the two cover references');
assert.equal(current('docs/demo.html'), once(before('docs/demo.html'),
  'poster="../assets/figureforge-demo-poster.jpg"', 'poster="../assets/figureforge-demo-poster-zh.png"'),
  'Video page may change only its poster reference');
const previousCheck = ' || node scripts/check-support-author-release-20261104.mjs';
assert.equal(current(workflow), once(before(workflow), previousCheck, `${previousCheck} || node ${self}`),
  'Deployment may only append this release check');
for (const [path, hash] of Object.entries(covers)) {
  assert.equal(createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex'), hash,
    `Cover differs from the reviewed six-conference image: ${path}`);
}
console.log('Tutorial cover release verified: only bilingual covers, references and the authorized deployment check changed.');
