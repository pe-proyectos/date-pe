/* date.pe: service worker de notificaciones push (panel y turno de la fila). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'date.pe', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'date.pe';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    requireInteraction: !!data.urgent,
    vibrate: data.urgent ? [300, 120, 300, 120, 600] : [120],
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.navigate ? c.navigate(url).catch(() => {}) : null;
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

/*
 * Caja sin internet: el panel (/admin) y sus archivos quedan guardados en el dispositivo.
 * La página se pide primero a la red (siempre la versión nueva) y, sin conexión, se usa
 * la última guardada. Los archivos de /_next/static no cambian nunca: se sirven del caché.
 * Las llamadas a la API no pasan por aquí.
 */
const SHELL = 'datepe-shell-v1';
const STATIC = 'datepe-static-v1';
const MAX_STATIC = 200;

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('datepe-') && k !== SHELL && k !== STATIC).map((k) => caches.delete(k)))),
  );
});

/*
 * La primera visita al panel no pasa por el service worker (aún no controla la página):
 * el panel le manda la lista de archivos que ya cargó para guardarlos de una vez.
 */
self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (d.type !== 'precache' || !Array.isArray(d.urls)) return;
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL);
      try {
        const res = await fetch('/admin', { credentials: 'same-origin' });
        if (res.ok) await shell.put('/admin', res);
      } catch (e) { /* sin red */ }
      const stat = await caches.open(STATIC);
      for (const u of d.urls) {
        try {
          const url = new URL(u, self.location.origin);
          if (url.origin !== self.location.origin || !url.pathname.startsWith('/_next/static/')) continue;
          if (await stat.match(url.href)) continue;
          const res = await fetch(url.href);
          if (res.ok) await stat.put(url.href, res);
        } catch (e) { /* siguiente */ }
      }
      await trim(STATIC, MAX_STATIC);
    })(),
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate' && url.pathname.startsWith('/admin')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put('/admin', copy));
          }
          return res;
        })
        .catch(() => caches.open(SHELL).then((c) => c.match('/admin')).then((r) => r || Response.error())),
    );
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/fonts/')) {
    event.respondWith(
      caches.open(STATIC).then((cache) =>
        cache.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok) {
                cache.put(req, res.clone());
                trim(STATIC, MAX_STATIC);
              }
              return res;
            }),
        ),
      ),
    );
  }
});
