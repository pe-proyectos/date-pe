'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_CLIENT } from '@/lib/config';

interface District {
  slug: string;
  district: string;
  province: string;
}

export function SearchBar({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [district, setDistrict] = useState('');
  const [service, setService] = useState('');
  const [when, setWhen] = useState('');
  const [suggestions, setSuggestions] = useState<District[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE_CLIENT}/api/geo/districts?q=${encodeURIComponent(district)}`, {
          signal: ctrl.signal,
        });
        const data = await res.json();
        setSuggestions(data.districts ?? []);
      } catch {
        /* ignore */
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [district]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function submit() {
    const params = new URLSearchParams();
    if (district) params.set('district', district);
    if (service) params.set('service', service);
    if (when) params.set('date', when);
    router.push(`/search?${params.toString()}`);
  }

  return (
    <div
      className={`flex flex-col gap-2 rounded-2xl bg-white p-2 shadow-xl md:flex-row md:items-center ${
        compact ? '' : 'md:p-3'
      }`}
    >
      <div ref={boxRef} className="relative flex-1">
        <label className="block px-3 pt-1 text-xs font-semibold text-slate-500">¿Dónde?</label>
        <input
          value={district}
          onChange={(e) => {
            setDistrict(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Distrito o zona (ej. Miraflores)"
          className="w-full rounded-xl px-3 pb-2 text-sm outline-none"
        />
        {open && suggestions.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
            {suggestions.map((s) => (
              <li key={s.slug}>
                <button
                  type="button"
                  onClick={() => {
                    setDistrict(s.district);
                    setOpen(false);
                  }}
                  className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-100"
                >
                  {s.district} <span className="text-slate-400">· {s.province}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex-1 border-t border-slate-100 md:border-l md:border-t-0">
        <label className="block px-3 pt-1 text-xs font-semibold text-slate-500">¿Qué?</label>
        <input
          value={service}
          onChange={(e) => setService(e.target.value)}
          placeholder="Servicio (corte, barba…)"
          className="w-full rounded-xl px-3 pb-2 text-sm outline-none"
        />
      </div>

      <div className="flex-1 border-t border-slate-100 md:border-l md:border-t-0">
        <label className="block px-3 pt-1 text-xs font-semibold text-slate-500">¿Cuándo?</label>
        <input
          type="date"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="w-full rounded-xl px-3 pb-2 text-sm outline-none"
        />
      </div>

      <button
        onClick={submit}
        className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
      >
        Buscar
      </button>
    </div>
  );
}
