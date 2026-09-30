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
