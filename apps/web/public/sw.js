/* date.pe: service worker de notificaciones push (panel, turno de la fila y clientes) y de la página sin internet. */
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
    icon: data.icon || '/icons/icon-192.png',
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
const PAGES = 'datepe-pages-v1';
const MAX_STATIC = 200;
const MAX_PAGES = 40;

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('datepe-') && k !== SHELL && k !== STATIC && k !== PAGES).map((k) => caches.delete(k)))),
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

  /*
   * Página de la barbería: también se pide primero a la red y se guarda la última versión
   * de cada sección, así la carta, el horario, la cita o el turno se ven aunque no haya señal.
   */
  if (req.mode === 'navigate' && !/^\/(api|superadmin|caja|staff|tv)(\/|$)/.test(url.pathname)) {
    const key = /^\/(cita|turno)$/.test(url.pathname) ? url.pathname + url.search : url.pathname;
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(key, copy).then(() => trim(PAGES, MAX_PAGES)));
          }
          return res;
        })
        .catch(() =>
          caches.open(PAGES).then(async (c) => (await c.match(key)) || (await c.match('/')) || offlinePage()),
        ),
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

function offlinePage() {
  const html = '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión</title>'
    + '<body style="margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#faf9f7;color:#111;text-align:center;padding:24px">'
    + '<div><p style="font-size:22px;font-weight:600;margin:0 0 8px">Estás sin conexión</p><p style="color:#666;margin:0 0 20px">Cuando vuelva la señal, la página se carga sola.</p>'
    + '<button onclick="location.reload()" style="font:inherit;padding:12px 22px;border-radius:999px;border:0;background:#111;color:#fff">Reintentar</button></div>'
    + '<script>addEventListener("online",()=>location.reload())</script></body></html>';
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
