const CACHE_NAME = 'figureforge-static-v3';
const STATIC_FILE = /\.(?:html|css|js|mjs|wasm|onnx|json|bin|png|gif)(?:$|\?)/i;

// Keep the manifest network-first so a newly published model/data version is
// discovered, while canonicalising its URL so the old `?ts=` cache-buster can
// never create an unbounded set of duplicate entries.
function cacheRequest(request){
  const url = new URL(request.url);
  if(url.pathname.endsWith('/manifest.json')) url.search = '';
  return new Request(url.href, request);
}

async function writeCache(request, response){
  if(!response || !response.ok) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(cacheRequest(request), response);
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith('figureforge-static-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    )).then(async() => {
      // Remove timestamped manifest entries left by the previous release.
      // They are never read now and would otherwise accumulate indefinitely.
      const cache = await caches.open(CACHE_NAME);
      const entries = await cache.keys();
      await Promise.all(entries.filter(entry => {
        const entryUrl = new URL(entry.url);
        return entryUrl.pathname.endsWith('/manifest.json') && entryUrl.search;
      }).map(entry => cache.delete(entry)));
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if(request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Always prefer the network for the document so a new deployment is seen.
  if(request.mode === 'navigate'){
    event.respondWith(fetch(request).catch(() => caches.match('./index.html')));
    return;
  }
  if(!STATIC_FILE.test(url.pathname)) return;

  const key = cacheRequest(request);

  // The manifest is tiny and controls the data-version query used below. It
  // must be checked on each visit, with the last good copy available offline.
  if(url.pathname.endsWith('/manifest.json')){
    event.respondWith((async() => {
      try{
        const response = await fetch(request);
        if(response.ok) event.waitUntil(writeCache(key, response.clone()).catch(() => {}));
        return response;
      }catch(e){
        const cached = await caches.match(key);
        if(cached) return cached;
        throw e;
      }
    })());
    return;
  }

  // Cache-first for the large same-origin data/model/vendor assets.
  event.respondWith(
    (async() => {
      const hit = await caches.match(key);
      if(hit) return hit;
      const response = await fetch(request);
      if(response.ok) event.waitUntil(writeCache(key, response.clone()).catch(() => {}));
      return response;
    })()
  );
});
