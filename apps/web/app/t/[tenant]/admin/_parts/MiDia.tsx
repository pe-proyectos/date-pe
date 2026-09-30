'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Phone, MessageCircle, Check, UserX, Wallet, Camera, Loader2, CircleAlert, Sparkles, ListOrdered, CalendarCheck, Coffee,
  Megaphone, Armchair, Banknote, Smartphone, QrCode, CreditCard, Users, Timer,
} from 'lucide-react';
import { useAdmin, useApi, soles } from './api';
import { PageHead, Skeleton, StatusPill, usePanel, featureOn } from './ui';
import { Lightbox } from '@/components/Lightbox';
import { Sheet } from '@/components/Sheet';
import { uploadImage } from '@/lib/upload';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import { useTenantSocket } from '../../tv/_lib/queue';

interface DayAppt {
  id: string; starts_at: string; ends_at: string; status: string; price_cents: number;
  client_id: string | null; client_name: string | null; client_phone: string | null;
  preferences: string | null; allergies: string | null; service_name: string | null; last_photo: string | null;
}
interface Ticket { id: string; number: number; name: string; status: string; service_name: string | null }
interface Earnings { services_cents: number; commission_cents: number; tips_cents: number; clients: number }
interface Day { staffId: string | null; appointments: DayAppt[]; tickets: Ticket[]; earnings: Earnings | null }
interface Staff { id: string; name: string; photo_url: string | null }
interface QueueRow { id: string; status: string; staff_id: string | null; called_at: string | null }
interface QueueCfg { noShowMinutes: number; autoNoShow: boolean }
interface PosCfg { tipPresets: number[]; methods: string[]; tipsOn: boolean }
interface CatalogService { id: string; name: string; price_cents: number; is_addon: boolean }
export interface Charge {
  appointmentId: string | null; ticketId: string | null; staffId: string | null; clientId: string | null; clientName: string | null;
  items: { serviceId: string; name: string; priceCents: number }[];
  discountCents: number; totalCents: number; depositCents: number; dueCents: number; needsService?: boolean;
}
interface FinishOut {
  finished: { kind: 'ticket' | 'appointment'; id: string; name: string | null; number: number | null } | null;
  charge: Charge | null;
  next: { id: string; number: number; name: string; staffName: string } | null;
}

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Lima' });
const waNumber = (phone: string) => {
  const d = phone.replace(/\D/g, '');
  return d.length === 9 ? `51${d}` : d;
};
const OPEN = ['pending', 'confirmed'];
const errCode = (e: unknown) => (e as Error)?.message ?? '';

/** "en 25 min", "en 1 h 10 min", "ahora" */
function untilText(iso: string, now: number) {
  const m = Math.round((new Date(iso).getTime() - now) / 60000);
  if (m <= 0) return 'ahora';
  if (m < 60) return `en ${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `en ${h} h${r ? ` ${r} min` : ''}`;
}

/** Cita que "Terminé" cerraría: la misma ventana que usa el servidor. */
function apptInProgress(appts: DayAppt[], now: number) {
  return appts.find((a) => a.status === 'confirmed' && new Date(a.starts_at).getTime() <= now + 10 * 60000 && new Date(a.ends_at).getTime() >= now - 90 * 60000) ?? null;
}

/** El día del barbero: su siguiente cliente, su agenda de hoy, su turno de la fila y lo que lleva ganado. */
export function MiDia() {
  const { tenant, token } = useAdmin();
  const api = useApi();
  const { me, features } = usePanel();
  const ownStaff = me?.staffId ?? null;
  const pickKey = `datepe_midia_staff_${tenant}`;
  const [staff, setStaff] = useState<Staff[]>([]);
  const [staffLoaded, setStaffLoaded] = useState(false);
  const [viewStaff, setViewStaff] = useState<string | null>(ownStaff);
  const [day, setDay] = useState<Day | null>(null);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [qCfg, setQCfg] = useState<QueueCfg>({ noShowMinutes: 10, autoNoShow: true });
  const [posCfg, setPosCfg] = useState<PosCfg | null>(null);
  const [charge, setCharge] = useState<Charge | null>(null);
  const [emptyFlash, setEmptyFlash] = useState(false);
  const [acting, setActing] = useState<'finish' | 'finishOnly' | 'next' | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoFor = useRef<DayAppt | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pos = featureOn(features, 'pos');
  const photos = featureOn(features, 'client_photos');
  const queueOn = featureOn(features, 'queue');
  // Barbero sobre el que actúan los botones: el propio o el elegido por el dueño
  const actStaff = ownStaff ?? viewStaff;

  // Sin barbero vinculado (el dueño): elige a quién ver
  useEffect(() => {
    if (ownStaff) return;
    api<{ staff: Staff[] }>('/admin/staff')
      .then((d) => {
        setStaff(d.staff);
        const saved = localStorage.getItem(pickKey);
        setViewStaff(d.staff.some((s) => s.id === saved) ? saved : d.staff[0]?.id ?? null);
      })
      .catch(() => {})
      .finally(() => setStaffLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownStaff]);

  const load = useCallback(async () => {
    if (!viewStaff) return;
    try {
      const d = await api<Day>(`/admin/me/day${ownStaff ? '' : `?staffId=${viewStaff}`}`);
      setDay(d);
    } catch { /* sin conexión: se reintenta solo */ }
    if (queueOn) {
      api<{ tickets: QueueRow[] }>('/admin/queue').then((q) => setQueue(q.tickets)).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewStaff, ownStaff, queueOn]);

  const loadConfig = useCallback(() => {
    api<{ queue?: Partial<QueueCfg> }>('/admin/features')
      .then((d) => setQCfg({ noShowMinutes: d.queue?.noShowMinutes ?? 10, autoNoShow: d.queue?.autoNoShow !== false }))
      .catch(() => {});
    if (pos) {
      api<{ config?: { tipPresets?: number[]; methods?: string[] }; features?: Record<string, boolean> }>('/admin/pos/state')
        .then((d) => setPosCfg({ tipPresets: d.config?.tipPresets ?? [], methods: d.config?.methods ?? ['cash', 'yape', 'plin', 'card'], tipsOn: d.features?.tips !== false }))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);

  useEffect(() => { setDay(null); load(); }, [load]);
  useEffect(() => { loadConfig(); }, [loadConfig]);

  // Tiempo real: citas nuevas, fila y cobros desde otros dispositivos
  useTenantSocket(
    tenant,
    (type) => {
      if (['availability_changed', 'queue_changed', 'sale_created', 'sale_voided'].includes(type)) load();
      if (type === 'config_changed') loadConfig();
    },
    () => load(),
  );

  // Reloj y respaldo por si el WebSocket se cae
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 30000);
    const poll = setInterval(load, 120000);
    return () => { clearInterval(clock); clearInterval(poll); };
  }, [load]);

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  const appts = useMemo(() => day?.appointments ?? [], [day]);
  const next = appts.find((a) => OPEN.includes(a.status) && new Date(a.ends_at).getTime() > now) ?? null;
  const active = appts.filter((a) => a.status !== 'no_show');
  const done = appts.filter((a) => a.status === 'completed').length;
  const progress = active.length ? done / active.length : 0;
  const tickets = day?.tickets ?? [];
  const called = tickets.filter((t) => t.status === 'called');
  const serving = tickets.filter((t) => t.status !== 'called');
  const currentTicket = tickets[0] ?? null;
  const currentAppt = currentTicket ? null : apptInProgress(appts, now);
  const attending = !!(currentTicket || currentAppt);
  const waitingN = queue.filter((t) => t.status === 'waiting' && (!t.staff_id || t.staff_id === actStaff)).length;
  const calledAt = (id: string) => queue.find((t) => t.id === id)?.called_at ?? null;

  function flashEmpty() {
    setEmptyFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setEmptyFlash(false), 6000);
  }

  /** Muestra al llamado al instante, sin esperar la recarga. */
  function showCalled(n: { id: string; number: number; name: string }) {
    setEmptyFlash(false);
    setDay((d) => (d ? { ...d, tickets: [...d.tickets.filter((x) => x.id !== n.id), { id: n.id, number: n.number, name: n.name, status: 'called', service_name: null }] } : d));
    setQueue((q) => q.map((x) => (x.id === n.id ? { ...x, status: 'called', called_at: new Date().toISOString() } : x)));
  }

  async function finish(callNext: boolean) {
    if (!actStaff || acting) return;
    haptic.tap();
    setActing(callNext ? 'finish' : 'finishOnly');
    try {
      const out = await api<FinishOut>('/admin/queue/finish', { method: 'POST', body: { staffId: actStaff, callNext } });
      if (out.finished) {
        const { id, kind } = out.finished;
        setDay((d) => (d ? {
          ...d,
          tickets: d.tickets.filter((x) => x.id !== id),
          appointments: kind === 'appointment' ? d.appointments.map((a) => (a.id === id ? { ...a, status: 'completed' } : a)) : d.appointments,
        } : d));
        toast.success(`Terminaste con ${out.finished.name ?? 'tu cliente'}`);
      }
      if (out.next) {
        haptic.success();
        showCalled(out.next);
      } else if (callNext && queueOn) {
        flashEmpty();
      }
      const c = out.charge;
      if (pos && c && (c.dueCents > 0 || c.needsService)) setCharge(c);
      load();
    } catch (e) {
      const code = errCode(e);
      if (code === 'nada_que_cerrar') {
        haptic.tap();
        flashEmpty();
        toast.info('No hay nadie en la fila');
      } else if (code === 'sin_permiso') toast.error('Solo puedes cerrar tus propios clientes.');
      else if (code === 'elige_el_barbero') toast.error('Elige qué barbero terminó.');
      else toast.error('No se pudo terminar. Intenta de nuevo.');
    } finally {
      setActing(null);
    }
  }

  async function callNextOne() {
    if (!actStaff || acting) return;
    haptic.tap();
    setActing('next');
    try {
      const out = await api<{ id: string; number: number; name: string; staffName: string }>('/admin/queue/next', { method: 'POST', body: { staffId: actStaff } });
      haptic.success();
      showCalled(out);
      load();
    } catch (e) {
      if (errCode(e) === 'nadie_esperando') {
        flashEmpty();
        toast.info('No hay nadie en la fila');
      } else toast.error('No se pudo llamar. Intenta de nuevo.');
    } finally {
      setActing(null);
    }
  }

  async function recall(t: Ticket) {
    haptic.tap();
    setBusy(`recall:${t.id}`);
    try {
      await api(`/admin/queue/${t.id}/recall`, { method: 'POST' });
      toast.success(`Volviste a llamar a ${t.name}`);
    } catch {
      toast.error('No se pudo volver a llamar.');
    } finally {
      setBusy(null);
    }
  }

  async function arrived(t: Ticket) {
    haptic.tap();
    setBusy(`serve:${t.id}`);
    try {
      await api(`/admin/queue/${t.id}`, { method: 'PATCH', body: { status: 'serving' } });
      setDay((d) => (d ? { ...d, tickets: d.tickets.map((x) => (x.id === t.id ? { ...x, status: 'serving' } : x)) } : d));
      haptic.success();
      load();
    } catch {
      toast.error('No se pudo actualizar.');
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(a: DayAppt, status: 'completed' | 'no_show') {
    haptic.tap();
    setBusy(a.id + status);
    const prev = day;
    setDay((d) => (d ? { ...d, appointments: d.appointments.map((x) => (x.id === a.id ? { ...x, status } : x)) } : d));
    try {
      await api(`/admin/appointments/${a.id}`, { method: 'PATCH', body: { status } });
      toast.success(status === 'completed' ? `${a.client_name ?? 'Cliente'} atendido` : 'Marcado como no vino');
      load();
    } catch {
      setDay(prev);
      toast.error('No se pudo actualizar.');
    } finally {
      setBusy(null);
    }
  }

  async function ticketDone(t: Ticket) {
    haptic.tap();
    setBusy(t.id);
    try {
      await api(`/admin/queue/${t.id}`, { method: 'PATCH', body: { status: 'done' } });
      setDay((d) => (d ? { ...d, tickets: d.tickets.filter((x) => x.id !== t.id) } : d));
      toast.success(`Turno ${t.number} terminado`);
      load();
    } catch {
      toast.error('No se pudo cerrar el turno.');
    } finally {
      setBusy(null);
    }
  }

  function askPhoto(a: DayAppt) {
    photoFor.current = a;
    fileRef.current?.click();
  }

  async function onPhoto(file: File) {
    const a = photoFor.current;
    if (!a?.client_id) return;
    setBusy(`photo:${a.id}`);
    try {
      const url = await uploadImage(file, 'clients', { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenant, Authorization: `Bearer ${token}` });
      await api(`/admin/clients/${a.client_id}/photos`, { method: 'POST', body: { url, appointmentId: a.id, caption: a.service_name ?? undefined } });
      setDay((d) => (d ? { ...d, appointments: d.appointments.map((x) => (x.client_id === a.client_id ? { ...x, last_photo: url } : x)) } : d));
      toast.success(`Foto guardada en la ficha de ${a.client_name ?? 'tu cliente'}`);
    } catch {
      toast.error('No se pudo subir la foto.');
    } finally {
      setBusy(null);
    }
  }

  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Lima' }).format(new Date(now)));
  const greet = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  const firstName = (me?.name ?? '').split(' ')[0];
  // La barra aparece si hay algo que terminar o una fila de la que llamar
  const showBar = !!day && !!actStaff && (attending || queueOn);

  return (
    <>
      <PageHead
        title={firstName ? `${greet}, ${firstName}` : greet}
        sub={new Date(now).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Lima' })}
      />
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhoto(f); e.target.value = ''; }} />

      {!ownStaff && staff.length > 0 && (
        <div className="-mx-4 mb-6 px-4">
          <p className="mb-2 text-[14px] text-mute">Ver el día de</p>
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label="Barbero">
            {staff.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={viewStaff === s.id}
                onClick={() => { haptic.select(); setViewStaff(s.id); localStorage.setItem(pickKey, s.id); }}
                className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-4 text-[15px] transition-colors ${viewStaff === s.id ? 'bg-ink text-white' : 'bg-field text-ink hover:bg-line'}`}
              >
                <span className="h-9 w-9 overflow-hidden rounded-full bg-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {s.photo_url ? <img src={s.photo_url} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-[14px] font-semibold text-ink">{s.name.charAt(0)}</span>}
                </span>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {!ownStaff && staffLoaded && staff.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-2 p-6 text-[15px] text-mute">Agrega a tu equipo en Equipo para ver el día de cada barbero.</p>
      ) : !day ? (
        <Skeleton rows={4} />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-8">
            {/* Recién llamado de la fila: se puede volver a anunciar */}
            {called.map((t) => (
              <CalledCard
                key={t.id}
                t={t}
                calledAt={calledAt(t.id)}
                cfg={qCfg}
                recalling={busy === `recall:${t.id}`}
                serving={busy === `serve:${t.id}`}
                onRecall={() => recall(t)}
                onArrived={() => arrived(t)}
              />
            ))}

            {emptyFlash && called.length === 0 && (
              <div className="rise-in flex items-center gap-4 rounded-xl bg-field p-5" role="status">
                <Users size={24} strokeWidth={1.75} className="shrink-0 text-mute" />
                <div>
                  <p className="text-[17px] font-semibold tracking-[-0.02em]">No hay nadie en la fila</p>
                  <p className="text-[14px] text-mute">Cuando alguien se anote, podrás llamarlo desde aquí.</p>
                </div>
              </div>
            )}

            {/* Turno de la fila que está atendiendo */}
            {serving.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-xl border border-ink p-4 sm:gap-4">
                <span className="tnum flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-ink text-white">
                  <span className="text-[11px] font-medium opacity-70">Turno</span>
                  <span className="text-[20px] font-semibold leading-none">{t.number}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[13px] text-mute"><ListOrdered size={14} strokeWidth={1.75} /> Atendiendo de la fila</p>
                  <p className="truncate text-[17px] font-semibold tracking-[-0.02em]">{t.name}</p>
                  {t.service_name && <p className="truncate text-[14px] text-mute">{t.service_name}</p>}
                </div>
                {pos && (
                  <a href={`#caja?ticket=${t.id}`} aria-label="Cobrar este turno" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-line px-4 text-[15px] font-medium hover:border-ink">
                    <Wallet size={16} strokeWidth={1.75} /> <span className="hidden sm:inline">Cobrar</span>
                  </a>
                )}
                <button type="button" onClick={() => ticketDone(t)} disabled={busy === t.id} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-medium text-white hover:bg-ink-2 disabled:opacity-50">
                  {busy === t.id ? <Loader2 size={16} className="animate-spin" /> : <Check size={17} strokeWidth={2} />} Listo
                </button>
              </div>
            ))}

            {/* Siguiente cliente */}
            {next ? (
              <NextCard
                a={next}
                now={now}
                pos={pos}
                busy={busy}
                onDone={() => setStatus(next, 'completed')}
                onPhoto={() => setPhoto(next.last_photo)}
              />
            ) : (
              <div className="rounded-xl bg-field p-6">
                <Coffee size={24} strokeWidth={1.5} className="text-mute" />
                <p className="mt-3 text-[19px] font-semibold tracking-[-0.02em]">{appts.length ? 'No tienes más citas hoy' : 'Hoy no tienes citas agendadas'}</p>
                <p className="mt-1 text-[15px] text-mute">{queueOn ? 'Los clientes de la fila te llegan aquí cuando te toque atenderlos.' : 'Las nuevas reservas aparecen aquí al instante.'}</p>
              </div>
            )}

            {/* Agenda de hoy */}
            <section>
              <h2 className="mb-3 text-[19px] font-semibold tracking-[-0.02em]">Tu día</h2>
              {appts.length === 0 ? (
                <p className="border-y border-line py-4 text-[15px] text-mute">Sin citas por ahora.</p>
              ) : (
                <ol className="relative">
                  {appts.map((a, i) => {
                    const isOpen = OPEN.includes(a.status);
                    const past = !isOpen;
                    const isNext = next?.id === a.id;
                    return (
                      <li key={a.id} className="relative flex gap-4 pb-6 last:pb-0">
                        {i < appts.length - 1 && <span className="absolute bottom-0 left-[27px] top-8 w-px bg-line" aria-hidden />}
                        <span className={`tnum relative z-[1] w-14 shrink-0 pt-0.5 text-[15px] font-medium ${past ? 'text-soft' : ''}`}>
                          {hhmm(a.starts_at)}
                        </span>
                        <div className={`min-w-0 flex-1 ${past ? 'opacity-70' : ''}`}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[16px] font-medium">{a.client_name ?? 'Cliente sin cita'}</span>
                            {isNext ? <span className="inline-flex rounded-full bg-ink px-2.5 py-1 text-[12px] font-medium text-white">Siguiente</span> : <StatusPill status={a.status} />}
                          </div>
                          <p className="text-[14px] text-mute">{a.service_name ?? 'Servicio'}, hasta las {hhmm(a.ends_at)}</p>
                          {a.allergies && (
                            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-red-tint px-2.5 py-1 text-[13px] font-medium text-red-deep">
                              <CircleAlert size={14} strokeWidth={1.75} /> Alergia: {a.allergies}
                            </p>
                          )}
                          {a.preferences && <p className="mt-1 text-[14px] text-ink">{a.preferences}</p>}
                          <div className="mt-2.5 flex flex-wrap gap-2">
                            {isOpen && (
                              <>
                                <MiniBtn onClick={() => setStatus(a, 'completed')} busy={busy === a.id + 'completed'} icon={Check} label="Atendido" strong />
                                <MiniBtn onClick={() => setStatus(a, 'no_show')} busy={busy === a.id + 'no_show'} icon={UserX} label="No vino" />
                              </>
                            )}
                            {pos && ['confirmed', 'completed'].includes(a.status) && (
                              <a href={`#caja?cita=${a.id}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line px-4 text-[14px] font-medium hover:border-ink">
                                <Wallet size={15} strokeWidth={1.75} /> Cobrar
                              </a>
                            )}
                            {photos && a.client_id && a.status !== 'no_show' && (
                              <MiniBtn onClick={() => askPhoto(a)} busy={busy === `photo:${a.id}`} icon={Camera} label="Foto del corte" />
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </div>

          {/* Lo ganado hoy */}
          <aside className="space-y-4 lg:sticky lg:top-10 lg:self-start">
            <EarningsCard e={day.earnings} done={done} total={active.length} progress={progress} />
          </aside>
        </div>
      )}

      {/* Espacio para que la barra de acción no tape el final de la página */}
      {showBar && <div className="h-40 lg:h-32" aria-hidden />}
      {showBar && (
        <ActionBar
          attending={attending}
          queueOn={queueOn}
          who={currentTicket ? `Con ${currentTicket.name}, turno ${currentTicket.number}` : currentAppt ? `Con ${currentAppt.client_name ?? 'tu cliente'}, cita de las ${hhmm(currentAppt.starts_at)}` : null}
          waitingN={waitingN}
          acting={acting}
          onFinish={() => finish(true)}
          onFinishOnly={() => finish(false)}
          onNext={callNextOne}
        />
      )}

      <ChargeSheet charge={charge} cfg={posCfg} onClose={() => setCharge(null)} onPaid={() => { setCharge(null); load(); }} />
      <Lightbox images={photo ? [{ src: photo, alt: 'Último corte' }] : []} index={photo ? 0 : null} onClose={() => setPhoto(null)} />
    </>
  );
}

/* ------------------------------ Barra de acción fija ------------------------------ */

/**
 * Un toque para terminar y llamar al siguiente, al alcance del pulgar.
 * Se monta en <body> para que ninguna animación del contenedor la saque de su lugar.
 */
function ActionBar({ attending, queueOn, who, waitingN, acting, onFinish, onFinishOnly, onNext }: {
  attending: boolean; queueOn: boolean; who: string | null; waitingN: number; acting: string | null;
  onFinish: () => void; onFinishOnly: () => void; onNext: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const spin = <Loader2 size={20} className="animate-spin" />;
  const waitText = waitingN === 0 ? 'No hay nadie en la fila' : waitingN === 1 ? '1 persona puede pasar contigo' : `${waitingN} personas pueden pasar contigo`;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 px-3 lg:bottom-6 lg:left-[248px] lg:px-10">
      <div className="pointer-events-auto mx-auto max-w-[560px] rounded-2xl border border-line bg-white p-2.5 shadow-lift">
        <p className="truncate px-2 pb-2 pt-0.5 text-[13px] text-mute">
          {attending ? who : waitText}
          {attending && queueOn && waitingN > 0 ? `. ${waitingN} en espera` : ''}
        </p>
        {attending ? (
          <div className="flex gap-2">
            {queueOn ? (
              <>
                <button
                  type="button"
                  onClick={onFinish}
                  disabled={!!acting}
                  className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-full bg-ink px-4 text-left text-[16px] font-semibold leading-tight text-white transition-colors hover:bg-ink-2 disabled:opacity-60"
                >
                  {acting === 'finish' ? spin : <Check size={20} strokeWidth={2} className="shrink-0" />}
                  <span>Terminé, llamar al siguiente</span>
                </button>
                <button
                  type="button"
                  onClick={onFinishOnly}
                  disabled={!!acting}
                  className="flex min-h-14 shrink-0 items-center justify-center gap-1.5 rounded-full border border-line px-4 text-[14px] font-medium transition-colors hover:border-ink disabled:opacity-60"
                >
                  {acting === 'finishOnly' && <Loader2 size={16} className="animate-spin" />} Solo terminar
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onFinishOnly}
                disabled={!!acting}
                className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-full bg-ink px-4 text-[16px] font-semibold text-white transition-colors hover:bg-ink-2 disabled:opacity-60"
              >
                {acting === 'finishOnly' ? spin : <Check size={20} strokeWidth={2} />} Terminé
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={onNext}
            disabled={!!acting}
            className={`flex min-h-14 w-full items-center justify-center gap-2 rounded-full px-4 text-[16px] font-semibold transition-colors disabled:opacity-60 ${waitingN > 0 ? 'bg-ink text-white hover:bg-ink-2' : 'border border-line bg-white hover:border-ink'}`}
          >
            {acting === 'next' ? spin : <Megaphone size={20} strokeWidth={1.75} />} Llamar al siguiente
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------ Llamado de la fila ------------------------------ */

function CalledCard({ t, calledAt, cfg, recalling, serving, onRecall, onArrived }: {
  t: Ticket; calledAt: string | null; cfg: QueueCfg; recalling: boolean; serving: boolean; onRecall: () => void; onArrived: () => void;
}) {
  return (
    <section className="rise-in rounded-xl bg-ink p-5 text-white md:p-6" aria-live="polite" aria-label="Cliente llamado">
      <p className="flex items-center gap-1.5 text-[14px] text-white/70"><Megaphone size={15} strokeWidth={1.75} /> Anunciado en la pantalla</p>
      <p className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.03em]">
        Llamaste a {t.name}, <span className="tnum">turno {t.number}</span>
      </p>
      {t.service_name && <p className="mt-1 text-[15px] text-white/70">{t.service_name}</p>}
      {cfg.autoNoShow && calledAt && <NoShowCountdown calledAt={calledAt} minutes={cfg.noShowMinutes} />}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button type="button" onClick={onRecall} disabled={recalling} className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-white/15 px-4 text-[15px] font-medium transition-colors hover:bg-white/25 disabled:opacity-60">
          {recalling ? <Loader2 size={17} className="animate-spin" /> : <Megaphone size={17} strokeWidth={1.75} />} Volver a llamar
        </button>
        <button type="button" onClick={onArrived} disabled={serving} className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-4 text-[15px] font-medium text-ink transition-colors hover:bg-field disabled:opacity-60">
          {serving ? <Loader2 size={17} className="animate-spin" /> : <Armchair size={17} strokeWidth={1.75} />} Ya llegó
        </button>
      </div>
    </section>
  );
}

/** "Si no llega, pasa a no vino en 4:32", con segundos en vivo. */
function NoShowCountdown({ calledAt, minutes }: { calledAt: string; minutes: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.ceil((new Date(calledAt).getTime() + minutes * 60000 - now) / 1000));
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');
  return (
    <p className="mt-3 flex items-center gap-1.5 text-[14px] text-white/80">
      <Timer size={15} strokeWidth={1.75} />
      {left > 0 ? <span>Si no llega, pasa a no vino en <span className="tnum font-medium text-white">{mm}:{ss}</span></span> : 'Pasando a no vino y llamando al siguiente'}
    </p>
  );
}

/* ------------------------------ Cobro en segundos ------------------------------ */

const PAY: { id: 'cash' | 'yape' | 'plin' | 'card'; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }[] = [
  { id: 'cash', label: 'Efectivo', icon: Banknote },
  { id: 'yape', label: 'Yape', icon: Smartphone },
  { id: 'plin', label: 'Plin', icon: QrCode },
  { id: 'card', label: 'Tarjeta', icon: CreditCard },
];

const CHECKOUT_ERR: Record<string, string> = {
  elige_el_servicio: 'Elige el servicio primero.',
  cita_ya_cobrada: 'Esto ya estaba cobrado.',
  pagos_no_cuadran: 'El monto no cuadra. Cóbralo desde la caja.',
  propinas_desactivadas: 'Las propinas están apagadas en Funciones.',
  funcion_desactivada: 'La caja está apagada en Funciones.',
};

function ChargeSheet({ charge, cfg, onClose, onPaid }: { charge: Charge | null; cfg: PosCfg | null; onClose: () => void; onPaid: () => void }) {
  const api = useApi();
  const [services, setServices] = useState<CatalogService[] | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [tipPct, setTipPct] = useState(0);
  const [paying, setPaying] = useState<string | null>(null);
  const needs = !!charge?.needsService;

  useEffect(() => {
    setServiceId(null);
    setTipPct(0);
    setPaying(null);
    if (charge?.needsService && !services) {
      api<{ services: CatalogService[] }>('/admin/pos/catalog').then((d) => setServices(d.services.filter((s) => !s.is_addon))).catch(() => setServices([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charge]);

  const picked = services?.find((s) => s.id === serviceId) ?? null;
  const total = needs ? picked?.price_cents ?? 0 : charge?.totalCents ?? 0;
  const baseDue = needs ? total : charge?.dueCents ?? 0;
  const tip = Math.round((total * tipPct) / 1000) * 10;
  const due = baseDue + tip;
  const tips = cfg?.tipsOn ? [0, ...(cfg.tipPresets ?? []).filter((p) => p > 0)] : [];
  const methods = PAY.filter((m) => !cfg || cfg.methods.includes(m.id));
  const canPay = !!charge && (!needs || !!picked) && !paying;

  async function pay(method: (typeof PAY)[number]) {
    if (!charge || !canPay) return;
    haptic.tap();
    setPaying(method.id);
    try {
      await api('/admin/pos/checkout', {
        method: 'POST',
        body: {
          ...(charge.appointmentId ? { appointmentId: charge.appointmentId } : { ticketId: charge.ticketId }),
          payWith: method.id,
          tipCents: tip,
          ...(needs && picked ? { items: [{ kind: 'service', refId: picked.id }] } : {}),
        },
      });
      toast.success(`Cobrado ${soles(due)} con ${method.label}`);
      onPaid();
    } catch (e) {
      const code = errCode(e);
      toast.error(CHECKOUT_ERR[code] ?? 'No se pudo cobrar. Intenta de nuevo.');
      if (code === 'cita_ya_cobrada') onPaid();
    } finally {
      setPaying(null);
    }
  }

  const chip = (on: boolean) => `tnum min-h-11 rounded-full px-4 text-[15px] transition-colors ${on ? 'bg-ink text-white' : 'bg-field text-ink hover:bg-line'}`;

  return (
    <Sheet
      open={!!charge}
      onClose={onClose}
      title={`Cobrar a ${charge?.clientName ?? 'tu cliente'}`}
      footer={
        <button type="button" onClick={onClose} className="flex min-h-12 w-full items-center justify-center rounded-full text-[15px] font-medium text-mute hover:bg-field hover:text-ink">
          Lo cobra la caja
        </button>
      }
    >
      {charge && (
        <div className="space-y-6">
          <div>
            <p className="text-[14px] text-mute">Por cobrar</p>
            <p className="tnum text-[48px] font-semibold leading-none tracking-[-0.04em]">{needs && !picked ? 'S/ 0.00' : soles(due)}</p>
            {tip > 0 && <p className="mt-1 text-[14px] text-mute">Incluye <span className="tnum">{soles(tip)}</span> de propina</p>}
          </div>

          {needs ? (
            <div>
              <p className="mb-2 text-[14px] font-medium">Elige el servicio</p>
              {!services ? (
                <div className="flex gap-2">{[0, 1, 2].map((i) => <span key={i} className="h-11 w-28 animate-pulse rounded-full bg-field" />)}</div>
              ) : services.length === 0 ? (
                <p className="text-[14px] text-mute">No hay servicios activos. Cóbralo desde la caja.</p>
              ) : (
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Servicio">
                  {services.map((s) => (
                    <button key={s.id} type="button" role="radio" aria-checked={serviceId === s.id} onClick={() => { haptic.select(); setServiceId(s.id); }} className={chip(serviceId === s.id)}>
                      {s.name}, {soles(s.price_cents)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <dl className="divide-y divide-line border-y border-line text-[15px]">
              {charge.items.map((it, i) => (
                <div key={`${it.serviceId}${i}`} className="flex justify-between gap-4 py-2.5"><dt>{it.name}</dt><dd className="tnum">{soles(it.priceCents)}</dd></div>
              ))}
              {charge.discountCents > 0 && (
                <div className="flex justify-between gap-4 py-2.5"><dt className="text-mute">Descuento</dt><dd className="tnum text-mute">- {soles(charge.discountCents)}</dd></div>
              )}
              {charge.depositCents > 0 && (
                <div className="flex justify-between gap-4 py-2.5"><dt className="text-mute">Adelanto pagado</dt><dd className="tnum text-ok">{soles(charge.depositCents)}</dd></div>
              )}
            </dl>
          )}

          {tips.length > 1 && (
            <div>
              <p className="mb-2 text-[14px] font-medium">Propina</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Propina">
                {tips.map((p) => (
                  <button key={p} type="button" role="radio" aria-checked={tipPct === p} onClick={() => { haptic.select(); setTipPct(p); }} className={chip(tipPct === p)}>
                    {p === 0 ? 'Sin propina' : `${p}%`}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-[14px] font-medium">Cobrar con</p>
            <div className="grid grid-cols-2 gap-2">
              {methods.map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => pay(m)}
                    disabled={!canPay}
                    className="flex min-h-16 items-center justify-center gap-2.5 rounded-xl bg-ink px-4 text-[17px] font-semibold text-white transition-colors hover:bg-ink-2 disabled:opacity-40"
                  >
                    {paying === m.id ? <Loader2 size={20} className="animate-spin" /> : <Icon size={21} strokeWidth={1.75} />} {m.label}
                  </button>
                );
              })}
            </div>
            {needs && !picked && <p className="mt-2 text-[13px] text-soft">Elige el servicio para cobrar.</p>}
          </div>
        </div>
      )}
    </Sheet>
  );
}

function NextCard({ a, now, pos, busy, onDone, onPhoto }: { a: DayAppt; now: number; pos: boolean; busy: string | null; onDone: () => void; onPhoto: () => void }) {
  const inChair = new Date(a.starts_at).getTime() <= now;
  return (
    <section className="rounded-xl border border-line p-5 md:p-6" aria-label="Tu siguiente cliente">
      <p className="text-[14px] text-mute">{inChair ? 'En el sillón ahora' : 'Tu siguiente cliente'}</p>
      <div className="mt-2 flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="tnum text-[40px] font-semibold leading-none tracking-[-0.04em]">{hhmm(a.starts_at)}</p>
          <p className="mt-1 text-[14px] text-mute">{inChair ? `Termina a las ${hhmm(a.ends_at)}` : untilText(a.starts_at, now)}</p>
          <p className="mt-4 truncate text-[22px] font-semibold tracking-[-0.03em]">{a.client_name ?? 'Cliente sin cita'}</p>
          <p className="text-[15px] text-mute">{a.service_name ?? 'Servicio'}</p>
        </div>
        {a.last_photo && (
          <button type="button" onClick={onPhoto} className="shrink-0 text-center" aria-label="Ver su último corte">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.last_photo} alt="" className="h-24 w-24 rounded-xl object-cover md:h-28 md:w-28" />
            <span className="mt-1 block text-[12px] text-mute">Último corte</span>
          </button>
        )}
      </div>

      {(a.allergies || a.preferences) && (
        <div className="mt-4 space-y-2">
          {a.allergies && (
            <p className="flex items-start gap-2 rounded-xl bg-red-tint px-4 py-3 text-[15px] text-red-deep">
              <CircleAlert size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" />
              <span><span className="font-semibold">Alergia:</span> {a.allergies}</span>
            </p>
          )}
          {a.preferences && (
            <p className="flex items-start gap-2 rounded-xl bg-field px-4 py-3 text-[15px]">
              <Sparkles size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-mute" />
              <span><span className="font-medium">Le gusta así:</span> {a.preferences}</span>
            </p>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {a.client_phone && (
          <>
            <a href={`tel:${a.client_phone}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-[15px] font-medium hover:border-ink"><Phone size={16} strokeWidth={1.75} /> Llamar</a>
            <a href={`https://wa.me/${waNumber(a.client_phone)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-[15px] font-medium hover:border-ink"><MessageCircle size={16} strokeWidth={1.75} /> WhatsApp</a>
          </>
        )}
        <span className="flex-1" />
        {pos && a.status === 'confirmed' && (
          <a href={`#caja?cita=${a.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-[15px] font-medium hover:border-ink"><Wallet size={16} strokeWidth={1.75} /> Cobrar</a>
        )}
        <button type="button" onClick={onDone} disabled={busy === a.id + 'completed'} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-medium text-white hover:bg-ink-2 disabled:opacity-50">
          {busy === a.id + 'completed' ? <Loader2 size={16} className="animate-spin" /> : <Check size={17} strokeWidth={2} />} Atendido
        </button>
      </div>
    </section>
  );
}

function EarningsCard({ e, done, total, progress }: { e: Earnings | null; done: number; total: number; progress: number }) {
  const mine = (e?.commission_cents ?? 0) + (e?.tips_cents ?? 0);
  const msg = total === 0 ? 'Tu día recién empieza.' : done === total ? 'Terminaste tu agenda de hoy. Buen trabajo.' : done === 0 ? 'Tu primer cliente ya viene.' : `Vas ${done} de ${total}. Sigue así.`;
  return (
    <section className="rounded-xl border border-line p-5" aria-label="Lo ganado hoy">
      <p className="text-[14px] text-mute">Llevas hoy</p>
      <p className="tnum mt-1 text-[34px] font-semibold leading-none tracking-[-0.04em]">{soles(mine)}</p>
      <p className="mt-1 text-[13px] text-soft">Tu comisión más propinas</p>

      <div className="mt-5">
        <div className="flex items-center justify-between text-[14px]">
          <span className="flex items-center gap-1.5 font-medium"><CalendarCheck size={15} strokeWidth={1.75} /> Citas atendidas</span>
          <span className="tnum text-mute">{done} de {total}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-field" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Citas atendidas">
          <div className="h-full rounded-full bg-ink transition-[width] duration-700" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <p className="mt-2 text-[14px] text-mute">{msg}</p>
      </div>

      <dl className="mt-5 divide-y divide-line border-t border-line text-[15px]">
        <div className="flex justify-between py-2.5"><dt className="text-mute">Servicios cobrados</dt><dd className="tnum">{soles(e?.services_cents ?? 0)}</dd></div>
        <div className="flex justify-between py-2.5"><dt className="text-mute">Tu comisión</dt><dd className="tnum">{soles(e?.commission_cents ?? 0)}</dd></div>
        <div className="flex justify-between py-2.5"><dt className="text-mute">Propinas</dt><dd className="tnum">{soles(e?.tips_cents ?? 0)}</dd></div>
        <div className="flex justify-between py-2.5"><dt className="text-mute">Clientes cobrados</dt><dd className="tnum">{e?.clients ?? 0}</dd></div>
      </dl>
    </section>
  );
}

function MiniBtn({ onClick, busy, icon: Icon, label, strong }: { onClick: () => void; busy?: boolean; icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; label: string; strong?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium transition-colors disabled:opacity-50 ${strong ? 'bg-ink text-white hover:bg-ink-2' : 'border border-line hover:border-ink'}`}
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : <Icon size={15} strokeWidth={1.75} />} {label}
    </button>
  );
}
