import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const prefix = '/api/nonelinear/v1';
const routes = new Map([['/models', 'GET'], ['/chat/completions', 'POST'], ['/images/generations', 'POST'], ['/images/edits', 'POST']]);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wasm': 'application/wasm', '.pdf': 'application/pdf', '.woff2': 'font/woff2' };

// Some NoneLinear image URLs download as application/octet-stream. Its vision
// endpoint requires the actual image media type. Change only the URI header;
// preserve encoded pixels, dimensions, prompts and all model parameters.
export function normalizeVisionMediaType(buffer) {
  const body = JSON.parse(buffer.toString('utf8'));
  let changed = false;
  for (const message of body.messages || []) {
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      const url = part?.type === 'image_url' && part.image_url?.url;
      if (typeof url !== 'string' || !url.startsWith('data:application/octet-stream;base64,')) continue;
      const encoded = url.slice(url.indexOf(',') + 1);
      const bytes = Buffer.from(encoded.slice(0, 24), 'base64');
      const mime = bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) ? 'image/png'
        : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
        : bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP' ? 'image/webp' : '';
      if (mime) { part.image_url.url = `data:${mime};base64,${encoded}`; changed = true; }
    }
  }
  return changed ? Buffer.from(JSON.stringify(body)) : buffer;
}

// Loopback only. The destination is fixed; credentials are forwarded in memory.
export function createGalleryServer() {
  return http.createServer(async (req, res) => {
    const origin = `http://127.0.0.1:${req.socket.localPort}`;
    if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) {
      res.writeHead(403); return res.end('Local origin required');
    }
    try {
      const url = new URL(req.url, origin);
      if (url.pathname.startsWith(prefix + '/')) {
        const route = url.pathname.slice(prefix.length);
        if (routes.get(route) !== req.method || url.search) { res.writeHead(404); return res.end(); }
        const chunks = []; let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 64 * 1024 * 1024) { res.writeHead(413); res.end('Request too large'); return; }
          chunks.push(chunk);
        }
        const controller = new AbortController();
        const cancel = () => { if (!res.writableEnded) controller.abort(); };
        res.on('close', cancel);
        const timeout = setTimeout(() => controller.abort(), 600_000);
        try {
          const headers = {};
          if (req.headers.authorization) headers.authorization = req.headers.authorization;
          if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
          const requestBody = req.method === 'POST' ? Buffer.concat(chunks) : undefined;
          const upstream = await fetch('https://api.nonelinear.com.cn/v1' + route, {
            method: req.method, headers, body: route === '/chat/completions' ? normalizeVisionMediaType(requestBody) : requestBody,
            signal: controller.signal, redirect: 'error',
          });
          res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' });
          if (upstream.body) for await (const chunk of upstream.body) {
            if (controller.signal.aborted) break;
            res.write(chunk);
          }
          res.end();
        } finally { clearTimeout(timeout); res.off('close', cancel); }
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/') { res.writeHead(302, { Location: '/forge/' }); return res.end(); }
      if (pathname.endsWith('/')) pathname += 'index.html';
      const filename = resolve(root, '.' + pathname);
      if (!filename.startsWith(root + sep) || pathname.split(/[\\/]/).some(part => part.startsWith('.')) || /\/(?:scripts|_local)\//.test(pathname)) {
        res.writeHead(403); return res.end();
      }
      let data;
      try { data = await readFile(filename); }
      catch (error) {
        // Sparse local checkouts omit the public gallery thumbnails. Never
        // forward API credentials when reading these fixed-origin assets.
        if (error.code !== 'ENOENT' || !/^\/images\/[a-zA-Z0-9_./-]+\.(?:jpg|jpeg|png|webp)$/.test(pathname)) throw error;
        const asset = await fetch('https://qwdwqfwq.github.io/topconf-paper-figure-gallery' + pathname, { redirect: 'error', signal: AbortSignal.timeout(30000) });
        if (!asset.ok) { res.writeHead(asset.status); return res.end(); }
        data = Buffer.from(await asset.arrayBuffer());
      }
      if (pathname === '/forge/index.html') {
        data = Buffer.from(data.toString('utf8').replace('<head>', `<head><script>window.FF_NONELINEAR_BASE=${JSON.stringify(origin + prefix)};</script>`));
      }
      res.writeHead(200, { 'Content-Type': types[extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      if (!res.headersSent) res.writeHead(error.code === 'ENOENT' ? 404 : 502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Request failed');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 8765);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const server = createGalleryServer();
  server.on('error', error => { console.error(error.code || 'Server failed'); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`画廊：http://127.0.0.1:${port}/forge/ （非线智能本机转发已启用，密钥只在浏览器填写）`));
}
