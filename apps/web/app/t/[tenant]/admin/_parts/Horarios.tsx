'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Plus, Trash2, CalendarOff, AlertTriangle, X, Check } from 'lucide-react';
import { useApi } from './api';
import { PageHead, Btn, Switch, Skeleton, Drawer, Field, inputCls, Empty } from './ui';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';

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
              <button key={s.id} type="button" aria-pressed={sel === s.id} onClick={() => setSel(s.id)} className={`flex min-h-11 items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-4 text-[14px] transition-colors ${sel === s.id ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink'}`}>
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
                      <Switch checked={r.on} onChange={(v) => setRows({ ...rows, [d]: { ...r, on: v } })} label={`Atiende ${label}`} states={['Abierto', 'Cerrado']} />
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

          <TimeOff staff={staff} />
        </>
      )}
    </>
  );
}

/* ------------------------------ Bloqueos y vacaciones ------------------------------ */

interface TimeOffRow { id: string; staff_id: string; staff_name: string; starts_at: string; ends_at: string; reason: string | null }
interface Conflict { id: string; starts_at: string; client_name: string | null; staff_name: string | null }
interface OffDraft { staffIds: string[]; allDay: boolean; date: string; endDate: string; start: string; end: string; reason: string }

const REASONS = ['Vacaciones', 'Médico', 'Capacitación', 'Almuerzo'];

/** Partes de una fecha en hora de Lima: día YYYY-MM-DD y hora HH:MM. */
function lima(iso: string | Date) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso));
  const g = (t: string) => f.find((x) => x.type === t)?.value ?? '';
  const hour = g('hour') === '24' ? '00' : g('hour');
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${hour}:${g('minute')}` };
}
/** "Jueves 1 de octubre" (es-PE escribe "setiembre"). */
function dayTitle(date: string) {
  const t = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)).replace(',', '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}
const dayShort = (date: string) =>
  new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)).replace(/\./g, '').replace(',', '');

/** Texto del rango en hora de Lima, sin repetir el día del encabezado cuando no hace falta. */
function rangeText(r: TimeOffRow) {
  const a = lima(r.starts_at);
  const b = lima(r.ends_at);
  const allDay = a.time === '00:00' && (b.time === '23:59' || b.time === '00:00');
  // Un bloqueo que termina a las 00:00 cubre hasta el día anterior
  const lastDay = allDay && b.time === '00:00' ? lima(new Date(new Date(r.ends_at).getTime() - 60000)).date : b.date;
  if (allDay) return lastDay === a.date ? 'Todo el día' : `Todo el día, hasta el ${dayShort(lastDay)}`;
  if (a.date === b.date) return `${a.time} a ${b.time}`;
  return `Desde las ${a.time}, hasta el ${dayShort(b.date)} a las ${b.time}`;
}

const todayLima = () => lima(new Date()).date;
const newDraft = (): OffDraft => ({ staffIds: [], allDay: true, date: todayLima(), endDate: '', start: '13:00', end: '14:00', reason: '' });

function TimeOff({ staff }: { staff: Staff[] }) {
  const api = useApi();
  const [list, setList] = useState<TimeOffRow[] | null>(null);
  const [draft, setDraft] = useState<OffDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);

  const load = useCallback(() => api<{ timeOff: TimeOffRow[] }>('/admin/time-off').then((d) => setList(d.timeOff)).catch(() => setList([])), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const groups: [string, TimeOffRow[]][] = [];
  for (const r of list ?? []) {
    const d = lima(r.starts_at).date;
    const last = groups[groups.length - 1];
    if (last && last[0] === d) last[1].push(r);
    else groups.push([d, [r]]);
  }

  // Rango final en ISO con el desfase fijo de Lima (UTC-5)
  const range = (() => {
    if (!draft || !draft.date) return null;
    const endDate = draft.endDate && draft.endDate >= draft.date ? draft.endDate : draft.date;
    const startsAt = draft.allDay ? `${draft.date}T00:00:00-05:00` : `${draft.date}T${draft.start}:00-05:00`;
    const endsAt = draft.allDay ? `${endDate}T23:59:00-05:00` : `${endDate}T${draft.end}:00-05:00`;
    return { startsAt, endsAt, ok: new Date(endsAt).getTime() > new Date(startsAt).getTime() };
  })();
  const allTeam = !!draft && staff.length > 0 && draft.staffIds.length === staff.length;
  const valid = !!draft && draft.staffIds.length > 0 && !!range?.ok;

  function toggleStaff(id: string) {
    if (!draft) return;
    haptic.select();
    const has = draft.staffIds.includes(id);
    setDraft({ ...draft, staffIds: has ? draft.staffIds.filter((x) => x !== id) : [...draft.staffIds, id] });
  }

  async function save() {
    if (!draft || !range || !valid) return;
    setBusy(true);
    try {
      const d = await api<{ ok: boolean; conflicts?: Conflict[] }>('/admin/time-off', {
        method: 'POST',
        body: { staffIds: draft.staffIds, startsAt: range.startsAt, endsAt: range.endsAt, reason: draft.reason.trim() || undefined },
      });
      const c = d.conflicts ?? [];
      setConflicts(c);
      if (c.length) toast.info(`Bloqueo guardado. Hay ${c.length === 1 ? '1 cita' : `${c.length} citas`} en ese horario.`);
      else toast.success('Bloqueo guardado. Esas horas ya no se pueden reservar.');
      setDraft(null);
      load();
    } catch (e) {
      toast.error((e as Error).message === 'rango_invalido' ? 'El fin debe ser después del inicio.' : 'No se pudo guardar el bloqueo.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(r: TimeOffRow) {
    if (!confirm(`¿Quitar el bloqueo de ${r.staff_name}? Esas horas vuelven a estar disponibles para reservar.`)) return;
    setList((p) => p?.filter((x) => x.id !== r.id) ?? null);
    try {
      await api(`/admin/time-off/${r.id}`, { method: 'DELETE' });
      toast.success('Bloqueo eliminado');
    } catch {
      toast.error('No se pudo eliminar.');
      load();
    }
  }

  return (
    <section className="mt-14 max-w-2xl border-t border-line pt-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-semibold tracking-[-0.03em]">Bloqueos y vacaciones</h2>
          <p className="mt-1 text-[15px] text-mute">Días u horas en que un barbero no atiende. No se pueden reservar.</p>
        </div>
        <Btn variant="secondary" onClick={() => { haptic.tap(); setDraft(newDraft()); }}><Plus size={16} strokeWidth={2} /> Nuevo bloqueo</Btn>
      </div>

      {conflicts.length > 0 && (
        <div role="alert" className="mb-6 rounded-xl border border-[#f1d9a6] bg-[#fff8eb] p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-[#8a5300]" />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium">{conflicts.length === 1 ? 'Hay una cita dentro del bloqueo' : `Hay ${conflicts.length} citas dentro del bloqueo`}</p>
              <p className="mt-0.5 text-[14px] text-mute">Siguen agendadas. Muévelas o cancélalas desde la <a href="#agenda" className="font-medium text-ink underline underline-offset-2">Agenda</a> y avisa al cliente.</p>
              <ul className="mt-3 divide-y divide-[#f1d9a6] text-[14px]">
                {conflicts.map((c) => {
                  const p = lima(c.starts_at);
                  return (
                    <li key={c.id} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 py-2">
                      <span className="font-medium">{c.client_name ?? 'Cliente sin nombre'}</span>
                      <span className="tnum text-mute">{c.staff_name ?? 'Sin barbero'}, {dayShort(p.date)} {p.time}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <button type="button" onClick={() => setConflicts([])} className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-mute hover:bg-white" aria-label="Cerrar aviso">
              <X size={18} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      )}

      {!list ? (
        <Skeleton rows={2} />
      ) : list.length === 0 ? (
        <Empty icon={CalendarOff} title="Sin bloqueos próximos" body="Agrega vacaciones, citas médicas o la hora de almuerzo para que nadie reserve en esos momentos." />
      ) : (
        <div className="space-y-6">
          {groups.map(([day, rows]) => (
            <div key={day}>
              <h3 className="mb-1 text-[14px] font-medium text-mute">{dayTitle(day)}</h3>
              <ul className="divide-y divide-line border-y border-line">
                {rows.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-[15px] font-medium">{r.staff_name}</span>
                        <span className="tnum text-[14px] text-mute">{rangeText(r)}</span>
                      </div>
                      {r.reason && <div className="truncate text-[14px] text-soft">{r.reason}</div>}
                    </div>
                    <button type="button" onClick={() => remove(r)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-mute transition-colors hover:bg-red-tint hover:text-red" aria-label={`Quitar bloqueo de ${r.staff_name}`}>
                      <Trash2 size={17} strokeWidth={1.75} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <Drawer
        open={!!draft}
        onClose={() => setDraft(null)}
        title="Nuevo bloqueo"
        footer={<><Btn variant="ghost" onClick={() => setDraft(null)}>Cancelar</Btn><Btn onClick={save} busy={busy} disabled={!valid}>Guardar bloqueo</Btn></>}
      >
        {draft && (
          <div className="space-y-6">
            <div>
              <span className="mb-2 block text-[14px] font-medium">Barberos</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={allTeam}
                  onClick={() => { haptic.select(); setDraft({ ...draft, staffIds: allTeam ? [] : staff.map((s) => s.id) }); }}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[15px] transition-colors ${allTeam ? 'bg-ink text-white' : 'bg-field hover:bg-line'}`}
                >
                  {allTeam && <Check size={15} strokeWidth={2} />} Todo el equipo
                </button>
                {staff.map((s) => {
                  const on = draft.staffIds.includes(s.id);
                  return (
                    <button key={s.id} type="button" aria-pressed={on} onClick={() => toggleStaff(s.id)} className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[15px] transition-colors ${on ? 'bg-ink text-white' : 'bg-field hover:bg-line'}`}>
                      {on && <Check size={15} strokeWidth={2} />} {s.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <span className="text-[15px] font-medium">Todo el día</span>
              <Switch checked={draft.allDay} onChange={(v) => setDraft({ ...draft, allDay: v })} label="Todo el día" states={['Sí', 'No']} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label={draft.endDate ? 'Desde' : 'Día'}>
                <input type="date" value={draft.date} min={todayLima()} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Hasta (opcional)">
                <input type="date" value={draft.endDate} min={draft.date} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} className={inputCls} />
              </Field>
            </div>
            {!draft.allDay && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Desde las"><input type="time" step={900} value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} className={`tnum ${inputCls}`} /></Field>
                <Field label="Hasta las"><input type="time" step={900} value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} className={`tnum ${inputCls}`} /></Field>
              </div>
            )}
            {range && !range.ok && <p className="-mt-3 text-[13px] text-red">El fin debe ser después del inicio.</p>}
            <p className="-mt-3 text-[13px] text-soft">Deja "Hasta" vacío si es un solo día. Para vacaciones, elige el último día libre.</p>

            <div>
              <span className="mb-2 block text-[14px] font-medium">Motivo</span>
              <div className="mb-3 flex flex-wrap gap-2">
                {REASONS.map((r) => (
                  <button key={r} type="button" aria-pressed={draft.reason === r} onClick={() => { haptic.select(); setDraft({ ...draft, reason: draft.reason === r ? '' : r }); }} className={`min-h-11 rounded-full px-4 text-[15px] transition-colors ${draft.reason === r ? 'bg-ink text-white' : 'bg-field hover:bg-line'}`}>
                    {r}
                  </button>
                ))}
              </div>
              <input value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} maxLength={120} placeholder="O escribe el motivo (opcional)" aria-label="Motivo" className={inputCls} />
              <span className="mt-1 block text-[13px] text-soft">El motivo no se muestra a tus clientes.</span>
            </div>
          </div>
        )}
      </Drawer>
    </section>
  );
}
