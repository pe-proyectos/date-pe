'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Smartphone } from 'lucide-react';

const BARBERS = [
  { name: 'Carlos', img: '/img/juana-carlos.webp' },
  { name: 'Juana', img: '/img/staff-juana.webp' },
  { name: 'Diego', img: '/img/juana-diego.webp' },
];
const SLOTS = ['10:00', '10:30', '11:00', '11:30', '12:00', '12:30'];
const PICK_BARBER = 1;
const PICK_DAY = 2;
const PICK_SLOT = 2;
const HOLD = [1400, 1300, 1300, 1400, 1500, 3000];

export function BookingDemo() {
  const [step, setStep] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const paused = useRef(false);
  const visible = useRef(true);

  const days = useMemo(() => {
    const w = new Intl.DateTimeFormat('es-PE', { weekday: 'short', timeZone: 'America/Lima' });
    const n = new Intl.DateTimeFormat('es-PE', { day: 'numeric', timeZone: 'America/Lima' });
    const long = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', timeZone: 'America/Lima' });
    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date(Date.now() + (i + 1) * 864e5);
      const wd = w.format(d).replace('.', '');
      return { top: wd.charAt(0).toUpperCase() + wd.slice(1), num: n.format(d), long: long.format(d) };
    });
  }, []);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStep(5);
      return;
    }
    const io = new IntersectionObserver(([e]) => (visible.current = e.isIntersecting), { threshold: 0.2 });
    if (rootRef.current) io.observe(rootRef.current);
    let t: ReturnType<typeof setTimeout>;
    let current = 0;
    const tick = () => {
      if (!paused.current && visible.current && !document.hidden) {
        current = (current + 1) % 6;
        setStep(current);
      }
      t = setTimeout(tick, HOLD[current]);
    };
    t = setTimeout(tick, HOLD[0]);
    return () => {
      clearTimeout(t);
      io.disconnect();
    };
  }, []);

  const day = days[PICK_DAY];

  return (
    <div
      ref={rootRef}
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      className="w-[min(340px,86vw)] rounded-xl bg-white p-5 shadow-pop"
      aria-label="Ejemplo de una reserva en date.pe"
    >
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/img/tenant-cover.webp" alt="" className="h-11 w-11 rounded-lg object-cover" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-medium">Barbería Juana</div>
          <div className="flex items-center gap-1 text-[13px] text-mute">
            <MapPin size={13} strokeWidth={1.75} /> Miraflores
          </div>
        </div>
        <span className="rounded-full bg-field px-2.5 py-1 text-[11px] font-medium text-mute">Ejemplo</span>
      </div>

      <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
        <div>
          <div className="text-[15px] font-medium">Corte y barba</div>
          <div className="text-[13px] text-mute">45 min</div>
        </div>
        <div className="tnum text-[15px] font-medium">S/ 35.00</div>
      </div>

      <div className="mt-4 text-[12px] font-medium text-mute">Barbero</div>
      <div className="dim-others mt-2 flex gap-3">
        {BARBERS.map((b, i) => (
          <div key={b.name} className={`flex flex-col items-center gap-1 ${step >= 1 && i === PICK_BARBER ? 'is-picked' : ''}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={b.img}
              alt=""
              className={`h-11 w-11 rounded-full object-cover ring-2 transition-all duration-300 ${
                step >= 1 && i === PICK_BARBER ? 'ring-red' : 'ring-transparent'
              }`}
            />
            <span className="text-[12px]">{b.name}</span>
          </div>
        ))}
      </div>

      <div className={`dim-others mt-4 grid grid-cols-5 gap-1.5 transition-opacity duration-300 ${step >= 1 ? 'opacity-100' : 'opacity-40'}`}>
        {days.map((d, i) => (
          <div
            key={d.num}
            className={`rounded-lg border py-1.5 text-center ${
              step >= 2 && i === PICK_DAY ? 'is-picked border-ink bg-ink text-white' : 'border-line'
            }`}
          >
            <div className="text-[11px] leading-tight opacity-70">{d.top}</div>
            <div className="tnum text-[14px] font-medium leading-tight">{d.num}</div>
          </div>
        ))}
      </div>

      <div className={`dim-others mt-2 grid grid-cols-3 gap-1.5 transition-opacity duration-300 ${step >= 2 ? 'opacity-100' : 'opacity-40'}`}>
        {SLOTS.map((s, i) => (
          <div
            key={s}
            className={`tnum rounded-lg border py-1.5 text-center text-[13px] ${
              step >= 3 && i === PICK_SLOT ? 'is-picked -translate-y-0.5 border-ink bg-ink text-white shadow-lift' : 'border-line'
            }`}
          >
            {s}
          </div>
        ))}
      </div>

      <div className="mt-4 min-h-[52px]">
        {step < 4 && (
          <div
            className={`flex h-[52px] items-center justify-center rounded-lg text-[14px] font-medium transition-colors duration-300 ${
              step >= 3 ? 'bg-ink text-white' : 'bg-field text-soft'
            }`}
          >
            Continuar
          </div>
        )}
        {step === 4 && (
          <div key="pay" className="rise-in flex h-[52px] items-center justify-between rounded-lg border border-line px-3">
            <span className="flex items-center gap-2 text-[14px]">
              <Smartphone size={17} strokeWidth={1.75} /> Adelanto con Yape
            </span>
            <span className="tnum rounded-md bg-red px-3 py-1.5 text-[13px] font-medium text-white">Pagar S/ 7.00</span>
          </div>
        )}
        {step === 5 && (
          <div key="ok" className="rise-in flex h-[52px] items-center gap-3 rounded-lg bg-ok-tint px-3 text-ok">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="draw-check shrink-0" aria-hidden>
              <circle cx="12" cy="12" r="11" fill="currentColor" />
              <path d="M7 12.5l3.2 3.2L17 9" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="leading-tight">
              <div className="text-[14px] font-medium">Reserva confirmada</div>
              <div className="text-[12px] opacity-80">
                {day.long}, 11:00 con Juana
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
