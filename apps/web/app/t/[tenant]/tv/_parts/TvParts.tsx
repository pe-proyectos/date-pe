'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarClock, QrCode, Scissors } from 'lucide-react';
import { Qr } from '../_lib/Qr';
import { fmtMinutes, fmtTime, type Announce, type QueueState } from '../_lib/queue';

/** Colores de la pantalla según el tema elegido en el panel. */
export interface Palette {
  bg: string;
  fg: string;
  mute: string;
  soft: string;
  line: string;
  card: string;
  accent: string;
  onAccent: string;
  brand: string;
  onBrand: string;
}

type Staff = QueueState['staff'];

export const initialOf = (name: string) => name.replace(/^Barber[ií]a\s+/i, '').trim().charAt(0).toUpperCase() || 'B';

/** Cuántas filas de `rowRem` caben en el contenedor (se recalcula al cambiar el tamaño). */
export function useFit(rowRem: number, min = 1) {
  const ref = useRef<HTMLDivElement>(null);
  const [n, setN] = useState(6);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const calc = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setN(Math.max(min, Math.floor(el.clientHeight / (rowRem * rem))));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rowRem, min]);
  return [ref, n] as const;
}

export function Avatar({ name, url, size, p }: { name: string; url?: string | null; size: number; p: Palette }) {
  const style = { width: `${size}rem`, height: `${size}rem` };
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="shrink-0 rounded-full object-cover" style={{ ...style, boxShadow: `0 0 0 0.2rem ${p.bg}` }} />;
  }
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full font-semibold" style={{ ...style, background: p.card, color: p.fg, fontSize: `${size * 0.42}rem` }}>
      {initialOf(name)}
    </span>
  );
}

export function SectionTitle({ children, p, right }: { children: React.ReactNode; p: Palette; right?: React.ReactNode }) {
  return (
    <div className="mb-[1rem] flex items-baseline justify-between gap-[1rem]">
      <h2 className="text-[1.5rem] font-semibold tracking-[-0.02em]" style={{ color: p.mute }}>{children}</h2>
      {right}
    </div>
  );
}

// ------------------------------- Fila en espera -------------------------------
export function WaitingList({ items, p, rowRem = 5.6, showEta = true }: { items: QueueState['waiting']; p: Palette; rowRem?: number; showEta?: boolean }) {
  const [ref, fit] = useFit(rowRem, 2);
  const overflow = items.length > fit;
  const visible = items.slice(0, overflow ? fit - 1 : fit);
  return (
    <div ref={ref} className="min-h-0 flex-1 overflow-hidden">
      <ol>
        {visible.map((t, i) => (
          <li
            key={t.id ?? t.number}
            className="tv-row flex items-center gap-[1.25rem]"
            style={{ height: `${rowRem}rem`, borderTop: i === 0 ? 'none' : `1px solid ${p.line}`, animationDelay: `${i * 60}ms` }}
          >
            <span
              className="tnum flex h-[4.2rem] min-w-[6.2rem] items-center justify-center rounded-[0.9rem] px-[0.8rem] text-[2.9rem] font-semibold tracking-[-0.03em]"
              style={i === 0 ? { background: p.accent, color: p.onAccent } : { background: p.card, color: p.fg }}
            >
              {t.number}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[1.9rem] font-semibold leading-tight tracking-[-0.02em]">{t.name}</span>
              <span className="block truncate text-[1.2rem]" style={{ color: p.mute }}>
                {[t.service, t.staff ? `con ${t.staff}` : 'el primero libre'].filter(Boolean).join(', ')}
              </span>
            </span>
            {showEta && (
              <span className="tnum shrink-0 text-right text-[1.35rem]" style={{ color: i === 0 ? p.fg : p.mute }}>
                {i === 0 ? 'Sigue' : t.etaMin != null ? `en ${fmtMinutes(t.etaMin)}` : ''}
              </span>
            )}
          </li>
        ))}
      </ol>
      {overflow && (
        <p className="flex items-center text-[1.3rem]" style={{ height: `${rowRem * 0.7}rem`, color: p.mute, borderTop: `1px solid ${p.line}` }}>
          y {items.length - visible.length} más en la fila
        </p>
      )}
    </div>
  );
}

// ------------------------------- Atendiendo ahora -------------------------------
export function ServingGrid({ serving, staff, p, cols }: { serving: QueueState['serving']; staff: Staff; p: Palette; cols: number }) {
  const photo = (name: string | null) => staff.find((s) => s.name === name)?.photo_url ?? null;
  return (
    <div className="grid gap-[1rem]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {serving.map((t) => {
        const called = t.status === 'called';
        return (
          <div
            key={t.id ?? t.number}
            className={`relative flex flex-col items-center overflow-hidden rounded-[1.1rem] px-[1rem] pb-[1.2rem] pt-[1.4rem] text-center ${called ? 'tv-called' : ''}`}
            style={{ background: p.card, ['--ring' as string]: p.accent }}
          >
            <Avatar name={t.staff ?? '?'} url={photo(t.staff)} size={5.2} p={p} />
            <div className="mt-[0.6rem] max-w-full truncate text-[1.35rem] font-medium" style={{ color: p.mute }}>{t.staff ?? 'Por asignar'}</div>
            <div className="tnum mt-[0.2rem] text-[4.6rem] font-semibold leading-none tracking-[-0.04em]">{t.number}</div>
            <div className="mt-[0.4rem] max-w-full truncate text-[1.5rem] font-medium">{t.name}</div>
            <span
              className="mt-[0.8rem] inline-flex rounded-full px-[0.9rem] py-[0.3rem] text-[1.1rem] font-semibold"
              style={called ? { background: p.accent, color: p.onAccent } : { background: 'transparent', color: p.mute, boxShadow: `inset 0 0 0 1px ${p.line}` }}
            >
              {called ? 'Pasa ahora' : 'Atendiendo'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------- Música -------------------------------
function Eq({ color }: { color: string }) {
  return (
    <span className="tv-eq inline-flex h-[1.1rem] items-end gap-[0.15rem]" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="w-[0.22rem] rounded-full" style={{ background: color, animationDelay: `${i * 0.18}s` }} />
      ))}
    </span>
  );
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export type Slide =
  | { kind: 'promo'; title: string; text?: string; image?: string }
  | { kind: 'appointments'; items: QueueState['appointments'] };

export function Rotator({ slides, p, ms = 9000 }: { slides: Slide[]; p: Palette; ms?: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % slides.length), ms);
    return () => clearInterval(t);
  }, [slides.length, ms]);
  const idx = slides.length ? i % slides.length : 0;
  const s = slides[idx];
  if (!s) return null;
  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[1.1rem] p-[1.3rem]" style={{ background: p.card }}>
      <div key={idx} className="tv-slide flex min-h-0 flex-1 flex-col">
        {s.kind === 'appointments' ? (
          <>
            <div className="flex items-center gap-[0.6rem] text-[1.15rem] font-medium" style={{ color: p.mute }}>
              <CalendarClock strokeWidth={1.75} style={{ width: '1.3rem', height: '1.3rem' }} /> Próximas citas
            </div>
            <ul className="mt-[0.6rem]">
              {s.items.slice(0, 4).map((a, k) => (
                <li key={k} className="flex items-baseline gap-[0.9rem] py-[0.35rem]" style={{ borderTop: k ? `1px solid ${p.line}` : 'none' }}>
                  <span className="tnum w-[4.2rem] shrink-0 text-[1.45rem] font-semibold">{fmtTime(a.at)}</span>
                  <span className="min-w-0 flex-1 truncate text-[1.35rem]">{a.name}</span>
                  {a.staff && <span className="shrink-0 truncate text-[1.15rem]" style={{ color: p.mute }}>con {a.staff}</span>}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 items-center gap-[1.2rem]">
            {s.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.image} alt="" className="aspect-square h-full max-h-[9rem] shrink-0 rounded-[0.8rem] object-cover" />
            )}
            <div className="min-w-0">
              <div className="line-clamp-2 text-[2rem] font-semibold leading-tight tracking-[-0.03em]">{s.title}</div>
              {s.text && <div className="mt-[0.4rem] line-clamp-3 text-[1.3rem]" style={{ color: p.mute }}>{s.text}</div>}
            </div>
          </div>
        )}
      </div>
      {slides.length > 1 && (
        <div className="mt-[0.8rem] flex gap-[0.35rem]" aria-hidden>
          {slides.map((_, k) => (
            <span key={k} className="h-[0.3rem] rounded-full transition-all duration-500" style={{ width: k === idx ? '1.6rem' : '0.5rem', background: k === idx ? p.fg : p.line }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------- QR -------------------------------
export function QrCard({ url, host, p, size = 11, title = 'Escanea para sacar tu turno' }: { url: string; host: string; p: Palette; size?: number; title?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-[1.1rem] p-[1.2rem] text-center" style={{ background: p.card }}>
      <div className="rounded-[0.9rem] bg-white p-[0.7rem]" style={{ width: `${size}rem` }}>
        <Qr value={url} label="Código QR de la fila virtual" />
      </div>
      <div className="mt-[0.8rem] flex items-center gap-[0.5rem] text-[1.35rem] font-semibold leading-tight tracking-[-0.02em]">
        <QrCode strokeWidth={1.75} style={{ width: '1.3rem', height: '1.3rem' }} className="shrink-0" /> {title}
      </div>
      <div className="mt-[0.2rem] text-[1.05rem]" style={{ color: p.mute }}>{host}/fila</div>
    </div>
  );
}

// ------------------------------- Cinta de mensaje -------------------------------
export function Ticker({ message, p }: { message: string; p: Palette }) {
  const secs = Math.max(20, message.length * 0.32);
  return (
    <div className="flex h-[3.6rem] shrink-0 items-center overflow-hidden" style={{ background: p.card, borderTop: `1px solid ${p.line}` }}>
      <div className="tv-marquee flex whitespace-nowrap text-[1.5rem] font-medium" style={{ animationDuration: `${secs}s` }}>
        {[0, 1].map((k) => (
          <span key={k} className="flex items-center gap-[1.5rem] pr-[1.5rem]" aria-hidden={k === 1}>
            <Scissors strokeWidth={1.75} style={{ width: '1.3rem', height: '1.3rem', color: p.accent }} />
            {message}
            <Scissors strokeWidth={1.75} style={{ width: '1.3rem', height: '1.3rem', color: p.accent }} />
            {message}
          </span>
        ))}
      </div>
    </div>
  );
}

// ------------------------------- Llamado a pantalla completa -------------------------------
export function CallCard({ call, photo, p, ms }: { call: Announce; photo: string | null; p: Palette; ms: number }) {
  return (
    <div className="tv-call fixed inset-0 z-40 flex flex-col items-center justify-center overflow-hidden text-center" style={{ background: p.brand, color: p.onBrand }} role="alert" aria-live="assertive">
      <div className="tv-call-glow pointer-events-none absolute inset-0" aria-hidden style={{ ['--c' as string]: p.onBrand }} />
      <div className="relative flex flex-col items-center px-[4rem]">
        <div className="text-[3rem] font-semibold tracking-[-0.03em] opacity-80">Turno</div>
        <div className="tv-pop tnum text-[19rem] font-semibold leading-[0.9] tracking-[-0.05em] portrait:text-[16rem]">{call.number}</div>
        <div className="mt-[2rem] flex flex-wrap items-center justify-center gap-[1.6rem]">
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="h-[7rem] w-[7rem] rounded-full object-cover" style={{ boxShadow: `0 0 0 0.35rem ${p.onBrand}` }} />
          )}
          <div className="text-left portrait:text-center">
            <div className="text-[4.4rem] font-semibold leading-[1.05] tracking-[-0.035em]">{call.name}</div>
            <div className="text-[3rem] font-medium leading-tight opacity-90">{call.staff ? `pasa con ${call.staff}` : 'pasa, por favor'}</div>
          </div>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-[0.5rem]" style={{ background: 'rgba(0,0,0,0.12)' }}>
        <div className="tv-countdown h-full" style={{ background: p.onBrand, animationDuration: `${ms}ms` }} />
      </div>
    </div>
  );
}
