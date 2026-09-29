'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { API_BASE_CLIENT } from '@/lib/config';
import { uploadImage } from '@/lib/upload';

interface Staff { id: string; name: string; is_bookable: boolean; bio: string | null; photo_url?: string | null }
type Tab = 'agenda' | 'equipo' | 'horarios';

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export default function AdminPage() {
  const tenant = useParams().tenant as string;
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('agenda');

  useEffect(() => {
    setToken(localStorage.getItem(`datepe_token_${tenant}`));
  }, [tenant]);

  if (!token) return <Login tenant={tenant} onLogin={(t) => { localStorage.setItem(`datepe_token_${tenant}`, t); setToken(t); }} />;

  const headers = { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenant, Authorization: `Bearer ${token}` };

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold">Panel · {tenant}</h1>
        <nav className="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm">
          {(['agenda', 'equipo', 'horarios'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-1.5 capitalize ${tab === t ? 'bg-white shadow font-semibold' : 'text-slate-500'}`}
            >
              {t}
            </button>
          ))}
        </nav>
        <button onClick={() => { localStorage.removeItem(`datepe_token_${tenant}`); setToken(null); }} className="text-sm text-slate-500">
          Salir
        </button>
      </header>

      {tab === 'agenda' && <Agenda tenant={tenant} headers={headers} />}
      {tab === 'equipo' && <Equipo headers={headers} />}
      {tab === 'horarios' && <Horarios headers={headers} />}
    </main>
  );
}

function Login({ tenant, onLogin }: { tenant: string; onLogin: (t: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`${API_BASE_CLIENT}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenant },
      body: JSON.stringify({ email, password }),
    });
    const d = await res.json();
    if (res.ok) onLogin(d.token);
    else setError('Credenciales inválidas');
  }
  return (
    <main className="mx-auto max-w-sm px-6 py-20">
      <h1 className="text-2xl font-bold">Panel de tu barbería</h1>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2" />
        <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="w-full rounded-xl bg-slate-900 py-2.5 font-semibold text-white">Entrar</button>
      </form>
    </main>
  );
}

function Agenda({ tenant, headers }: { tenant: string; headers: Record<string, string> }) {
  const calRef = useRef<FullCalendar>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [events, setEvents] = useState<any[]>([]);

  const staffColor = useCallback(
    (id: string) => {
      const palette = ['#0ea5e9', '#f59e0b', '#22c55e', '#a855f7', '#ef4444', '#14b8a6'];
      const i = staff.findIndex((s) => s.id === id);
      return palette[i % palette.length] ?? '#0f172a';
    },
    [staff],
  );

  const load = useCallback(async () => {
    const api = calRef.current?.getApi();
    const from = api ? api.view.activeStart.toISOString() : new Date().toISOString();
    const to = api ? api.view.activeEnd.toISOString() : new Date(Date.now() + 7 * 864e5).toISOString();
    const res = await fetch(`${API_BASE_CLIENT}/api/admin/appointments?from=${from}&to=${to}`, { headers });
    if (!res.ok) return;
    const d = await res.json();
    setEvents(
      (d.appointments ?? []).map((a: any) => ({
        id: a.id,
        title: `${a.client_name ?? 'Walk-in'}`,
        start: a.starts_at,
        end: a.ends_at,
        backgroundColor: staffColor(a.staff_id),
        borderColor: staffColor(a.staff_id),
        extendedProps: { status: a.status },
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headers, staffColor]);

  useEffect(() => {
    fetch(`${API_BASE_CLIENT}/api/admin/staff`, { headers }).then((r) => r.json()).then((d) => setStaff(d.staff ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  // Tiempo real
  useEffect(() => {
    const proto = API_BASE_CLIENT.startsWith('https') ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${API_BASE_CLIENT.replace(/^https?:\/\//, '')}/api/ws?tenant=${tenant}`);
    ws.onmessage = (ev) => {
      try { if (JSON.parse(ev.data).type === 'availability_changed') load(); } catch { /* */ }
    };
    return () => ws.close();
  }, [tenant, load]);

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`${API_BASE_CLIENT}/api/admin/appointments/${id}`, { method: 'PATCH', headers, body: JSON.stringify(body) });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
      <aside>
        <h3 className="mb-2 text-sm font-semibold text-slate-500">Barberos</h3>
        <ul className="space-y-1 text-sm">
          {staff.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: staffColor(s.id) }} />
              {s.name}
            </li>
          ))}
        </ul>
      </aside>
      <div className="rounded-2xl border border-slate-200 p-2">
        <FullCalendar
          ref={calRef}
          plugins={[timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{ left: 'prev,next today', center: 'title', right: 'timeGridWeek,timeGridDay' }}
          locale="es"
          slotMinTime="08:00:00"
          slotMaxTime="22:00:00"
          allDaySlot={false}
          height="auto"
          nowIndicator
          editable
          eventStartEditable
          eventDurationEditable
          events={events}
          datesSet={() => load()}
          eventDrop={(info) => patch(info.event.id, { startsAt: info.event.start?.toISOString(), endsAt: info.event.end?.toISOString() })}
          eventResize={(info) => patch(info.event.id, { startsAt: info.event.start?.toISOString(), endsAt: info.event.end?.toISOString() })}
        />
      </div>
    </div>
  );
}

function Equipo({ headers }: { headers: Record<string, string> }) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    const d = await (await fetch(`${API_BASE_CLIENT}/api/admin/staff`, { headers })).json();
    setStaff(d.staff ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!name) return;
    await fetch(`${API_BASE_CLIENT}/api/admin/staff`, { method: 'POST', headers, body: JSON.stringify({ name }) });
    setName('');
    load();
  }
  async function toggle(s: Staff) {
    await fetch(`${API_BASE_CLIENT}/api/admin/staff/${s.id}`, { method: 'PATCH', headers, body: JSON.stringify({ isBookable: !s.is_bookable }) });
    load();
  }
  async function remove(id: string) {
    await fetch(`${API_BASE_CLIENT}/api/admin/staff/${id}`, { method: 'DELETE', headers });
    load();
  }
  async function uploadPhoto(s: Staff, file: File) {
    try {
      const url = await uploadImage(file, 'staff', headers);
      await fetch(`${API_BASE_CLIENT}/api/admin/staff/${s.id}`, { method: 'PATCH', headers, body: JSON.stringify({ photoUrl: url }) });
      load();
    } catch {
      alert('No se pudo subir la foto');
    }
  }

  return (
    <div className="max-w-xl">
      <div className="mb-4 flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del barbero" className="flex-1 rounded-xl border border-slate-300 px-3 py-2" />
        <button onClick={add} className="rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white">Agregar</button>
      </div>
      <ul className="space-y-2">
        {staff.map((s) => (
          <li key={s.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 overflow-hidden rounded-full bg-slate-200">
                {s.photo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.photo_url} alt={s.name} className="h-full w-full object-cover" />
                )}
              </div>
              <span className="font-medium">{s.name}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <label className="cursor-pointer text-slate-500 hover:text-slate-900">
                Foto
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadPhoto(s, e.target.files[0])}
                />
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={s.is_bookable} onChange={() => toggle(s)} />
                Visible
              </label>
              <button onClick={() => remove(s.id)} className="text-red-600">Eliminar</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Horarios({ headers }: { headers: Record<string, string> }) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [rows, setRows] = useState<Record<number, { on: boolean; start: string; end: string }>>({});

  useEffect(() => {
    fetch(`${API_BASE_CLIENT}/api/admin/staff`, { headers }).then((r) => r.json()).then((d) => setStaff(d.staff ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSchedule = useCallback(async (id: string) => {
    const d = await (await fetch(`${API_BASE_CLIENT}/api/admin/staff/${id}/schedules`, { headers })).json();
    const map: Record<number, { on: boolean; start: string; end: string }> = {};
    for (let i = 0; i < 7; i++) map[i] = { on: false, start: '10:00', end: '20:00' };
    for (const s of d.schedules ?? []) map[s.day_of_week] = { on: true, start: s.start_time.slice(0, 5), end: s.end_time.slice(0, 5) };
    setRows(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    const schedules = Object.entries(rows)
      .filter(([, v]) => v.on)
      .map(([dow, v]) => ({ dayOfWeek: Number(dow), startTime: v.start, endTime: v.end }));
    await fetch(`${API_BASE_CLIENT}/api/admin/staff/${selected}/schedules`, { method: 'PUT', headers, body: JSON.stringify({ schedules }) });
    alert('Horario guardado');
  }

  return (
    <div className="max-w-xl">
      <select
        value={selected}
        onChange={(e) => { setSelected(e.target.value); if (e.target.value) loadSchedule(e.target.value); }}
        className="mb-4 rounded-xl border border-slate-300 px-3 py-2"
      >
        <option value="">Elige un barbero…</option>
        {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>

      {selected && (
        <>
          <div className="space-y-2">
            {DAYS.map((label, dow) => {
              const r = rows[dow] ?? { on: false, start: '10:00', end: '20:00' };
              return (
                <div key={dow} className="flex items-center gap-3 rounded-lg border border-slate-200 p-2">
                  <label className="flex w-20 items-center gap-2">
                    <input type="checkbox" checked={r.on} onChange={(e) => setRows({ ...rows, [dow]: { ...r, on: e.target.checked } })} />
                    {label}
                  </label>
                  <input type="time" value={r.start} disabled={!r.on} onChange={(e) => setRows({ ...rows, [dow]: { ...r, start: e.target.value } })} className="rounded border border-slate-300 px-2 py-1" />
                  <span>a</span>
                  <input type="time" value={r.end} disabled={!r.on} onChange={(e) => setRows({ ...rows, [dow]: { ...r, end: e.target.value } })} className="rounded border border-slate-300 px-2 py-1" />
                </div>
              );
            })}
          </div>
          <button onClick={save} className="mt-4 rounded-xl bg-slate-900 px-6 py-2 font-semibold text-white">Guardar horario</button>
        </>
      )}
    </div>
  );
}
