'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { useApi } from './api';
import { PageHead, Btn, Switch, Skeleton } from './ui';
import { toast } from '@/lib/toast';

interface Staff { id: string; name: string; photo_url: string | null }
type Row = { on: boolean; start: string; end: string };
const DAYS: [number, string][] = [[1, 'Lunes'], [2, 'Martes'], [3, 'Miércoles'], [4, 'Jueves'], [5, 'Viernes'], [6, 'Sábado'], [0, 'Domingo']];

export function Horarios() {
  const api = useApi();
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [sel, setSel] = useState('');
  const [rows, setRows] = useState<Record<number, Row> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ staff: Staff[] }>('/admin/staff').then((d) => { setStaff(d.staff); if (d.staff[0]) setSel(d.staff[0].id); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async (id: string) => {
    setRows(null);
    const d = await api<{ schedules: { day_of_week: number; start_time: string; end_time: string }[] }>(`/admin/staff/${id}/schedules`);
    const map: Record<number, Row> = {};
    for (let i = 0; i < 7; i++) map[i] = { on: false, start: '10:00', end: '20:00' };
    for (const s of d.schedules) map[s.day_of_week] = { on: true, start: s.start_time.slice(0, 5), end: s.end_time.slice(0, 5) };
    setRows(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (sel) load(sel); }, [sel, load]);

  const invalid = rows ? Object.values(rows).some((r) => r.on && r.end <= r.start) : false;

  async function save() {
    if (!rows || invalid) return;
    setBusy(true);
    try {
      const schedules = Object.entries(rows).filter(([, r]) => r.on).map(([d, r]) => ({ dayOfWeek: Number(d), startTime: r.start, endTime: r.end }));
      await api(`/admin/staff/${sel}/schedules`, { method: 'PUT', body: { schedules } });
      toast.success('Horario guardado. Tu página ya muestra los nuevos horarios.');
    } catch {
      toast.error('No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  }

  function copyMonday() {
    if (!rows) return;
    const m = rows[1];
    const next = { ...rows };
    for (const d of [2, 3, 4, 5, 6]) next[d] = { ...m };
    setRows(next);
  }

  return (
    <>
      <PageHead title="Horarios" sub="Los horarios de cada barbero definen las horas que se pueden reservar." />
      {!staff ? (
        <Skeleton rows={2} />
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-2">
            {staff.map((s) => (
              <button key={s.id} type="button" onClick={() => setSel(s.id)} className={`flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-4 text-[14px] transition-colors ${sel === s.id ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink'}`}>
                {s.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.photo_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                ) : (
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[12px] ${sel === s.id ? 'bg-white/20' : 'bg-field'}`}>{s.name.charAt(0)}</span>
                )}
                {s.name}
              </button>
            ))}
          </div>

          {!rows ? (
            <Skeleton rows={7} />
          ) : (
            <div className="max-w-2xl">
              <ul className="divide-y divide-line border-y border-line">
                {DAYS.map(([d, label]) => {
                  const r = rows[d];
                  const bad = r.on && r.end <= r.start;
                  return (
                    <li key={d} className="flex flex-wrap items-center gap-4 py-3.5">
                      <Switch checked={r.on} onChange={(v) => setRows({ ...rows, [d]: { ...r, on: v } })} label={`Atiende ${label}`} />
                      <span className={`w-24 text-[15px] ${r.on ? 'font-medium' : 'text-soft'}`}>{label}</span>
                      {r.on ? (
                        <div className="flex items-center gap-2">
                          <input type="time" step={900} value={r.start} onChange={(e) => setRows({ ...rows, [d]: { ...r, start: e.target.value } })} className={`tnum rounded-lg border px-3 py-2 text-[15px] outline-none focus:border-ink ${bad ? 'border-red' : 'border-line-2'}`} aria-label={`Entrada ${label}`} />
                          <span className="text-mute">a</span>
                          <input type="time" step={900} value={r.end} onChange={(e) => setRows({ ...rows, [d]: { ...r, end: e.target.value } })} className={`tnum rounded-lg border px-3 py-2 text-[15px] outline-none focus:border-ink ${bad ? 'border-red' : 'border-line-2'}`} aria-label={`Salida ${label}`} />
                          {bad && <span className="text-[13px] text-red">La salida debe ser después de la entrada</span>}
                        </div>
                      ) : (
                        <span className="text-[15px] text-soft">No atiende</span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="mt-6 flex flex-wrap gap-2">
                <Btn onClick={save} busy={busy} disabled={invalid}>Guardar horario</Btn>
                <Btn variant="ghost" onClick={copyMonday}><Copy size={16} strokeWidth={1.75} /> Copiar lunes al resto de la semana</Btn>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
