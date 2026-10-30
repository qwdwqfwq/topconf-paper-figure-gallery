// Only NoneLinear's own generated image storage needs this CORS bridge.
// All other providers, local data URIs, and custom gateways retain their path.
export function fetchBitmapSource(src, {provider, base, key}, fetcher = fetch) {
  let url;
  try { url = new URL(src); } catch { return fetcher(src); }
  if (provider !== 'nonelinear' || url.hostname !== 'imagen-nonelinear-2025.tos-cn-beijing.volces.com' ||
      base.replace(/\/+$/, '') !== 'https://gallery-nonelinear-relay.lixiao-gallery.workers.dev/v1') return fetcher(src);
  return fetcher(base.replace(/\/+$/, '') + '/source-image', {
    method:'POST', headers:{Authorization:'Bearer '+key, 'Content-Type':'application/json'},
    body:JSON.stringify({url:String(src)}), credentials:'omit', redirect:'error',
  });
}
