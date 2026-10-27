const CACHE = 'gymcrew-v16';
const ASSETS = ['./', './index.html', './style.css?v=15', './app.js?v=16', './manifest.webmanifest', './icon.svg', './config.js', './push.js', './push-config.js'];
// skipWaiting : la nouvelle version (avec la réception des notifications) remplace
// l'ancienne immédiatement, sans attendre la fermeture complète de l'application.
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { /* Notification générique si charge invalide. */ }
  event.waitUntil(self.registration.showNotification(data.title || 'GymCrew', {
    body: data.body || 'Ouvre GymCrew pour consulter ton groupe.',
    tag: data.tag || 'gymcrew',
    data: {url: './?tab=poll'}
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL('./?tab=poll', self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients => {
    const existing = clients.find(client => client.url.startsWith(self.registration.scope));
    if (existing) { await existing.navigate(target); return existing.focus(); }
    return self.clients.openWindow(target);
  }));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => /^gymcrew-v[0-9]+$/.test(key) && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)));
    }
    return response;
  }).catch(async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    if (event.request.mode === 'navigate') {
      const shell = await caches.match('./index.html');
      if (shell) return shell;
    }
    return Response.error();
  }));
});
