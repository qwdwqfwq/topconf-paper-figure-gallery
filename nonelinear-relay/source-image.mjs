// Read original generated pixels only from the provider's fixed image bucket.
// Never send the user's API key to object storage, follow redirects, or resize.
export async function sourceImage(body, signal, headers) {
  let url;
  try { url = new URL(JSON.parse(new TextDecoder().decode(body)).url); }
  catch { return new Response('Invalid source image URL', {status:400, headers}); }
  if (url.protocol !== 'https:' || url.hostname !== 'imagen-nonelinear-2025.tos-cn-beijing.volces.com' ||
      url.port || url.username || url.password || url.search || url.hash ||
      !/^\/gemini\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(url.pathname)) {
    return new Response('Unsupported source image URL', {status:400, headers});
  }
  const response = await fetch(url.href, {redirect:'manual', signal});
  if (!response.ok) return new Response('Source image unavailable', {status:502, headers});
  const limit = 40 * 1024 * 1024;
  if (Number(response.headers.get('Content-Length')) > limit) {
    await response.body?.cancel();
    return new Response('Source image exceeds 40 MiB', {status:413, headers});
  }
  const reader = response.body?.getReader(), chunks = []; let size = 0;
  if (reader) for (;;) {
    const {done, value} = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); return new Response('Source image exceeds 40 MiB', {status:413, headers}); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const starts = (...values) => values.every((v,i) => bytes[i] === v);
  const mime = starts(137,80,78,71,13,10,26,10) ? 'image/png'
    : starts(255,216,255) ? 'image/jpeg'
    : starts(82,73,70,70) && bytes[8]===87 && bytes[9]===69 && bytes[10]===66 && bytes[11]===80 ? 'image/webp' : '';
  if (!mime) return new Response('Unsupported source image content', {status:502, headers});
  headers.set('Content-Type', mime);
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(bytes, {headers});
}
