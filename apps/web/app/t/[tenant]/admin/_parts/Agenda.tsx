'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import luxonPlugin from '@fullcalendar/luxon3';
import type { EventDropArg, EventClickArg, DateSelectArg } from '@fullcalendar/core';
import type { EventResizeDoneArg } from '@fullcalendar/interaction';
import { Check, UserX, XCircle, Link2, Phone, MessageCircle } from 'lucide-react';
import { useAdmin, useApi, soles } from './api';
import { PageHead, Btn, Drawer, Field, inputCls, StatusPill } from './ui';
import { staffColor } from '@/components/charts';
import { API_BASE_CLIENT, tenantUrl } from '@/lib/config';
import { toast } from '@/lib/toast';

interface Staff { id: string; name: string; is_bookable: boolean }

// Título en español del Perú ("setiembre"), en hora de Lima.
function calendarTitle(arg: { date: { marker: Date }; start?: { marker: Date }; end?: { marker: Date } }) {
  const f = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-PE', { ...o, timeZone: 'UTC' }).format(d);
  const start = arg.start?.marker ?? arg.date.marker;
  const end = arg.end?.marker;
  if (end && end.getTime() - start.getTime() >= 5 * 864e5) {
    const last = new Date(start.getTime() + 6 * 864e5);
    return `${f(start, { day: 'numeric', month: 'short' })} al ${f(last, { day: 'numeric', month: 'short', year: 'numeric' })}`.replace(/\./g, '');
  }
  const t = f(start, { weekday: 'long', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}
interface Appt {
  id: string; staff_id: string | null; starts_at: string; ends_at: string; status: string; price_cents: number;
  client_name: string | null; client_phone: string | null; service_name: string | null; source: string; note: string | null;
}

export function Agenda() {
  const { tenant } = useAdmin();
  const api = useApi();
  const calRef = useRef<FullCalendar>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [appts, setAppts] = useState<Appt[]>([]);
  const [open, setOpen] = useState<Appt | null>(null);
  const [walkIn, setWalkIn] = useState<{ start: Date; end: Date } | null>(null);

  useEffect(() => {
    api<{ staff: Staff[] }>('/admin/staff').then((d) => setStaff(d.staff)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const colorOf = useCallback((id: string | null) => staffColor(staff.findIndex((s) => s.id === id)), [staff]);

  const load = useCallback(async () => {
    const view = calRef.current?.getApi().view;
    const from = (view?.activeStart ?? new Date()).toISOString();
    const to = (view?.activeEnd ?? new Date(Date.now() + 7 * 864e5)).toISOString();
    try {
      const d = await api<{ appointments: Appt[] }>(`/admin/appointments?from=${from}&to=${to}`);
      setAppts(d.appointments);
    } catch { /* */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tiempo real: otras reservas o cambios desde otro dispositivo
  useEffect(() => {
    const proto = API_BASE_CLIENT.startsWith('https') ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${API_BASE_CLIENT.replace(/^https?:\/\//, '')}/api/ws?tenant=${tenant}`);
    ws.onmessage = (ev) => {
      try {
        if (JSON.parse(ev.data).type === 'availability_changed') load();
      } catch { /* */ }
    };
    return () => ws.close();
  }, [tenant, load]);

  const events = useMemo(
    () =>
      appts
        .filter((a) => a.status !== 'cancelled' && !(a.staff_id && hidden.has(a.staff_id)))
        .map((a) => ({
          id: a.id,
          title: `${a.client_name ?? 'Walk-in'}${a.service_name ? `, ${a.service_name}` : ''}`,
          start: a.starts_at,
          end: a.ends_at,
          backgroundColor: a.status === 'no_show' ? '#a1a1aa' : colorOf(a.staff_id),
          textColor: '#ffffff',
          classNames: a.status === 'pending' ? ['opacity-70'] : [],
        })),
    [appts, hidden, colorOf],
  );

  async function move(info: EventDropArg | EventResizeDoneArg) {
    try {
      await api(`/admin/appointments/${info.event.id}`, {
        method: 'PATCH',
        body: { startsAt: info.event.start?.toISOString(), endsAt: info.event.end?.toISOString() },
      });
      toast.success('Cita movida');
      load();
    } catch (e) {
      info.revert();
      toast.error((e as Error).message === 'slot_ocupado' ? 'Ese horario ya está ocupado por otra cita.' : 'No se pudo mover la cita.');
    }
  }

  async function setStatus(a: Appt, status: string) {
    try {
      await api(`/admin/appointments/${a.id}`, { method: 'PATCH', body: { status } });
      toast.success(
        { confirmed: 'Cita confirmada', completed: 'Marcada como completada. Se sumaron puntos al cliente.', no_show: 'Marcada como no asistió', cancelled: 'Cita cancelada' }[status] ?? 'Listo',
      );
      setOpen(null);
      load();
    } catch {
      toast.error('No se pudo actualizar.');
    }
  }

  return (
    <>
      <PageHead title="Agenda" sub="Arrastra una cita para moverla. Selecciona un espacio vacío para registrar un walk-in." />

      <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Barberos">
        {staff.map((s, i) => {
          const off = hidden.has(s.id);
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={!off}
              onClick={() => {
                const next = new Set(hidden);
                if (off) next.delete(s.id);
                else next.add(s.id);
                setHidden(next);
              }}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[14px] transition-colors ${off ? 'border-line text-soft' : 'border-line-2 text-ink'}`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: off ? '#d4d4d8' : staffColor(i) }} />
              {s.name}
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-line p-3">
        <FullCalendar
          ref={calRef}
          plugins={[timeGridPlugin, interactionPlugin, luxonPlugin]}
          timeZone="America/Lima"
          titleFormat={calendarTitle}
          initialView="timeGridDay"
          headerToolbar={{ left: 'prev,next today', center: 'title', right: 'timeGridDay,timeGridWeek' }}
          buttonText={{ today: 'Hoy', day: 'Día', week: 'Semana' }}
          locale="es"
          firstDay={1}
          slotMinTime="08:00:00"
          slotMaxTime="22:00:00"
          slotDuration="00:15:00"
          slotLabelInterval="01:00"
          slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          allDaySlot={false}
          height="auto"
          nowIndicator
          editable
          selectable
          selectMirror
          events={events}
          datesSet={() => load()}
          eventDrop={move}
          eventResize={move}
          eventClick={(info: EventClickArg) => setOpen(appts.find((a) => a.id === info.event.id) ?? null)}
          select={(sel: DateSelectArg) => setWalkIn({ start: sel.start, end: sel.end })}
        />
      </div>

      <Drawer open={!!open} onClose={() => setOpen(null)} title="Cita">
        {open && (
          <div>
            <StatusPill status={open.status} />
            <div className="mt-4 text-[22px] font-semibold tracking-[-0.03em]">{open.client_name ?? 'Walk-in'}</div>
            <div className="mt-1 text-[15px] text-mute">
              {open.service_name ?? 'Servicio'} con {staff.find((s) => s.id === open.staff_id)?.name ?? 'sin asignar'}
            </div>
            <dl className="mt-6 divide-y divide-line border-y border-line text-[15px]">
              <div className="flex justify-between py-3">
                <dt className="text-mute">Cuándo</dt>
                <dd className="tnum">
                  {new Date(open.starts_at).toLocaleString('es-PE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Lima' })}
                </dd>
              </div>
              <div className="flex justify-between py-3"><dt className="text-mute">Precio</dt><dd className="tnum">{soles(open.price_cents)}</dd></div>
              <div className="flex justify-between py-3"><dt className="text-mute">Origen</dt><dd>{open.source === 'walk_in' ? 'Walk-in' : 'Reserva online'}</dd></div>
              {open.note && <div className="py-3"><dt className="text-mute">Nota</dt><dd className="mt-1">{open.note}</dd></div>}
            </dl>

            {open.client_phone && (
              <div className="mt-5 flex gap-2">
                <a href={`tel:${open.client_phone}`} className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-[14px] font-medium hover:border-ink"><Phone size={15} strokeWidth={1.75} /> Llamar</a>
                <a href={`https://wa.me/${open.client_phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-[14px] font-medium hover:border-ink"><MessageCircle size={15} strokeWidth={1.75} /> WhatsApp</a>
              </div>
            )}

            <div className="mt-8 space-y-2">
              {open.status === 'pending' && <ActionRow icon={Check} label="Confirmar sin adelanto" onClick={() => setStatus(open, 'confirmed')} />}
              {['pending', 'confirmed'].includes(open.status) && (
                <>
                  <ActionRow icon={Check} label="Marcar como completada" onClick={() => setStatus(open, 'completed')} />
                  <ActionRow icon={UserX} label="No asistió" onClick={() => setStatus(open, 'no_show')} />
                  <ActionRow icon={XCircle} label="Cancelar cita" danger onClick={() => setStatus(open, 'cancelled')} />
                </>
              )}
              {open.status === 'completed' && open.client_phone && (
                <ActionRow
                  icon={Link2}
                  label="Copiar enlace para pedir reseña"
                  onClick={() => {
                    navigator.clipboard.writeText(tenantUrl(tenant, `/resena?cita=${open.id}`));
                    toast.success('Enlace copiado. Envíaselo al cliente.');
                  }}
                />
              )}
            </div>
          </div>
        )}
      </Drawer>

      <WalkInDrawer range={walkIn} staff={staff} onClose={() => setWalkIn(null)} onDone={() => { setWalkIn(null); load(); }} />
    </>
  );
}

function ActionRow({ icon: Icon, label, onClick, danger }: { icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl border border-line px-4 py-3 text-left text-[15px] font-medium transition-colors hover:border-ink ${danger ? 'text-red' : ''}`}>
      <Icon size={18} strokeWidth={1.75} /> {label}
    </button>
  );
}

function WalkInDrawer({ range, staff, onClose, onDone }: { range: { start: Date; end: Date } | null; staff: Staff[]; onClose: () => void; onDone: () => void }) {
  const api = useApi();
  const [staffId, setStaffId] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (range) {
      setStaffId(staff[0]?.id ?? '');
      setName('');
    }
  }, [range, staff]);

  async function save() {
    if (!range || !staffId) return;
    setBusy(true);
    try {
      await api('/admin/appointments', { method: 'POST', body: { staffId, startsAt: range.start.toISOString(), endsAt: range.end.toISOString(), clientName: name || undefined } });
      toast.success('Walk-in registrado');
      onDone();
    } catch {
      toast.error('No se pudo registrar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={!!range}
      onClose={onClose}
      title="Registrar walk-in"
      footer={<><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn onClick={save} busy={busy} disabled={!staffId}>Guardar</Btn></>}
    >
      {range && (
        <div className="space-y-4">
          <p className="tnum text-[15px] text-mute">
            {range.start.toLocaleString('es-PE', { weekday: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })} a{' '}
            {range.end.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </p>
          <Field label="Barbero">
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className={inputCls}>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Nombre del cliente (opcional)">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </Field>
        </div>
      )}
    </Drawer>
  );
}
