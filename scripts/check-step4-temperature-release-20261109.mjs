// Verify the authorized Step 4 temperature-only release against the live base.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const base = 'fd0e58556c2648774a6f0e290eb80c5754da7663';
const forge = 'forge/index.html';
const workflow = '.github/workflows/deploy.yml';
const check = 'scripts/check-step4-temperature-release-20261109.mjs';

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const before = path => git('show', base + ':' + path);
const current = path => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n');
const allowed = [forge, workflow, check].sort();

function replaceOnce(source, original, replacement) {
  assert.equal(source.split(original).length, 2, 'Expected one match for ' + original);
  return source.replace(original, replacement);
}

assert.deepEqual(git('diff', '--cached', '--name-only', base).trim().split('\n').sort(), allowed,
  'The release may change only the FigureForge page and the release check');
git('diff', '--exit-code');
for (const path of allowed) {
  assert.ok(git('ls-files', '--stage', '--', path).startsWith('100644 '), 'Unexpected file mode for ' + path);
}

const expectedScene = replaceOnce(before(forge),
  '          temperature:0.1,\n          max_tokens:audit.wholeImage?',
  '          max_tokens:audit.wholeImage?');
const expectedPage = replaceOnce(expectedScene,
  "    const body = { model:model, temperature:0.2,\n                   messages:[{ role:'system', content:ANALYZE_SYS },",
  "    const body = { model:model,\n                   messages:[{ role:'system', content:ANALYZE_SYS },");
assert.equal(current(forge), expectedPage, 'The page may only omit temperature in the two Step 4 request bodies');

const previousCheck = ' || node scripts/check-gallery-summary-release-20261109.mjs --prepare-pages';
assert.equal(current(workflow), replaceOnce(before(workflow), previousCheck, previousCheck + ' || node ' + check + ' --prepare-pages'),
  'The deployment workflow may only append this release check');

if (process.argv[2] === '--prepare-pages') {
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
  assert.equal(process.env.GITHUB_SHA, git('rev-parse', 'HEAD').trim());
  assert.equal(git('show', '-s', '--format=%P', 'HEAD').trim(), base);
  assert.equal(git('status', '--porcelain', '--untracked-files=all'), '');

  // Reproduce the previous release's artifact, with the Step 4 page updated.
  const deployed = '7e089379d187af99271d0d7de8ae50c2b128dc2f';
  const publishedPaths = [forge, 'assets/i18n_gallery.js', 'index.html'].sort();
  const changedPaths = () => git('diff', '--cached', '--name-only', deployed).trim().split('\n').sort();
  const restorePaths = changedPaths().filter(path => !publishedPaths.includes(path));
  git('restore', '--source=' + deployed, '--staged', '--worktree', '--', ...restorePaths);
  assert.deepEqual(changedPaths(), publishedPaths);
  for (const path of ['assets/i18n_gallery.js', 'index.html']) {
    assert.equal(git('rev-parse', ':' + path), git('rev-parse', base + ':' + path));
  }
  assert.equal(current(forge), expectedPage);
  git('diff', '--exit-code');
}

console.log('Verified the Step 4 temperature-only release against the deployed base.');
