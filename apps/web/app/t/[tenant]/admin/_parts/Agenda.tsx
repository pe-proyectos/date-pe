'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import luxonPlugin from '@fullcalendar/luxon3';
import listPlugin from '@fullcalendar/list';
import type { EventDropArg, EventClickArg, DateSelectArg, EventInput } from '@fullcalendar/core';
import type { EventResizeDoneArg } from '@fullcalendar/interaction';
import { Check, UserX, XCircle, Link2, Phone, MessageCircle, Plus, CalendarClock, Receipt, FileText } from 'lucide-react';
import { useAdmin, useApi, soles } from './api';
import { PageHead, Btn, Drawer, Field, inputCls, StatusPill } from './ui';
import { staffColor } from '@/components/charts';
import { API_BASE_CLIENT, tenantUrl } from '@/lib/config';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';

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
  return dayLabel({ date: { marker: start } });
}
/** Cabecera de día de la lista: "Miércoles 30 de setiembre", con el mes como se escribe en Perú. */
function dayLabel(arg: { date: { marker: Date } }) {
  const t = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(arg.date.marker).replace(',', '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}
interface Appt {
  id: string; staff_id: string | null; starts_at: string; ends_at: string; status: string; price_cents: number;
  client_name: string | null; client_phone: string | null; client_email?: string | null; service_name: string | null; source: string; note: string | null;
  receipt?: ReceiptInfo | null;
}
interface ReceiptInfo { id?: string; serie: string; numero: number | string; status: string; pdf_url: string | null }
interface TimeOff { id: string; staff_id: string; staff_name: string; starts_at: string; ends_at: string; reason: string | null }

/** "Boleta B001-12", o "de prueba" si se emitió sin Nubefact. */
function receiptLabel(r: ReceiptInfo) {
  const serie = r.serie.replace(/^PRUEBA-/, '');
  const kind = serie.startsWith('F') ? 'Factura' : 'Boleta';
  return `${kind} ${serie}-${r.numero}${r.status === 'simulated' ? ' de prueba' : ''}`;
}

// Bloqueos en la vista de día y semana: franjas grises, sin robarle color a las citas
const OFF_CSS = `
.fc .dp-off { opacity: 1; background-color: #f4f4f5; background-image: repeating-linear-gradient(135deg, rgb(10 10 10 / 0.07) 0 6px, transparent 6px 12px); box-shadow: none; border-radius: 0; }
.fc .dp-off .fc-event-title { font-style: normal; font-size: 12px; font-weight: 500; color: #5f5f66; margin: 6px; }
`;

export function Agenda() {
  const { tenant } = useAdmin();
  const api = useApi();
  const calRef = useRef<FullCalendar>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [appts, setAppts] = useState<Appt[]>([]);
  const [timeOff, setTimeOff] = useState<TimeOff[]>([]);
  const [viewType, setViewType] = useState('');
  const [receiptFor, setReceiptFor] = useState<Appt | null>(null);
  const [open, setOpen] = useState<Appt | null>(null);
  const [walkIn, setWalkIn] = useState<ApptDraft | null>(null);
  const [isMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    api<{ staff: Staff[] }>('/admin/staff').then((d) => setStaff(d.staff)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const colorOf = useCallback((id: string | null) => staffColor(staff.findIndex((s) => s.id === id)), [staff]);

  const load = useCallback(async () => {
    const view = calRef.current?.getApi().view;
    const from = (view?.activeStart ?? new Date()).toISOString();
    const to = (view?.activeEnd ?? new Date(Date.now() + 7 * 864e5)).toISOString();
    const [a, off] = await Promise.allSettled([
      api<{ appointments: Appt[] }>(`/admin/appointments?from=${from}&to=${to}`),
      api<{ timeOff: TimeOff[] }>(`/admin/time-off?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    ]);
    if (a.status === 'fulfilled') setAppts(a.value.appointments);
    if (off.status === 'fulfilled') setTimeOff(off.value.timeOff);
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

  const events = useMemo<EventInput[]>(
    () =>
      appts
        .filter((a) => a.status !== 'cancelled' && !(a.staff_id && hidden.has(a.staff_id)))
        .map((a): EventInput => ({
          id: a.id,
          title: `${a.client_name ?? 'Cliente sin cita'}${a.service_name ? `, ${a.service_name}` : ''}`,
          start: a.starts_at,
          end: a.ends_at,
          backgroundColor: a.status === 'no_show' ? '#a1a1aa' : colorOf(a.staff_id),
          textColor: '#ffffff',
          classNames: a.status === 'pending' ? ['opacity-70'] : [],
        }))
        .concat(
          timeOff
            .filter((o) => !hidden.has(o.staff_id))
            .map((o): EventInput => {
              const label = `${o.staff_name}, ${o.reason || 'No atiende'}`;
              // La lista no dibuja eventos de fondo: ahí el bloqueo va como una fila gris
              return viewType.startsWith('list')
                ? { id: `off:${o.id}`, title: `Bloqueo: ${label}`, start: o.starts_at, end: o.ends_at, backgroundColor: '#d4d4d8', textColor: '#0a0a0a', classNames: ['text-mute'], editable: false }
                : { id: `off:${o.id}`, title: label, start: o.starts_at, end: o.ends_at, display: 'background', classNames: ['dp-off'] };
            }),
        ),
    [appts, timeOff, viewType, hidden, colorOf],
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
      <style>{OFF_CSS}</style>
      <PageHead
        title="Agenda"
        sub={isMobile ? 'Toca una cita para verla o cambiarla. Usa + para anotar a un cliente sin cita.' : 'Arrastra una cita para moverla. Selecciona un espacio vacío para anotar a un cliente sin cita.'}
      />

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

      <div
        className="rounded-xl border border-line p-2 md:p-3"
        onTouchStart={(e) => { const t = e.touches[0]; swipe.current = { x: t.clientX, y: t.clientY }; }}
        onTouchEnd={(e) => {
          const s0 = swipe.current;
          swipe.current = null;
          if (!s0 || !isMobile) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - s0.x;
          const dy = t.clientY - s0.y;
          if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            const api = calRef.current?.getApi();
            if (dx < 0) api?.next();
            else api?.prev();
          }
        }}
      >
        <FullCalendar
          ref={calRef}
          plugins={[timeGridPlugin, interactionPlugin, luxonPlugin, listPlugin]}
          timeZone="America/Lima"
          titleFormat={calendarTitle}
          initialView={isMobile ? 'listWeek' : 'timeGridDay'}
          headerToolbar={isMobile ? { left: 'prev', center: 'title', right: 'next' } : { left: 'prev,next today', center: 'title', right: 'timeGridDay,timeGridWeek,listWeek' }}
          footerToolbar={isMobile ? { center: 'today listWeek,timeGridDay' } : undefined}
          buttonText={{ today: 'Hoy', day: 'Día', week: 'Semana', list: 'Lista' }}
          noEventsContent="No hay citas en estos días"
          listDayFormat={dayLabel}
          listDaySideFormat={false}
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
          datesSet={(arg) => { setViewType(arg.view.type); load(); }}
          eventDrop={move}
          eventResize={move}
          eventClick={(info: EventClickArg) => {
            if (info.event.id.startsWith('off:')) return toast.info('Bloqueo de horario. Puedes quitarlo en Horarios.');
            setOpen(appts.find((a) => a.id === info.event.id) ?? null);
          }}
          select={(sel: DateSelectArg) => setWalkIn({ start: sel.start, end: sel.end })}
        />
      </div>

      <button
        type="button"
        onClick={() => setWalkIn({ auto: true })}
        className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-white shadow-pop md:bottom-8 md:right-8"
        aria-label="Nueva cita"
      >
        <Plus size={26} strokeWidth={2} />
      </button>

      <Drawer open={!!open} onClose={() => setOpen(null)} title="Cita">
        {open && (
          <div>
            <StatusPill status={open.status} />
            <div className="mt-4 text-[22px] font-semibold tracking-[-0.03em]">{open.client_name ?? 'Cliente sin cita'}</div>
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
              <div className="flex justify-between py-3"><dt className="text-mute">Origen</dt><dd>{open.source === 'walk_in' ? 'Sin cita, en el local' : 'Reserva online'}</dd></div>
              {open.note && <div className="py-3"><dt className="text-mute">Nota</dt><dd className="mt-1">{open.note}</dd></div>}
              {open.receipt && (
                <div className="flex items-center justify-between gap-4 py-3">
                  <dt className="text-mute">Comprobante</dt>
                  <dd className="flex items-center gap-3 text-right">
                    <span className="tnum">{receiptLabel(open.receipt)}</span>
                    {open.receipt.pdf_url && (
                      <a href={open.receipt.pdf_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 font-medium underline underline-offset-2">
                        <FileText size={15} strokeWidth={1.75} /> PDF
                      </a>
                    )}
                  </dd>
                </div>
              )}
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
                  <ActionRow
                    icon={CalendarClock}
                    label="Cambiar hora o barbero"
                    onClick={() => {
                      const a = open;
                      setOpen(null);
                      // Espera a que se cierre la hoja actual para abrir la siguiente
                      setTimeout(() => setWalkIn({ start: new Date(a.starts_at), end: new Date(a.ends_at), edit: a }), 60);
                    }}
                  />
                  <ActionRow icon={Check} label="Marcar como completada" onClick={() => setStatus(open, 'completed')} />
                  <ActionRow icon={UserX} label="No asistió" onClick={() => setStatus(open, 'no_show')} />
                  <ActionRow icon={XCircle} label="Cancelar cita" danger onClick={() => setStatus(open, 'cancelled')} />
                </>
              )}
              {['confirmed', 'completed'].includes(open.status) && !open.receipt && (
                <ActionRow
                  icon={Receipt}
                  label="Emitir comprobante"
                  onClick={() => {
                    const a = open;
                    haptic.tap();
                    setOpen(null);
                    setTimeout(() => setReceiptFor(a), 60);
                  }}
                />
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
      <ReceiptDrawer
        appt={receiptFor}
        onClose={() => setReceiptFor(null)}
        onDone={(id, r) => {
          setReceiptFor(null);
          setAppts((p) => p.map((x) => (x.id === id ? { ...x, receipt: r } : x)));
          load();
        }}
      />
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

/** Borrador de cita: un rango elegido, "auto" (próximo horario abierto) o una cita existente a reprogramar. */
type ApptDraft = { start?: Date; end?: Date; auto?: boolean; edit?: Appt };
interface Schedule { day_of_week: number; start_time: string; end_time: string }

function WalkInDrawer({ range, staff, onClose, onDone }: { range: ApptDraft | null; staff: Staff[]; onClose: () => void; onDone: () => void }) {
  const api = useApi();
  const [staffId, setStaffId] = useState('');
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [minutes, setMinutes] = useState(30);
  // Duración original de la cita si no es una de las estándar: se mantiene como opción
  const [extra, setExtra] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const limaParts = (d: Date) => {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
    const g = (t: string) => f.find((x) => x.type === t)?.value ?? '';
    return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}` };
  };
  const edit = range?.edit ?? null;

  // Próximo horario dentro del turno del barbero (hora de Lima), redondeado a 15 minutos
  async function nextOpen(sid: string) {
    try {
      const { schedules } = await api<{ schedules: Schedule[] }>(`/admin/staff/${sid}/schedules`);
      const now = Date.now();
      for (let d = 0; d < 8; d++) {
        const day = new Date(now + d * 864e5);
        const p = limaParts(day);
        const dow = new Date(`${p.date}T12:00:00-05:00`).getUTCDay();
        for (const sc of schedules.filter((x) => x.day_of_week === dow).sort((a, b) => a.start_time.localeCompare(b.start_time))) {
          const open = new Date(`${p.date}T${sc.start_time.slice(0, 5)}:00-05:00`).getTime();
          const close = new Date(`${p.date}T${sc.end_time.slice(0, 5)}:00-05:00`).getTime();
          const t = Math.max(open, Math.ceil(now / 9e5) * 9e5);
          if (t + 15 * 60000 <= close) return new Date(t);
        }
      }
    } catch { /* sin horario: usamos ahora */ }
    return new Date(Math.ceil(Date.now() / 9e5) * 9e5);
  }

  useEffect(() => {
    if (!range) return;
    const sid = range.edit?.staff_id ?? staff[0]?.id ?? '';
    setStaffId(sid);
    setName('');
    const apply = (start: Date, end: Date) => {
      const p = limaParts(start);
      setDate(p.date);
      setTime(p.time);
      const m = Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000));
      setMinutes(m);
      setExtra([15, 30, 45, 60].includes(m) ? null : m);
    };
    if (range.auto) {
      setDate('');
      setTime('');
      setMinutes(30);
      setExtra(null);
      if (sid) nextOpen(sid).then((st) => apply(st, new Date(st.getTime() + 30 * 60000)));
    } else if (range.start && range.end) apply(range.start, range.end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, staff]);

  async function save() {
    if (!staffId || !date || !time) return;
    setBusy(true);
    try {
      // Hora de Lima (UTC-5, sin horario de verano)
      const start = new Date(`${date}T${time}:00-05:00`);
      const end = new Date(start.getTime() + minutes * 60000);
      if (edit) {
        await api(`/admin/appointments/${edit.id}`, { method: 'PATCH', body: { staffId, startsAt: start.toISOString(), endsAt: end.toISOString() } });
        toast.success('Cita reprogramada');
      } else {
        await api('/admin/appointments', { method: 'POST', body: { staffId, startsAt: start.toISOString(), endsAt: end.toISOString(), clientName: name || undefined } });
        toast.success('Cita registrada');
      }
      onDone();
    } catch (e) {
      toast.error((e as Error).message === 'slot_ocupado' ? 'Ese barbero ya tiene una cita a esa hora.' : 'No se pudo registrar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={!!range}
      onClose={onClose}
      title={edit ? 'Cambiar hora o barbero' : 'Cliente sin cita'}
      footer={<><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn onClick={save} busy={busy} disabled={!staffId || !date || !time}>{edit ? 'Guardar cambios' : 'Guardar'}</Btn></>}
    >
      {range && (
        <div className="space-y-4">
          {edit && (
            <p className="rounded-xl bg-field px-4 py-3 text-[15px]">
              <span className="font-medium">{edit.client_name ?? 'Cliente sin cita'}</span>
              {edit.service_name && <span className="text-mute">, {edit.service_name}</span>}
            </p>
          )}
          <Field label="Barbero">
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className={inputCls}>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Día"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Field>
            <Field label="Hora"><input type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} className={`tnum ${inputCls}`} /></Field>
          </div>
          <Field label="Duración">
            <div className={`grid gap-2 ${extra ? 'grid-cols-5' : 'grid-cols-4'}`}>
              {[15, 30, 45, 60, ...(extra ? [extra] : [])].sort((x, y) => x - y).map((m) => (
                <button key={m} type="button" onClick={() => setMinutes(m)} className={`tnum whitespace-nowrap rounded-xl border py-2.5 text-[14px] sm:text-[15px] ${minutes === m ? 'border-ink bg-ink text-white' : 'border-line'}`}>
                  {m} min
                </button>
              ))}
            </div>
          </Field>
          {!edit && (
            <Field label="Nombre del cliente (opcional)">
              <input value={name} onChange={(e) => setName(e.target.value)} autoCapitalize="words" className={inputCls} />
            </Field>
          )}
        </div>
      )}
    </Drawer>
  );
}

/* ------------------------------ Comprobante electrónico ------------------------------ */

const RECEIPT_ERRORS: Record<string, string> = {
  factura_requiere_ruc: 'Para emitir una factura necesitas un RUC de 11 dígitos.',
  dni_invalido: 'El DNI debe tener 8 dígitos.',
  ya_emitido: 'Esta cita ya tiene un comprobante emitido.',
  cita_no_atendida: 'Solo puedes emitir comprobantes de citas confirmadas o completadas.',
  sin_configuracion: 'Primero configura los comprobantes electrónicos en Ajustes.',
  monto_cero: 'La cita no tiene monto para emitir un comprobante.',
};

type DocType = '-' | '1' | '6';

function ReceiptDrawer({ appt, onClose, onDone }: { appt: Appt | null; onClose: () => void; onDone: (id: string, r: ReceiptInfo) => void }) {
  const api = useApi();
  const [kind, setKind] = useState<'boleta' | 'factura'>('boleta');
  const [docType, setDocType] = useState<DocType>('-');
  const [doc, setDoc] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!appt) return;
    setKind('boleta');
    setDocType('-');
    setDoc('');
    setName(appt.client_name ?? '');
    setAddress('');
    setEmail(appt.client_email ?? '');
  }, [appt]);

  const docLen = docType === '1' ? 8 : docType === '6' ? 11 : 0;
  const docOk = docType === '-' || doc.length === docLen;
  const emailOk = !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const valid = docOk && emailOk && (kind === 'boleta' || name.trim().length > 1);

  function pickKind(k: 'boleta' | 'factura') {
    haptic.select();
    setKind(k);
    // La factura siempre va a un RUC
    if (k === 'factura') setDocType('6');
    else if (docType === '6') setDocType('-');
  }

  async function save() {
    if (!appt || !valid) return;
    setBusy(true);
    try {
      const d = await api<{ ok: boolean; receipt: ReceiptInfo & { sunat_message?: string | null } }>(`/admin/appointments/${appt.id}/receipt`, {
        method: 'POST',
        body: {
          kind,
          docType,
          doc: docType === '-' ? undefined : doc,
          name: name.trim() || undefined,
          address: kind === 'factura' && address.trim() ? address.trim() : undefined,
          email: email.trim() || undefined,
        },
      });
      toast.success(`${receiptLabel(d.receipt)} emitida${email.trim() && d.receipt.status === 'issued' ? '. Le llegará al correo del cliente.' : ''}`);
      onDone(appt.id, d.receipt);
    } catch (e) {
      toast.error(RECEIPT_ERRORS[(e as Error).message] ?? 'No se pudo emitir el comprobante. Revisa los datos.');
    } finally {
      setBusy(false);
    }
  }

  const seg = (on: boolean, disabled = false) =>
    `min-h-11 rounded-full px-4 text-[15px] transition-colors ${on ? 'bg-ink text-white' : 'bg-field hover:bg-line'} ${disabled ? 'cursor-not-allowed opacity-40' : ''}`;

  return (
    <Drawer
      open={!!appt}
      onClose={onClose}
      title="Emitir comprobante"
      footer={<><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn onClick={save} busy={busy} disabled={!valid}>Emitir {kind}</Btn></>}
    >
      {appt && (
        <div className="space-y-5">
          <p className="flex items-center justify-between gap-4 rounded-xl bg-field px-4 py-3 text-[15px]">
            <span className="min-w-0">
              <span className="block font-medium">{appt.service_name ?? 'Servicio'}</span>
              <span className="block text-mute">{appt.client_name ?? 'Cliente sin cita'}</span>
            </span>
            <span className="tnum shrink-0 font-medium">{soles(appt.price_cents)}</span>
          </p>

          <div>
            <span className="mb-2 block text-[14px] font-medium">Tipo</span>
            <div className="flex gap-2" role="radiogroup" aria-label="Tipo de comprobante">
              {(['boleta', 'factura'] as const).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => pickKind(k)} className={seg(kind === k)}>
                  {k === 'boleta' ? 'Boleta' : 'Factura'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-2 block text-[14px] font-medium">Documento del cliente</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo de documento">
              {([['-', 'Sin documento'], ['1', 'DNI'], ['6', 'RUC']] as const).map(([v, label]) => {
                const disabled = kind === 'factura' && v !== '6';
                return (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={docType === v}
                    disabled={disabled}
                    onClick={() => { haptic.select(); setDocType(v); setDoc(''); }}
                    className={seg(docType === v, disabled)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {kind === 'factura' && <span className="mt-1.5 block text-[13px] text-soft">La factura siempre lleva el RUC de la empresa.</span>}
          </div>

          {docType !== '-' && (
            <Field label={docType === '1' ? 'Número de DNI' : 'Número de RUC'} hint={doc && !docOk ? `Debe tener ${docLen} dígitos.` : undefined}>
              <input
                inputMode="numeric"
                autoComplete="off"
                value={doc}
                maxLength={docLen}
                onChange={(e) => setDoc(e.target.value.replace(/\D/g, '').slice(0, docLen))}
                className={`tnum ${inputCls}`}
                placeholder={docType === '1' ? '12345678' : '20123456789'}
              />
            </Field>
          )}

          <Field label={kind === 'factura' ? 'Razón social' : 'Nombre'}>
            <input value={name} onChange={(e) => setName(e.target.value)} autoCapitalize="words" className={inputCls} />
          </Field>

          {kind === 'factura' && (
            <Field label="Dirección fiscal (opcional)">
              <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} />
            </Field>
          )}

          <Field label="Correo (opcional)" hint={emailOk ? 'Con Nubefact configurado, el comprobante le llega a este correo.' : 'Revisa el correo.'}>
            <input type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </Field>
        </div>
      )}
    </Drawer>
  );
}
