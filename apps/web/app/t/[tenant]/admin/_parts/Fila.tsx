'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Megaphone, UserPlus, Monitor, Copy, ExternalLink, RefreshCw, Printer, Trash2, Phone, Receipt, Check,
  UserX, Undo2, Armchair, ListOrdered, Loader2, Plus, CircleCheck, WifiOff, X, ChevronDown, Timer,
} from 'lucide-react';
import { useAdmin, useApi, soles } from './api';
import { PageHead, Btn, Drawer, Field, inputCls, Empty, Skeleton } from './ui';
import { StatTile } from '@/components/charts';
import { API_BASE_CLIENT, tenantUrl } from '@/lib/config';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import { queueError, useTenantSocket, fmtMinutes, type QueueState } from '../../tv/_lib/queue';
import { Qr, qrSvg } from '../../tv/_lib/Qr';

interface AdminTicket {
  id: string; number: number; name: string; phone: string | null; status: 'waiting' | 'called' | 'serving' | 'done' | 'cancelled' | 'no_show';
  staff_id: string | null; served_by: string | null; service_id: string | null; source: string; delays: number;
  created_at: string; called_at: string | null; started_at: string | null; finished_at: string | null;
  sale_id: string | null; service_name: string | null; price_cents: number | null; staff_name: string | null; served_by_name: string | null;
}
interface AdminQueue {
  tickets: AdminTicket[]; tvKey: string; features: Record<string, boolean>;
  stats: { atendidos: number; no_vinieron: number; espera_promedio_min: number }; estimatedWaitMin: number;
}
interface Me { me: { id: string; name: string | null; role: string; staffId: string | null } }
interface QueueCfg { noShowMinutes: number; autoNoShow: boolean }
interface FinishOut {
  finished: { kind: 'ticket' | 'appointment'; id: string; name: string | null; number: number | null } | null;
  charge: { appointmentId: string | null; ticketId: string | null; clientName: string | null; dueCents: number; needsService?: boolean } | null;
  next: { id: string; number: number; name: string; staffName: string } | null;
}
interface PendingCharge { name: string; href: string; dueCents: number; needsService: boolean }

const mins = (from: string | null, now: number) => (from ? Math.max(0, Math.floor((now - new Date(from).getTime()) / 60000)) : 0);
const STATUS: Record<AdminTicket['status'], [string, string]> = {
  waiting: ['En espera', 'bg-field text-mute'],
  called: ['Llamado', 'bg-[#fff4e0] text-[#8a5300]'],
  serving: ['Atendiendo', 'bg-[#e8eefb] text-[#1d3f94]'],
  done: ['Atendido', 'bg-ok-tint text-ok'],
  no_show: ['No vino', 'bg-red-tint text-red-deep'],
  cancelled: ['Salió de la fila', 'bg-field text-mute'],
};

export function Fila() {
  const { tenant } = useAdmin();
  const api = useApi();
  const [q, setQ] = useState<AdminQueue | null>(null);
  const [pub, setPub] = useState<QueueState | null>(null);
  const [me, setMe] = useState<Me['me'] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [calling, setCalling] = useState<string | null>(null);
  const [open, setOpen] = useState<AdminTicket | null>(null);
  const [walkIn, setWalkIn] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [error, setError] = useState(false);
  const [qCfg, setQCfg] = useState<QueueCfg>({ noShowMinutes: 10, autoNoShow: true });
  const [finishing, setFinishing] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingCharge | null>(null);

  const loadQueue = useCallback(async () => {
    try {
      const d = await api<AdminQueue>('/admin/queue');
      setQ(d);
      setError(false);
      setOpen((o) => (o ? d.tickets.find((t) => t.id === o.id) ?? null : o));
    } catch (e) {
      if ((e as Error).message !== 'no_autenticado') setError(true);
    }
    fetch(`${API_BASE_CLIENT}/api/public/queue`, { headers: { 'X-Tenant-Slug': tenant } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: QueueState | null) => d && setPub(d))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  const loadCfg = useCallback(() => {
    api<{ queue?: Partial<QueueCfg> }>('/admin/features')
      .then((d) => setQCfg({ noShowMinutes: d.queue?.noShowMinutes ?? 10, autoNoShow: d.queue?.autoNoShow !== false }))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadQueue();
    loadCfg();
    api<Me>('/admin/me').then((d) => setMe(d.me)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const online = useTenantSocket(
    tenant,
    (type) => {
      if (type === 'config_changed') loadCfg();
      if (type === 'queue_changed' || type === 'config_changed') loadQueue();
      if (type === 'sale_created') loadQueue();
    },
    () => { loadQueue(); },
  );

  // Reloj para "espera 12 min" y respaldo por si el WebSocket se cae
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === 'visible') loadQueue();
    }, 30000);
    return () => clearInterval(t);
  }, [loadQueue]);

  const staff = pub?.staff ?? [];
  const tickets = q?.tickets ?? [];
  const waiting = tickets.filter((t) => t.status === 'waiting');
  const inChair = tickets.filter((t) => t.status === 'called' || t.status === 'serving');
  const finished = tickets.filter((t) => ['done', 'no_show', 'cancelled'].includes(t.status));
  const waitingFor = (staffId: string) => waiting.filter((t) => !t.staff_id || t.staff_id === staffId).length;
  const callers = useMemo(() => {
    if (!me?.staffId) return staff;
    const mine = staff.find((s) => s.id === me.staffId);
    return mine ? [mine, ...staff.filter((s) => s.id !== me.staffId)] : staff;
  }, [staff, me?.staffId]);

  async function callNext(staffId: string) {
    setCalling(staffId);
    try {
      const out = await api<{ number: number; name: string; staffName: string }>('/admin/queue/next', { method: 'POST', body: { staffId } });
      haptic.success();
      toast.success(`Turno ${out.number}: ${out.name} pasa con ${out.staffName}`);
      loadQueue();
    } catch (e) {
      toast.error(queueError((e as Error).message));
    } finally {
      setCalling(null);
    }
  }

  // "Terminé y siguiente": cierra lo que atiende ese barbero, llama al siguiente y deja el cobro a un toque
  async function finishFor(staffId: string) {
    haptic.tap();
    setFinishing(staffId);
    try {
      const out = await api<FinishOut>('/admin/queue/finish', { method: 'POST', body: { staffId, callNext: true } });
      haptic.success();
      const done = out.finished ? `${out.finished.name ?? 'Cliente'} listo. ` : '';
      toast.success(out.next ? `${done}Turno ${out.next.number}: ${out.next.name} pasa con ${out.next.staffName}` : `${done}No hay nadie en la fila`);
      const c = out.charge;
      if (q?.features.pos && c && (c.dueCents > 0 || c.needsService)) {
        setPending({
          name: c.clientName ?? out.finished?.name ?? 'Cliente',
          href: c.appointmentId ? `#caja?cita=${c.appointmentId}` : `#caja?ticket=${c.ticketId}`,
          dueCents: c.dueCents,
          needsService: !!c.needsService,
        });
      }
      loadQueue();
    } catch (e) {
      const code = (e as Error).message;
      if (code === 'nada_que_cerrar') toast.info('No hay nada que cerrar ni nadie esperando.');
      else if (code === 'sin_permiso') toast.error('Solo puedes cerrar tus propios clientes.');
      else toast.error(queueError(code));
    } finally {
      setFinishing(null);
    }
  }

  // ---------------------------- Estados ----------------------------
  if (error && !q) {
    return (
      <>
        <PageHead title="Fila" />
        <Empty icon={WifiOff} title="No pudimos cargar la fila" body="Revisa tu conexión e inténtalo de nuevo." action={<Btn onClick={loadQueue}>Reintentar</Btn>} />
      </>
    );
  }
  if (!q) {
    return (
      <>
        <PageHead title="Fila" />
        <Skeleton rows={5} />
      </>
    );
  }
  if (!q.features.queue) {
    return (
      <>
        <PageHead title="Fila" />
        <Empty
          icon={ListOrdered}
          title="La fila virtual está apagada"
          body="Tus clientes escanean un QR en la puerta, sacan su turno y esperan donde quieran. Tú los llamas con un toque y la pantalla del local los anuncia. Enciéndela en Funciones."
          action={<a href="#funciones" className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[14px] font-medium text-white hover:bg-ink-2">Ir a Funciones</a>}
        />
      </>
    );
  }

  const tvUrl = tenantUrl(tenant, `/tv?k=${q.tvKey}`);
  const filaUrl = tenantUrl(tenant, '/fila');

  return (
    <>
      <PageHead
        title="Fila"
        sub={online ? 'Clientes sin cita en orden de llegada. Se actualiza sola.' : 'Reconectando, los datos pueden tardar unos segundos.'}
        actions={
          <>
            <Btn variant="secondary" onClick={() => window.open(tvUrl, '_blank', 'noopener')}><Monitor size={16} strokeWidth={1.75} /> Abrir pantalla</Btn>
            <Btn variant="secondary" onClick={() => setWalkIn(true)}><UserPlus size={16} strokeWidth={1.75} /> Agregar con celular</Btn>
          </>
        }
      />

      <QuickAdd pub={pub} api={api} reload={loadQueue} />

      {pending && (
        <div className="rise-in mb-6 flex items-center gap-3 rounded-xl border border-ink p-3 pl-4" role="status">
          <Receipt size={20} strokeWidth={1.75} className="shrink-0" />
          <p className="min-w-0 flex-1 text-[15px]">
            <span className="font-medium">{pending.name}</span>{' '}
            <span className="text-mute">{pending.needsService ? 'terminó, falta elegir el servicio y cobrar' : <>terminó, falta cobrar <span className="tnum">{soles(pending.dueCents)}</span></>}</span>
          </p>
          <a href={pending.href} onClick={() => setPending(null)} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-ink px-4 text-[14px] font-medium text-white hover:bg-ink-2">Cobrar</a>
          <button type="button" onClick={() => setPending(null)} aria-label="Cerrar aviso" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-field">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
      )}

      {/* Llamar al siguiente */}
      <section className="mb-8">
        {callers.length === 0 ? (
          <p className="text-[15px] text-mute">Agrega barberos en Equipo para llamar clientes.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {callers.map((s, i) => {
              const n = waitingFor(s.id);
              const self = me?.staffId === s.id;
              const busy = inChair.find((t) => t.served_by === s.id);
              const primary = self || (!me?.staffId && i === 0 && callers.length === 1);
              // Un barbero solo puede cerrar lo suyo; dueño, encargado y caja cierran por cualquiera
              const canFinish = me?.role !== 'staff' || self;
              return (
                <div key={s.id} className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => callNext(s.id)}
                  disabled={!!calling || n === 0}
                  className={`flex min-h-[72px] items-center gap-3 rounded-xl px-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-45 ${primary ? 'bg-ink text-white hover:bg-ink-2' : 'border border-line hover:border-ink'}`}
                >
                  {s.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.photo_url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold ${primary ? 'bg-white/15' : 'bg-field'}`}>{s.name.charAt(0)}</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-semibold tracking-[-0.02em]">{self ? 'Llamar al siguiente' : `Llamar para ${s.name}`}</span>
                    <span className={`block truncate text-[13px] ${primary ? 'text-white/70' : 'text-mute'}`}>
                      {n === 0 ? 'Nadie esperando' : n === 1 ? '1 puede pasar' : `${n} pueden pasar`}
                      {busy ? `, ahora con el ${busy.number}` : ''}
                    </span>
                  </span>
                  {calling === s.id ? <Loader2 size={20} className="animate-spin" /> : <Megaphone size={20} strokeWidth={1.75} />}
                </button>
                {canFinish && (
                  <button
                    type="button"
                    onClick={() => finishFor(s.id)}
                    disabled={!!finishing || !!calling}
                    className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-line px-4 text-[14px] font-medium transition-colors hover:border-ink disabled:opacity-45"
                  >
                    {finishing === s.id ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2} />}
                    {busy ? `Terminé con el ${busy.number} y siguiente` : 'Terminé y siguiente'}
                  </button>
                )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="En espera" value={String(waiting.length)} sub={waiting.length ? `Espera aprox. ${fmtMinutes(q.estimatedWaitMin)}` : 'Sin espera'} />
        <StatTile label="Atendidos hoy" value={String(q.stats.atendidos)} />
        <StatTile label="No vinieron" value={String(q.stats.no_vinieron)} />
        <StatTile label="Espera promedio" value={fmtMinutes(q.stats.espera_promedio_min)} sub="Desde que sacan turno hasta el sillón" />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-10">
          <TicketGroup title="En el sillón" empty="Nadie llamado todavía." items={inChair} now={now} onOpen={setOpen} api={api} reload={loadQueue} pos={!!q.features.pos} noShowMin={qCfg.autoNoShow ? qCfg.noShowMinutes : null} />
          <TicketGroup title="En espera" empty="No hay nadie en la fila. Comparte el QR o agrega a quien llegue." items={waiting} now={now} onOpen={setOpen} api={api} reload={loadQueue} pos={!!q.features.pos} noShowMin={qCfg.autoNoShow ? qCfg.noShowMinutes : null} />
          {finished.length > 0 && (
            <details className="border-t border-line">
              <summary className="flex min-h-[52px] items-center justify-between text-[15px] font-medium">
                Terminados hoy <span className="flex items-center gap-2 text-mute"><span className="tnum">{finished.length}</span><Plus size={18} strokeWidth={1.75} className="acc-icon" /></span>
              </summary>
              <div className="acc-body"><div>
                <TicketGroup title="" empty="" items={finished} now={now} onOpen={setOpen} api={api} reload={loadQueue} pos={!!q.features.pos} noShowMin={qCfg.autoNoShow ? qCfg.noShowMinutes : null} />
              </div></div>
            </details>
          )}
        </div>

        <aside className="space-y-6">
          <TvCard tvUrl={tvUrl} filaUrl={filaUrl} tvOn={q.features.tv !== false} pub={pub} onRotate={me && (me.role === 'owner' || me.role === 'manager') ? () => setRotateOpen(true) : undefined} />
        </aside>
      </div>

      <TicketDrawer ticket={open} onClose={() => setOpen(null)} staff={staff} me={me} now={now} api={api} reload={loadQueue} pos={!!q.features.pos} />
      <WalkInDrawer open={walkIn} onClose={() => setWalkIn(false)} pub={pub} api={api} reload={loadQueue} />
      <Drawer
        open={rotateOpen}
        onClose={() => setRotateOpen(false)}
        title="Cambiar llave de la pantalla"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setRotateOpen(false)}>Cancelar</Btn>
            <Btn
              onClick={async () => {
                try {
                  await api('/admin/tv/rotate-key', { method: 'POST' });
                  toast.success('Llave cambiada. Abre el enlace nuevo en tu TV.');
                  setRotateOpen(false);
                  loadQueue();
                } catch {
                  toast.error('No se pudo cambiar la llave.');
                }
              }}
            >
              Cambiar llave
            </Btn>
          </>
        }
      >
        <p className="text-[15px] text-ink-2">El enlace actual de la pantalla deja de funcionar. Úsalo si alguien que no debe tiene el enlace. Después abre el enlace nuevo en tu TV.</p>
      </Drawer>
    </>
  );
}

type Api = ReturnType<typeof useApi>;

// ------------------------------- Lista de turnos -------------------------------
function TicketGroup({ title, empty, items, now, onOpen, api, reload, pos, noShowMin }: {
  title: string; empty: string; items: AdminTicket[]; now: number; onOpen: (t: AdminTicket) => void; api: Api; reload: () => void; pos: boolean;
  /** Minutos para pasar a "no vino" si el aviso automático está activo. */
  noShowMin: number | null;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  async function patch(t: AdminTicket, body: Record<string, unknown>, msg: string) {
    setBusy(t.id);
    try {
      await api(`/admin/queue/${t.id}`, { method: 'PATCH', body });
      haptic.success();
      toast.success(msg);
      reload();
    } catch {
      toast.error('No se pudo actualizar.');
    } finally {
      setBusy(null);
    }
  }
  return (
    <section>
      {title && <h2 className="mb-2 flex items-baseline gap-2 text-[17px] font-semibold tracking-[-0.02em]">{title} <span className="tnum text-[14px] font-normal text-mute">{items.length}</span></h2>}
      {items.length === 0 ? (
        empty && <p className="rounded-xl border border-dashed border-line-2 px-4 py-5 text-[15px] text-mute">{empty}</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {items.map((t) => {
            const [label, cls] = STATUS[t.status];
            const since = t.status === 'waiting' ? mins(t.created_at, now) : t.status === 'called' ? mins(t.called_at ?? t.created_at, now) : t.status === 'serving' ? mins(t.started_at, now) : null;
            const who = t.served_by_name ?? t.staff_name;
            return (
              <li key={t.id} className="flex items-center gap-3 py-3">
                <button type="button" onClick={() => onOpen(t)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left">
                  <span className={`tnum flex h-12 min-w-12 items-center justify-center rounded-lg px-2 text-[20px] font-semibold ${t.status === 'called' ? 'bg-ink text-white' : 'bg-field'}`}>{t.number}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-medium">{t.name}</span>
                      <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium sm:inline-flex ${cls}`}>{label}</span>
                    </span>
                    {t.status === 'called' && noShowMin != null && t.called_at && <NoShowLeft calledAt={t.called_at} minutes={noShowMin} />}
                    <span className="block truncate text-[13px] text-mute">
                      {[t.service_name, who ? (t.status === 'waiting' ? `pidió a ${who}` : who) : t.status === 'waiting' ? 'el primero libre' : null, since != null ? (t.status === 'waiting' ? `espera ${fmtMinutes(since)}` : t.status === 'called' ? `llamado hace ${fmtMinutes(since)}` : `hace ${fmtMinutes(since)}`) : null, t.delays ? 'pidió tiempo' : null].filter(Boolean).join(', ')}
                    </span>
                  </span>
                </button>
                {t.status === 'called' && (
                  <Btn variant="secondary" busy={busy === t.id} onClick={() => patch(t, { status: 'serving' }, `Atendiendo el turno ${t.number}`)} className="shrink-0">
                    <Armchair size={16} strokeWidth={1.75} /> <span className="hidden sm:inline">Atendiendo</span>
                  </Btn>
                )}
                {t.status === 'serving' && (
                  <>
                    {pos && !t.sale_id && (
                      <a href={`#caja?ticket=${t.id}`} className="hidden shrink-0 items-center gap-2 rounded-full border border-line px-4 py-2.5 text-[14px] font-medium hover:border-ink sm:inline-flex">
                        <Receipt size={16} strokeWidth={1.75} /> Cobrar
                      </a>
                    )}
                    <Btn busy={busy === t.id} onClick={() => patch(t, { status: 'done' }, `Turno ${t.number} listo`)} className="shrink-0">
                      <Check size={16} strokeWidth={2} /> Listo
                    </Btn>
                  </>
                )}
                {t.status === 'done' && pos && !t.sale_id && (
                  <a href={`#caja?ticket=${t.id}`} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-line px-4 py-2.5 text-[14px] font-medium hover:border-ink">
                    <Receipt size={16} strokeWidth={1.75} /> Cobrar
                  </a>
                )}
                {t.status === 'done' && t.sale_id && <span className="flex shrink-0 items-center gap-1 text-[13px] text-ok"><CircleCheck size={15} strokeWidth={1.75} /> Cobrado</span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** "Pasa a no vino en 4:32", con segundos en vivo. */
function NoShowLeft({ calledAt, minutes }: { calledAt: string; minutes: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.ceil((new Date(calledAt).getTime() + minutes * 60000 - now) / 1000));
  return (
    <span className="flex items-center gap-1 text-[13px] font-medium text-[#8a5300]">
      <Timer size={13} strokeWidth={1.75} />
      {left > 0 ? <span>Pasa a no vino en <span className="tnum">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span></span> : 'Pasando a no vino'}
    </span>
  );
}

// ------------------------------- Anotar rápido -------------------------------
/** Anotar a quien llega en un segundo: nombre, Enter y listo para el siguiente. */
function QuickAdd({ pub, api, reload }: { pub: QueueState | null; api: Api; reload: () => void }) {
  const [name, setName] = useState('');
  const [more, setMore] = useState(false);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const services = pub?.services ?? [];
  const staff = pub?.staff ?? [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) {
      inputRef.current?.focus();
      return;
    }
    if (busy) return;
    haptic.tap();
    setBusy(true);
    try {
      const out = await api<{ number: number }>('/admin/queue', { method: 'POST', body: { name: n, ...(serviceId ? { serviceId } : {}), ...(staffId ? { staffId } : {}) } });
      toast.success(`Turno ${out.number} para ${n}`);
      setName('');
      setServiceId(null);
      setStaffId(null);
      reload();
    } catch (err) {
      toast.error(queueError((err as Error).message));
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  const chip = (on: boolean) => `min-h-11 rounded-full px-4 text-[15px] transition-colors ${on ? 'bg-ink text-white' : 'bg-field text-ink hover:bg-line'}`;
  const extras = services.length > 0 || staff.length > 0;

  return (
    <form onSubmit={submit} className="mb-6">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          autoCapitalize="words"
          autoComplete="off"
          enterKeyHint="done"
          aria-label="Nombre de quien llegó"
          placeholder="Nombre de quien llegó"
          className="min-h-12 w-full min-w-0 flex-1 rounded-full border border-line-2 bg-white px-5 text-[16px] outline-none transition-colors focus:border-ink"
        />
        <button type="submit" disabled={busy} className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-medium text-white hover:bg-ink-2 disabled:opacity-60">
          {busy ? <Loader2 size={17} className="animate-spin" /> : <Plus size={17} strokeWidth={2} />} Anotar
        </button>
      </div>
      {extras && (
        <button type="button" onClick={() => { haptic.tap(); setMore((m) => !m); }} aria-expanded={more} className="mt-1 inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-[14px] font-medium text-mute hover:bg-field hover:text-ink">
          Más opciones{serviceId || staffId ? ' (elegidas)' : ''} <ChevronDown size={16} strokeWidth={1.75} className={`transition-transform duration-200 ${more ? 'rotate-180' : ''}`} />
        </button>
      )}
      {more && extras && (
        <div className="fade-in mt-2 space-y-4 rounded-xl border border-line p-4">
          {services.length > 0 && (
            <div>
              <p className="mb-2 text-[14px] font-medium">Servicio</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Servicio">
                <button type="button" role="radio" aria-checked={!serviceId} onClick={() => setServiceId(null)} className={chip(!serviceId)}>Sin elegir</button>
                {services.map((s) => (
                  <button key={s.id} type="button" role="radio" aria-checked={serviceId === s.id} onClick={() => { haptic.select(); setServiceId(s.id); }} className={chip(serviceId === s.id)}>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {staff.length > 0 && (
            <div>
              <p className="mb-2 text-[14px] font-medium">Barbero</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Barbero">
                <button type="button" role="radio" aria-checked={!staffId} onClick={() => setStaffId(null)} className={chip(!staffId)}>El primero libre</button>
                {staff.map((s) => (
                  <button key={s.id} type="button" role="radio" aria-checked={staffId === s.id} onClick={() => { haptic.select(); setStaffId(s.id); }} className={chip(staffId === s.id)}>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </form>
  );
}

// ------------------------------- Detalle del turno -------------------------------
function TicketDrawer({ ticket: t, onClose, staff, me, now, api, reload, pos }: {
  ticket: AdminTicket | null; onClose: () => void; staff: QueueState['staff']; me: Me['me'] | null; now: number; api: Api; reload: () => void; pos: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [barber, setBarber] = useState<string | null>(null);
  useEffect(() => {
    setBarber(t ? t.served_by ?? t.staff_id ?? me?.staffId ?? staff[0]?.id ?? null : null);
  }, [t?.id, t?.served_by, t?.staff_id, me?.staffId, staff]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!t) return <Drawer open={false} onClose={onClose} title=""><span /></Drawer>;

  async function run(key: string, fn: () => Promise<unknown>, msg: string, close = false) {
    setBusy(key);
    try {
      await fn();
      haptic.success();
      toast.success(msg);
      reload();
      if (close) onClose();
    } catch (e) {
      toast.error(queueError((e as Error).message));
    } finally {
      setBusy(null);
    }
  }
  const patch = (body: Record<string, unknown>) => api(`/admin/queue/${t.id}`, { method: 'PATCH', body });
  const barberName = staff.find((s) => s.id === barber)?.name;
  const active = ['waiting', 'called', 'serving'].includes(t.status);
  const row = 'flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] font-medium hover:bg-field disabled:opacity-40';

  return (
    <Drawer open onClose={onClose} title={`Turno ${t.number}, ${t.name}`}>
      <dl className="space-y-2 text-[15px]">
        <div className="flex justify-between gap-4"><dt className="text-mute">Estado</dt><dd>{STATUS[t.status][0]}</dd></div>
        {t.service_name && <div className="flex justify-between gap-4"><dt className="text-mute">Servicio</dt><dd>{t.service_name}{t.price_cents != null ? `, ${soles(t.price_cents)}` : ''}</dd></div>}
        <div className="flex justify-between gap-4"><dt className="text-mute">Pidió</dt><dd>{t.staff_name ?? 'El primero libre'}</dd></div>
        {t.served_by_name && <div className="flex justify-between gap-4"><dt className="text-mute">Lo atiende</dt><dd>{t.served_by_name}</dd></div>}
        <div className="flex justify-between gap-4"><dt className="text-mute">Llegó</dt><dd className="tnum">hace {fmtMinutes(mins(t.created_at, now))}, {t.source === 'front' ? 'en recepción' : 'con el QR'}</dd></div>
        {t.phone && (
          <div className="flex justify-between gap-4"><dt className="text-mute">Celular</dt><dd><a href={`tel:${t.phone}`} className="inline-flex items-center gap-1.5 underline underline-offset-4"><Phone size={14} strokeWidth={1.75} />{t.phone}</a></dd></div>
        )}
      </dl>

      {active && staff.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 text-[14px] font-medium">{t.status === 'waiting' ? 'Barbero' : 'Lo atiende'}</div>
          <div className="flex flex-wrap gap-2">
            {t.status === 'waiting' && (
              <button type="button" onClick={() => run('staff', () => patch({ staffId: null }), 'Ahora pasa con el primero libre')} className={`min-h-[40px] rounded-full px-4 text-[14px] ${!t.staff_id ? 'bg-ink text-white' : 'bg-field hover:bg-line'}`}>El primero libre</button>
            )}
            {staff.map((s) => {
              const on = barber === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    haptic.select();
                    setBarber(s.id);
                    if (t.status === 'waiting') run('staff', () => patch({ staffId: s.id }), `Ahora espera a ${s.name}`);
                    else run('staff', () => patch({ servedBy: s.id }), `Ahora lo atiende ${s.name}`);
                  }}
                  className={`min-h-[40px] rounded-full px-4 text-[14px] ${on && (t.status !== 'waiting' || t.staff_id === s.id) ? 'bg-ink text-white' : 'bg-field hover:bg-line'}`}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-6 space-y-1 border-t border-line pt-4">
        {t.status === 'waiting' && (
          <button
            type="button"
            className={row}
            disabled={!barber || !!busy}
            onClick={() => run('call', async () => { await patch({ status: 'called', servedBy: barber }); await api(`/admin/queue/${t.id}/recall`, { method: 'POST' }); }, `Llamaste al turno ${t.number}`)}
          >
            {busy === 'call' ? <Loader2 size={18} className="animate-spin" /> : <Megaphone size={18} strokeWidth={1.75} />} Llamar ahora{barberName ? ` con ${barberName}` : ''}
          </button>
        )}
        {t.status === 'called' && (
          <>
            <button type="button" className={row} disabled={!!busy} onClick={() => run('recall', () => api(`/admin/queue/${t.id}/recall`, { method: 'POST' }), 'Anunciado de nuevo en la pantalla')}>
              <Megaphone size={18} strokeWidth={1.75} /> Volver a llamar
            </button>
            <button type="button" className={row} disabled={!!busy} onClick={() => run('serving', () => patch({ status: 'serving' }), 'Atendiendo')}>
              <Armchair size={18} strokeWidth={1.75} /> Atendiendo
            </button>
          </>
        )}
        {t.status === 'serving' && (
          <>
            <button type="button" className={row} disabled={!!busy} onClick={() => run('done', () => patch({ status: 'done' }), `Turno ${t.number} listo`, true)}>
              <Check size={18} strokeWidth={2} /> Listo
            </button>
            {pos && !t.sale_id && (
              <a href={`#caja?ticket=${t.id}`} onClick={onClose} className={row}><Receipt size={18} strokeWidth={1.75} /> Cobrar</a>
            )}
          </>
        )}
        {t.status === 'done' && pos && !t.sale_id && (
          <a href={`#caja?ticket=${t.id}`} onClick={onClose} className={row}><Receipt size={18} strokeWidth={1.75} /> Cobrar</a>
        )}
        {(t.status === 'called' || t.status === 'serving' || t.status === 'no_show' || t.status === 'cancelled') && (
          <button type="button" className={row} disabled={!!busy} onClick={() => run('back', () => patch({ status: 'waiting' }), 'Volvió a la fila')}>
            <Undo2 size={18} strokeWidth={1.75} /> Devolver a la fila
          </button>
        )}
        {(t.status === 'called' || t.status === 'waiting') && (
          <button type="button" className={`${row} text-red hover:bg-red-tint`} disabled={!!busy} onClick={() => run('noshow', () => patch({ status: 'no_show' }), 'Marcado como no vino', true)}>
            <UserX size={18} strokeWidth={1.75} /> No vino
          </button>
        )}
        {t.status === 'waiting' && (
          <button type="button" className={`${row} text-red hover:bg-red-tint`} disabled={!!busy} onClick={() => run('cancel', () => patch({ status: 'cancelled' }), 'Quitado de la fila', true)}>
            <Trash2 size={18} strokeWidth={1.75} /> Quitar de la fila
          </button>
        )}
      </div>
    </Drawer>
  );
}

// ------------------------------- Agregar cliente -------------------------------
function WalkInDrawer({ open, onClose, pub, api, reload }: { open: boolean; onClose: () => void; pub: QueueState | null; api: Api; reload: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [staffId, setStaffId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) { setName(''); setPhone(''); setServiceId(''); setStaffId(null); }
  }, [open]);

  async function save() {
    if (!name.trim()) return toast.error('Escribe el nombre.');
    setBusy(true);
    try {
      const digits = phone.replace(/\D/g, '');
      const out = await api<{ number: number }>('/admin/queue', {
        method: 'POST',
        body: { name: name.trim(), ...(digits ? { phone: `+51${digits.slice(-9)}` } : {}), ...(serviceId ? { serviceId } : {}), ...(staffId ? { staffId } : {}) },
      });
      toast.success(`${name.trim()} tiene el turno ${out.number}`);
      reload();
      onClose();
    } catch {
      toast.error('No se pudo agregar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Agregar a la fila"
      footer={<><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn onClick={save} busy={busy}>Dar turno</Btn></>}
    >
      <div className="space-y-5">
        <Field label="Nombre"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoCapitalize="words" className={inputCls} placeholder="Como se llamará en la pantalla" /></Field>
        <Field label="Celular (opcional)" hint="Si lo das, puede seguir su turno y recibir avisos.">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={`${inputCls} tnum`} placeholder="987 654 321" />
        </Field>
        {pub && pub.services.length > 0 && (
          <Field label="Servicio (opcional)">
            <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className={inputCls}>
              <option value="">Sin elegir</option>
              {pub.services.map((s) => <option key={s.id} value={s.id}>{s.name}, {soles(s.price_cents)}</option>)}
            </select>
          </Field>
        )}
        {pub && pub.staff.length > 0 && (
          <div>
            <div className="mb-1.5 text-[14px] font-medium">Barbero</div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setStaffId(null)} className={`min-h-[40px] rounded-full px-4 text-[14px] ${!staffId ? 'bg-ink text-white' : 'bg-field hover:bg-line'}`}>El primero libre</button>
              {pub.staff.map((s) => (
                <button key={s.id} type="button" onClick={() => setStaffId(s.id)} className={`min-h-[40px] rounded-full px-4 text-[14px] ${staffId === s.id ? 'bg-ink text-white' : 'bg-field hover:bg-line'}`}>{s.name}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}

// ------------------------------- Pantalla y cartel -------------------------------
function TvCard({ tvUrl, filaUrl, tvOn, pub, onRotate }: { tvUrl: string; filaUrl: string; tvOn: boolean; pub: QueueState | null; onRotate?: () => void }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(tvUrl);
      haptic.success();
      toast.success('Enlace copiado');
    } catch {
      toast.error('No se pudo copiar. Selecciona el enlace y cópialo.');
    }
  }

  async function printPoster() {
    const w = window.open('', '_blank', 'width=820,height=1100');
    if (!w) return toast.error('Permite las ventanas emergentes para imprimir el cartel.');
    const svg = await qrSvg(filaUrl, '#0a0a0a', '#ffffff', 0);
    const name = pub?.tenant.name ?? 'Nuestra barbería';
    const brand = pub?.branding?.color_primary ?? '#0a0a0a';
    const logo = pub?.branding?.logo_url ? new URL(pub.branding.logo_url, filaUrl).toString() : '';
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
    const host = filaUrl.replace(/^https?:\/\//, '');
    w.document.write(`<!doctype html><html lang="es-PE"><head><meta charset="utf-8"><title>Cartel QR, ${esc(name)}</title>
<style>
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Figtree, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif; color: #0a0a0a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 210mm; height: 297mm; display: flex; flex-direction: column; align-items: center; padding: 22mm 18mm 16mm; text-align: center; }
.band { width: 100%; height: 10mm; border-radius: 6mm; background: ${brand}; }
.brand { margin-top: 14mm; display: flex; align-items: center; gap: 5mm; }
.brand img { width: 18mm; height: 18mm; border-radius: 50%; object-fit: cover; }
.brand span { font-size: 30pt; font-weight: 600; letter-spacing: -0.03em; }
h1 { margin: 12mm 0 0; font-size: 40pt; line-height: 1.02; font-weight: 600; letter-spacing: -0.04em; max-width: 160mm; }
.qr { margin-top: 12mm; width: 120mm; height: 120mm; padding: 6mm; border: 0.6mm solid #e6e6e9; border-radius: 8mm; }
.qr svg { width: 100%; height: 100%; display: block; }
.steps { margin-top: 10mm; font-size: 15pt; color: #5f5f66; line-height: 1.5; }
.url { margin-top: 4mm; font-size: 14pt; font-weight: 600; }
.foot { margin-top: auto; font-size: 10pt; color: #71717a; }
</style></head><body><div class="page">
<div class="band"></div>
<div class="brand">${logo ? `<img src="${esc(logo)}" alt="">` : ''}<span>${esc(name)}</span></div>
<h1>Escanea y saca tu turno sin hacer fila</h1>
<div class="qr">${svg}</div>
<div class="steps">Abre la cámara de tu celular, apunta al código y te avisamos cuando te toque.</div>
<div class="url">${esc(host)}</div>
<div class="foot">Fila virtual con date.pe</div>
</div><script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`);
    w.document.close();
  }

  return (
    <section className="rounded-xl border border-line p-5">
      <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.02em]"><Monitor size={18} strokeWidth={1.75} /> Pantalla del local</h2>
      {!tvOn && <p className="mt-2 rounded-lg bg-field px-3 py-2 text-[13px] text-mute">La pantalla de TV está apagada. Actívala en <a href="#funciones" className="underline underline-offset-4">Funciones</a>.</p>}
      <p className="mt-2 text-[14px] text-mute">Abre este enlace en el navegador de tu Smart TV o en una laptop conectada al TV. La primera vez toca la pantalla para activar el sonido.</p>
      <div className="mt-4 flex items-center gap-2 rounded-xl bg-field py-1.5 pl-3 pr-1.5">
        <span className="min-w-0 flex-1 truncate text-[14px] text-ink-2" title={tvUrl}>{tvUrl.replace(/^https?:\/\//, '')}</span>
        <button type="button" onClick={copy} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-white" aria-label="Copiar enlace de la pantalla">
          <Copy size={17} strokeWidth={1.75} />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Btn variant="secondary" onClick={() => window.open(tvUrl, '_blank', 'noopener')}><ExternalLink size={16} strokeWidth={1.75} /> Abrir pantalla</Btn>
        {onRotate && <Btn variant="ghost" onClick={onRotate}><RefreshCw size={16} strokeWidth={1.75} /> Cambiar llave</Btn>}
      </div>

      <div className="mt-6 flex items-center gap-4 border-t border-line pt-5">
        <div className="w-24 shrink-0 rounded-lg border border-line p-1.5"><Qr value={filaUrl} label="QR de la fila virtual" /></div>
        <div className="min-w-0">
          <div className="text-[15px] font-medium">QR de la fila</div>
          <p className="text-[13px] text-mute">Pégalo en la puerta y el espejo. Lleva a {filaUrl.replace(/^https?:\/\//, '')}</p>
          <Btn variant="secondary" onClick={printPoster} className="mt-2"><Printer size={16} strokeWidth={1.75} /> Imprimir cartel</Btn>
        </div>
      </div>
    </section>
  );
}
