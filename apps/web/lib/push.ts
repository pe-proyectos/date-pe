'use client';

// Suscribe este navegador a notificaciones push. Devuelve la suscripción (para
// enviarla al API) o null si el usuario no dio permiso o el navegador no soporta push.
function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function subscribePush(publicKey: string): Promise<PushSubscriptionJSON | null> {
  if (!pushSupported()) return null;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
  return sub.toJSON();
}
