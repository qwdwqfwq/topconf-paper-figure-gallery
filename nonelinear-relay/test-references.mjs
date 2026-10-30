import assert from 'node:assert/strict';
import worker from './worker.mjs';

const originalFetch = globalThis.fetch, calls = [];
const refs = ['data:image/png;base64,aW1hZ2Ux', 'data:image/jpeg;base64,aW1hZ2Uy', 'data:image/webp;base64,aW1hZ2Uz'];
const payload = { model: 'gemini-3.1-flash-image-preview', prompt: 'Three references', image: refs, size: '4K', aspect_ratio: '16:9', n: 1 };
const request = (data, path = '/v1/images/generations') => new Request('https://relay.example' + path, {
  method: 'POST', headers: { Origin: 'https://qwdwqfwq.github.io', Authorization: 'Bearer test-only', 'Content-Type': 'application/json' },
  body: typeof data === 'string' ? data : JSON.stringify(data),
});
function mockUpload() {
  calls.length = 0;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url === 'https://nonelinear.com.cn/api/upload-file') return Response.json({ url: `https://images.example/${calls.length}.png` });
    return Response.json({ data: [{ url: 'https://images.example/result.png' }] });
  };
}
try {
  mockUpload();
  const response = await worker.fetch(request(payload));
  assert.equal(response.status, 200);
  assert.equal(calls.length, 4);
  for (let i = 0; i < 3; i++) {
    const call = calls[i];
    assert.equal(call.url, 'https://nonelinear.com.cn/api/upload-file');
    assert.equal(call.options.headers.Authorization, 'Bearer test-only');
    assert.equal(call.options.redirect, 'manual');
    assert.ok(call.options.signal instanceof AbortSignal);
    assert.deepEqual(JSON.parse(call.options.body), { image: refs[i].split(',')[1], type: ['.png', '.jpeg', '.webp'][i] });
  }
  assert.equal(calls[3].url, 'https://api.nonelinear.com.cn/v1/images/generations');
  assert.deepEqual(JSON.parse(calls[3].options.body), { ...payload, image: [1, 2, 3].map(n => `https://images.example/${n}.png`) });

  mockUpload();
  await worker.fetch(request({ ...payload, image: [refs[0], 'https://original.example/ref.png', refs[2]] }));
  assert.equal(calls.length, 3);
  assert.deepEqual(JSON.parse(calls[2].options.body).image, ['https://images.example/1.png', 'https://original.example/ref.png', 'https://images.example/2.png']);
  for (const image of [undefined, [], ['https://original.example/ref.png'], 'https://original.example/ref.png']) {
    mockUpload();
    const body = JSON.stringify({ ...payload, image }, null, 2);
    await worker.fetch(request(body));
    assert.equal(calls.length, 1);
    assert.equal(new TextDecoder().decode(calls[0].options.body), body);
  }
  for (const image of [[refs[0], 'file:///secret'], [refs[0], 'data:image/png;base64,???'], [refs[0], 42]]) {
    mockUpload();
    assert.equal((await worker.fetch(request({ ...payload, image }))).status, 400);
    assert.equal(calls.length, 0);
  }
  for (const badResponse of [() => new Response('private base64 / key detail', { status: 429 }), () => new Response(null, { status: 302, headers: { Location: 'https://other.example' } }), () => Response.json({ url: 'http://bad.example/ref.png' }), () => Response.json({}), () => { throw new Error('secret detail'); }]) {
    calls.length = 0;
    globalThis.fetch = async (...args) => { calls.push(args); return badResponse(); };
    const failed = await worker.fetch(request(payload));
    assert.equal(failed.status, 502);
    assert.equal(calls.length, 1); // No generation, retry or credential-following redirect.
    assert.equal(await failed.text(), 'NoneLinear reference image upload failed; generation was not submitted');
  }
  for (const path of ['/v1/chat/completions', '/v1/images/edits']) {
    mockUpload();
    const body = JSON.stringify({ ...payload, messages: [] });
    await worker.fetch(request(body, path));
    assert.equal(calls.length, 1);
    const forwarded = calls[0].options.body;
    assert.equal(typeof forwarded === 'string' ? forwarded : new TextDecoder().decode(forwarded), body);
  }
  console.log('PASS: three uploads, order, unchanged model/size/prompt, mixed URLs, bypass isolation, validation and safe failure without retries');
} finally { globalThis.fetch = originalFetch; }
