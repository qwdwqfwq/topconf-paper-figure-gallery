import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const deployed = '7e089379d187af99271d0d7de8ae50c2b128dc2f';
const parent = '2539a93fdbffa341f82dc9e4a226a60faf7250d4';
const summaryBlobs = {
  'assets/i18n_gallery.js': 'e3558c312eb07ef25739b1ed7aa2911a5b474bb2',
  'index.html': '66c530e3eefdb94debf330ddca9babf1aca658cd',
};
const summaryPaths = Object.keys(summaryBlobs);
const releaseSupport = [
  '.github/workflows/deploy.yml',
  'scripts/check-gallery-summary-release-20261109.mjs',
];
const changedPaths = (base, ...args) => git('diff', '--name-only', ...args, base, '--').split('\n').sort();

// The exception applies only to the direct, single-parent release commit.
assert.equal(git('show', '-s', '--format=%P', 'HEAD'), parent);
assert.equal(git('status', '--porcelain', '--untracked-files=all'), '');
assert.deepEqual(changedPaths(parent, 'HEAD'), [...summaryPaths, ...releaseSupport].sort());
for (const [path, blob] of Object.entries(summaryBlobs)) {
  assert.equal(git('ls-files', '--stage', '--', path), `100644 ${blob} 0\t${path}`);
}

if (process.argv[2] === '--prepare-pages') {
  // Restore only in the clean Actions checkout. Keep unpublished main content
  // and the release support files out of the artifact.
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
  assert.equal(process.env.GITHUB_SHA, git('rev-parse', 'HEAD'));
  const restorePaths = changedPaths(deployed, 'HEAD').filter(path => !summaryPaths.includes(path));
  git('restore', `--source=${deployed}`, '--staged', '--worktree', '--ignore-skip-worktree-bits', '--', ...restorePaths);
  assert.deepEqual(changedPaths(deployed, '--cached'), summaryPaths);
  git('diff', '--exit-code');
}

console.log('Verified the one-time gallery summary release against the deployed tree.');
