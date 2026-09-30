'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_CLIENT } from '@/lib/config';

// Tipos y utilidades compartidas por la pantalla de TV, la fila (QR), el turno y el panel.

export type TvTheme = 'dark' | 'light' | 'brand';
export type TvLayout = 'split' | 'queue' | 'minimal';

export interface TvConfig {
  theme: TvTheme;
  layout: TvLayout;
  showQueue: boolean;
  showAppointments: boolean;
  showQr: boolean;
  showClock: boolean;
  showPromos: boolean;
  announceVoice: boolean;
  chime: boolean;
  message: string;
  promos: Array<{ title: string; text?: string; image?: string }>;
  backgroundUrl: string;
  scale: number;
  /** No viene en el contrato actual; se respeta si la API lo agrega. */
  volume?: number;
}

export interface QueueState {
  tenant: { name: string; slug: string };
  open: boolean;
  opensAt: string | null;
  pushPublicKey: string | null;
  features: { queue: boolean; booking: boolean };
  tv: TvConfig;
  queueConfig: { allowStaffChoice: boolean; askPhone: boolean; welcome: string; closedMessage: string; maxWaiting: number };
  branding: { logo_url: string | null; cover_url: string | null; color_primary: string | null; tagline: string | null; instagram: string | null } | null;
  staff: Array<{ id: string; name: string; photo_url: string | null }>;
  staffOnShift?: string[];
  withAppointment?: Array<{ staffId: string; until: string; name: string }>;
  services: Array<{ id: string; name: string; duration_min: number; price_cents: number }>;
  barbersNow: number;
  waitingCount: number;
  estimatedWaitMin: number;
  serving: Array<{ id?: string; number: number; name: string; status: 'called' | 'serving'; staff: string | null; calledAt?: string | null }>;
  waiting: Array<{ id?: string; number: number; name: string; service: string | null; staff: string | null; etaMin: number | null }>;
  appointments: Array<{ at: string; name: string; staff: string | null }>;
  locations?: QueueLocation[];
  location?: QueueLocation | null;
  /** Varias sedes y ninguna elegida */
  needsLocation?: boolean;
}

export type TicketStatus = 'waiting' | 'called' | 'serving' | 'done' | 'cancelled' | 'no_show';

export interface TicketState extends QueueState {
  ticket: {
    number: number;
    name: string;
    status: TicketStatus;
    day?: string;
    service: string | null;
    staff: string | null;
    servedBy: string | null;
    position: number | null;
    ahead: number | null;
    etaMin: number | null;
    canDelay: boolean;
  };
}

export interface Announce {
  number: number;
  name: string;
  staff: string;
  /** Sede donde se llamó (con varias sedes, cada TV anuncia solo lo suyo) */
  locationId?: string | null;
}

export interface QueueLocation { id: string; name: string; address: string | null; district: string | null }

export const TZ = 'America/Lima';

/** Error de la API con su código (`error`) y el cuerpo completo. */
export class ApiError extends Error {
  constructor(public code: string, public status: number, public data: Record<string, unknown>) {
    super(code);
  }
}

/** Llamada a la API pública de la barbería. */
export async function publicApi<T = unknown>(tenant: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API_BASE_CLIENT}/api${path}`, {
    method: init.method ?? 'GET',
    headers: { 'X-Tenant-Slug': tenant, ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(typeof data.error === 'string' ? data.error : 'error', res.status, data);
  return data as T;
}

export function wsUrl(tenant: string) {
  const proto = API_BASE_CLIENT.startsWith('https') ? 'wss' : 'ws';
  return `${proto}://${API_BASE_CLIENT.replace(/^https?:\/\//, '')}/api/ws?tenant=${encodeURIComponent(tenant)}`;
}

/**
 * WebSocket del local con reconexión automática (espera creciente hasta 15 s).
 * Llama a `onEvent` con cada `{ type, data }` y a `onReconnect` al volver la conexión,
 * para que la pantalla se ponga al día. Devuelve si está conectado.
 */
export function useTenantSocket(
  tenant: string,
  onEvent: (type: string, data: unknown) => void,
  onReconnect?: () => void,
) {
  const [online, setOnline] = useState(true);
  const evRef = useRef(onEvent);
  evRef.current = onEvent;
  const reRef = useRef(onReconnect);
  reRef.current = onReconnect;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let offlineTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let everOpened = false;

    const connect = () => {
      if (closed) return;
      try {
        ws = new WebSocket(wsUrl(tenant));
      } catch {
        schedule();
        return;
      }
      ws.onopen = () => {
        retry = 0;
        if (offlineTimer) clearTimeout(offlineTimer);
        offlineTimer = null;
        setOnline(true);
        if (everOpened) reRef.current?.();
        everOpened = true;
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as { type?: string; data?: unknown };
          if (msg.type && msg.type !== 'subscribed') evRef.current(msg.type, msg.data ?? null);
        } catch {
          /* mensaje no válido */
        }
      };
      ws.onclose = () => {
        ws = null;
        // Un corte breve no se muestra: solo si dura más de 4 s
        if (!offlineTimer) offlineTimer = setTimeout(() => setOnline(false), 4000);
        schedule();
      };
      ws.onerror = () => ws?.close();
    };
    const schedule = () => {
      if (closed) return;
      if (timer) clearTimeout(timer);
      const wait = Math.min(15000, 1000 * 2 ** retry) + Math.random() * 500;
      retry = Math.min(retry + 1, 6);
      timer = setTimeout(connect, wait);
    };
    // Al volver al frente o recuperar internet, reconecta de inmediato
    const kick = () => {
      if (document.visibilityState !== 'visible') return;
      if (!ws || ws.readyState === WebSocket.CLOSED) {
        retry = 0;
        if (timer) clearTimeout(timer);
        connect();
      }
    };
    connect();
    window.addEventListener('online', kick);
    document.addEventListener('visibilitychange', kick);
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      if (offlineTimer) clearTimeout(offlineTimer);
      window.removeEventListener('online', kick);
      document.removeEventListener('visibilitychange', kick);
      ws?.close();
    };
  }, [tenant]);

  return online;
}

/** Repite `fn` cada `ms` mientras la pestaña está visible (respaldo del WebSocket). */
export function usePolling(fn: () => void, ms: number, enabled = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') ref.current();
    }, ms);
    return () => clearInterval(t);
  }, [ms, enabled]);
}

/** Mantiene la pantalla encendida mientras `active` (si el navegador lo permite). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let gone = false;
    const request = async () => {
      try {
        if (document.visibilityState !== 'visible') return;
        lock = await navigator.wakeLock.request('screen');
        if (gone) lock.release().catch(() => {});
      } catch {
        /* sin permiso o sin batería suficiente */
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'visible' && (!lock || lock.released)) request();
    };
    request();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', onVis);
      lock?.release().catch(() => {});
    };
  }, [active]);
}

/** Hoy en Lima como YYYY-MM-DD. */
export function todayLima() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

export const fmtTime = (d: Date | string) =>
  new Date(d).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });

/** "25 min" o "1 h 10 min". */
export function fmtMinutes(min: number) {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** Ordinal abreviado como se escribe en Perú: 1ro, 2do, 3ro, 4to... */
export function ordinal(n: number) {
  const SUF: Record<number, string> = { 1: 'ro', 2: 'do', 3: 'ro', 4: 'to', 5: 'to', 6: 'to', 7: 'mo', 8: 'vo', 9: 'no', 0: 'mo' };
  const suf = n % 100 >= 11 && n % 100 <= 13 ? 'vo' : SUF[n % 10];
  return `${n}${suf}`;
}

// ------------------------- Turno guardado en el teléfono -------------------------
export interface SavedTicket {
  token: string;
  day: string;
  number: number;
}
const ticketKey = (tenant: string) => `datepe_fila_${tenant}`;

export function loadSavedTicket(tenant: string): SavedTicket | null {
  try {
    const raw = JSON.parse(localStorage.getItem(ticketKey(tenant)) ?? 'null') as SavedTicket | null;
    if (raw && raw.token && raw.day === todayLima()) return raw;
  } catch {
    /* */
  }
  return null;
}
export function saveTicket(tenant: string, t: { token: string; number: number }) {
  try {
    localStorage.setItem(ticketKey(tenant), JSON.stringify({ token: t.token, number: t.number, day: todayLima() }));
  } catch {
    /* */
  }
}
export function clearSavedTicket(tenant: string) {
  try {
    localStorage.removeItem(ticketKey(tenant));
  } catch {
    /* */
  }
}

// ------------------------- Mensajes de error en español -------------------------
export function queueError(code: string, data?: Record<string, unknown>) {
  switch (code) {
    case 'cerrado':
      return typeof data?.message === 'string' && data.message ? data.message : 'La fila está cerrada en este momento.';
    case 'elige_la_sede':
      return 'Elige la sede donde estás.';
    case 'fila_llena':
      return 'La fila está llena por ahora. Intenta en unos minutos.';
    case 'falta_celular':
      return 'Escribe tu celular para sacar el turno.';
    case 'funcion_desactivada':
      return 'Esta barbería no tiene la fila virtual activa.';
    case 'eres_el_ultimo':
      return 'Eres el último de la fila, no hay a quién dejar pasar.';
    case 'no_se_puede':
      return 'Ya no puedes pedir más tiempo con este turno.';
    case 'ticket_no_encontrado':
      return 'No encontramos tu turno. Puede que ya haya terminado.';
    case 'nadie_esperando':
      return 'No hay nadie esperando para ese barbero.';
    case 'elige_el_barbero':
      return 'Elige qué barbero llama.';
    default:
      return 'Algo salió mal. Inténtalo de nuevo.';
  }
}


// ------------------------- Sonido -------------------------
let audioCtx: AudioContext | null = null;

/** AudioContext compartido. Debe crearse o reanudarse tras un toque del usuario. */
export function getAudio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!audioCtx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
  } catch {
    return null;
  }
}

/** Campanita suave de dos notas (sin archivos). `bright` = versión más alegre para "te toca". */
export function playChime(bright = false, gain = 0.22) {
  const ctx = getAudio();
  if (!ctx) return;
  const notes = bright ? [659.25, 830.61, 987.77, 1318.5] : [880, 659.25];
  const step = bright ? 0.13 : 0.32;
  const t0 = ctx.currentTime + 0.02;
  notes.forEach((f, i) => {
    const start = t0 + i * step;
    for (const [mult, amp] of [[1, 1], [2, 0.18], [3, 0.06]] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f * mult;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(gain * amp, start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, start + (bright ? 0.9 : 1.6));
      o.connect(g).connect(ctx.destination);
      o.start(start);
      o.stop(start + 1.7);
    }
  });
}

/** Lee un texto en voz alta en español del Perú (o el español que tenga el equipo). */
export function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    const synth = window.speechSynthesis;
    const voices = synth.getVoices();
    const voice =
      voices.find((v) => v.lang.toLowerCase() === 'es-pe') ??
      voices.find((v) => /^es[-_](419|us|mx|co|cl|ar)/i.test(v.lang)) ??
      voices.find((v) => v.lang.toLowerCase().startsWith('es'));
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice?.lang ?? 'es-PE';
    if (voice) u.voice = voice;
    u.rate = 0.92;
    u.pitch = 1;
    synth.cancel();
    synth.speak(u);
  } catch {
    /* sin voz */
  }
}

// ------------------------- Color -------------------------
function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0').slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0) as [number, number, number];
}
function lum(hex: string) {
  const [r, g, b] = rgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
/** Color con transparencia a partir de un hex. */
export function alpha(hex: string, a: number) {
  const [r, g, b] = rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
/** El color de marca si se lee bien sobre `bg`; si no, `fallback`. */
export function readableAccent(accent: string, bg: string, fallback: string, min = 2.6) {
  return contrast(accent, bg) >= min ? accent : fallback;
}
