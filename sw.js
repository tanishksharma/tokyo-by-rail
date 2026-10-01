// Network first online; complete release cache offline.
const CACHE = 'tokyobyrail-__REVISION__';
const PREFIX = 'tokyobyrail-';
self.addEventListener('install', event => event.waitUntil((async () => {
  const assets = await fetch('/offline-assets.json', { cache: 'no-store' }).then(response => { if (!response.ok) throw new Error('Offline inventory unavailable'); return response.json(); });
  const cache = await caches.open(CACHE);
  try {
    await cache.addAll(assets);
    const visited = new Set(assets);
    const styles = assets.filter(url => url.includes('.css') || url.includes('fonts.googleapis.com'));
    for (const url of styles) {
      const response = await cache.match(url);
      const css = await response.text();
      const resources = [...css.matchAll(/url\(\s*["']?([^"'()\s;]+)["']?\s*\)/g)].map(match => new URL(match[1],url).href).filter(url => /^https:/.test(url));
      const pending = [];
      for (const resource of resources) {
        if (visited.has(resource)) continue;
        visited.add(resource);
        pending.push(resource);
        if (resource.includes('.css') || resource.includes('fonts.googleapis.com')) styles.push(resource);
      }
      await cache.addAll(pending);
    }
  } catch (error) { await caches.delete(CACHE); throw error; }
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const local = url.origin === self.location.origin;
  const library = url.origin === 'https://facet.tanishksharma.com' || url.origin === 'https://fonts.gstatic.com' || url.origin === 'https://fonts.googleapis.com';
  if (!local && !library) return;
  const key = local && event.request.mode === 'navigate' ? '/' : event.request;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request);
      if (response.ok && (local || library)) event.waitUntil(cache.put(key, response.clone()));
      return response;
    } catch {
      return await cache.match(key) || Response.error();
    }
  })());
});
