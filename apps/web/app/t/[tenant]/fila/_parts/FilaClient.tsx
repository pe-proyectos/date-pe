'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clock, Users, CalendarOff, CalendarClock, Loader2, Ticket, ChevronRight, Check, WifiOff, Info, BellRing, MapPin } from 'lucide-react';
import { onColor } from '@/lib/color';
import { soles } from '@/lib/api';
import { Toaster } from '@/components/Toaster';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import {
  ApiError, clearSavedTicket, fmtMinutes, loadSavedTicket, publicApi, queueError, saveTicket, usePolling, useTenantSocket,
  type QueueState, type SavedTicket, type TicketState,
} from '../../tv/_lib/queue';

const FLD = `.fld{width:100%;border:1px solid var(--color-line-2);border-radius:12px;padding:0.85rem 1rem;font-size:16px;background:#fff;outline:none;transition:border-color .2s}.fld:focus{border-color:var(--color-ink)}`;
const initialOf = (name: string) => name.replace(/^Barber[ií]a\s+/i, '').trim().charAt(0).toUpperCase() || 'B';

export function FilaClient({ tenant, logoUrl }: { tenant: string; logoUrl: string | null; coverUrl: string | null }) {
  const router = useRouter();
  const [data, setData] = useState<QueueState | null>(null);
  const [off, setOff] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saved, setSaved] = useState<SavedTicket | null>(null);
  const [form, setForm] = useState({ name: '', phone: '' });
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phoneError, setPhoneError] = useState(false);
  // Varias sedes: la del QR (?sede=) o la última elegida en este celular
  const [sede, setSede] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('sede');
    setSede(fromUrl || localStorage.getItem(`datepe_fila_sede_${tenant}`) || null);
  }, [tenant]);
  const chooseSede = (id: string | null) => {
    haptic.tap();
    if (id) localStorage.setItem(`datepe_fila_sede_${tenant}`, id);
    else localStorage.removeItem(`datepe_fila_sede_${tenant}`);
    const u = new URL(window.location.href);
    if (id) u.searchParams.set('sede', id);
    else u.searchParams.delete('sede');
    window.history.replaceState(null, '', u.toString());
    setData(null);
    setSede(id);
  };

  const load = useCallback(async () => {
    if (sede === undefined) return;
    try {
      const d = await publicApi<QueueState>(tenant, `/public/queue${sede ? `?sede=${sede}` : ''}`);
      // Sede guardada que ya no existe: se vuelve a elegir
      if (sede && d.locations && !d.locations.some((l) => l.id === sede)) {
        localStorage.removeItem(`datepe_fila_sede_${tenant}`);
        setSede(null);
        return;
      }
      setData(d);
      setLoadError(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'funcion_desactivada') setOff(true);
      else setLoadError(true);
    }
  }, [tenant, sede]);

  useEffect(() => {
    load();
    try {
      const c = JSON.parse(localStorage.getItem('datepe_cliente') ?? 'null') as { name?: string; phone?: string } | null;
      if (c) setForm({ name: c.name ?? '', phone: (c.phone ?? '').replace(/\D/g, '').slice(-9) });
    } catch { /* */ }
    // ¿Ya tiene turno hoy? Se confirma que siga activo
    const s = loadSavedTicket(tenant);
    if (s) {
      publicApi<TicketState>(tenant, `/public/queue/ticket?token=${encodeURIComponent(s.token)}`)
        .then((d) => {
          if (['waiting', 'called', 'serving'].includes(d.ticket.status)) setSaved(s);
          else clearSavedTicket(tenant);
        })
        .catch((e) => {
          if (e instanceof ApiError && e.status === 404) clearSavedTicket(tenant);
        });
    }
  }, [load, tenant]);

  const online = useTenantSocket(tenant, (type) => {
    if (type === 'queue_changed' || type === 'config_changed') load();
  }, load);
  usePolling(load, 30000);

  const accent = data?.branding?.color_primary ?? '#0a0a0a';
  const onAccent = onColor(accent);
  const staffName = data?.staff.find((s) => s.id === staffId)?.name ?? null;
  const ahead = useMemo(() => {
    if (!data) return 0;
    if (!staffName) return data.waitingCount;
    return data.waiting.filter((w) => !w.staff || w.staff === staffName).length;
  }, [data, staffName]);
  const waitingFor = (name: string) => data?.waiting.filter((w) => w.staff === name).length ?? 0;

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!data || busy) return;
    const name = form.name.trim();
    const digits = form.phone.replace(/\D/g, '');
    if (!name) return toast.error('Escribe tu nombre para llamarte.');
    if ((data.queueConfig.askPhone && digits.length < 9) || (digits.length > 0 && digits.length < 9)) {
      setPhoneError(true);
      haptic.error();
      return;
    }
    setBusy(true);
    try {
      const out = await publicApi<{ token: string; number: number; existing?: boolean }>(tenant, '/public/queue/join', {
        method: 'POST',
        body: { name, ...(digits ? { phone: `+51${digits.slice(-9)}` } : {}), ...(serviceId ? { serviceId } : {}), ...(staffId ? { staffId } : {}), ...(sede ? { locationId: sede } : {}) },
      });
      saveTicket(tenant, out);
      try {
        const prev = JSON.parse(localStorage.getItem('datepe_cliente') ?? '{}') as Record<string, string>;
        localStorage.setItem('datepe_cliente', JSON.stringify({ ...prev, name, ...(digits ? { phone: `+51${digits.slice(-9)}` } : {}) }));
      } catch { /* */ }
      haptic.success();
      if (out.existing) toast.info(`Ya tenías el turno ${out.number}.`);
      router.push(`/turno?t=${encodeURIComponent(out.token)}`);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'error';
      if (code === 'falta_celular') setPhoneError(true);
      toast.error(queueError(code, err instanceof ApiError ? err.data : undefined));
      if (code === 'cerrado' || code === 'fila_llena') load();
      setBusy(false);
    }
  }

  // ---------------------------- Estados ----------------------------
  if (off) {
    return (
      <Centered>
        <Info size={28} strokeWidth={1.5} className="text-soft" />
        <h1 className="mt-4 text-[24px] font-semibold tracking-[-0.03em]">Esta barbería no usa fila virtual</h1>
        <p className="mt-2 text-[15px] text-mute">Puedes reservar tu hora o acercarte al local.</p>
        <Link href="/reservar" className="mt-6 inline-flex min-h-[48px] items-center rounded-full bg-ink px-6 text-[15px] font-medium text-white">Reservar una hora</Link>
      </Centered>
    );
  }
  if (!data) {
    return (
      <Centered>
        {loadError ? (
          <>
            <WifiOff size={28} strokeWidth={1.5} className="text-soft" />
            <h1 className="mt-4 text-[20px] font-semibold tracking-[-0.02em]">No pudimos cargar la fila</h1>
            <button type="button" onClick={load} className="mt-5 min-h-[44px] rounded-full border border-line px-5 text-[15px] font-medium hover:border-ink">Reintentar</button>
          </>
        ) : (
          <Loader2 className="animate-spin text-soft" size={28} strokeWidth={1.75} />
        )}
      </Centered>
    );
  }

  const shop = data.tenant.name;
  const logo = logoUrl ?? data.branding?.logo_url;
  const multiSede = (data.locations?.length ?? 0) > 1;

  if (data.needsLocation && data.locations) {
    return (
      <main className="mx-auto min-h-dvh max-w-md px-5 pb-12 pt-[calc(2.5rem+env(safe-area-inset-top))]">
        <Toaster />
        <p className="text-[15px] text-mute">{shop}</p>
        <h1 className="mt-1 text-[30px] font-semibold leading-[1.1] tracking-[-0.035em]">¿En qué sede estás?</h1>
        <p className="mt-2 text-[16px] text-mute">Cada sede tiene su propia fila.</p>
        <div className="mt-6 grid gap-2">
          {data.locations.map((l) => (
            <button key={l.id} type="button" onClick={() => chooseSede(l.id)} className="flex min-h-16 items-center gap-3 rounded-xl border border-line px-4 text-left active:bg-field">
              <MapPin size={20} strokeWidth={1.75} className="shrink-0 text-mute" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[17px] font-medium">{l.name}</span>
                {(l.address || l.district) && <span className="block truncate text-[14px] text-mute">{l.address && l.district && l.address.includes(l.district) ? l.address : [l.address, l.district].filter(Boolean).join(', ')}</span>}
              </span>
              <ChevronRight size={18} strokeWidth={1.75} className="text-soft" />
            </button>
          ))}
        </div>
      </main>
    );
  }
  const full = data.waitingCount >= data.queueConfig.maxWaiting;
  const closed = !data.open;
  const canJoin = data.features.queue && !closed && !full;

  return (
    <main className="mx-auto min-h-dvh max-w-md pb-[calc(120px+env(safe-area-inset-bottom))]" style={{ ['--accent' as string]: accent }}>
      <style>{FLD}</style>
      <Toaster />
      <header className="pt-safe sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur-md">
        <div className="flex h-14 items-center gap-3 px-5">
          <Link href="/" className="flex min-w-0 flex-1 items-center gap-3">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold" style={{ background: accent, color: onAccent }}>{initialOf(shop)}</span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-[16px] font-semibold tracking-[-0.02em]">{shop}</span>
              {multiSede && data.location && <span className="block truncate text-[13px] text-mute">{data.location.name}</span>}
            </span>
          </Link>
          {multiSede && (
            <button type="button" onClick={() => chooseSede(null)} className="min-h-10 shrink-0 rounded-full px-3 text-[14px] font-medium text-mute active:bg-field">Cambiar sede</button>
          )}
          <span className={`inline-flex items-center gap-1.5 text-[13px] ${online ? 'text-mute' : 'text-soft'}`}>
            {online ? <span className="h-2 w-2 rounded-full bg-ok" aria-hidden /> : <WifiOff size={14} strokeWidth={1.75} />}
            {online ? 'En vivo' : 'Reconectando'}
          </span>
        </div>
      </header>

      <section className="px-5 pt-7">
        {closed ? (
          <div className="rise-in">
            <CalendarOff size={26} strokeWidth={1.5} className="text-soft" />
            <h1 className="mt-4 text-[30px] font-semibold leading-[1.1] tracking-[-0.035em]">
              {data.opensAt ? <>Abrimos a las <span className="tnum">{data.opensAt}</span></> : 'La fila está cerrada'}
            </h1>
            <p className="mt-2 text-[16px] text-mute">{data.queueConfig.closedMessage || 'La fila virtual abre en el horario de atención.'}</p>
          </div>
        ) : full ? (
          <div className="rise-in">
            <Users size={26} strokeWidth={1.5} className="text-soft" />
            <h1 className="mt-4 text-[30px] font-semibold leading-[1.1] tracking-[-0.035em]">La fila está llena por ahora</h1>
            <p className="mt-2 text-[16px] text-mute">Hay {data.waitingCount} personas esperando. Vuelve a intentar en unos minutos, esta página se actualiza sola.</p>
          </div>
        ) : (
          <div className="rise-in">
            <p className="text-[15px] text-mute">Fila virtual</p>
            <h1 className="mt-1 text-[30px] font-semibold leading-[1.1] tracking-[-0.035em]">
              {ahead === 0 ? 'No hay nadie antes que tú' : ahead === 1 ? 'Hay 1 persona antes que tú' : <>Hay <span className="tnum">{ahead}</span> personas antes que tú</>}
            </h1>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="tnum inline-flex items-center gap-1.5 rounded-full bg-field px-3.5 py-2 text-[14px] font-medium">
                <Clock size={15} strokeWidth={1.75} /> {ahead === 0 ? 'Te atienden al toque' : `Espera aprox. ${fmtMinutes(data.estimatedWaitMin)}`}
              </span>
              {data.barbersNow > 0 && (
                <span className="tnum inline-flex items-center gap-1.5 rounded-full bg-field px-3.5 py-2 text-[14px] font-medium">
                  <Users size={15} strokeWidth={1.75} /> {data.barbersNow === 1 ? '1 barbero atendiendo' : `${data.barbersNow} barberos atendiendo`}
                </span>
              )}
            </div>
          </div>
        )}
      </section>

      {saved && (
        <section className="px-5 pt-6">
          <Link
            href={`/turno?t=${encodeURIComponent(saved.token)}`}
            onClick={() => haptic.tap()}
            className="rise-in flex items-center gap-4 rounded-xl p-4 shadow-lift"
            style={{ background: accent, color: onAccent }}
          >
            <span className="tnum flex h-14 min-w-14 items-center justify-center rounded-lg px-2 text-[26px] font-semibold" style={{ background: 'rgba(255,255,255,0.16)' }}>{saved.number}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] font-semibold tracking-[-0.02em]">Ya tienes un turno hoy</span>
              <span className="block text-[14px] opacity-85">Ver mi turno</span>
            </span>
            <ChevronRight size={22} strokeWidth={1.75} />
          </Link>
        </section>
      )}

      {canJoin && (
        <form id="join" onSubmit={join} className="space-y-7 px-5 pt-8">
          {data.queueConfig.welcome && <p className="rounded-xl bg-field px-4 py-3 text-[15px] text-ink-2">{data.queueConfig.welcome}</p>}
          {saved && <h2 className="text-[17px] font-semibold tracking-[-0.02em]">¿Sacar un turno para otra persona?</h2>}

          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[14px] font-medium">Tu nombre</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="given-name" autoCapitalize="words" enterKeyHint="next" maxLength={40} className="fld" placeholder="Así te llamamos en la pantalla" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[14px] font-medium">{data.queueConfig.askPhone ? 'Celular' : 'Celular (opcional)'}</span>
              <div className={`flex items-center rounded-xl border bg-white focus-within:border-ink ${phoneError ? 'border-red' : 'border-line-2'}`}>
                <span className="tnum border-r border-line pl-4 pr-3 text-[16px] text-mute">+51</span>
                <input
                  value={form.phone}
                  onChange={(e) => { setForm({ ...form, phone: e.target.value }); setPhoneError(false); }}
                  inputMode="tel"
                  autoComplete="tel-national"
                  className="tnum w-full bg-transparent px-3 py-3.5 text-[16px] outline-none"
                  placeholder="987 654 321"
                />
              </div>
              <span className={`mt-1 block text-[13px] ${phoneError ? 'text-red-deep' : 'text-soft'}`}>
                {phoneError ? 'Escribe un celular de 9 dígitos.' : 'Si vuelves a entrar con el mismo celular, recuperas tu turno.'}
              </span>
            </label>
          </div>

          {data.services.length > 0 && (
            <fieldset className="min-w-0">
              <legend className="mb-2 text-[14px] font-medium">¿Qué te vas a hacer? <span className="font-normal text-soft">(opcional)</span></legend>
              <div className="flex flex-wrap gap-2">
                {data.services.map((s) => {
                  const on = serviceId === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => { haptic.select(); setServiceId(on ? null : s.id); }}
                      className={`inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-[15px] transition-colors ${on ? 'bg-ink text-white' : 'bg-field hover:bg-line'}`}
                    >
                      {on && <Check size={15} strokeWidth={2} />}
                      {s.name}
                      <span className={`tnum text-[13px] ${on ? 'text-white/70' : 'text-mute'}`}>{soles(s.price_cents)}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          {data.queueConfig.allowStaffChoice && data.staff.length > 1 && (
            <fieldset className="min-w-0">
              <legend className="mb-2 text-[14px] font-medium">¿Con quién?</legend>
              <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
                <StaffChip on={!staffId} onClick={() => { haptic.select(); setStaffId(null); }} name="El primero libre" sub="Menos espera" />
                {data.staff.map((s) => {
                  const n = waitingFor(s.name);
                  return (
                    <StaffChip
                      key={s.id}
                      on={staffId === s.id}
                      onClick={() => { haptic.select(); setStaffId(s.id); }}
                      name={s.name}
                      photo={s.photo_url}
                      sub={n === 0 ? 'Sin fila propia' : n === 1 ? '1 lo espera' : `${n} lo esperan`}
                    />
                  );
                })}
              </div>
              {staffId && <p className="mt-2 text-[13px] text-soft">Si eliges barbero, esperas a que él se libere aunque otro esté disponible.</p>}
            </fieldset>
          )}

          <p className="flex items-start gap-2 text-[14px] text-mute">
            <BellRing size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
            Verás tu turno en vivo y te avisamos cuando falte poco. No necesitas quedarte en el local.
          </p>
        </form>
      )}

      {data.features.booking && (
        <section className="px-5 pt-8">
          <Link href="/reservar" className="flex min-h-[56px] items-center gap-3 rounded-xl border border-line px-4 hover:border-ink">
            <CalendarClock size={20} strokeWidth={1.75} className="shrink-0" />
            <span className="flex-1 text-[15px]">¿Prefieres reservar hora? <span className="font-medium underline underline-offset-4">Reservar</span></span>
            <ChevronRight size={18} strokeWidth={1.75} className="text-soft" />
          </Link>
        </section>
      )}

      {canJoin && (
        <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur-md">
          <div className="mx-auto max-w-md px-5 pt-3">
            <button
              type="submit"
              form="join"
              disabled={busy}
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full text-[16px] font-medium transition-opacity disabled:opacity-60"
              style={{ background: accent, color: onAccent }}
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Ticket size={19} strokeWidth={1.75} />}
              {saved ? 'Sacar otro turno' : 'Sacar mi turno'}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function StaffChip({ on, onClick, name, sub, photo }: { on: boolean; onClick: () => void; name: string; sub: string; photo?: string | null }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex w-[104px] shrink-0 flex-col items-center rounded-xl border px-2 py-3 text-center transition-all ${on ? '-translate-y-0.5 border-ink bg-field shadow-lift' : 'border-line hover:border-ink'}`}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="h-12 w-12 rounded-full object-cover" />
      ) : (
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white">
          <Users size={20} strokeWidth={1.75} />
        </span>
      )}
      <span className="mt-2 w-full truncate text-[14px] font-medium">{name}</span>
      <span className="w-full truncate text-[12px] text-mute">{sub}</span>
    </button>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">{children}</main>;
}
