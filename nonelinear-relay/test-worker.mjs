import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import worker, { normalizeMedia } from './worker.mjs';

const origin = 'https://qwdwqfwq.github.io';
const calls = [], originalFetch = globalThis.fetch;
const request = (path, options = {}) => new Request('https://relay.example' + path, {
  ...options, headers: { Origin: origin, Authorization: 'Bearer test-only', ...options.headers },
});
globalThis.fetch = async (url, options) => {
  calls.push({ url, options });
  return new Response('upstream error detail', { status: 429, headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': 'https://nonelinear.com.cn' } });
};
try {
  for (const badOrigin of ['null', 'https://other.example']) {
    const response = await worker.fetch(request('/v1/models', { headers: { Origin: badOrigin } }));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  }
  assert.equal((await worker.fetch(request('/v1/models?target=https://other.example'))).status, 404);
  assert.equal((await worker.fetch(request('/v1/unknown'))).status, 404);
  assert.equal((await worker.fetch(request('/v1/models', { method: 'DELETE' }))).status, 405);
  assert.equal((await worker.fetch(request('/v1/models', { headers: { Authorization: '' } }))).status, 401);
  assert.equal((await worker.fetch(request('/v1/chat/completions', { method: 'POST', body: 'bad json' }))).status, 400);
  assert.equal(calls.length, 0);
  const preflight = await worker.fetch(request('/v1/images/edits', { method: 'OPTIONS', headers: {
    'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type',
  } }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal((await worker.fetch(request('/v1/models', { method: 'OPTIONS', headers: {
    'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'cookie',
  } }))).status, 403);
  for (const [mime, hex] of [['image/png', '89504e470d0a1a0a0000000d49484452'], ['image/jpeg', 'ffd8ffe000104a464946'], ['image/webp', '524946460000000057454250']]) {
    const encoded = Buffer.from(hex, 'hex').toString('base64');
    const body = { model: 'qwen-test', messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:application/octet-stream;base64,' + encoded } }] }] };
    const normalized = JSON.parse(normalizeMedia(JSON.stringify(body)));
    body.messages[0].content[0].image_url.url = `data:${mime};base64,${encoded}`;
    assert.deepEqual(normalized, body);
  }
  for (const [path, method] of [['/v1/models', 'GET'], ['/v1/chat/completions', 'POST'], ['/v1/images/generations', 'POST'], ['/v1/images/edits', 'POST']]) {
    const response = await worker.fetch(request(path, { method, ...(method === 'POST' ? { body: '{"model":"qwen-test","messages":[]}', headers: { 'Content-Type': 'application/json', Cookie: 'private', 'X-Untrusted': 'ignore' } } : {}) }));
    assert.equal(response.status, 429);
    assert.equal(await response.text(), 'upstream error detail');
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const call = calls.at(-1);
    assert.equal(call.url, 'https://api.nonelinear.com.cn' + path);
    assert.equal(call.options.headers.get('Authorization'), 'Bearer test-only');
    assert.equal(call.options.headers.get('Cookie'), null);
    assert.equal(call.options.headers.get('X-Untrusted'), null);
    assert.equal(call.options.redirect, 'manual');
    assert.ok(call.options.signal instanceof AbortSignal);
    if (method === 'POST') assert.equal(typeof call.options.body === 'string' ? call.options.body : new TextDecoder().decode(call.options.body), '{"model":"qwen-test","messages":[]}');
  }
  globalThis.fetch = async () => new Response(null, { status: 302, headers: { Location: 'https://other.example' } });
  const redirectResponse = await worker.fetch(request('/v1/models'));
  assert.equal(redirectResponse.status, 502);
  assert.equal(redirectResponse.headers.get('Location'), null);
  globalThis.fetch = async () => { throw new Error('private connection detail'); };
  assert.equal((await worker.fetch(request('/v1/models'))).status, 502);
  const config = await readFile(new URL('../forge/nonelinear-config.js', import.meta.url), 'utf8');
  const injected = { window: { FF_NONELINEAR_BASE: 'https://relay.example/v1' } };
  vm.runInNewContext(config, injected);
  assert.equal(injected.window.FF_NONELINEAR_BASE, 'https://relay.example/v1');
  console.log('PASS: relay routes, CORS, preflight, credentials, MIME, upstream errors, and shared configuration (no paid calls)');
} finally { globalThis.fetch = originalFetch; }
