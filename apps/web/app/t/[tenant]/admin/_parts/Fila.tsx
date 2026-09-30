'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Megaphone, UserPlus, Monitor, Copy, ExternalLink, RefreshCw, Printer, Music2, SkipForward, Trash2, Phone, Receipt, Check,
  UserX, Undo2, Armchair, ListOrdered, Loader2, Plus, CircleCheck, WifiOff,
} from 'lucide-react';
import { useAdmin, useApi, soles } from './api';
import { PageHead, Btn, Drawer, Field, inputCls, Empty, Skeleton } from './ui';
import { StatTile } from '@/components/charts';
import { API_BASE_CLIENT, tenantUrl } from '@/lib/config';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import { musicError, queueError, useTenantSocket, fmtMinutes, type QueueState, type Song } from '../../tv/_lib/queue';
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
interface MusicAdmin { nowPlaying: Song | null; upNext: Song[]; history: Array<{ id: string; title: string; requested_by: string; status: string }> }

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
  const [music, setMusic] = useState<MusicAdmin | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [calling, setCalling] = useState<string | null>(null);
  const [open, setOpen] = useState<AdminTicket | null>(null);
  const [walkIn, setWalkIn] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [error, setError] = useState(false);

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

  const loadMusic = useCallback(async () => {
    try {
      setMusic(await api<MusicAdmin>('/admin/music'));
    } catch { /* sin permiso o apagada */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadQueue();
    api<Me>('/admin/me').then((d) => setMe(d.me)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const musicOn = !!q?.features.music;
  useEffect(() => {
    if (musicOn) loadMusic();
  }, [musicOn, loadMusic]);

  const online = useTenantSocket(
    tenant,
    (type) => {
      if (type === 'queue_changed' || type === 'config_changed') loadQueue();
      if (type === 'music_changed' && musicOn) loadMusic();
      if (type === 'sale_created') loadQueue();
    },
    () => { loadQueue(); if (musicOn) loadMusic(); },
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
            <Btn onClick={() => setWalkIn(true)}><UserPlus size={16} strokeWidth={1.75} /> Agregar cliente</Btn>
          </>
        }
      />

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
              return (
                <button
                  key={s.id}
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
          <TicketGroup title="En el sillón" empty="Nadie llamado todavía." items={inChair} now={now} onOpen={setOpen} api={api} reload={loadQueue} pos={!!q.features.pos} />
          <TicketGroup title="En espera" empty="No hay nadie en la fila. Comparte el QR o agrega a quien llegue." items={waiting} now={now} onOpen={setOpen} api={api} reload={loadQueue} pos={!!q.features.pos} />
          {finished.length > 0 && (
            <details className="border-t border-line">
              <summary className="flex min-h-[52px] items-center justify-between text-[15px] font-medium">
                Terminados hoy <span className="flex items-center gap-2 text-mute"><span className="tnum">{finished.length}</span><Plus size={18} strokeWidth={1.75} className="acc-icon" /></span>
              </summary>
              <div className="acc-body"><div>
                <TicketGroup title="" empty="" items={finished} now={now} onOpen={setOpen} api={api} reload={loadQueue} pos={!!q.features.pos} />
              </div></div>
            </details>
          )}
        </div>

        <aside className="space-y-6">
          <TvCard tvUrl={tvUrl} filaUrl={filaUrl} tvOn={q.features.tv !== false} pub={pub} onRotate={me && (me.role === 'owner' || me.role === 'manager') ? () => setRotateOpen(true) : undefined} />
          {musicOn && <MusicCard music={music} api={api} reload={loadMusic} searchEnabled={!!pub?.musicConfig.searchEnabled} />}
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
        <p className="text-[15px] text-ink-2">El enlace actual deja de controlar la música. Úsalo si alguien que no debe tiene el enlace de la pantalla. Después abre el enlace nuevo en tu TV.</p>
      </Drawer>
    </>
  );
}

type Api = ReturnType<typeof useApi>;

// ------------------------------- Lista de turnos -------------------------------
function TicketGroup({ title, empty, items, now, onOpen, api, reload, pos }: {
  title: string; empty: string; items: AdminTicket[]; now: number; onOpen: (t: AdminTicket) => void; api: Api; reload: () => void; pos: boolean;
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

// ------------------------------- Música -------------------------------
function MusicCard({ music, api, reload, searchEnabled }: { music: MusicAdmin | null; api: Api; reload: () => void; searchEnabled: boolean }) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  async function run(key: string, fn: () => Promise<unknown>, msg: string) {
    setBusy(key);
    try {
      await fn();
      toast.success(msg);
      reload();
      return true;
    } catch (e) {
      toast.error(musicError((e as Error).message));
      return false;
    } finally {
      setBusy(null);
    }
  }

  const now = music?.nowPlaying ?? null;
  const upNext = music?.upNext ?? [];
  return (
    <section className="rounded-xl border border-line p-5">
      <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.02em]"><Music2 size={18} strokeWidth={1.75} /> Música</h2>
      <p className="mt-1 text-[14px] text-mute">Los clientes con turno piden canciones y suenan en la pantalla.</p>

      {now ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-field p-3">
          {now.thumbnail && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={now.thumbnail} alt="" className="aspect-video w-20 shrink-0 rounded-lg object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-medium text-mute">Sonando ahora</div>
            <div className="line-clamp-2 text-[14px] font-medium leading-snug">{now.title}</div>
            <div className="truncate text-[12px] text-mute">Pedida por {now.requested_by}</div>
          </div>
          <button type="button" onClick={() => run('skip', () => api(`/admin/music/${now.id}/skip`, { method: 'POST' }), 'Canción saltada')} disabled={!!busy} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white disabled:opacity-40" aria-label="Saltar canción">
            {busy === 'skip' ? <Loader2 size={18} className="animate-spin" /> : <SkipForward size={18} strokeWidth={1.75} />}
          </button>
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-field px-3 py-3 text-[14px] text-mute">No suena nada. {upNext.length ? 'La pantalla pondrá la siguiente al abrirse.' : 'Pon una canción o espera los pedidos.'}</p>
      )}

      <form
        className="mt-4 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (query.trim().length < 2) return;
          if (await run('add', () => api('/admin/music', { method: 'POST', body: { query: query.trim() } }), 'Canción agregada')) setQuery('');
        }}
      >
        <input value={query} onChange={(e) => setQuery(e.target.value)} className={inputCls} placeholder={searchEnabled ? 'Canción, artista o enlace' : 'Pega un enlace de YouTube'} aria-label="Poner una canción" />
        <Btn type="submit" busy={busy === 'add'} disabled={query.trim().length < 2} className="shrink-0">Poner</Btn>
      </form>

      {upNext.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <h3 className="text-[14px] font-medium">A continuación <span className="tnum font-normal text-mute">{upNext.length}</span></h3>
            <button type="button" onClick={() => setConfirmClear(true)} className="min-h-[36px] rounded-full px-3 text-[13px] font-medium text-red hover:bg-red-tint">Vaciar lista</button>
          </div>
          <ol className="mt-1 divide-y divide-line">
            {upNext.map((s) => (
              <li key={s.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium">{s.title}</div>
                  <div className="truncate text-[12px] text-mute">{s.requested_by}{s.votes > 0 && s.votes < 1000 ? `, ${s.votes} ${s.votes === 1 ? 'voto' : 'votos'}` : ''}</div>
                </div>
                <button type="button" onClick={() => run(s.id, () => api(`/admin/music/${s.id}/skip`, { method: 'POST' }), 'Quitada de la lista')} disabled={!!busy} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-mute hover:bg-field hover:text-red disabled:opacity-40" aria-label={`Quitar ${s.title}`}>
                  {busy === s.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} strokeWidth={1.75} />}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
      <p className="mt-4 text-[13px] text-soft">Límites, votos y palabras bloqueadas se ajustan en <a href="#funciones" className="underline underline-offset-4">Funciones</a>.</p>

      <Drawer
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="¿Vaciar la lista?"
        footer={<><Btn variant="ghost" onClick={() => setConfirmClear(false)}>Cancelar</Btn><Btn busy={busy === 'clear'} onClick={async () => { if (await run('clear', () => api('/admin/music/clear', { method: 'POST' }), 'Lista vaciada')) setConfirmClear(false); }}>Vaciar</Btn></>}
      >
        <p className="text-[15px] text-ink-2">Se quitan las {upNext.length} canciones en espera. La que está sonando termina normal.</p>
      </Drawer>
    </section>
  );
}
