'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Bell, BellRing, Clock, Hourglass, LogOut, Loader2, Plus, Check, Scissors, Star,
  CalendarClock, WifiOff, Ticket, Home, PartyPopper,
} from 'lucide-react';
import { onColor } from '@/lib/color';
import { soles } from '@/lib/api';
import { Toaster } from '@/components/Toaster';
import { PullRefresh } from '@/components/PullRefresh';
import { Sheet } from '@/components/Sheet';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import { pushSupported, subscribePush } from '@/lib/push';
import { WhatsAppIcon, waLink } from '../../cita/_parts/shared';
import {
  ApiError, clearSavedTicket, fmtMinutes, fmtTime, getAudio, loadSavedTicket, ordinal, playChime, publicApi,
  queueError, saveTicket, usePolling, useTenantSocket, useWakeLock, type TicketState,
} from '../../tv/_lib/queue';

const ACTIVE = ['waiting', 'called', 'serving'];
const initialOf = (name: string) => name.replace(/^Barber[ií]a\s+/i, '').trim().charAt(0).toUpperCase() || 'B';

function ls<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function lsSet(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch { /* */ }
}

export function TurnoClient({ tenant, whatsapp, reviewUrl, logoUrl }: { tenant: string; whatsapp: string | null; reviewUrl: string | null; logoUrl: string | null }) {
  const params = useSearchParams();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [data, setData] = useState<TicketState | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [fetchOk, setFetchOk] = useState(true);
  const [celebrate, setCelebrate] = useState(false);
  const [confirm, setConfirm] = useState<'delay' | 'cancel' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pushOn, setPushOn] = useState(false);
  const [maxAhead, setMaxAhead] = useState(0);
  const prevStatus = useRef<string | null>(null);

  // Token de la URL o, si no viene, el guardado hoy en este teléfono
  useEffect(() => {
    const t = params.get('t') ?? loadSavedTicket(tenant)?.token ?? null;
    setToken(t);
    if (t) {
      setPushOn(ls(`datepe_push_${t}`, false));
      setMaxAhead(ls(`datepe_ahead_${t}`, 0));
    }
  }, [params, tenant]);

  // En el teléfono el sonido se habilita con el primer toque
  useEffect(() => {
    const unlock = () => getAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const d = await publicApi<TicketState>(tenant, `/public/queue/ticket?token=${encodeURIComponent(token)}`);
      setData(d);
      setFetchOk(true);
      if (ACTIVE.includes(d.ticket.status)) saveTicket(tenant, { token, number: d.ticket.number });
      else clearSavedTicket(tenant);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setNotFound(true);
        clearSavedTicket(tenant);
      } else setFetchOk(false);
    }
  }, [tenant, token]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  const online = useTenantSocket(tenant, (type) => {
    if (['queue_changed', 'config_changed'].includes(type)) load();
  }, load);
  const status = data?.ticket.status ?? null;
  const active = !!status && ACTIVE.includes(status);
  usePolling(load, 20000, !!token && (active || !data));
  useWakeLock(status === 'waiting' || status === 'called');

  // Máximo de personas delante (para el anillo de progreso)
  useEffect(() => {
    const a = data?.ticket.ahead;
    if (token && a != null && a + 1 > maxAhead) {
      setMaxAhead(a + 1);
      lsSet(`datepe_ahead_${token}`, a + 1);
    }
  }, [data?.ticket.ahead, maxAhead, token]);

  // Te toca: pantalla de celebración, vibración y sonido (una vez por llamado)
  useEffect(() => {
    if (!status || !token) return;
    const was = prevStatus.current;
    prevStatus.current = status;
    if (status !== 'called') return;
    const key = `datepe_called_${token}`;
    const shown = sessionStorage.getItem(key);
    if (was === 'called' || (was === null && shown)) return;
    sessionStorage.setItem(key, '1');
    setCelebrate(true);
    try {
      navigator.vibrate?.([300, 120, 300, 120, 600]);
    } catch { /* */ }
    playChime(true, 0.3);
  }, [status, token]);

  const accent = data?.branding?.color_primary ?? '#0a0a0a';
  const onAccent = onColor(accent);

  async function act(kind: 'delay' | 'cancel') {
    if (!token) return;
    setBusy(kind);
    try {
      await publicApi(tenant, `/public/queue/ticket/${kind}`, { method: 'POST', body: { token } });
      if (kind === 'delay') toast.success('Listo, dejamos pasar a los siguientes. No pierdes tu turno.');
      else {
        toast.success('Saliste de la fila.');
        clearSavedTicket(tenant);
      }
      setConfirm(null);
      load();
    } catch (e) {
      toast.error(queueError(e instanceof ApiError ? e.code : 'error'));
    } finally {
      setBusy(null);
    }
  }

  async function enablePush() {
    if (!token || !data?.pushPublicKey) return;
    setBusy('push');
    try {
      const sub = await subscribePush(data.pushPublicKey);
      if (!sub) {
        toast.error('Permite las notificaciones en tu navegador para avisarte. En iPhone, primero agrega esta página a tu inicio.');
        return;
      }
      await publicApi(tenant, '/public/queue/ticket/push', { method: 'POST', body: { token, subscription: sub } });
      setPushOn(true);
      lsSet(`datepe_push_${token}`, true);
      toast.success('Te avisaremos cuando falte poco.');
    } catch {
      toast.error('No pudimos activar el aviso. Inténtalo de nuevo.');
    } finally {
      setBusy(null);
    }
  }

  // ---------------------------- Estados base ----------------------------
  if (token === null || notFound) {
    return (
      <Centered>
        <Ticket size={28} strokeWidth={1.5} className="text-soft" />
        <h1 className="mt-4 text-[24px] font-semibold tracking-[-0.03em]">No encontramos tu turno</h1>
        <p className="mt-2 text-[15px] text-mute">Puede que ya haya terminado o que el enlace esté incompleto.</p>
        <Link href="/fila" className="mt-6 inline-flex min-h-[48px] items-center rounded-full bg-ink px-6 text-[15px] font-medium text-white">Sacar un turno</Link>
      </Centered>
    );
  }
  if (!data) {
    return (
      <Centered>
        {!fetchOk ? (
          <>
            <WifiOff size={28} strokeWidth={1.5} className="text-soft" />
            <h1 className="mt-4 text-[20px] font-semibold tracking-[-0.02em]">Sin conexión</h1>
            <button type="button" onClick={load} className="mt-5 min-h-[44px] rounded-full border border-line px-5 text-[15px] font-medium hover:border-ink">Reintentar</button>
          </>
        ) : (
          <Loader2 className="animate-spin text-soft" size={28} strokeWidth={1.75} />
        )}
      </Centered>
    );
  }

  const t = data.ticket;
  const shop = data.tenant.name;
  const logo = logoUrl ?? data.branding?.logo_url;
  const barber = t.servedBy ?? t.staff;
  const barberPhoto = data.staff.find((s) => s.name === barber)?.photo_url ?? null;
  const ringPct = t.status === 'waiting' ? (maxAhead > 0 && t.ahead != null ? 1 - t.ahead / maxAhead : 0.05) : 1;
  const eta = t.etaMin != null ? new Date(Date.now() + t.etaMin * 60000) : null;
  const statusLine =
    t.status === 'waiting'
      ? t.position === 1 ? 'Eres el siguiente' : t.position ? `Vas ${ordinal(t.position)}` : 'En la fila'
      : t.status === 'called' ? `Te toca, pasa con ${barber ?? 'tu barbero'}`
      : t.status === 'serving' ? 'Te están atendiendo'
      : t.status === 'done' ? 'Gracias por venir'
      : t.status === 'no_show' ? 'Te llamamos y no llegaste'
      : 'Saliste de la fila';

  return (
    <main className="mx-auto min-h-dvh max-w-md pb-[calc(40px+env(safe-area-inset-bottom))]">
      <Toaster />
      <PullRefresh onRefresh={load} />
      <header className="pt-safe sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur-md">
        <div className="flex h-14 items-center gap-3 px-5">
          <Link href="/" className="flex min-w-0 flex-1 items-center gap-3">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold" style={{ background: accent, color: onAccent }}>{initialOf(shop)}</span>
            )}
            <span className="truncate text-[16px] font-semibold tracking-[-0.02em]">{shop}</span>
          </Link>
          {active && (
            <span className={`inline-flex items-center gap-1.5 text-[13px] ${online && fetchOk ? 'text-mute' : 'text-soft'}`}>
              {online && fetchOk ? <span className="h-2 w-2 animate-pulse rounded-full bg-ok" aria-hidden /> : <WifiOff size={14} strokeWidth={1.75} />}
              {online && fetchOk ? 'En vivo' : 'Reconectando'}
            </span>
          )}
        </div>
      </header>

      {/* Ticket */}
      <section className="px-5 pt-8 text-center">
        <Ring pct={ringPct} color={t.status === 'cancelled' || t.status === 'no_show' ? '#d4d4d8' : accent} pulse={t.status === 'called'}>
          <span className="text-[14px] text-mute">Turno</span>
          <span className="tnum text-[76px] font-semibold leading-[0.95] tracking-[-0.05em]">{t.number}</span>
          <span className="max-w-[160px] truncate text-[15px] font-medium">{t.name}</span>
        </Ring>
        <h1 className="mt-6 text-[28px] font-semibold leading-tight tracking-[-0.035em]" aria-live="polite">{statusLine}</h1>

        {t.status === 'waiting' && (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {t.etaMin != null && (
              <span className="tnum inline-flex items-center gap-1.5 rounded-full bg-field px-3.5 py-2 text-[14px] font-medium">
                <Clock size={15} strokeWidth={1.75} />
                {t.etaMin <= 1 ? 'En un momento' : `Aprox. ${fmtMinutes(t.etaMin)}${eta ? `, cerca de las ${fmtTime(eta)}` : ''}`}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-field px-3.5 py-2 text-[14px] font-medium">
              <Scissors size={15} strokeWidth={1.75} /> {t.staff ? `Con ${t.staff}` : 'El primero libre'}
            </span>
          </div>
        )}
        {t.status === 'waiting' && t.ahead != null && t.ahead > 0 && (
          <p className="mt-3 text-[15px] text-mute">{t.ahead === 1 ? 'Hay 1 persona antes que tú.' : `Hay ${t.ahead} personas antes que tú.`} Te avisamos por aquí cuando te toque.</p>
        )}
        {(t.status === 'called' || t.status === 'serving') && barber && (
          <div className="mt-4 inline-flex items-center gap-3 rounded-full bg-field py-1.5 pl-1.5 pr-4">
            {barberPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={barberPhoto} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[14px] font-semibold">{initialOf(barber)}</span>
            )}
            <span className="text-[15px] font-medium">{t.status === 'called' ? `${barber} te espera` : `Con ${barber}`}</span>
          </div>
        )}
        {t.service && active && <p className="mt-3 text-[14px] text-soft">{t.service}</p>}
      </section>

      {/* Acciones mientras espera */}
      {t.status === 'waiting' && (
        <section className="mt-8 space-y-2 px-5">
          {data.pushPublicKey && pushSupported() && (
            <button
              type="button"
              onClick={pushOn ? undefined : enablePush}
              disabled={busy === 'push'}
              aria-pressed={pushOn}
              className={`flex min-h-[56px] w-full items-center gap-3 rounded-xl border px-4 text-left transition-colors ${pushOn ? 'border-transparent bg-ok-tint text-ok' : 'border-line hover:border-ink'}`}
            >
              {busy === 'push' ? <Loader2 size={20} className="animate-spin" /> : pushOn ? <BellRing size={20} strokeWidth={1.75} /> : <Bell size={20} strokeWidth={1.75} />}
              <span className="flex-1">
                <span className="block text-[15px] font-medium">{pushOn ? 'Aviso activado' : 'Avísame cuando falte poco'}</span>
                <span className={`block text-[13px] ${pushOn ? 'text-ok/80' : 'text-mute'}`}>{pushOn ? 'Te llega una notificación aunque cierres esta página.' : 'Sal a dar una vuelta, te mandamos una notificación.'}</span>
              </span>
              {pushOn && <Check size={18} strokeWidth={2} />}
            </button>
          )}
          <div className="grid grid-cols-2 gap-2">
            {t.canDelay && (
              <button type="button" onClick={() => { haptic.tap(); setConfirm('delay'); }} className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-line text-[15px] font-medium hover:border-ink">
                <Hourglass size={17} strokeWidth={1.75} /> Me demoro
              </button>
            )}
            <button type="button" onClick={() => { haptic.tap(); setConfirm('cancel'); }} className={`flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-line text-[15px] font-medium text-red hover:bg-red-tint ${t.canDelay ? '' : 'col-span-2'}`}>
              <LogOut size={17} strokeWidth={1.75} /> Salir de la fila
            </button>
          </div>
        </section>
      )}

      {t.status === 'called' && (
        <section className="mt-8 px-5">
          <button type="button" onClick={() => { haptic.tap(); setConfirm('cancel'); }} className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl text-[15px] font-medium text-red hover:bg-red-tint">
            <LogOut size={17} strokeWidth={1.75} /> Ya no voy a ir
          </button>
        </section>
      )}

      {/* Terminado */}
      {!active && (
        <section className="mt-8 space-y-2 px-5">
          {t.status === 'done' && (
            <p className="mb-4 text-center text-[15px] text-mute">Esperamos que te haya encantado, {t.name}. Vuelve cuando quieras.</p>
          )}
          {t.status === 'done' && reviewUrl && (
            <a href={reviewUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-[52px] items-center justify-center gap-2 rounded-full text-[16px] font-medium" style={{ background: accent, color: onAccent }}>
              <Star size={18} strokeWidth={1.75} /> Deja tu opinión
            </a>
          )}
          {data.features.booking && (
            <Link href="/reservar" className={`flex min-h-[52px] items-center justify-center gap-2 rounded-full text-[16px] font-medium ${t.status === 'done' && reviewUrl ? 'border border-line hover:border-ink' : ''}`} style={t.status === 'done' && reviewUrl ? undefined : { background: accent, color: onAccent }}>
              <CalendarClock size={18} strokeWidth={1.75} /> Reserva tu próxima cita
            </Link>
          )}
          {t.status !== 'done' && (
            <Link href="/fila" className="flex min-h-[52px] items-center justify-center gap-2 rounded-full border border-line text-[16px] font-medium hover:border-ink">
              <Ticket size={18} strokeWidth={1.75} /> Sacar otro turno
            </Link>
          )}
          <Link href="/" className="flex min-h-[48px] items-center justify-center gap-2 text-[15px] text-mute hover:text-ink">
            <Home size={17} strokeWidth={1.75} /> Ir a {shop}
          </Link>
        </section>
      )}

      {/* Servicios y contacto */}
      <section className="mt-10 border-t border-line px-5 pt-2">
        {data.services.length > 0 && (
          <details className="border-b border-line">
            <summary className="flex min-h-[56px] items-center justify-between text-[16px] font-medium">
              Servicios y precios
              <Plus size={20} strokeWidth={1.75} className="acc-icon text-mute" />
            </summary>
            <div className="acc-body">
              <div>
                <ul className="pb-4">
                  {data.services.map((s) => (
                    <li key={s.id} className="flex items-baseline justify-between gap-4 py-2 text-[15px]">
                      <span>{s.name} <span className="text-[13px] text-soft">{s.duration_min} min</span></span>
                      <span className="tnum font-medium">{soles(s.price_cents)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </details>
        )}
        {whatsapp && (
          <a href={waLink(whatsapp, `Hola, tengo el turno ${t.number} en la fila.`)} target="_blank" rel="noopener noreferrer" className="flex min-h-[56px] items-center gap-3 border-b border-line text-[16px] font-medium">
            <WhatsAppIcon size={20} /> Escribir a {shop}
          </a>
        )}
      </section>

      {/* Confirmaciones */}
      <Sheet
        open={confirm === 'delay'}
        onClose={() => setConfirm(null)}
        title="¿Te demoras unos minutos?"
        footer={
          <>
            <button type="button" onClick={() => setConfirm(null)} className="min-h-[48px] rounded-full px-5 text-[15px] font-medium hover:bg-field">Cancelar</button>
            <button type="button" onClick={() => act('delay')} disabled={busy === 'delay'} className="flex min-h-[48px] items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-medium text-white disabled:opacity-60">
              {busy === 'delay' && <Loader2 size={16} className="animate-spin" />} Sí, dejar pasar
            </button>
          </>
        }
      >
        <p className="text-[16px] text-ink-2">Dejamos pasar a las dos personas que siguen y tú conservas tu turno. Puedes hacerlo hasta dos veces.</p>
      </Sheet>
      <Sheet
        open={confirm === 'cancel'}
        onClose={() => setConfirm(null)}
        title="¿Salir de la fila?"
        footer={
          <>
            <button type="button" onClick={() => setConfirm(null)} className="min-h-[48px] rounded-full px-5 text-[15px] font-medium hover:bg-field">Me quedo</button>
            <button type="button" onClick={() => act('cancel')} disabled={busy === 'cancel'} className="flex min-h-[48px] items-center gap-2 rounded-full bg-red px-5 text-[15px] font-medium text-white disabled:opacity-60">
              {busy === 'cancel' && <Loader2 size={16} className="animate-spin" />} Salir de la fila
            </button>
          </>
        }
      >
        <p className="text-[16px] text-ink-2">Perderás el turno {t.number}. Si vuelves, tendrás que sacar uno nuevo al final de la fila.</p>
      </Sheet>

      {/* Te toca */}
      {celebrate && t.status === 'called' && (
        <div className="fade-in fixed inset-0 z-[70] flex flex-col items-center justify-center px-8 text-center" style={{ background: accent, color: onAccent }} role="alertdialog" aria-live="assertive">
          <PartyPopper size={40} strokeWidth={1.5} className="turno-pop" />
          <p className="mt-6 text-[18px] font-medium opacity-85">Turno {t.number}</p>
          <h2 className="turno-pop mt-2 text-[44px] font-semibold leading-[1.02] tracking-[-0.04em]">Te toca, {t.name}</h2>
          <p className="mt-3 text-[22px] font-medium opacity-90">{barber ? `Pasa con ${barber}` : 'Acércate al mostrador'}</p>
          {barberPhoto && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={barberPhoto} alt="" className="mt-6 h-24 w-24 rounded-full object-cover" style={{ boxShadow: `0 0 0 4px ${onAccent}` }} />
          )}
          <button
            type="button"
            onClick={() => { haptic.success(); setCelebrate(false); }}
            className="pb-safe absolute inset-x-6 bottom-6 min-h-[56px] rounded-full text-[17px] font-semibold"
            style={{ background: onAccent, color: accent }}
          >
            Ya voy
          </button>
          <style>{`@keyframes turno-pop{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.06);opacity:1}100%{transform:scale(1)}}.turno-pop{animation:turno-pop 800ms var(--ease-out) both}@media (prefers-reduced-motion: reduce){.turno-pop{animation:none}}`}</style>
        </div>
      )}
    </main>
  );
}

// ------------------------------- Anillo de progreso -------------------------------
function Ring({ pct, color, pulse, children }: { pct: number; color: string; pulse?: boolean; children: React.ReactNode }) {
  const r = 104;
  const c = 2 * Math.PI * r;
  const v = Math.max(0.04, Math.min(1, pct));
  return (
    <div className={`relative mx-auto h-[232px] w-[232px] ${pulse ? 'animate-pulse' : ''}`}>
      <svg viewBox="0 0 232 232" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="116" cy="116" r={r} fill="none" stroke="#f4f4f5" strokeWidth="10" />
        <circle
          cx="116" cy="116" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v)}
          style={{ transition: 'stroke-dashoffset 900ms var(--ease-out)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">{children}</main>;
}
