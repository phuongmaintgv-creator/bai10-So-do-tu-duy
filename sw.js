const STATIC_CACHE = 'bai10-static-v1';
const VIDEO_CACHE = 'bai10-video-v1';
const VIDEO_URL = new URL('./BAI_10_SO_DO_TU_DUY.mp4', self.location.href).href;
const STATIC_ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([STATIC_CACHE, VIDEO_CACHE]);
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !keep.has(k) && k.startsWith('bai10-')).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function cacheFullVideo() {
  const cache = await caches.open(VIDEO_CACHE);
  const hit = await cache.match(VIDEO_URL);
  if (hit) return hit;
  const response = await fetch(new Request(VIDEO_URL, {cache:'no-cache'}));
  if (response.ok && response.status === 200) {
    await cache.put(VIDEO_URL, response.clone());
  }
  return response;
}

async function rangeFromResponse(response, rangeHeader) {
  const buf = await response.arrayBuffer();
  const size = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader || '');
  if (!m) return response;
  let start = m[1] ? parseInt(m[1],10) : 0;
  let end = m[2] ? parseInt(m[2],10) : size - 1;
  if (Number.isNaN(start)) start = 0;
  if (Number.isNaN(end) || end >= size) end = size - 1;
  if (start >= size || start > end) {
    return new Response(null, {status:416, headers:{'Content-Range':`bytes */${size}`}});
  }
  const chunk = buf.slice(start, end + 1);
  const headers = new Headers(response.headers);
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Length', String(chunk.byteLength));
  headers.set('Content-Type', response.headers.get('Content-Type') || 'video/mp4');
  return new Response(chunk, {status:206, statusText:'Partial Content', headers});
}

async function handleVideo(event) {
  const request = event.request;
  const range = request.headers.get('range');
  const cache = await caches.open(VIDEO_CACHE);
  const cached = await cache.match(VIDEO_URL);
  if (cached) {
    if (range) return rangeFromResponse(cached, range);
    return cached;
  }
  event.waitUntil(cacheFullVideo().catch(() => undefined));
  return fetch(request);
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.href === VIDEO_URL) {
    event.respondWith(handleVideo(event));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (response.ok) {
          const cache = await caches.open(STATIC_CACHE);
          cache.put(event.request, response.clone());
        }
        return response;
      } catch (e) {
        return caches.match('./index.html');
      }
    })());
  }
});
