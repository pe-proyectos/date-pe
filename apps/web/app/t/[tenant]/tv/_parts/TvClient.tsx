'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize, Minimize, Volume2, WifiOff, Loader2, Clock, MonitorOff } from 'lucide-react';
import { onColor } from '@/lib/color';
import {
  ApiError, alpha, fmtMinutes, getAudio, playChime, publicApi, readableAccent, speak, useTenantSocket, usePolling, useWakeLock,
  TZ, type Announce, type QueueState,
} from '../_lib/queue';
import {
  Avatar, CallCard, QrCard, Rotator, SectionTitle, ServingGrid, Ticker, WaitingList, initialOf, type Palette, type Slide,
} from './TvParts';

const CALL_MS = 8000;
const SHIFT_EVERY_MS = 4 * 60 * 1000;

function palette(theme: string, brandRaw: string | null | undefined): Palette {
  const brand = /^#[0-9a-f]{3,8}$/i.test(brandRaw ?? '') ? (brandRaw as string) : '#0a0a0a';
  const onBrand = onColor(brand);
  if (theme === 'light') {
    const accent = readableAccent(brand, '#ffffff', '#0a0a0a');
    return { bg: '#ffffff', fg: '#0a0a0a', mute: '#5f5f66', soft: '#71717a', line: '#e6e6e9', card: '#f4f4f5', accent, onAccent: onColor(accent), brand, onBrand };
  }
  if (theme === 'brand') {
    return { bg: brand, fg: onBrand, mute: alpha(onBrand, 0.72), soft: alpha(onBrand, 0.55), line: alpha(onBrand, 0.16), card: alpha(onBrand, 0.08), accent: onBrand, onAccent: brand, brand: onBrand, onBrand: brand };
  }
  const accent = readableAccent(brand, '#161618', '#ffffff');
  // En tema oscuro, si la marca es muy oscura el llamado usa blanco para destacar
  const callBg = readableAccent(brand, '#0a0a0a', '#ffffff', 1.6);
  return { bg: '#0a0a0a', fg: '#ffffff', mute: 'rgba(255,255,255,0.64)', soft: 'rgba(255,255,255,0.45)', line: 'rgba(255,255,255,0.1)', card: '#161618', accent, onAccent: onColor(accent), brand: callBg, onBrand: onColor(callBg) };
}

function useNow(ms: number) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function useOrientation() {
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)');
    const on = () => setPortrait(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return portrait;
}

const CSS = (scale: number, bg: string) => `
html { font-size: calc(min(1vw, 1.78vh) * ${scale}); overflow: hidden; height: 100%; background: ${bg}; }
@media (orientation: portrait) { html { font-size: calc(min(1.8vw, 1.02vh) * ${scale}); } }
body { overflow: hidden; height: 100%; background: ${bg}; overscroll-behavior: none; }
::-webkit-scrollbar { display: none; }
@keyframes tv-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.tv-marquee { animation: tv-marquee linear infinite; will-change: transform; }
@keyframes tv-ring { 0%, 100% { box-shadow: inset 0 0 0 0.2rem var(--ring); } 50% { box-shadow: inset 0 0 0 0.45rem var(--ring); } }
.tv-called { animation: tv-ring 1.6s var(--ease-out) infinite; }
@keyframes tv-eq { 0%, 100% { height: 25%; } 50% { height: 100%; } }
.tv-eq > span { animation: tv-eq 0.9s ease-in-out infinite; height: 40%; }
@keyframes tv-slide { from { opacity: 0; transform: translateY(0.8rem); } to { opacity: 1; transform: none; } }
.tv-slide { animation: tv-slide 700ms var(--ease-out) both; }
.tv-row { animation: tv-slide 600ms var(--ease-out) both; }
@keyframes tv-call { from { opacity: 0; transform: scale(1.04); } to { opacity: 1; transform: none; } }
.tv-call { animation: tv-call 600ms var(--ease-out) both; }
@keyframes tv-pop { 0% { transform: scale(0.6); opacity: 0; } 60% { transform: scale(1.06); opacity: 1; } 100% { transform: scale(1); } }
.tv-pop { animation: tv-pop 900ms var(--ease-out) both 120ms; }
@keyframes tv-glow { 0%, 100% { opacity: 0.08; transform: scale(1); } 50% { opacity: 0.16; transform: scale(1.08); } }
.tv-call-glow { background: radial-gradient(circle at 50% 45%, var(--c) 0, transparent 55%); animation: tv-glow 2.4s ease-in-out infinite; }
@keyframes tv-countdown { from { width: 100%; } to { width: 0%; } }
.tv-countdown { animation: tv-countdown linear both; }
@keyframes tv-breathe { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
.tv-breathe { animation: tv-breathe 3s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .tv-marquee, .tv-called, .tv-eq > span, .tv-slide, .tv-row, .tv-call, .tv-pop, .tv-call-glow, .tv-breathe { animation: none !important; }
  .tv-countdown { animation: none; width: 0; }
}
`;

export function TvClient({ tenant, tvKey }: { tenant: string; tvKey: string }) {
  const [data, setData] = useState<QueueState | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [fetchOk, setFetchOk] = useState(true);
  const [calls, setCalls] = useState<Announce[]>([]);
  const [soundOn, setSoundOn] = useState(false);
  const [idle, setIdle] = useState(false);
  const [isFull, setIsFull] = useState(false);
  const [shift, setShift] = useState({ x: 0, y: 0 });
  const [origin, setOrigin] = useState({ url: '', host: '' });
  const now = useNow(1000);
  const portrait = useOrientation();
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCall = useRef<{ key: string; at: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await publicApi<QueueState>(tenant, '/public/queue');
      setData(d);
      setDisabled(false);
      setFetchOk(true);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'funcion_desactivada') setDisabled(true);
      else setFetchOk(false);
    }
  }, [tenant]);

  // Varios eventos seguidos generan una sola consulta
  const refetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(load, 150);
  }, [load]);

  useEffect(() => {
    load();
    setOrigin({ url: `${window.location.origin}/fila`, host: window.location.host });
  }, [load]);

  const online = useTenantSocket(
    tenant,
    (type, payload) => {
      if (type === 'queue_changed') {
        const a = (payload as { announce?: Announce } | null)?.announce;
        if (a && typeof a.number === 'number') {
          const key = `${a.number}:${a.staff}`;
          const t = Date.now();
          if (!lastCall.current || lastCall.current.key !== key || t - lastCall.current.at > 3000) {
            lastCall.current = { key, at: t };
            setCalls((c) => [...c, a].slice(-6));
          }
        }
      }
      if (['queue_changed', 'config_changed', 'availability_changed'].includes(type)) refetch();
    },
    load,
  );
  usePolling(load, 30000);
  useWakeLock(true);

  const tv = data?.tv;
  const p = useMemo(() => palette(tv?.theme ?? 'dark', data?.branding?.color_primary), [tv?.theme, data?.branding?.color_primary]);
  const needsSound = !!(tv && (tv.chime || tv.announceVoice));
  const current = calls[0] ?? null;

  // Si el navegador ya permite sonido (modo kiosco), no hace falta tocar
  useEffect(() => {
    const ctx = getAudio();
    if (ctx && ctx.state === 'running') setSoundOn(true);
  }, []);

  const unlockSound = useCallback(() => {
    if (soundOn) return;
    getAudio();
    try {
      // Activa la voz con una frase vacía y silenciosa
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis?.speak(u);
    } catch {
      /* */
    }
    setSoundOn(true);
    playChime(false, 0.12);
  }, [soundOn]);

  // Llamado en pantalla: campanita, voz y 8 segundos
  useEffect(() => {
    if (!current || !tv) return;
    if (soundOn && tv.chime) playChime();
    const text = `Turno ${current.number}. ${current.name}, ${current.staff ? `pasa con ${current.staff}` : 'pasa, por favor'}.`;
    const voice = soundOn && tv.announceVoice ? setTimeout(() => speak(text), tv.chime ? 900 : 100) : null;
    const t = setTimeout(() => setCalls((c) => c.slice(1)), CALL_MS);
    return () => {
      clearTimeout(t);
      if (voice) clearTimeout(voice);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  // Cursor y botón de pantalla completa se esconden a los 3 s sin mover el mouse
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), 3000);
    };
    wake();
    window.addEventListener('mousemove', wake);
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    const onFs = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousemove', wake);
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, []);

  // Protección de pantalla: un leve desplazamiento cada pocos minutos
  useEffect(() => {
    const t = setInterval(() => {
      setShift({ x: Math.round(Math.random() * 8 - 4), y: Math.round(Math.random() * 8 - 4) });
    }, SHIFT_EVERY_MS);
    return () => clearInterval(t);
  }, []);

  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }

  // ---------------------------- Estados base ----------------------------
  if (disabled) {
    return (
      <Shell p={palette('dark', null)} css={CSS(1, '#0a0a0a')}>
        <div className="flex h-full flex-col items-center justify-center gap-[1rem] text-center">
          <MonitorOff strokeWidth={1.5} style={{ width: '4rem', height: '4rem', opacity: 0.6 }} />
          <h1 className="text-[3rem] font-semibold tracking-[-0.03em]">La pantalla está apagada</h1>
          <p className="max-w-[46rem] text-[1.6rem] opacity-70">Activa la fila virtual o la pantalla de TV en el panel, sección Funciones, y esta página se actualiza sola.</p>
        </div>
      </Shell>
    );
  }
  if (!data || !tv) {
    return (
      <Shell p={palette('dark', null)} css={CSS(1, '#0a0a0a')}>
        <div className="flex h-full items-center justify-center">
          <Loader2 className="animate-spin" strokeWidth={1.75} style={{ width: '3rem', height: '3rem', opacity: 0.6 }} />
        </div>
      </Shell>
    );
  }

  const shop = data.tenant.name;
  const logo = data.branding?.logo_url;
  const scale = Math.min(1.6, Math.max(0.7, Number(tv.scale) || 1));
  const active = data.waiting.length + data.serving.length > 0;
  const closed = !data.open && !active;
  const idleShop = data.open && !active;
  const waitText = data.waitingCount > 0 ? `Espera aprox. ${fmtMinutes(data.estimatedWaitMin)}` : 'Sin espera';
  const photoOf = (name: string | null | undefined) => data.staff.find((s) => s.name === name)?.photo_url ?? null;
  const slides: Slide[] = [
    ...(tv.showAppointments && data.appointments.length ? [{ kind: 'appointments' as const, items: data.appointments }] : []),
    ...(tv.showPromos ? tv.promos.filter((x) => x.title).map((x) => ({ kind: 'promo' as const, ...x })) : []),
  ];
  const qr = tv.showQr && origin.url ? (size: number, title?: string) => <QrCard url={origin.url} host={origin.host} p={p} size={size} title={title} /> : null;
  const offline = !online || !fetchOk;

  const header = (
    <header className="flex shrink-0 items-center justify-between gap-[2rem] px-[2.5rem] pb-[1.2rem] pt-[1.6rem]">
      <div className="flex min-w-0 items-center gap-[1.1rem]">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="h-[4rem] w-[4rem] shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex h-[4rem] w-[4rem] shrink-0 items-center justify-center rounded-full text-[1.8rem] font-semibold" style={tv.theme === 'brand' ? { background: p.fg, color: p.bg } : { background: p.accent, color: p.onAccent }}>
            {initialOf(shop)}
          </span>
        )}
        <div className="min-w-0">
          <div className="truncate text-[2.1rem] font-semibold leading-tight tracking-[-0.03em]">{shop}</div>
          {data.open && data.barbersNow > 0 && (
            <div className="text-[1.2rem]" style={{ color: p.mute }}>
              {data.barbersNow === 1 ? '1 barbero atendiendo' : `${data.barbersNow} barberos atendiendo`}
            </div>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-[1.4rem]">
        {offline && (
          <span className="tv-breathe inline-flex items-center gap-[0.5rem] rounded-full px-[0.9rem] py-[0.35rem] text-[1.05rem]" style={{ color: p.mute, boxShadow: `inset 0 0 0 1px ${p.line}` }}>
            <WifiOff strokeWidth={1.75} style={{ width: '1.1rem', height: '1.1rem' }} /> Reconectando
          </span>
        )}
        {data.open && active && (
          <span className="tnum inline-flex items-center gap-[0.6rem] rounded-full px-[1.2rem] py-[0.55rem] text-[1.45rem] font-semibold" style={{ background: p.card }}>
            <Clock strokeWidth={1.75} style={{ width: '1.4rem', height: '1.4rem', color: p.mute }} /> {waitText}
          </span>
        )}
        {tv.showClock && now && (
          <div className="text-right">
            <div className="tnum text-[3rem] font-semibold leading-none tracking-[-0.03em]">
              {now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ })}
            </div>
            <div className="mt-[0.2rem] text-[1.05rem] first-letter:uppercase" style={{ color: p.mute }}>
              {now.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ })}
            </div>
          </div>
        )}
      </div>
    </header>
  );

  // ---------------------------- Composición por diseño ----------------------------
  let body: React.ReactNode;
  if (closed) {
    body = (
      <div className={`grid h-full min-h-0 gap-[2rem] px-[2.5rem] pb-[2rem] ${portrait ? 'grid-rows-[1fr_auto]' : 'grid-cols-[minmax(0,1fr)_auto]'}`}>
        <div className="flex min-h-0 flex-col justify-center">
          <div className="text-[1.8rem] font-medium" style={{ color: p.mute }}>Ahora estamos cerrados</div>
          <h1 className="mt-[0.6rem] text-[6.4rem] font-semibold leading-[0.95] tracking-[-0.045em]">
            {data.opensAt ? <>Abrimos a las <span className="tnum">{data.opensAt}</span></> : 'Volvemos pronto'}
          </h1>
          {data.queueConfig.closedMessage && <p className="mt-[1.2rem] max-w-[46rem] text-[1.7rem]" style={{ color: p.mute }}>{data.queueConfig.closedMessage}</p>}
          {slides.length > 0 && <div className="mt-[2.2rem] h-[12rem] max-w-[52rem]"><Rotator slides={slides} p={p} /></div>}
        </div>
        {qr && <div className={portrait ? 'mx-auto w-[26rem]' : 'w-[22rem] self-center'}>{qr(portrait ? 16 : 15, data.features.booking ? 'Escanea y reserva tu hora' : 'Escanea para ver la fila')}</div>}
      </div>
    );
  } else if (idleShop) {
    body = (
      <div className={`grid h-full min-h-0 gap-[2rem] px-[2.5rem] pb-[2rem] ${portrait ? 'grid-rows-[auto_auto_1fr]' : 'grid-cols-[minmax(0,1fr)_auto]'}`}>
        <div className="flex min-h-0 flex-col justify-center">
          {data.branding?.tagline && <div className="text-[1.7rem] font-medium" style={{ color: p.mute }}>{data.branding.tagline}</div>}
          <h1 className="mt-[0.6rem] text-[6.4rem] font-semibold leading-[0.95] tracking-[-0.045em]">Sin espera, pasa directo</h1>
          <p className="mt-[1.2rem] max-w-[44rem] text-[1.8rem]" style={{ color: p.mute }}>
            {data.queueConfig.welcome || 'Escanea el código, saca tu turno y te llamamos por esta pantalla y en tu celular.'}
          </p>
          {!portrait && slides.length > 0 && (
            <div className="mt-[2.2rem] grid h-[14rem] max-w-[62rem] gap-[1rem]" style={{ gridTemplateColumns: '1fr' }}>
              {slides.length > 0 && <Rotator slides={slides} p={p} />}
            </div>
          )}
        </div>
        {qr && <div className={portrait ? 'mx-auto w-[28rem]' : 'w-[24rem] self-center'}>{qr(portrait ? 18 : 17)}</div>}
        {portrait && (
          <div className="grid min-h-0 grid-rows-[auto_auto] content-end gap-[1rem]">
            {slides.length > 0 && <div className="h-[12rem]"><Rotator slides={slides} p={p} /></div>}
          </div>
        )}
      </div>
    );
  } else if (tv.layout === 'minimal') {
    const lead = [...data.serving].sort((a, b) => new Date(b.calledAt ?? 0).getTime() - new Date(a.calledAt ?? 0).getTime())[0];
    body = (
      <div className={`grid h-full min-h-0 gap-[2rem] px-[2.5rem] pb-[2rem] ${portrait ? 'grid-rows-[1fr_auto]' : 'grid-cols-[minmax(0,1fr)_auto]'}`}>
        <div className="flex min-h-0 flex-col items-center justify-center text-center">
          {lead ? (
            <>
              <div className="text-[2rem] font-medium" style={{ color: p.mute }}>{lead.status === 'called' ? 'Pasa ahora' : 'Atendiendo'}</div>
              <div className="tnum text-[17rem] font-semibold leading-[0.9] tracking-[-0.05em]">{lead.number}</div>
              <div className="mt-[1rem] flex items-center gap-[1rem] text-[2.6rem] font-semibold tracking-[-0.03em]">
                {lead.staff && <Avatar name={lead.staff} url={photoOf(lead.staff)} size={4.2} p={p} />}
                {lead.name}{lead.staff ? <span style={{ color: p.mute }}>con {lead.staff}</span> : null}
              </div>
            </>
          ) : (
            <>
              <div className="text-[2rem] font-medium" style={{ color: p.mute }}>Sigue</div>
              <div className="tnum text-[17rem] font-semibold leading-[0.9] tracking-[-0.05em]">{data.waiting[0]?.number}</div>
            </>
          )}
          {tv.showQueue && data.waiting.length > 0 && (
            <div className="mt-[2.4rem] flex flex-wrap items-center justify-center gap-[1rem]">
              <span className="text-[1.6rem]" style={{ color: p.mute }}>Siguen</span>
              {data.waiting.slice(0, 5).map((w) => (
                <span key={w.id ?? w.number} className="tnum rounded-[0.8rem] px-[1rem] py-[0.3rem] text-[2.4rem] font-semibold" style={{ background: p.card }}>{w.number}</span>
              ))}
            </div>
          )}
        </div>
        {qr && <div className={portrait ? 'mx-auto w-[22rem]' : 'w-[18rem] self-end'}>{qr(portrait ? 13 : 12, 'Saca tu turno')}</div>}
      </div>
    );
  } else if (tv.layout === 'queue') {
    body = (
      <div className={`grid h-full min-h-0 gap-[2rem] px-[2.5rem] pb-[2rem] ${portrait ? 'grid-rows-[auto_1fr_auto]' : 'grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_1fr]'}`}>
        <section className={portrait ? '' : 'col-start-1'}>
          <SectionTitle p={p}>Pasa ahora</SectionTitle>
          {data.serving.length ? (
            <div className="grid gap-[1rem]" style={{ gridTemplateColumns: `repeat(${Math.min(portrait ? 2 : 4, Math.max(1, data.serving.length))}, minmax(0, 1fr))` }}>
              {data.serving.slice(0, portrait ? 4 : 4).map((t) => (
                <div key={t.id ?? t.number} className={`flex items-center gap-[1.2rem] rounded-[1.1rem] px-[1.4rem] py-[1rem] ${t.status === 'called' ? 'tv-called' : ''}`} style={{ background: p.card, ['--ring' as string]: p.accent }}>
                  <span className="tnum text-[6.5rem] font-semibold leading-none tracking-[-0.05em]">{t.number}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[1.7rem] font-semibold">{t.name}</span>
                    <span className="block truncate text-[1.35rem]" style={{ color: p.mute }}>{t.staff ? `con ${t.staff}` : ''}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[1.6rem]" style={{ color: p.mute }}>En un momento llamamos al siguiente.</p>
          )}
        </section>
        {tv.showQueue && (
          <section className={`flex min-h-0 flex-col ${portrait ? '' : 'col-start-1'}`}>
            <SectionTitle p={p} right={<span className="tnum text-[1.4rem]" style={{ color: p.mute }}>{data.waitingCount} en espera</span>}>En espera</SectionTitle>
            <div className="grid content-start gap-[1rem] overflow-hidden" style={{ gridTemplateColumns: `repeat(${portrait ? 4 : 6}, minmax(0, 1fr))` }}>
              {data.waiting.slice(0, portrait ? 16 : 18).map((w, i) => (
                <div key={w.id ?? w.number} className="tv-row flex flex-col items-center rounded-[1.1rem] py-[1rem]" style={{ background: i === 0 ? p.accent : p.card, color: i === 0 ? p.onAccent : p.fg, animationDelay: `${i * 40}ms` }}>
                  <span className="tnum text-[4.4rem] font-semibold leading-none tracking-[-0.04em]">{w.number}</span>
                  <span className="mt-[0.3rem] max-w-full truncate px-[0.5rem] text-[1.25rem]" style={{ opacity: 0.75 }}>{w.name}</span>
                </div>
              ))}
            </div>
          </section>
        )}
        <aside className={portrait ? 'grid grid-cols-[1fr_auto] gap-[1rem]' : 'col-start-2 row-span-2 row-start-1 flex w-[20rem] flex-col gap-[1rem]'}>
          <div className="flex flex-col justify-center rounded-[1.1rem] p-[1.3rem]" style={{ background: p.card }}>
            <div className="text-[1.2rem]" style={{ color: p.mute }}>Espera aprox.</div>
            <div className="tnum text-[3.6rem] font-semibold leading-none tracking-[-0.04em]">{data.waitingCount ? fmtMinutes(data.estimatedWaitMin) : '0 min'}</div>
          </div>
          {qr && <div className={portrait ? 'w-[17rem]' : 'flex-1'}>{qr(portrait ? 11 : 13)}</div>}
        </aside>
      </div>
    );
  } else {
    // split
    const cols = portrait ? Math.min(2, Math.max(1, data.serving.length)) : Math.min(4, Math.max(2, data.serving.length));
    const serving = (
      <section className="shrink-0">
        <SectionTitle p={p}>Atendiendo ahora</SectionTitle>
        {data.serving.length ? (
          <ServingGrid serving={data.serving.slice(0, portrait ? 4 : 4)} staff={data.staff} p={p} cols={cols} />
        ) : (
          <div className="flex items-center gap-[1rem] rounded-[1.1rem] px-[1.4rem] py-[1.4rem] text-[1.6rem]" style={{ background: p.card, color: p.mute }}>
            {data.waiting[0] ? <>En un momento llamamos al turno <span className="tnum font-semibold" style={{ color: p.fg }}>{data.waiting[0].number}</span></> : 'Sillones listos'}
          </div>
        )}
      </section>
    );
    const waiting = tv.showQueue ? (
      <section className="flex min-h-0 flex-1 flex-col">
        <SectionTitle p={p} right={<span className="tnum text-[1.4rem]" style={{ color: p.mute }}>{data.waitingCount} en espera</span>}>En la fila</SectionTitle>
        {data.waiting.length ? (
          <WaitingList items={data.waiting} p={p} />
        ) : (
          <p className="text-[1.6rem]" style={{ color: p.mute }}>Nadie esperando. Escanea el QR y eres el siguiente.</p>
        )}
      </section>
    ) : null;
    const bottom = (
      <div className="grid min-h-0 gap-[1rem]" style={{ gridTemplateColumns: [slides.length ? 'minmax(0,1fr)' : '', qr ? 'auto' : ''].filter(Boolean).join(' ') || '1fr' }}>
        {slides.length > 0 && <Rotator slides={slides} p={p} />}
        {qr && <div className="w-[15rem]">{qr(10.5)}</div>}
      </div>
    );
    body = portrait ? (
      <div className="flex h-full min-h-0 flex-col gap-[1.6rem] px-[2.5rem] pb-[1.6rem]">
        {serving}
        {waiting ?? <div className="flex-1" />}
        <div className="h-[19rem] shrink-0">{bottom}</div>
      </div>
    ) : (
      <div className={`grid h-full min-h-0 gap-[2rem] px-[2.5rem] pb-[1.6rem] ${waiting ? 'grid-cols-[minmax(0,5fr)_minmax(0,7fr)]' : 'grid-cols-1'}`}>
        {waiting && <div className="flex min-h-0 flex-col">{waiting}</div>}
        <div className="flex min-h-0 flex-col gap-[1.6rem]">
          {serving}
          <div className="min-h-[16rem] flex-1">{bottom}</div>
        </div>
      </div>
    );
  }

  return (
    <Shell p={p} css={CSS(scale, p.bg)} cursorHidden={idle} onPointerDown={needsSound ? unlockSound : undefined}>
      {tv.backgroundUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={tv.backgroundUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0" style={{ background: p.bg, opacity: 0.86 }} />
        </>
      )}
      <div className="relative flex h-full flex-col transition-transform duration-[2000ms]" style={{ transform: `translate(${shift.x}px, ${shift.y}px)` }}>
        {header}
        <main className="min-h-0 flex-1">{body}</main>
        {tv.message && <Ticker message={tv.message} p={p} />}
      </div>

      {current && <CallCard call={current} photo={photoOf(current.staff)} p={p} ms={CALL_MS} />}

      {needsSound && !soundOn && (
        <div className="fixed inset-x-0 bottom-[6rem] z-50 flex justify-center">
          <button
            type="button"
            onClick={unlockSound}
            className="tv-breathe flex items-center gap-[0.8rem] rounded-full px-[2rem] py-[1.1rem] text-[1.6rem] font-semibold shadow-pop"
            style={{ background: p.fg, color: p.bg }}
          >
            <Volume2 strokeWidth={1.75} style={{ width: '1.8rem', height: '1.8rem' }} /> Toca para activar el sonido
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={toggleFull}
        className={`fixed bottom-[1.5rem] right-[1.5rem] z-50 flex items-center gap-[0.5rem] rounded-full px-[1.2rem] py-[0.7rem] text-[1.1rem] font-medium transition-opacity duration-500 ${idle ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
        style={{ background: p.card, color: p.fg, boxShadow: `inset 0 0 0 1px ${p.line}` }}
      >
        {isFull ? <Minimize strokeWidth={1.75} style={{ width: '1.2rem', height: '1.2rem' }} /> : <Maximize strokeWidth={1.75} style={{ width: '1.2rem', height: '1.2rem' }} />}
        {isFull ? 'Salir de pantalla completa' : 'Pantalla completa'}
      </button>

    </Shell>
  );
}

function Shell({ p, css, children, cursorHidden, onPointerDown }: { p: Palette; css: string; children: React.ReactNode; cursorHidden?: boolean; onPointerDown?: () => void }) {
  return (
    <div
      className="fixed inset-0 select-none overflow-hidden"
      style={{ background: p.bg, color: p.fg, cursor: cursorHidden ? 'none' : 'default' }}
      onPointerDown={onPointerDown}
    >
      <style>{css}</style>
      {children}
    </div>
  );
}
