// Only NoneLinear's own generated image storage needs this CORS bridge.
// All other providers, local data URIs, and custom gateways retain their path.
const relay = 'https://gallery-nonelinear-relay.lixiao-gallery.workers.dev/v1';
const host = 'imagen-nonelinear-2025.tos-cn-beijing.volces.com';
function bridged(src, {provider, base}) {
  try { return provider === 'nonelinear' && new URL(src).hostname === host && base.replace(/\/+$/, '') === relay; }
  catch { return false; }
}
function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, {once:true});
    if (signal.aborted) abort();
  });
}
export async function fetchBitmapSource(src, context, fetcher = fetch) {
  const {key, signal} = context;
  if (!bridged(src, context)) return signal ? fetcher(src, {signal}) : fetcher(src);
  // Bounds apply only to downloading original bytes, never model inference.
  for (let attempt = 0; attempt < 3; attempt++) {
    signal?.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal?.addEventListener('abort', abort, {once:true});
    const timer = setTimeout(() => controller.abort(new DOMException('Original image download timed out', 'TimeoutError')), 45000);
    let retry = false;
    try {
      const response = await fetcher(relay + '/source-image', {
        method:'POST', headers:{Authorization:'Bearer '+key, 'Content-Type':'application/json'},
        body:JSON.stringify({url:String(src)}), credentials:'omit', redirect:'error', signal:controller.signal,
      });
      retry = [408,429].includes(response.status) || response.status >= 500;
      if (!retry || attempt === 2) {
        if (!response.ok) return response;
        // Consume inside the attempt so interrupted response bodies also retry.
        const blob = await response.blob();
        signal?.throwIfAborted();
        return new Response(blob, {status:response.status, headers:response.headers});
      }
      await response.body?.cancel();
    } catch (error) {
      signal?.throwIfAborted();
      if (attempt === 2) throw new Error('原图下载失败：网络中断或读取超时，已尝试 3 次。请重试重建，无需重新生成图片。', {cause:error});
      retry = true;
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
    }
    if (retry) await pause(500 * (attempt + 1), signal || new AbortController().signal);
  }
}

// Successful original bytes only; bounded cache for remote versions still in use.
const originals = new Map();
let originalBytes = 0;
const limit = 40 * 1024 * 1024;
export async function readBitmapSource(src, context, toDataUrl, fetcher = fetch) {
  if (!src) return null;
  context.signal?.throwIfAborted();
  if (/^data:image\//i.test(String(src))) return String(src);
  const cacheable = bridged(src, context);
  if (cacheable && originals.has(String(src))) return originals.get(String(src)).data;
  const response = await fetchBitmapSource(src, context, fetcher);
  if (!response.ok) {
    const reason = {400:'图片地址格式尚不受支持',401:'请检查服务商 Key',403:'原图访问被拒绝',404:'原图已不存在或链接已失效',408:'原图服务读取超时',413:'原图超过 40 MiB',422:'返回内容不是支持的原图',429:'原图服务限流'}[response.status] || '原图服务暂不可用';
    throw new Error('原图读取失败（HTTP '+response.status+'）：'+reason+'。请重试重建或上传已下载的原图，无需重新生成图片。');
  }
  const blob = await response.blob();
  const data = await toDataUrl(blob);
  context.signal?.throwIfAborted();
  if (cacheable && blob.size <= limit) {
    while (originals.size && (originals.size >= 3 || originalBytes + blob.size > limit)) {
      const oldest = originals.keys().next().value;
      originalBytes -= originals.get(oldest).size; originals.delete(oldest);
    }
    originals.set(String(src), {data, size:blob.size}); originalBytes += blob.size;
  }
  return data;
}
