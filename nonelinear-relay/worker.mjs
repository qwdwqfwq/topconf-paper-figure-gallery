// Fixed upstream only. Users supply their own key; no server-side key or logs.
import { adaptReferences, ReferenceError } from './reference-images.mjs';
import { sourceImage } from './source-image.mjs';
import { prepareChat, waitingChat } from './chat-stream.mjs';
import { waitingSSE } from './live-chat.mjs';
const routes = new Map([['/v1/models', 'GET'], ['/v1/chat/completions', 'POST'], ['/v1/images/generations', 'POST'], ['/v1/images/edits', 'POST'], ['/v1/source-image', 'POST']]);
export function normalizeMedia(body) {
  const data = JSON.parse(body);
  for (const message of data.messages || []) {
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      const url = part?.type === 'image_url' && part.image_url?.url;
      if (typeof url !== 'string' || !url.startsWith('data:application/octet-stream;base64,')) continue;
      const encoded = url.slice(url.indexOf(',') + 1), bytes = atob(encoded.slice(0, 24));
      const mime = bytes.startsWith('\x89PNG\r\n\x1a\n') ? 'image/png'
        : bytes.startsWith('\xff\xd8\xff') ? 'image/jpeg'
        : bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP' ? 'image/webp' : '';
      if (mime) part.image_url.url = `data:${mime};base64,${encoded}`;
    }
  }
  return JSON.stringify(data);
}

export default {
  async fetch(request, env = {}) {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || 'https://qwdwqfwq.github.io').split(',').map(x => x.trim());
    const headers = new Headers({ 'Cache-Control': 'no-store', 'Vary': 'Origin' });
    const reply = (status, message) => new Response(message, { status, headers });
    if (!origin || origin === 'null' || !allowed.includes(origin)) return reply(403, 'Gallery origin required');
    headers.set('Access-Control-Allow-Origin', origin);
    const url = new URL(request.url), method = routes.get(url.pathname);
    if (!method || url.search) return reply(404, 'Unknown endpoint');
    if (request.method === 'OPTIONS') {
      const requested = (request.headers.get('Access-Control-Request-Headers') || '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
      if (request.headers.get('Access-Control-Request-Method') !== method || requested.some(x => !['authorization', 'content-type'].includes(x))) return reply(403, 'Unsupported preflight');
      headers.set('Access-Control-Allow-Methods', method);
      headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      return reply(204, null);
    }
    if (request.method !== method) return reply(405, 'Method not allowed');
    const authorization = request.headers.get('Authorization');
    if (!/^Bearer\s+\S+$/i.test(authorization || '')) return reply(401, 'API key required');
    try {
      const outgoing = new Headers({ Authorization: authorization });
      const contentType = request.headers.get('Content-Type');
      if (contentType) outgoing.set('Content-Type', contentType);
      let body, aggregate = false;
      if (method === 'POST') {
        // Bound memory before parsing large reference-image requests.
        const reader = request.body?.getReader(), chunks = []; let size = 0;
        if (reader) for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > 32 * 1024 * 1024) { await reader.cancel(); return reply(413, 'Request exceeds relay 32 MiB limit'); }
          chunks.push(value);
        }
        body = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
        if (url.pathname === '/v1/source-image') return await sourceImage(body, request.signal, headers);
        if (url.pathname === '/v1/chat/completions') {
          try { ({body,aggregate} = prepareChat(normalizeMedia(new TextDecoder().decode(body)))); }
          catch { return reply(400, 'Invalid chat JSON'); }
        }
        if (url.pathname === '/v1/images/generations' && contentType?.toLowerCase().includes('application/json')) {
          body = await adaptReferences(body, authorization, request.signal);
        }
      }
      const pending = fetch('https://api.nonelinear.com.cn' + url.pathname, {
        method, headers: outgoing, body, redirect: 'manual', signal: request.signal,
      });
      if (aggregate) return waitingChat(pending, headers);
      if (url.pathname === '/v1/chat/completions' && JSON.parse(body).stream === true) return waitingSSE(pending, headers);
      const response = await pending;
      // Workers does not support redirect: 'error'. Reject redirects explicitly
      // so credentials can never be forwarded to another destination.
      if (response.status >= 300 && response.status < 400) return reply(502, 'NoneLinear upstream redirect refused');
      headers.set('Content-Type', response.headers.get('Content-Type') || 'application/json');
      // Preserve upstream errors and stream long model responses without buffering.
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      if (error instanceof ReferenceError) return reply(error.status, error.message);
      return reply(502, 'NoneLinear upstream connection failed');
    }
  },
};
