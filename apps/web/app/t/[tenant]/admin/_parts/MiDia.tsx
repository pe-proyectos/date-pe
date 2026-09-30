'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Phone, MessageCircle, Check, UserX, Wallet, Camera, Loader2, CircleAlert, Sparkles, ListOrdered, CalendarCheck, Coffee } from 'lucide-react';
import { useAdmin, useApi, soles } from './api';
import { PageHead, Skeleton, StatusPill, usePanel, featureOn } from './ui';
import { Lightbox } from '@/components/Lightbox';
import { API_BASE_CLIENT } from '@/lib/config';
import { uploadImage } from '@/lib/upload';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';

interface DayAppt {
  id: string; starts_at: string; ends_at: string; status: string; price_cents: number;
  client_id: string | null; client_name: string | null; client_phone: string | null;
  preferences: string | null; allergies: string | null; service_name: string | null; last_photo: string | null;
}
interface Ticket { id: string; number: number; name: string; status: string; service_name: string | null }
interface Earnings { services_cents: number; commission_cents: number; tips_cents: number; clients: number }
interface Day { staffId: string | null; appointments: DayAppt[]; tickets: Ticket[]; earnings: Earnings | null }
interface Staff { id: string; name: string; photo_url: string | null }

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Lima' });
const waNumber = (phone: string) => {
  const d = phone.replace(/\D/g, '');
  return d.length === 9 ? `51${d}` : d;
};
const OPEN = ['pending', 'confirmed'];

/** "en 25 min", "en 1 h 10 min", "ahora" */
function untilText(iso: string, now: number) {
  const m = Math.round((new Date(iso).getTime() - now) / 60000);
  if (m <= 0) return 'ahora';
  if (m < 60) return `en ${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `en ${h} h${r ? ` ${r} min` : ''}`;
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
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoFor = useRef<DayAppt | null>(null);
  const pos = featureOn(features, 'pos');
  const photos = featureOn(features, 'client_photos');

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewStaff, ownStaff]);

  useEffect(() => { setDay(null); load(); }, [load]);

  // Tiempo real y reloj: citas nuevas, fila y cobros desde otros dispositivos
  useEffect(() => {
    const proto = API_BASE_CLIENT.startsWith('https') ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${API_BASE_CLIENT.replace(/^https?:\/\//, '')}/api/ws?tenant=${tenant}`);
    ws.onmessage = (ev) => {
      try {
        const t = JSON.parse(ev.data).type;
        if (['availability_changed', 'queue_changed', 'sale_created', 'sale_voided'].includes(t)) load();
      } catch { /* */ }
    };
    const clock = setInterval(() => setNow(Date.now()), 30000);
    const poll = setInterval(load, 120000);
    return () => { ws.close(); clearInterval(clock); clearInterval(poll); };
  }, [tenant, load]);

  const appts = useMemo(() => day?.appointments ?? [], [day]);
  const next = appts.find((a) => OPEN.includes(a.status) && new Date(a.ends_at).getTime() > now) ?? null;
  const active = appts.filter((a) => a.status !== 'no_show');
  const done = appts.filter((a) => a.status === 'completed').length;
  const progress = active.length ? done / active.length : 0;

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
            {/* Turno de la fila que está atendiendo */}
            {day.tickets.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-xl border border-ink p-4 sm:gap-4">
                <span className="tnum flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-ink text-white">
                  <span className="text-[11px] font-medium opacity-70">Turno</span>
                  <span className="text-[20px] font-semibold leading-none">{t.number}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[13px] text-mute"><ListOrdered size={14} strokeWidth={1.75} /> {t.status === 'called' ? 'Llamado de la fila' : 'Atendiendo de la fila'}</p>
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
                <p className="mt-1 text-[15px] text-mute">{featureOn(features, 'queue') ? 'Los clientes de la fila te llegan aquí cuando te toque atenderlos.' : 'Las nuevas reservas aparecen aquí al instante.'}</p>
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

      <Lightbox images={photo ? [{ src: photo, alt: 'Último corte' }] : []} index={photo ? 0 : null} onClose={() => setPhoto(null)} />
    </>
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
