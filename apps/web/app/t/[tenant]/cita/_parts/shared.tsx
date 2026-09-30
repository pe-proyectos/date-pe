'use client';

import { useState } from 'react';
import { Copy, Check, Share2, Gift } from 'lucide-react';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';

export const TZ = 'America/Lima';

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });

export const fmtDayLong = (iso: string) => {
  const s = new Date(iso).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Tira de días desde hoy, en hora de Lima. */
export function buildDays(n = 14) {
  const isoFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
  const wd = new Intl.DateTimeFormat('es-PE', { weekday: 'short', timeZone: TZ });
  const dn = new Intl.DateTimeFormat('es-PE', { day: 'numeric', timeZone: TZ });
  const mo = new Intl.DateTimeFormat('es-PE', { month: 'short', timeZone: TZ });
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.now() + i * 864e5);
    const w = wd.format(d).replace('.', '');
    return {
      iso: isoFmt.format(d),
      top: i === 0 ? 'Hoy' : w.charAt(0).toUpperCase() + w.slice(1),
      num: dn.format(d),
      month: mo.format(d).replace('.', ''),
    };
  });
}

export function icsFor(p: { id: string; start: string; end: string; title: string; location: string }) {
  const f = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//date.pe//ES', 'BEGIN:VEVENT',
    `UID:${p.id}@date.pe`, `DTSTAMP:${f(new Date().toISOString())}`, `DTSTART:${f(p.start)}`, `DTEND:${f(p.end)}`,
    `SUMMARY:${p.title}`, `LOCATION:${p.location}`, 'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}

export const waLink = (phone: string, text?: string) =>
  `https://wa.me/${phone.replace(/[^0-9]/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

export function WhatsAppIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2Zm5.8 14.03c-.24.68-1.4 1.3-1.94 1.35-.5.05-1.13.07-1.82-.11-.42-.13-.96-.31-1.65-.61-2.9-1.25-4.79-4.17-4.94-4.36-.14-.19-1.18-1.57-1.18-2.99 0-1.42.75-2.12 1.01-2.41.26-.29.57-.36.76-.36.19 0 .38 0 .55.01.18.01.41-.07.64.49.24.57.81 1.97.88 2.11.07.14.12.31.02.5-.09.19-.14.31-.28.48-.14.17-.29.37-.42.5-.14.14-.28.29-.12.57.16.28.72 1.19 1.55 1.93 1.06.95 1.96 1.24 2.24 1.38.28.14.44.12.6-.07.16-.19.69-.81.88-1.09.19-.28.37-.23.62-.14.25.09 1.61.76 1.89.9.28.14.46.21.53.33.07.12.07.68-.17 1.36Z" />
    </svg>
  );
}

/** Tarjeta "invita a un amigo" con el código de referido del cliente. */
export function InviteCard({
  code,
  percent,
  shopName,
  bookUrl,
}: {
  code: string;
  percent: number;
  shopName: string;
  bookUrl: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      haptic.success();
      setCopied(true);
      toast.success('Código copiado');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('No pudimos copiar. Mantén presionado el código.');
    }
  }

  async function share() {
    haptic.tap();
    const text = `Reserva en ${shopName} con mi código ${code} y ten ${percent}% de descuento en tu primera cita.`;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: shopName, text, url: bookUrl });
        return;
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
      }
    }
    copy();
  }

  return (
    <section className="rounded-xl border border-line p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-field">
          <Gift size={19} strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold tracking-[-0.01em]">Invita a un amigo</h2>
          <p className="mt-0.5 text-[14px] text-mute">
            Tiene {percent}% de descuento en su primera cita y tú sumas puntos.
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={copy}
          className="tnum flex h-12 min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border border-dashed border-line-2 px-4 text-left text-[17px] font-semibold tracking-[0.06em] active:bg-field"
          aria-label={`Copiar código ${code}`}
        >
          <span className="truncate">{code}</span>
          {copied ? <Check size={18} strokeWidth={1.75} className="shrink-0 text-ok" /> : <Copy size={18} strokeWidth={1.75} className="shrink-0 text-mute" />}
        </button>
        <button
          type="button"
          onClick={share}
          className="flex h-12 shrink-0 items-center gap-2 rounded-xl border border-line px-4 text-[15px] font-medium hover:border-ink active:bg-field"
        >
          <Share2 size={17} strokeWidth={1.75} /> Compartir
        </button>
      </div>
    </section>
  );
}
