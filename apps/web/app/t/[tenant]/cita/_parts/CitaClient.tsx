'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { NotifyMe } from '../../_site/NotifyMe';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronLeft, ChevronRight, CalendarPlus, Navigation, Loader2, MapPin, Scissors, User, Clock, CalendarClock, CalendarX2,
  Star, Info, CircleCheck, Users, Search, Wallet, Gift, Package, Crown,
} from 'lucide-react';
import { API_BASE_CLIENT } from '@/lib/config';
import { onColor } from '@/lib/color';
import { soles, type TenantSite } from '@/lib/api';
import { Toaster } from '@/components/Toaster';
import { Sheet } from '@/components/Sheet';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import { InviteCard, WhatsAppIcon, buildDays, fmtDayLong, fmtTime, icsFor, waLink, TZ } from './shared';

interface Booking {
  id: string;
  status: 'pending' | 'confirmed' | 'completed' | 'no_show' | 'cancelled';
  starts_at: string;
  ends_at: string;
  price_cents: number;
  staff_id: string | null;
  staff_name: string | null;
  location_id?: string | null;
  location_name: string | null;
  address: string | null;
  service_id: string | null;
  addon_ids: string[] | null;
  service_name: string | null;
  paid_cents: number;
  reviewed: boolean | number;
  referral_code: string | null;
  referral_enabled: boolean;
  referral_discount_percent: number;
  phone_hint: string | null;
  cancel_window_hours: number;
  can_cancel: boolean;
  can_reschedule: boolean;
  client_name: string | null;
  manage_token?: string;
}
interface Slot { start: string; end: string; staffId: string }
type Ref = { t: string } | { id: string; phone: string };

const STATUS: Record<Booking['status'], { label: string; cls: string }> = {
  pending: { label: 'Por confirmar', cls: 'bg-field text-ink' },
  confirmed: { label: 'Confirmada', cls: 'bg-ok-tint text-ok' },
  completed: { label: 'Atendida', cls: 'bg-field text-ink' },
  no_show: { label: 'No asististe', cls: 'bg-red-tint text-red' },
  cancelled: { label: 'Cancelada', cls: 'bg-red-tint text-red' },
};
const REASONS = ['No podré ir', 'Me equivoqué de hora', 'Encontré otro horario', 'Otro motivo'];
const limaHour = (iso: string) => Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: TZ }).format(new Date(iso)));
const refQuery = (r: Ref) => new URLSearchParams('t' in r ? { t: r.t } : { id: r.id, phone: r.phone }).toString();

export function CitaClient({ site, tenant }: { site: TenantSite; tenant: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const headers = useMemo(() => ({ 'Content-Type': 'application/json', 'X-Tenant-Slug': tenant }), [tenant]);
  const accent = site.branding?.color_primary ?? '#0a0a0a';
  const onAccent = onColor(accent);
  const whatsapp = site.branding?.whatsapp ?? null;

  const initialRef = useMemo<Ref | null>(() => {
    const t = params.get('t');
    if (t) return { t };
    const id = params.get('id');
    const phone = params.get('phone');
    if (id && phone) return { id, phone };
    return null;
  }, [params]);

  const [ref, setRef] = useState<Ref | null>(initialRef);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(!!initialRef);
  const [missing, setMissing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Formulario de búsqueda
  const [fId, setFId] = useState(params.get('id') ?? '');
  const [fPhone, setFPhone] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);

  const load = useCallback(
    async (r: Ref, quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const res = await fetch(`${API_BASE_CLIENT}/api/public/booking?${refQuery(r)}`, { headers });
        if (!res.ok) {
          setMissing(true);
          setBooking(null);
          return false;
        }
        const d = (await res.json()) as { booking: Booking };
        setBooking(d.booking);
        setMissing(false);
        return true;
      } catch {
        toast.error('Sin conexión. Intenta de nuevo.');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [headers],
  );

  useEffect(() => {
    if (initialRef) load(initialRef);
  }, [initialRef, load]);

  // Las acciones usan el enlace seguro si la API lo devolvió
  const actionRef: Ref | null = booking?.manage_token ? { t: booking.manage_token } : ref;
  const actionKey = actionRef ? refQuery(actionRef) : '';

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    const id = fId.trim();
    const phone = fPhone.replace(/\D/g, '');
    if (!/^[0-9a-f-]{8,36}$/i.test(id)) return toast.error('Revisa el código de reserva. Está en tu correo de confirmación.');
    if (phone.length < 9) return toast.error('Escribe los 9 dígitos de tu celular.');
    setLookupBusy(true);
    const r = { id: id.toLowerCase(), phone };
    const ok = await load(r, true);
    setLookupBusy(false);
    if (ok) {
      haptic.success();
      setRef(r);
    } else toast.error('No encontramos una reserva con ese código y celular.');
  }

  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push('/');
  }

  // ------------------------- Reprogramar -------------------------
  const days = useMemo(() => buildDays(21), []);
  const [resOpen, setResOpen] = useState(false);
  const [dayIdx, setDayIdx] = useState(0);
  const [staffChoice, setStaffChoice] = useState<string>('any');
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [picked, setPicked] = useState<Slot | null>(null);
  const [resBusy, setResBusy] = useState(false);
  const [slotsKey, setSlotsKey] = useState(0);
  const slotSeq = useRef(0);
  const dayStripRef = useRef<HTMLDivElement>(null);

  const staffOptions = useMemo(
    () => site.staff.filter((s) => !booking?.location_id || !s.location_id || s.location_id === booking.location_id),
    [site.staff, booking?.location_id],
  );

  function openReschedule() {
    if (!booking) return;
    haptic.tap();
    const startIso = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(booking.starts_at));
    const i = days.findIndex((d) => d.iso === startIso);
    setDayIdx(i >= 0 ? i : 0);
    setStaffChoice(booking.staff_id ?? 'any');
    setPicked(null);
    setSlots(null);
    setResOpen(true);
  }

  // Desde "Mi cuenta" (?cambiar=1): se abre directo la hoja para elegir otra hora
  const autoRes = useRef(false);
  useEffect(() => {
    if (autoRes.current || !booking?.can_reschedule) return;
    if (new URLSearchParams(window.location.search).get('cambiar') !== '1') return;
    autoRes.current = true;
    openReschedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking]);

  useEffect(() => {
    if (!resOpen || !actionKey) return;
    const seq = ++slotSeq.current;
    setSlots(null);
    setPicked(null);
    const q = new URLSearchParams(actionKey);
    q.set('date', days[dayIdx].iso);
    if (staffChoice !== 'any') q.set('staffId', staffChoice);
    fetch(`${API_BASE_CLIENT}/api/public/booking/slots?${q}`, { headers })
      .then((r) => (r.ok ? r.json() : { slots: [] }))
      .then((d: { slots?: Slot[] }) => {
        if (seq !== slotSeq.current) return;
        // Con "cualquiera", una sola opción por hora
        const seen = new Set<string>();
        setSlots((d.slots ?? []).filter((s) => (seen.has(s.start) ? false : (seen.add(s.start), true))));
      })
      .catch(() => seq === slotSeq.current && setSlots([]));
  }, [resOpen, dayIdx, staffChoice, headers, days, actionKey, slotsKey]);

  useEffect(() => {
    if (!resOpen) return;
    const el = dayStripRef.current?.querySelector<HTMLElement>(`[data-day="${dayIdx}"]`);
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [dayIdx, resOpen]);

  async function doReschedule() {
    if (!picked || !actionRef || !booking) return;
    setResBusy(true);
    try {
      const res = await fetch(`${API_BASE_CLIENT}/api/public/booking/reschedule`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...actionRef, startsAt: picked.start, staffId: picked.staffId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (d.error === 'slot_ocupado') {
          toast.error('Alguien tomó esa hora hace un momento. Elige otra.');
          setSlotsKey((k) => k + 1);
        } else if (d.error === 'fuera_de_plazo') {
          toast.error(`Solo puedes cambiar la hora hasta ${d.hours ?? booking.cancel_window_hours} horas antes.`);
          setResOpen(false);
          load(actionRef, true);
        } else toast.error('No pudimos cambiar la hora. Intenta de nuevo.');
        return;
      }
      toast.success('Listo, cambiamos tu cita');
      setNotice(`Tu nueva hora: ${fmtDayLong(picked.start)}, ${fmtTime(picked.start)}.`);
      setResOpen(false);
      await load(actionRef, true);
    } catch {
      toast.error('Sin conexión. Intenta de nuevo.');
    } finally {
      setResBusy(false);
    }
  }

  // ------------------------- Cancelar -------------------------
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  async function doCancel() {
    if (!actionRef || !booking) return;
    setCancelBusy(true);
    try {
      const res = await fetch(`${API_BASE_CLIENT}/api/public/booking/cancel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...actionRef, reason: reason ?? undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (d.error === 'fuera_de_plazo') toast.error(`Solo puedes cancelar hasta ${d.hours ?? booking.cancel_window_hours} horas antes.`);
        else toast.error('No pudimos cancelar tu reserva. Intenta de nuevo.');
        setCancelOpen(false);
        load(actionRef, true);
        return;
      }
      toast.success('Tu reserva fue cancelada');
      setNotice(null);
      setCancelOpen(false);
      await load(actionRef, true);
    } catch {
      toast.error('Sin conexión. Intenta de nuevo.');
    } finally {
      setCancelBusy(false);
    }
  }

  // ------------------------- Vistas -------------------------
  const topBar = (
    <div className="pt-safe sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-lg items-center gap-1 px-2">
        <button type="button" onClick={goBack} className="flex h-11 w-11 items-center justify-center rounded-full active:bg-field" aria-label="Atrás">
          <ChevronLeft size={26} strokeWidth={1.75} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-[16px] font-semibold tracking-[-0.02em]">Mi reserva</div>
          <div className="truncate text-[12px] text-mute">{site.tenant.name}</div>
        </div>
        <span className="w-11" aria-hidden />
      </div>
    </div>
  );

  const wrap = (children: React.ReactNode) => (
    <div className="min-h-dvh bg-white">
      <Toaster />
      {topBar}
      <main className="mx-auto max-w-lg px-5 pb-[calc(40px+env(safe-area-inset-bottom))] pt-6">{children}</main>
    </div>
  );

  if (loading) {
    return wrap(
      <div className="space-y-3" aria-busy>
        <div className="h-7 w-32 animate-pulse rounded-full bg-field" />
        <div className="h-10 w-3/4 animate-pulse rounded-lg bg-field" />
        <div className="h-48 animate-pulse rounded-xl bg-field" />
        <div className="h-12 animate-pulse rounded-lg bg-field" />
      </div>,
    );
  }

  if (!booking) {
    return wrap(
      <form onSubmit={lookup}>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.035em]">Busca tu reserva</h1>
        <p className="mt-2 text-[16px] text-mute">
          {missing
            ? 'No encontramos tu reserva con ese enlace. Búscala con el código de tu correo y tu celular.'
            : 'Escribe el código de reserva de tu correo de confirmación y el celular con el que reservaste.'}
        </p>
        <label className="mt-8 block">
          <span className="mb-1.5 block text-[14px] font-medium">Código de reserva</span>
          <input
            value={fId}
            onChange={(e) => setFId(e.target.value.trim().toUpperCase())}
            autoComplete="off"
            maxLength={36}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="tnum w-full rounded-xl border border-line-2 px-4 py-3.5 text-[16px] outline-none focus:border-ink"
            placeholder="Ej. 3F2A9C1E"
          />
        </label>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-[14px] font-medium">Celular</span>
          <div className="flex items-center rounded-xl border border-line-2 focus-within:border-ink">
            <span className="tnum border-r border-line pl-4 pr-3 text-[16px] text-mute">+51</span>
            <input
              value={fPhone}
              onChange={(e) => setFPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel-national"
              className="tnum w-full bg-transparent px-3 py-3.5 text-[16px] outline-none"
              placeholder="987 654 321"
            />
          </div>
        </label>
        <button
          disabled={lookupBusy || !fId.trim() || fPhone.replace(/\D/g, '').length < 9}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg py-3.5 text-[16px] font-medium disabled:opacity-40"
          style={{ background: accent, color: onAccent }}
        >
          {lookupBusy ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} strokeWidth={1.75} />} Buscar mi reserva
        </button>
        {whatsapp && (
          <a href={waLink(whatsapp, 'Hola, necesito ayuda con mi reserva.')} target="_blank" rel="noopener noreferrer" className="mt-4 flex min-h-[44px] items-center justify-center gap-2 text-[15px] text-mute underline hover:text-ink">
            <WhatsAppIcon size={16} /> ¿No lo encuentras? Escríbenos por WhatsApp
          </a>
        )}
      </form>,
    );
  }

  const b = booking;
  const st = STATUS[b.status] ?? STATUS.pending;
  const upcoming = ['pending', 'confirmed'].includes(b.status) && new Date(b.starts_at).getTime() > Date.now();
  const loc = site.locations.find((l) => l.id === b.location_id) ?? site.locations.find((l) => l.name === b.location_name) ?? (site.locations.length === 1 ? site.locations[0] : undefined);
  const address = b.address ?? loc?.address ?? null;
  const mapsUrl =
    loc?.lat != null && loc?.lng != null
      ? `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${site.tenant.name} ${address ?? ''}`.trim())}`;
  const ics = icsFor({
    id: b.id,
    start: b.starts_at,
    end: b.ends_at,
    title: `${b.service_name ?? 'Cita'} en ${site.tenant.name}`,
    location: `${address ?? ''} ${loc?.district ?? ''}`.trim(),
  });
  const firstName = (b.client_name ?? '').split(' ')[0];
  const walletToken = b.manage_token ?? (ref && 't' in ref ? ref.t : null);
  const rest = Math.max(0, b.price_cents - b.paid_cents);
  const waText = `Hola, tengo una reserva para el ${fmtDayLong(b.starts_at).toLowerCase()} a las ${fmtTime(b.starts_at)}.`;
  const reviewHref = `/resena?cita=${b.id}${ref && 'phone' in ref ? `&tel=${ref.phone.replace(/\D/g, '').slice(-9)}` : ''}`;

  const daySlots = slots ?? [];
  const groups = [
    { label: 'Mañana', items: daySlots.filter((s) => limaHour(s.start) < 12) },
    { label: 'Tarde', items: daySlots.filter((s) => limaHour(s.start) >= 12 && limaHour(s.start) < 18) },
    { label: 'Noche', items: daySlots.filter((s) => limaHour(s.start) >= 18) },
  ].filter((g) => g.items.length > 0);

  return wrap(
    <>
      <span className={`inline-flex items-center rounded-full px-3 py-1 text-[13px] font-medium ${st.cls}`}>{st.label}</span>
      <h1 className={`mt-3 text-[28px] font-semibold leading-[1.1] tracking-[-0.035em] ${b.status === 'cancelled' ? 'text-mute line-through decoration-1' : ''}`}>
        {fmtDayLong(b.starts_at)}
        <span className="tnum block">{fmtTime(b.starts_at)}</span>
      </h1>
      {firstName && <p className="mt-2 text-[16px] text-mute">A nombre de {firstName}{b.phone_hint ? `, celular ${b.phone_hint}` : ''}</p>}

      {notice && b.status !== 'cancelled' && (
        <div className="rise-in mt-5 flex items-start gap-3 rounded-xl bg-ok-tint p-4 text-[15px] text-ok">
          <CircleCheck size={20} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      <dl className="mt-6 divide-y divide-line rounded-xl border border-line text-[15px]">
        <Row icon={<Scissors size={17} strokeWidth={1.75} />} label="Servicio" value={b.service_name ?? ''} />
        {b.staff_name && <Row icon={<User size={17} strokeWidth={1.75} />} label="Barbero" value={b.staff_name} />}
        <Row
          icon={<Clock size={17} strokeWidth={1.75} />}
          label="Duración"
          value={`${Math.round((new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60000)} min`}
        />
        {(b.location_name || address) && (
          <Row
            icon={<MapPin size={17} strokeWidth={1.75} />}
            label={site.locations.length >= 2 ? 'Sede' : 'Dirección'}
            value={
              <>
                {site.locations.length >= 2 && b.location_name && <span className="block">{b.location_name}</span>}
                {address && <span className={site.locations.length >= 2 ? 'block text-mute' : 'block'}>{address}</span>}
              </>
            }
          />
        )}
        <Row
          icon={<Wallet size={17} strokeWidth={1.75} />}
          label="Precio"
          value={
            <>
              <span className="tnum block">{soles(b.price_cents)}</span>
              {b.paid_cents > 0 && <span className="tnum block text-[14px] text-ok">Adelanto pagado {soles(b.paid_cents)}</span>}
              {b.paid_cents > 0 && upcoming && rest > 0 && <span className="tnum block text-[14px] text-mute">Pagas en la barbería {soles(rest)}</span>}
            </>
          }
        />
      </dl>

      {/* Acciones */}
      {upcoming && (b.can_reschedule || b.can_cancel) && (
        <div className="mt-6 space-y-2">
          {b.can_reschedule && (
            <button type="button" onClick={openReschedule} className="flex w-full items-center justify-center gap-2 rounded-lg py-3.5 text-[16px] font-medium" style={{ background: accent, color: onAccent }}>
              <CalendarClock size={18} strokeWidth={1.75} /> Cambiar hora
            </button>
          )}
          {b.can_cancel && (
            <button
              type="button"
              onClick={() => { haptic.tap(); setReason(null); setCancelOpen(true); }}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg text-[15px] font-medium text-red hover:bg-red-tint"
            >
              <CalendarX2 size={17} strokeWidth={1.75} /> Cancelar reserva
            </button>
          )}
          {!b.can_reschedule && (
            <p className="flex items-start gap-2 pt-1 text-[14px] text-mute">
              <Info size={15} strokeWidth={1.75} className="mt-0.5 shrink-0" />
              Para cambiar la hora, escríbele a la barbería{whatsapp ? ' por WhatsApp' : ''}.
            </p>
          )}
        </div>
      )}
      {upcoming && !b.can_cancel && (
        <div className="mt-6 flex items-start gap-3 rounded-xl bg-field p-4 text-[15px]">
          <Info size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <p>
            Solo puedes cambiar o cancelar hasta {b.cancel_window_hours} horas antes.
            {whatsapp ? ' Escríbenos por WhatsApp y vemos cómo ayudarte.' : ' Comunícate con la barbería.'}
          </p>
        </div>
      )}

      {b.status === 'completed' && !Number(b.reviewed) && (
        <Link href={reviewHref} className="mt-6 flex items-center gap-3 rounded-xl border border-line p-4 hover:border-ink">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-field"><Star size={18} strokeWidth={1.75} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-medium">Deja tu opinión</span>
            <span className="block text-[14px] text-mute">¿Qué tal te fue{b.staff_name ? ` con ${b.staff_name}` : ''}? Toma un minuto.</span>
          </span>
          <ChevronRight size={18} strokeWidth={1.75} className="text-mute" />
        </Link>
      )}

      {upcoming && walletToken && <NotifyMe tenant={tenant} manageToken={walletToken} className="mt-6" />}

      {walletToken && <WalletCard tenant={tenant} token={walletToken} accent={accent} />}

      {/* Utilidades */}
      <div className="mt-6 grid grid-cols-2 gap-2">
        {upcoming && (
          <a
            href={`data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`}
            download="cita-date-pe.ics"
            onClick={() => haptic.tap()}
            className="flex min-h-[48px] items-center justify-center gap-2 rounded-lg border border-line px-3 text-[15px] font-medium hover:border-ink"
          >
            <CalendarPlus size={17} strokeWidth={1.75} /> Calendario
          </a>
        )}
        {(address || loc) && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-[48px] items-center justify-center gap-2 rounded-lg border border-line px-3 text-[15px] font-medium hover:border-ink">
            <Navigation size={17} strokeWidth={1.75} /> Cómo llegar
          </a>
        )}
        {whatsapp && (
          <a
            href={waLink(whatsapp, waText)}
            target="_blank"
            rel="noopener noreferrer"
            className="col-span-2 flex min-h-[48px] items-center justify-center gap-2 rounded-lg border border-line px-3 text-[15px] font-medium hover:border-ink"
          >
            <span className="text-[#25D366]"><WhatsAppIcon size={18} /></span> Escribir por WhatsApp
          </a>
        )}
      </div>

      {b.referral_code && b.referral_enabled && (
        <div className="mt-8">
          <InviteCard
            code={b.referral_code}
            percent={b.referral_discount_percent}
            shopName={site.tenant.name}
            bookUrl={typeof window !== 'undefined' ? `${window.location.origin}/reservar` : ''}
          />
        </div>
      )}

      {!upcoming && site.tenant.available !== false && (
        <Link href="/reservar" className="mt-8 flex items-center justify-center rounded-lg py-3.5 text-[16px] font-medium" style={{ background: accent, color: onAccent }}>
          Reservar otra cita
        </Link>
      )}
      <Link href="/" className="mt-6 inline-flex min-h-[44px] items-center text-[15px] text-mute underline hover:text-ink">
        Volver a {site.tenant.name}
      </Link>

      {/* Hoja: cambiar hora */}
      <Sheet
        open={resOpen}
        onClose={() => setResOpen(false)}
        title="Cambiar hora"
        footer={
          <button
            type="button"
            disabled={!picked || resBusy}
            onClick={doReschedule}
            className="flex w-full items-center justify-center gap-2 rounded-lg py-3.5 text-[16px] font-medium disabled:opacity-40"
            style={{ background: accent, color: onAccent }}
          >
            {resBusy && <Loader2 size={18} className="animate-spin" />}
            {picked ? `Cambiar al ${fmtDayLong(picked.start).toLowerCase()}, ${fmtTime(picked.start)}` : 'Elige una hora'}
          </button>
        }
      >
        {staffOptions.length > 1 && (
          <div className="mb-5">
            <div className="mb-2 text-[13px] font-medium text-mute">Barbero</div>
            <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 md:-mx-6 md:px-6">
              {[{ id: 'any', name: 'Cualquiera' }, ...staffOptions].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { haptic.select(); setStaffChoice(s.id); }}
                  className={`flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full px-4 text-[15px] transition-colors ${staffChoice === s.id ? 'bg-ink text-white' : 'bg-field hover:bg-line'}`}
                >
                  {s.id === 'any' && <Users size={15} strokeWidth={1.75} />}
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div ref={dayStripRef} className="no-scrollbar -mx-5 flex snap-x gap-2 overflow-x-auto px-5 pb-1 md:-mx-6 md:px-6">
          {days.map((d, i) => (
            <button
              key={d.iso}
              type="button"
              data-day={i}
              onClick={() => { haptic.select(); setDayIdx(i); }}
              className={`flex w-[60px] shrink-0 snap-start flex-col items-center rounded-xl border py-2.5 transition-colors ${i === dayIdx ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink'}`}
            >
              <span className={`text-[12px] ${i === dayIdx ? 'text-white/70' : 'text-mute'}`}>{d.top}</span>
              <span className="tnum text-[18px] font-medium leading-tight">{d.num}</span>
              <span className={`text-[11px] ${i === dayIdx ? 'text-white/70' : 'text-soft'}`}>{d.month}</span>
            </button>
          ))}
        </div>
        <div className="mt-5 min-h-[160px]">
          {slots === null && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {Array.from({ length: 9 }, (_, i) => <div key={i} className="h-11 animate-pulse rounded-lg bg-field" />)}
            </div>
          )}
          {slots !== null && groups.length === 0 && (
            <div className="rounded-xl bg-field p-6 text-center">
              <p className="text-[15px]">No quedan horarios este día.</p>
              {dayIdx < days.length - 1 && (
                <button type="button" onClick={() => setDayIdx(dayIdx + 1)} className="mt-2 min-h-[44px] text-[15px] font-medium underline">
                  Ver el día siguiente
                </button>
              )}
            </div>
          )}
          {groups.map((g) => (
            <div key={g.label} className="mb-5">
              <div className="mb-2 text-[13px] font-medium text-mute">{g.label}</div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {g.items.map((s) => {
                  const current = new Date(s.start).getTime() === new Date(b.starts_at).getTime() && s.staffId === b.staff_id;
                  const on = picked?.start === s.start && picked?.staffId === s.staffId;
                  return (
                    <button
                      key={s.start + s.staffId}
                      type="button"
                      disabled={current}
                      onClick={() => { haptic.select(); setPicked(s); }}
                      className={`tnum h-11 rounded-lg border text-[15px] transition-all disabled:cursor-not-allowed disabled:border-dashed disabled:text-soft ${
                        on ? '-translate-y-0.5 border-ink bg-ink text-white shadow-lift' : 'border-line hover:border-ink'
                      }`}
                      aria-label={current ? `${fmtTime(s.start)}, tu hora actual` : fmtTime(s.start)}
                    >
                      {fmtTime(s.start)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Sheet>

      {/* Hoja: cancelar */}
      <Sheet
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancelar reserva"
        footer={
          <div className="flex w-full gap-2">
            <button type="button" onClick={() => setCancelOpen(false)} className="min-h-[48px] flex-1 rounded-lg border border-line text-[15px] font-medium hover:border-ink">
              Mantener
            </button>
            <button
              type="button"
              disabled={cancelBusy}
              onClick={doCancel}
              className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-lg bg-red text-[15px] font-medium text-white hover:bg-red-deep disabled:opacity-40"
            >
              {cancelBusy && <Loader2 size={17} className="animate-spin" />} Sí, cancelar
            </button>
          </div>
        }
      >
        <p className="text-[16px]">
          {b.service_name}, {fmtDayLong(b.starts_at).toLowerCase()} a las {fmtTime(b.starts_at)}.
        </p>
        {b.paid_cents > 0 && (
          <p className="mt-2 text-[14px] text-mute">Sobre tu adelanto de {soles(b.paid_cents)}, la barbería te contactará según su política.</p>
        )}
        <div className="mt-6 text-[13px] font-medium text-mute">¿Por qué cancelas? (opcional)</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={reason === r}
              onClick={() => { haptic.select(); setReason(reason === r ? null : r); }}
              className={`min-h-[44px] rounded-full px-4 text-[15px] transition-colors ${reason === r ? 'bg-ink text-white' : 'bg-field hover:bg-line'}`}
            >
              {r}
            </button>
          ))}
        </div>
        {b.can_reschedule && (
          <button
            type="button"
            onClick={() => { setCancelOpen(false); setTimeout(openReschedule, 350); }}
            className="mt-6 flex min-h-[44px] items-center gap-2 text-[15px] font-medium underline underline-offset-4"
          >
            <CalendarClock size={17} strokeWidth={1.75} /> Mejor cambio la hora
          </button>
        )}
      </Sheet>
    </>,
  );
}

interface WalletData {
  points: number;
  packages: Array<{ id: string; name: string; uses_total: number; uses_left: number; expires_at: string | null }>;
  memberships: Array<{ id: string; name: string; ends_at: string; discount_percent: number | null; included_uses: number | null }>;
  rewards: Array<{ id: string; name: string; points_cost: number; available: boolean }>;
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });

/** Lo que el cliente tiene a favor en la barbería: puntos, paquetes y membresía. */
function WalletCard({ tenant, token, accent }: { tenant: string; token: string; accent: string }) {
  const [w, setW] = useState<WalletData | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE_CLIENT}/api/public/wallet?t=${encodeURIComponent(token)}`, { headers: { 'X-Tenant-Slug': tenant } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: WalletData | null) => alive && d && setW(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [tenant, token]);

  if (!w) return null;
  const points = Number(w.points ?? 0);
  const rewards = [...(w.rewards ?? [])].sort((a, c) => a.points_cost - c.points_cost);
  const packages = w.packages ?? [];
  const membership = (w.memberships ?? [])[0];
  if (points === 0 && rewards.length === 0 && packages.length === 0 && !membership) return null;

  const next = rewards.find((r) => r.points_cost > points) ?? null;
  const ready = rewards.filter((r) => r.points_cost <= points);
  const best = ready[ready.length - 1] ?? null;
  const pct = next ? Math.min(100, Math.round((points / next.points_cost) * 100)) : 100;

  return (
    <section className="mt-6 rounded-xl border border-line" aria-label="Tus beneficios">
      <div className="flex items-center justify-between gap-3 px-4 pt-4">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Tus beneficios</h2>
        <span className="tnum text-[15px] font-medium">{points} {points === 1 ? 'punto' : 'puntos'}</span>
      </div>

      {rewards.length > 0 && (
        <div className="px-4 pb-4 pt-3">
          <div className="h-2 overflow-hidden rounded-full bg-field" role="progressbar" aria-valuemin={0} aria-valuemax={next?.points_cost ?? points} aria-valuenow={points} aria-label="Avance al próximo premio">
            <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, background: accent }} />
          </div>
          <p className="mt-2 flex items-start gap-2 text-[14px] text-mute">
            <Gift size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ink" />
            <span>
              {best && <span className="font-medium text-ink">Ya puedes canjear {best.name}. Pídelo al pagar. </span>}
              {next
                ? `Te faltan ${next.points_cost - points} puntos para ${next.name}.`
                : !best
                  ? 'Sumas puntos en cada visita.'
                  : ''}
            </span>
          </p>
        </div>
      )}

      {(packages.length > 0 || membership) && (
        <ul className="divide-y divide-line border-t border-line text-[15px]">
          {membership && (
            <li className="flex items-start gap-3 px-4 py-3.5">
              <Crown size={17} strokeWidth={1.75} className="mt-0.5 shrink-0 text-mute" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{membership.name}</span>
                <span className="block text-[14px] text-mute">
                  Activa hasta el {fmtDate(membership.ends_at)}
                  {membership.discount_percent ? `, ${membership.discount_percent}% de descuento` : ''}
                </span>
              </span>
            </li>
          )}
          {packages.map((p) => (
            <li key={p.id} className="flex items-start gap-3 px-4 py-3.5">
              <Package size={17} strokeWidth={1.75} className="mt-0.5 shrink-0 text-mute" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-medium">{p.name}</span>
                  <span className="tnum shrink-0 text-[14px]">
                    {p.uses_left} de {p.uses_total} {p.uses_total === 1 ? 'uso' : 'usos'}
                  </span>
                </span>
                <span className="mt-1.5 flex gap-1" aria-hidden>
                  {Array.from({ length: Math.min(p.uses_total, 20) }, (_, i) => (
                    <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < p.uses_left ? accent : 'var(--color-field)' }} />
                  ))}
                </span>
                {p.expires_at && <span className="mt-1 block text-[13px] text-soft">Vence el {fmtDate(p.expires_at)}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <span className="mt-0.5 shrink-0 text-mute">{icon}</span>
      <dt className="sr-only">{label}</dt>
      <dd className="min-w-0 flex-1">{value}</dd>
    </div>
  );
}
