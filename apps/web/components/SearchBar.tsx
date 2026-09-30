'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Scissors, CalendarDays, Search } from 'lucide-react';
import { API_BASE_CLIENT } from '@/lib/config';
import { DISTRICTS } from '@/lib/districts';

type Panel = 'where' | 'what' | 'when' | null;

const SERVICES = ['Corte', 'Fade', 'Barba', 'Afeitado con navaja', 'Corte y barba'];

function nextDays(n = 8) {
  const out: { iso: string; top: string; bottom: string }[] = [];
  const fmtW = new Intl.DateTimeFormat('es-PE', { weekday: 'short', timeZone: 'America/Lima' });
  const fmtD = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', timeZone: 'America/Lima' });
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.now() + i * 864e5);
    const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(d);
    const top = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : fmtW.format(d).replace('.', '');
    out.push({ iso, top: top.charAt(0).toUpperCase() + top.slice(1), bottom: fmtD.format(d).replace('.', '') });
  }
  return out;
}

export function SearchBar({
  compact = false,
  initial,
}: {
  compact?: boolean;
  initial?: { district?: string; service?: string; date?: string };
}) {
  const router = useRouter();
  const [district, setDistrict] = useState(initial?.district ?? '');
  const [service, setService] = useState(initial?.service ?? '');
  const [date, setDate] = useState(initial?.date ?? '');
  const [panel, setPanel] = useState<Panel>(null);
  const [remote, setRemote] = useState<string[] | null>(null);
  const boxRef = useRef<HTMLFormElement>(null);
  const days = useMemo(() => nextDays(), []);

  useEffect(() => {
    if (panel !== 'where') return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE_CLIENT}/api/geo/districts?q=${encodeURIComponent(district)}`, { signal: ctrl.signal });
        const data = await res.json();
        setRemote((data.districts ?? []).map((d: { district: string }) => d.district));
      } catch {
        setRemote(null);
      }
    }, 120);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [district, panel]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setPanel(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPanel(null);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const q = district.trim().toLowerCase();
  const localMatches = DISTRICTS.map((d) => d.name).filter((n) => !q || n.toLowerCase().includes(q));
  const suggestions = Array.from(new Set([...(remote ?? []), ...localMatches])).slice(0, 8);
  const dateLabel = days.find((d) => d.iso === date);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const p = new URLSearchParams();
    if (district) p.set('district', district);
    if (service) p.set('service', service);
    if (date) p.set('date', date);
    setPanel(null);
    router.push(`/search${p.toString() ? `?${p}` : ''}`);
  }

  const seg = (id: Panel) =>
    `relative flex min-w-0 flex-1 flex-col justify-center rounded-full px-6 text-left transition-colors ${
      panel === id ? 'bg-white shadow-lift' : 'hover:bg-field'
    }`;

  return (
    <form onSubmit={submit} ref={boxRef} className="relative w-full">
      {/* Escritorio */}
      <div
        className={`hidden items-stretch rounded-full border border-line p-1.5 md:flex ${
          panel ? 'bg-field' : 'bg-white'
        } ${compact ? 'h-[60px]' : 'h-[72px]'} transition-colors`}
      >
        <label className={seg('where')} onClick={() => setPanel('where')}>
          <span className="text-xs font-medium text-ink">Dónde</span>
          <input
            value={district}
            onChange={(e) => {
              setDistrict(e.target.value);
              setPanel('where');
            }}
            onFocus={() => setPanel('where')}
            placeholder="Busca tu distrito"
            className="w-full truncate bg-transparent text-[15px] text-ink outline-none"
            aria-label="Distrito"
          />
        </label>
        <span className="my-3 w-px bg-line" aria-hidden />
        <button type="button" className={seg('what')} onClick={() => setPanel(panel === 'what' ? null : 'what')}>
          <span className="text-xs font-medium text-ink">Qué</span>
          <span className={`truncate text-[15px] ${service ? 'text-ink' : 'text-soft'}`}>{service || 'Corte, barba, fade'}</span>
        </button>
        <span className="my-3 w-px bg-line" aria-hidden />
        <button type="button" className={seg('when')} onClick={() => setPanel(panel === 'when' ? null : 'when')}>
          <span className="text-xs font-medium text-ink">Cuándo</span>
          <span className={`truncate text-[15px] ${date ? 'text-ink' : 'text-soft'}`}>
            {dateLabel ? `${dateLabel.top}, ${dateLabel.bottom}` : 'Cualquier día'}
          </span>
        </button>
        <button
          type="submit"
          className="ml-1 flex items-center gap-2 rounded-full bg-red px-6 text-[15px] font-medium text-white transition-colors hover:bg-red-deep"
        >
          <Search size={18} strokeWidth={2} />
          Buscar
        </button>
      </div>

      {/* Móvil */}
      <div className="overflow-hidden rounded-xl border border-line bg-white md:hidden">
        <label className="flex items-center gap-3 border-b border-line px-4 py-3.5">
          <MapPin size={18} strokeWidth={1.75} className="shrink-0 text-mute" />
          <input
            value={district}
            onChange={(e) => {
              setDistrict(e.target.value);
              setPanel('where');
            }}
            onFocus={() => setPanel('where')}
            placeholder="¿En qué distrito?"
            className="w-full bg-transparent text-[16px] outline-none"
            aria-label="Distrito"
          />
        </label>
        <button type="button" onClick={() => setPanel(panel === 'what' ? null : 'what')} className="flex w-full items-center gap-3 border-b border-line px-4 py-3.5 text-left">
          <Scissors size={18} strokeWidth={1.75} className="shrink-0 text-mute" />
          <span className={`text-[16px] ${service ? 'text-ink' : 'text-soft'}`}>{service || '¿Qué te haces?'}</span>
        </button>
        <button type="button" onClick={() => setPanel(panel === 'when' ? null : 'when')} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
          <CalendarDays size={18} strokeWidth={1.75} className="shrink-0 text-mute" />
          <span className={`text-[16px] ${date ? 'text-ink' : 'text-soft'}`}>
            {dateLabel ? `${dateLabel.top}, ${dateLabel.bottom}` : 'Cualquier día'}
          </span>
        </button>
        <div className="p-2">
          <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-lg bg-red py-3.5 text-[16px] font-medium text-white">
            <Search size={18} strokeWidth={2} />
            Buscar barberías
          </button>
        </div>
      </div>

      {/* Paneles */}
      {panel === 'where' && suggestions.length > 0 && (
        <div className="rise-in absolute left-0 top-full z-30 mt-3 w-full max-w-md rounded-xl bg-white p-2 shadow-pop">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setDistrict(s);
                setPanel('what');
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] hover:bg-field"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-field">
                <MapPin size={17} strokeWidth={1.75} />
              </span>
              {s}
              <span className="ml-auto text-sm text-soft">Lima</span>
            </button>
          ))}
        </div>
      )}
      {panel === 'what' && (
        <div className="rise-in absolute left-0 top-full z-30 mt-3 w-full rounded-xl bg-white p-2 shadow-pop md:left-1/3 md:w-72">
          {SERVICES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setService(s === service ? '' : s);
                setPanel('when');
              }}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-[15px] hover:bg-field ${
                s === service ? 'font-medium text-ink' : ''
              }`}
            >
              {s}
              {s === service && <span className="h-2 w-2 rounded-full bg-red" />}
            </button>
          ))}
        </div>
      )}
      {panel === 'when' && (
        <div className="rise-in absolute right-0 top-full z-30 mt-3 w-full rounded-xl bg-white p-4 shadow-pop md:w-[440px]">
          <div className="grid grid-cols-4 gap-2">
            {days.map((d) => (
              <button
                key={d.iso}
                type="button"
                onClick={() => {
                  setDate(d.iso === date ? '' : d.iso);
                  setPanel(null);
                }}
                className={`rounded-lg border px-2 py-2.5 text-center transition-colors ${
                  d.iso === date ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink'
                }`}
              >
                <div className="text-sm font-medium">{d.top}</div>
                <div className={`text-xs ${d.iso === date ? 'text-white/70' : 'text-soft'}`}>{d.bottom}</div>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => { setDate(''); setPanel(null); }} className="mt-3 text-sm text-mute underline hover:text-ink">
            Cualquier día
          </button>
        </div>
      )}
    </form>
  );
}
