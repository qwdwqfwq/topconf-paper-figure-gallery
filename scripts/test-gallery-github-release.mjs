import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {assertScope, assertArtifact, verifyCandidate, verifyPrevious, payload} from './check-gallery-github-release.mjs';

test('publication rejects any extra, missing or protected file', () => {
  assertArtifact(payload);
  assert.throws(() => assertArtifact([...payload, 'forge/index.html']));
  assert.throws(() => assertArtifact(payload.slice(1)));
  const allowed = [...payload, '.github/workflows/deploy-gallery-github.yml',
    'scripts/check-gallery-github-release.mjs', 'scripts/test-gallery-github-release.mjs'];
  assertScope(allowed);
  assert.throws(() => assertScope([...allowed, '.github/forge-workflow-lock.json']));
  assert.throws(() => assertScope([...allowed, 'forge/revision-gallery.mjs']));
});
test('candidate hashes reject changed content or unapproved paths', () => {
  for (const p of payload) {
    const bytes = Buffer.from(readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n'));
    verifyCandidate(p, bytes);
    assert.throws(() => verifyCandidate(p, Buffer.concat([bytes, Buffer.from(' ')])));
  }
  assert.throws(() => verifyCandidate('forge/index.html', Buffer.from('')));
});
test('publication proof cannot be replaced by an unverified manifest', () => {
  assert.throws(() => verifyPrevious(Buffer.from('{}')));
  assert.throws(() => verifyPrevious(Buffer.from(JSON.stringify({allOtherPublishedBytesIdentical: true, entries: []}))));
});
