'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, ChevronLeft, ChevronRight, ChevronUp, Clock, Users, Smartphone, CreditCard, Wallet, Ticket, CalendarPlus, Navigation, Loader2, Star, Info,
} from 'lucide-react';
import { API_BASE_CLIENT } from '@/lib/config';
import { onColor } from '@/lib/color';
import { Toaster } from '@/components/Toaster';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import { Sheet } from '@/components/Sheet';

interface Service { id: string; name: string; description: string | null; duration_min: number; price_cents: number }
interface Staff { id: string; name: string; photo_url: string | null; bio: string | null; rating_avg: string; rating_count: number }
interface Slot { start: string; end: string; staffId: string }
interface Site {
  tenant: { name: string; slug: string; is_demo?: boolean };
  branding: { color_primary: string; cover_url: string | null } | null;
  settings: { deposit_percent: number; require_deposit: boolean; cancel_window_hours: number } | null;
  locations: { address: string | null; district: string | null; lat: number | null; lng: number | null }[];
  services: Service[];
  staff: Staff[];
}
interface Quote {
  listPriceCents: number; discountCents: number; finalCents: number; depositCents: number; depositPercent: number;
  promo: { code: string; valid: boolean; reason?: string; discountCents: number } | null;
  giftCard: { code: string; valid: boolean; reason?: string; appliedCents: number } | null;
}
type Step = 'service' | 'staff' | 'time' | 'you' | 'pay';
const STEPS: Step[] = ['service', 'staff', 'time', 'you', 'pay'];
type Method = 'mercadopago' | 'culqi' | 'paypal';

const soles = (c: number) => `S/ ${(c / 100).toFixed(2)}`;
const TZ = 'America/Lima';
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
const fmtDayLong = (iso: string) => {
  const s = new Date(iso).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const limaHour = (iso: string) => Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: TZ }).format(new Date(iso)));

function buildDays(n = 14) {
  const isoFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
  const wd = new Intl.DateTimeFormat('es-PE', { weekday: 'short', timeZone: TZ });
  const dn = new Intl.DateTimeFormat('es-PE', { day: 'numeric', timeZone: TZ });
  const mo = new Intl.DateTimeFormat('es-PE', { month: 'short', timeZone: TZ });
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.now() + i * 864e5);
    const w = wd.format(d).replace('.', '');
    return {
      iso: isoFmt.format(d),
      top: i === 0 ? 'Hoy' : w.charAt(0).toUpperCase() + w.slice(1),
      num: dn.format(d),
      month: mo.format(d).replace('.', ''),
    };
  });
}

function icsFor(p: { id: string; start: string; end: string; title: string; location: string }) {
  const f = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//date.pe//ES', 'BEGIN:VEVENT',
    `UID:${p.id}@date.pe`, `DTSTAMP:${f(new Date().toISOString())}`, `DTSTART:${f(p.start)}`, `DTEND:${f(p.end)}`,
    `SUMMARY:${p.title}`, `LOCATION:${p.location}`, 'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}

function ReservarInner() {
  const tenant = useParams().tenant as string;
  const params = useSearchParams();
  const headers = useMemo(() => ({ 'Content-Type': 'application/json', 'X-Tenant-Slug': tenant }), [tenant]);

  const [site, setSite] = useState<Site | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [step, setStep] = useState<Step>('service');
  const router = useRouter();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const dayStripRef = useRef<HTMLDivElement>(null);
  // Cada paso entra al historial: el gesto "atrás" del teléfono retrocede un paso.
  const goStep = useCallback((next: Step) => {
    setStep(next);
    window.history.pushState({ ...(window.history.state ?? {}), __step: next }, '');
  }, []);
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const st = (e.state ?? {}).__step as Step | undefined;
      setStep(st && STEPS.includes(st) ? st : 'service');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    if (window.matchMedia('(max-width: 1023px)').matches) window.scrollTo({ top: 0 });
  }, [step]);
  const [service, setService] = useState<Service | null>(null);
  const [staffId, setStaffId] = useState<string | 'any' | null>(null);
  const days = useMemo(() => buildDays(), []);
  const [dayIdx, setDayIdx] = useState(0);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  useEffect(() => {
    const el = dayStripRef.current?.querySelector<HTMLElement>(`[data-day="${dayIdx}"]`);
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [dayIdx]);
  const autoSeek = useRef(true); // busca el próximo día con horarios tras elegir servicio/barbero
  const [skipped, setSkipped] = useState(0);
  const [you, setYou] = useState({ name: '', phone: '', email: '' });
  const [promoCode, setPromoCode] = useState('');
  const [giftCode, setGiftCode] = useState('');
  const [codesOpen, setCodesOpen] = useState(false);
  const [applied, setApplied] = useState<{ promo?: string; gift?: string }>({});
  const [quote, setQuote] = useState<Quote | null>(null);
  const [method, setMethod] = useState<Method>('mercadopago');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: string; slot: Slot; staffName: string } | null>(null);

  // Carga del sitio + preselección desde la URL + datos recordados
  useEffect(() => {
    fetch(`${API_BASE_CLIENT}/api/public/site`, { headers })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Site) => {
        setSite(d);
        const sv = d.services.find((s) => s.id === params.get('servicio'));
        const st = d.staff.find((s) => s.id === params.get('barbero'));
        if (sv) setService(sv);
        if (st) setStaffId(st.id);
        const initial: Step = sv && st ? 'time' : sv ? 'staff' : 'service';
        setStep(initial);
        window.history.replaceState({ ...(window.history.state ?? {}), __step: initial }, '');
      })
      .catch(() => setLoadError(true));
    try {
      const saved = JSON.parse(localStorage.getItem('datepe_cliente') ?? 'null');
      if (saved) setYou((y) => ({ ...y, ...saved }));
    } catch { /* */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  const accent = site?.branding?.color_primary ?? '#0a0a0a';
  const onAccent = onColor(accent);
  const staffForSlot = site?.staff.find((s) => s.id === (slot?.staffId ?? (staffId !== 'any' ? staffId : null)));

  const loadSlots = useCallback(async () => {
    if (!service || !staffId) return;
    const q = new URLSearchParams({ date: days[dayIdx].iso, serviceId: service.id });
    if (staffId !== 'any') q.set('staffId', staffId);
    try {
      const res = await fetch(`${API_BASE_CLIENT}/api/public/availability?${q}`, { headers });
      const d = await res.json();
      const list: Slot[] = d.slots ?? [];
      if (list.length === 0 && autoSeek.current && dayIdx < days.length - 1) {
        setSkipped((n) => n + 1);
        setDayIdx(dayIdx + 1);
        return;
      }
      autoSeek.current = false;
      setSlots(list);
    } catch {
      setSlots([]);
    }
  }, [service, staffId, dayIdx, days, headers]);

  useEffect(() => {
    if (step === 'time' || slot) {
      setSlots(null);
      loadSlots();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, staffId, dayIdx]);

  useEffect(() => {
    if (step === 'time' && slots === null) loadSlots();
  }, [step, slots, loadSlots]);

  // Disponibilidad en tiempo real
  useEffect(() => {
    const proto = API_BASE_CLIENT.startsWith('https') ? 'wss' : 'ws';
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(`${proto}://${API_BASE_CLIENT.replace(/^https?:\/\//, '')}/api/ws?tenant=${tenant}`);
      ws.onmessage = (ev) => {
        try {
          if (JSON.parse(ev.data).type === 'availability_changed') loadSlots();
        } catch { /* */ }
      };
    } catch { /* */ }
    return () => ws?.close();
  }, [tenant, loadSlots]);

  // Cotización (precio, descuentos, adelanto)
  useEffect(() => {
    if (!service) return;
    const staff = slot?.staffId ?? (staffId && staffId !== 'any' ? staffId : undefined);
    fetch(`${API_BASE_CLIENT}/api/public/quote`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ serviceId: service.id, staffId: staff, promoCode: applied.promo, giftCardCode: applied.gift }),
    })
      .then((r) => r.json())
      .then((q: Quote) => setQuote(q))
      .catch(() => {});
  }, [service, staffId, slot, applied, headers]);

  function applyCodes() {
    setApplied({ promo: promoCode.trim() || undefined, gift: giftCode.trim() || undefined });
  }
  useEffect(() => {
    if (!quote) return;
    if (applied.promo && quote.promo) {
      if (quote.promo.valid) toast.success(`Código ${quote.promo.code} aplicado`);
      else toast.error(quote.promo.reason ?? 'Código no válido');
    }
    if (applied.gift && quote.giftCard) {
      if (quote.giftCard.valid) toast.success('Gift card aplicada');
      else toast.error(quote.giftCard.reason ?? 'Gift card no válida');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied]);

  const phoneOk = you.phone.replace(/\D/g, '').length >= 9;
  const emailOk = !you.email || /^\S+@\S+\.\S+$/.test(you.email);
  const needsDeposit = (quote?.depositCents ?? 0) > 0;

  async function confirm() {
    if (!service || !slot || !site) return;
    setBusy(true);
    try {
      localStorage.setItem('datepe_cliente', JSON.stringify(you));
      const phone = you.phone.trim().startsWith('+') ? you.phone.trim() : `+51${you.phone.replace(/\D/g, '')}`;
      const res = await fetch(`${API_BASE_CLIENT}/api/bookings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          serviceId: service.id,
          staffId: slot.staffId,
          startsAt: slot.start,
          promoCode: quote?.promo?.valid ? quote.promo.code : undefined,
          giftCardCode: quote?.giftCard?.valid ? quote.giftCard.code : undefined,
          client: { name: you.name.trim(), phone, email: you.email.trim() || undefined },
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        if (d.error === 'slot_ocupado') {
          toast.error('Alguien tomó esa hora hace un momento. Elige otra.');
          setSlot(null);
          goStep('time');
          loadSlots();
        } else toast.error('No pudimos crear la reserva. Revisa tus datos.');
        return;
      }
      const finish = () => {
        setDone({ id: d.appointmentId, slot, staffName: staffForSlot?.name ?? '' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };
      if (!d.depositCents) return finish();

      const pay = await fetch(`${API_BASE_CLIENT}/api/payments/intent`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ appointmentId: d.appointmentId, provider: method }),
      }).then((r) => r.json());
      if (pay.redirectUrl) {
        toast.info('Te llevamos a la pasarela de pago');
        window.location.href = pay.redirectUrl;
        return;
      }
      if (pay.devSimulated) {
        const ok = await fetch(`${API_BASE_CLIENT}${pay.devConfirmUrl}`, { method: 'POST', headers, body: '{}' }).then((r) => r.ok).catch(() => false);
        if (!ok) {
          toast.error('No pudimos confirmar el pago. Intenta de nuevo.');
          return;
        }
        return finish();
      }
      if (pay.noDeposit) return finish();
      toast.error('El pago con tarjeta aún no está activo en esta barbería. Elige otro método.');
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.03em]">No encontramos esta barbería</h1>
        <p className="mt-2 text-mute">Revisa el enlace o busca otra barbería en date.pe.</p>
        <a href="https://date.pe/search" className="mt-6 inline-block rounded-full bg-ink px-6 py-3 font-medium text-white">Buscar barberías</a>
      </main>
    );
  }

  if (!site) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center" aria-busy>
        <Loader2 className="animate-spin text-soft" size={28} strokeWidth={1.75} />
      </main>
    );
  }

  const loc = site.locations[0];

  // ------------------------- Confirmación -------------------------
  if (done) {
    const title = `${service?.name} en ${site.tenant.name}`;
    const ics = icsFor({ id: done.id, start: done.slot.start, end: done.slot.end, title, location: `${loc?.address ?? ''} ${loc?.district ?? ''}`.trim() });
    const maps = loc?.lat ? `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.tenant.name)}`;
    return (
      <main className="mx-auto max-w-lg px-5 py-16 md:py-24">
        <Toaster />
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" className="draw-check text-ok" aria-hidden>
          <circle cx="12" cy="12" r="11" fill="currentColor" />
          <path d="M7 12.5l3.2 3.2L17 9" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h1 className="mt-6 text-[clamp(2rem,5vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.035em]">Listo, te esperamos.</h1>
        <p className="mt-3 text-[17px] text-mute">
          {you.email ? `Te enviamos la confirmación a ${you.email}.` : 'Guarda esta pantalla o agrégala a tu calendario.'}
        </p>
        <dl className="mt-8 divide-y divide-line border-y border-line text-[16px]">
          {[
            ['Barbería', site.tenant.name],
            ['Servicio', service?.name ?? ''],
            ['Barbero', done.staffName],
            ['Cuándo', `${fmtDayLong(done.slot.start)}, ${fmtTime(done.slot.start)}`],
            ['Dirección', `${loc?.address ?? ''}`],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-6 py-3.5">
              <dt className="text-mute">{k}</dt>
              <dd className="text-right">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a
            href={`data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`}
            download="cita-date-pe.ics"
            className="flex flex-1 items-center justify-center gap-2 rounded-lg py-3.5 text-[15px] font-medium"
            style={{ background: accent, color: onAccent }}
          >
            <CalendarPlus size={18} strokeWidth={1.75} /> Agregar a mi calendario
          </a>
          <a href={maps} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-line py-3.5 text-[15px] font-medium hover:border-ink">
            <Navigation size={17} strokeWidth={1.75} /> Cómo llegar
          </a>
        </div>
        <Link href="/" className="mt-6 inline-block text-[15px] text-mute underline hover:text-ink">
          Volver a {site.tenant.name}
        </Link>
      </main>
    );
  }

  // ------------------------- Flujo -------------------------
  const daySlots = slots ?? [];
  const groups = [
    { label: 'Mañana', items: daySlots.filter((s) => limaHour(s.start) < 12) },
    { label: 'Tarde', items: daySlots.filter((s) => limaHour(s.start) >= 12 && limaHour(s.start) < 18) },
    { label: 'Noche', items: daySlots.filter((s) => limaHour(s.start) >= 18) },
  ].filter((g) => g.items.length > 0);

  const summary = (
    <>
            <div className="flex items-center gap-3">
              {site.branding?.cover_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={site.branding.cover_url} alt="" className="h-14 w-14 rounded-lg object-cover" />
              )}
              <div>
                <div className="text-[16px] font-medium">{site.tenant.name}</div>
                <div className="text-[14px] text-mute">{loc?.district}</div>
              </div>
            </div>
            <dl className="mt-5 space-y-3 border-t border-line pt-5 text-[15px]">
              <SummaryRow label="Servicio" value={service?.name} />
              <SummaryRow label="Barbero" value={slot ? staffForSlot?.name : staffId === 'any' ? 'Cualquiera disponible' : site.staff.find((s) => s.id === staffId)?.name} />
              <SummaryRow label="Fecha" value={slot ? fmtDayLong(slot.start) : undefined} />
              <SummaryRow label="Hora" value={slot ? fmtTime(slot.start) : undefined} />
            </dl>
            {quote && service && (
              <dl className="rise-in mt-5 space-y-2 border-t border-line pt-5 text-[15px]">
                <div className="flex justify-between"><dt className="text-mute">Precio</dt><dd className="tnum">{soles(quote.listPriceCents)}</dd></div>
                {quote.promo?.valid && (
                  <div className="flex justify-between text-ok"><dt>Código {quote.promo.code}</dt><dd className="tnum">- {soles(quote.promo.discountCents)}</dd></div>
                )}
                {quote.giftCard?.valid && (
                  <div className="flex justify-between text-ok"><dt>Gift card</dt><dd className="tnum">- {soles(quote.giftCard.appliedCents)}</dd></div>
                )}
                <div className="flex justify-between pt-1 text-[16px] font-medium"><dt>Total</dt><dd className="tnum">{soles(quote.finalCents)}</dd></div>
                {quote.depositCents > 0 && (
                  <>
                    <div className="flex justify-between border-t border-line pt-3 text-[16px] font-semibold">
                      <dt>Adelanto hoy ({quote.depositPercent}%)</dt><dd className="tnum">{soles(quote.depositCents)}</dd>
                    </div>
                    <div className="flex justify-between text-mute"><dt>Pagas en la barbería</dt><dd className="tnum">{soles(quote.finalCents - quote.depositCents)}</dd></div>
                  </>
                )}
              </dl>
            )}
          
    </>
  );

  const stepIdx = STEPS.indexOf(step);
  const stepTitle = { service: 'Elige el servicio', staff: 'Elige a tu barbero', time: 'Elige día y hora', you: 'Tus datos', pay: needsDeposit ? 'Adelanto' : 'Confirma tu reserva' }[step];
  function goBack() {
    if (stepIdx > 0 && window.history.state?.__step) window.history.back();
    else if (stepIdx > 0) setStep(STEPS[stepIdx - 1]);
    else router.push('/');
  }

  const primaryBtn = 'w-full rounded-lg py-3.5 text-[16px] font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <main className="mx-auto max-w-[1180px] px-5 pb-[calc(112px+env(safe-area-inset-bottom))] md:px-8 lg:pb-20 lg:pt-6">
      <Toaster />
      {/* Barra superior en el teléfono: atrás real + progreso */}
      <div className="pt-safe sticky top-0 z-30 -mx-5 bg-white/95 backdrop-blur-md md:-mx-8 lg:hidden">
        <div className="flex h-14 items-center gap-1 px-2">
          <button type="button" onClick={goBack} className="flex h-11 w-11 items-center justify-center rounded-full active:bg-field" aria-label="Atrás">
            <ChevronLeft size={26} strokeWidth={1.75} />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <div className="truncate text-[16px] font-semibold tracking-[-0.02em]">{stepTitle}</div>
            <div className="truncate text-[12px] text-mute">{site.tenant.name}</div>
          </div>
          <span className="tnum w-11 text-center text-[13px] text-mute">{stepIdx + 1} de 5</span>
        </div>
        <div className="h-[3px] bg-field" aria-hidden>
          <div className="h-full bg-ink transition-[width] duration-500 ease-out" style={{ width: `${((stepIdx + 1) / 5) * 100}%` }} />
        </div>
      </div>
      <div className="hidden lg:block">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[15px] text-mute hover:text-ink">
          <ArrowLeft size={17} strokeWidth={1.75} /> {site.tenant.name}
        </Link>
        <h1 className="mt-4 text-[clamp(2rem,4vw,2.75rem)] font-semibold tracking-[-0.035em]">Reserva tu cita</h1>
      </div>
      {site.tenant.is_demo && (
        <p className="mt-4 flex items-center gap-2 text-[13px] text-mute lg:mt-2 lg:text-[14px]">
          <Info size={15} strokeWidth={1.75} /> Barbería de demostración: puedes probar todo el flujo, el pago es simulado.
        </p>
      )}

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-10 lg:mt-8 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          {/* 1. Servicio */}
          <StepBlock
            n={1} title="Servicio" open={step === 'service'}
            summary={service ? `${service.name}, ${service.duration_min} min` : undefined}
            onEdit={() => goStep('service')}
          >
            <div className="space-y-2">
              {site.services.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    haptic.select();
                    setService(s);
                    setSlot(null);
                    autoSeek.current = true;
                    setSkipped(0);
                    goStep(staffId ? 'time' : 'staff');
                  }}
                  className={`flex w-full items-center justify-between gap-4 rounded-xl border p-4 text-left transition-colors ${
                    service?.id === s.id ? 'border-ink bg-field' : 'border-line hover:border-ink'
                  }`}
                >
                  <div>
                    <div className="text-[16px] font-medium">{s.name}</div>
                    {s.description && <div className="text-[14px] text-mute">{s.description}</div>}
                    <div className="mt-1 flex items-center gap-1 text-[13px] text-soft"><Clock size={13} strokeWidth={1.75} /> {s.duration_min} min</div>
                  </div>
                  <span className="tnum shrink-0 text-[16px] font-medium">{soles(s.price_cents)}</span>
                </button>
              ))}
            </div>
          </StepBlock>

          {/* 2. Barbero */}
          <StepBlock
            n={2} title="Barbero" open={step === 'staff'} disabled={!service}
            summary={staffId === 'any' ? 'Cualquiera disponible' : site.staff.find((s) => s.id === staffId)?.name}
            onEdit={() => goStep('staff')}
          >
            <div className="dim-others grid grid-cols-2 gap-3 sm:grid-cols-4">
              <button
                type="button"
                onClick={() => { haptic.select(); setStaffId('any'); setSlot(null); autoSeek.current = true; setSkipped(0); setDayIdx(0); goStep('time'); }}
                className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors ${staffId === 'any' ? 'is-picked border-ink bg-field' : 'border-line hover:border-ink'}`}
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-field"><Users size={24} strokeWidth={1.5} /></span>
                <span className="text-center text-[14px] font-medium leading-tight">Cualquiera disponible</span>
              </button>
              {site.staff.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => { haptic.select(); setStaffId(b.id); setSlot(null); autoSeek.current = true; setSkipped(0); setDayIdx(0); goStep('time'); }}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors ${staffId === b.id ? 'is-picked border-ink bg-field' : 'border-line hover:border-ink'}`}
                >
                  {b.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.photo_url} alt="" className="h-16 w-16 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-field text-xl font-medium">{b.name.charAt(0)}</span>
                  )}
                  <span className="text-[14px] font-medium">{b.name}</span>
                  {b.rating_count > 0 && (
                    <span className="tnum -mt-1 flex items-center gap-1 text-[12px] text-mute"><Star size={11} strokeWidth={0} className="fill-ink" /> {Number(b.rating_avg).toFixed(1)}</span>
                  )}
                </button>
              ))}
            </div>
          </StepBlock>

          {/* 3. Fecha y hora */}
          <StepBlock
            n={3} title="Fecha y hora" open={step === 'time'} disabled={!service || !staffId}
            summary={slot ? `${fmtDayLong(slot.start)}, ${fmtTime(slot.start)}` : undefined}
            onEdit={() => goStep('time')}
          >
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => { autoSeek.current = false; setSkipped(0); setDayIdx(Math.max(0, dayIdx - 1)); }} disabled={dayIdx === 0} className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line hover:border-ink disabled:opacity-30 sm:flex" aria-label="Día anterior">
                <ChevronLeft size={18} strokeWidth={1.75} />
              </button>
              <div ref={dayStripRef} className="no-scrollbar -mx-1 flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto px-1 pb-1">
                {days.map((d, i) => (
                  <button
                    key={d.iso}
                    type="button"
                    data-day={i}
                    onClick={() => { haptic.select(); autoSeek.current = false; setSkipped(0); setDayIdx(i); setSlot(null); }}
                    className={`flex w-[60px] shrink-0 snap-start flex-col items-center rounded-xl border py-2.5 transition-colors ${
                      i === dayIdx ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink'
                    }`}
                  >
                    <span className={`text-[12px] ${i === dayIdx ? 'text-white/70' : 'text-mute'}`}>{d.top}</span>
                    <span className="tnum text-[18px] font-medium leading-tight">{d.num}</span>
                    <span className={`text-[11px] ${i === dayIdx ? 'text-white/70' : 'text-soft'}`}>{d.month}</span>
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => { autoSeek.current = false; setSkipped(0); setDayIdx(Math.min(days.length - 1, dayIdx + 1)); }} disabled={dayIdx === days.length - 1} className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line hover:border-ink disabled:opacity-30 sm:flex" aria-label="Día siguiente">
                <ChevronRight size={18} strokeWidth={1.75} />
              </button>
            </div>

            {skipped > 0 && slots !== null && slots.length > 0 && (
              <p className="rise-in mt-4 flex items-center gap-2 text-[14px] text-mute">
                <Info size={15} strokeWidth={1.75} className="shrink-0" />
                {dayIdx === 1 ? 'Hoy ya no quedan horarios.' : 'Los días anteriores están llenos.'} Te mostramos el próximo día disponible.
              </p>
            )}
            <div className="mt-6 min-h-[120px]">
              {slots === null && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {Array.from({ length: 10 }, (_, i) => <div key={i} className="h-11 animate-pulse rounded-lg bg-field" />)}
                </div>
              )}
              {slots !== null && groups.length === 0 && (
                <div className="rounded-xl bg-field p-6 text-center">
                  <p className="text-[15px]">No quedan horarios este día.</p>
                  {dayIdx < days.length - 1 && (
                    <button type="button" onClick={() => { autoSeek.current = false; setDayIdx(dayIdx + 1); }} className="mt-3 text-[15px] font-medium underline">
                      Ver el día siguiente
                    </button>
                  )}
                </div>
              )}
              {groups.map((g) => (
                <div key={g.label} className="mb-5">
                  <div className="mb-2 text-[13px] font-medium text-mute">{g.label}</div>
                  <div className="dim-others grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {g.items.map((s) => {
                      const picked = slot?.start === s.start && slot?.staffId === s.staffId;
                      return (
                        <button
                          key={s.start + s.staffId}
                          type="button"
                          onClick={() => { haptic.select(); setSlot(s); goStep('you'); }}
                          className={`tnum h-11 rounded-lg border text-[15px] transition-all ${
                            picked ? 'is-picked -translate-y-0.5 border-ink bg-ink text-white shadow-lift' : 'border-line hover:border-ink'
                          }`}
                        >
                          {fmtTime(s.start)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </StepBlock>

          {/* 4. Tus datos */}
          <StepBlock
            n={4} title="Tus datos" open={step === 'you'} disabled={!slot}
            summary={you.name && phoneOk ? `${you.name}, ${you.phone}` : undefined}
            onEdit={() => goStep('you')}
          >
            <div className="space-y-3">
              <Field label="Nombre">
                <input value={you.name} onChange={(e) => setYou({ ...you, name: e.target.value })} autoComplete="name" autoCapitalize="words" enterKeyHint="next" className="fld" placeholder="Tu nombre" />
              </Field>
              <Field label="Celular" hint="Para que la barbería pueda contactarte.">
                <div className="flex items-center rounded-xl border border-line-2 focus-within:border-ink">
                  <span className="tnum border-r border-line pl-4 pr-3 text-[16px] text-mute">+51</span>
                  <input
                    value={you.phone.replace(/^\+51\s?/, '')}
                    onChange={(e) => setYou({ ...you, phone: e.target.value })}
                    inputMode="tel"
                    autoComplete="tel-national"
                    enterKeyHint="next"
                    className="tnum w-full bg-transparent px-3 py-3.5 text-[16px] outline-none"
                    placeholder="987 654 321"
                  />
                </div>
              </Field>
              <Field label="Correo (opcional)" hint="Te enviamos ahí la confirmación.">
                <input value={you.email} onChange={(e) => setYou({ ...you, email: e.target.value })} type="email" autoComplete="email" enterKeyHint="done" onKeyDown={(e) => { if (e.key === 'Enter' && you.name.trim() && phoneOk && emailOk) goStep('pay'); }} className="fld" placeholder="tucorreo@gmail.com" />
                {!emailOk && <p className="mt-1 text-[13px] text-red">Revisa el correo.</p>}
              </Field>
              <button
                type="button"
                disabled={!you.name.trim() || !phoneOk || !emailOk}
                onClick={() => goStep('pay')}
                className={`${primaryBtn} max-lg:hidden`}
                style={{ background: accent, color: onAccent }}
              >
                Continuar
              </button>
            </div>
          </StepBlock>

          {/* 5. Pago */}
          <StepBlock n={5} title={needsDeposit ? 'Adelanto y confirmación' : 'Confirmación'} open={step === 'pay'} disabled={!slot || !you.name || !phoneOk}>
            <button type="button" onClick={() => setCodesOpen(!codesOpen)} className="flex items-start gap-2 text-left text-[15px] font-medium underline-offset-4 hover:underline">
              <Ticket size={17} strokeWidth={1.75} /> ¿Tienes un código de descuento o una gift card?
            </button>
            {codesOpen && (
              <div className="rise-in mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <input value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())} className="fld uppercase" placeholder="Código de descuento" />
                <input value={giftCode} onChange={(e) => setGiftCode(e.target.value.toUpperCase())} className="fld uppercase" placeholder="Gift card" />
                <button type="button" onClick={applyCodes} className="rounded-xl border border-ink px-5 py-3 text-[15px] font-medium hover:bg-field">Aplicar</button>
              </div>
            )}

            {needsDeposit && (
              <fieldset className="mt-6">
                <legend className="mb-3 text-[15px] font-medium">Paga el adelanto con</legend>
                <div className="space-y-2">
                  {([
                    ['mercadopago', 'Yape o Plin', 'Con MercadoPago', Smartphone],
                    ['culqi', 'Tarjeta de débito o crédito', 'Con Culqi', CreditCard],
                    ['paypal', 'PayPal', 'Se cobra en dólares', Wallet],
                  ] as const).map(([id, label, sub, Icon]) => (
                    <label
                      key={id}
                      className={`flex cursor-pointer items-center gap-4 rounded-xl border p-4 transition-colors ${method === id ? 'border-ink bg-field' : 'border-line hover:border-ink'}`}
                    >
                      <input type="radio" name="metodo" value={id} checked={method === id} onChange={() => setMethod(id)} className="sr-only" />
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${method === id ? 'border-ink' : 'border-line-2'}`}>
                        {method === id && <span className="h-2.5 w-2.5 rounded-full bg-ink" />}
                      </span>
                      <Icon size={20} strokeWidth={1.75} />
                      <span className="flex-1">
                        <span className="block text-[15px] font-medium">{label}</span>
                        <span className="block text-[13px] text-mute">{sub}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <button type="button" onClick={confirm} disabled={busy} className={`mt-6 flex items-center justify-center gap-2 max-lg:hidden ${primaryBtn}`} style={{ background: accent, color: onAccent }}>
              {busy && <Loader2 size={18} className="animate-spin" />}
              {needsDeposit ? `Pagar adelanto de ${soles(quote!.depositCents)} y reservar` : 'Confirmar reserva'}
            </button>
            {site.settings && site.settings.cancel_window_hours > 0 && (
              <p className="mt-3 text-center text-[13px] text-soft">
                Puedes cancelar hasta {site.settings.cancel_window_hours} horas antes escribiéndole a la barbería.
              </p>
            )}
          </StepBlock>
        </div>

        {/* Resumen que se construye (escritorio) */}
        <aside className="hidden lg:col-span-5 lg:block">
          <div className="rounded-xl border border-line p-6 lg:sticky lg:top-8">{summary}</div>
        </aside>
      </div>

      {/* Barra inferior en el teléfono: total y acción principal */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-5 pt-3 backdrop-blur-md lg:hidden">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setSummaryOpen(true)} className="min-w-0 flex-1 text-left" aria-label="Ver resumen de la reserva">
            <span className="tnum flex items-center gap-1 text-[17px] font-semibold tracking-[-0.02em]">
              {quote && service ? soles(needsDeposit ? quote.depositCents : quote.finalCents) : 'Tu reserva'}
              <ChevronUp size={16} strokeWidth={2} className="text-mute" />
            </span>
            <span className="block truncate text-[13px] text-mute">
              {quote && service
                ? needsDeposit
                  ? `Adelanto hoy, total ${soles(quote.finalCents)}`
                  : `${service.name}${slot ? `, ${fmtTime(slot.start)}` : ''}`
                : 'Elige un servicio para empezar'}
            </span>
          </button>
          {step === 'you' && (
            <button type="button" disabled={!you.name.trim() || !phoneOk || !emailOk} onClick={() => goStep('pay')} className="rounded-xl px-6 py-3.5 text-[16px] font-medium disabled:opacity-40" style={{ background: accent, color: onAccent }}>
              Continuar
            </button>
          )}
          {step === 'pay' && (
            <button type="button" onClick={confirm} disabled={busy} className="flex items-center gap-2 rounded-xl px-5 py-3.5 text-[16px] font-medium disabled:opacity-40" style={{ background: accent, color: onAccent }}>
              {busy && <Loader2 size={18} className="animate-spin" />}
              {needsDeposit ? 'Pagar adelanto' : 'Confirmar'}
            </button>
          )}
        </div>
      </div>

      <Sheet open={summaryOpen} onClose={() => setSummaryOpen(false)} title="Tu reserva">
        {summary}
      </Sheet>

      <style>{`.fld{width:100%;border:1px solid var(--color-line-2);border-radius:12px;padding:0.85rem 1rem;font-size:16px;background:#fff;outline:none;transition:border-color .2s}.fld:focus{border-color:var(--color-ink)}`}</style>
    </main>
  );
}

function StepBlock({
  n, title, open, summary, onEdit, disabled, children,
}: { n: number; title: string; open: boolean; summary?: string; onEdit?: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <section className={`border-b border-line py-6 first:pt-0 ${disabled && !open ? 'opacity-40' : ''} ${open ? 'max-lg:border-0 max-lg:pt-2' : 'max-lg:hidden'}`}>
      <div className={`flex items-center justify-between gap-4 ${open ? 'max-lg:hidden' : ''}`}>
        <div className="min-w-0">
          <h2 className="flex items-center gap-3 text-[19px] font-semibold tracking-[-0.02em]">
            <span className={`tnum flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-medium ${open ? 'bg-ink text-white' : summary ? 'bg-field text-ink' : 'border border-line text-soft'}`}>{n}</span>
            {title}
          </h2>
          {!open && summary && <p className="ml-10 mt-1 truncate text-[15px] text-mute">{summary}</p>}
        </div>
        {!open && summary && onEdit && !disabled && (
          <button type="button" onClick={onEdit} className="shrink-0 text-[15px] font-medium underline underline-offset-4">Cambiar</button>
        )}
      </div>
      {open && !disabled && <div className="rise-in lg:mt-5">{children}</div>}
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-mute">{label}</dt>
      <dd className={`text-right ${value ? 'rise-in' : 'text-soft'}`}>{value ?? 'Por elegir'}</dd>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[14px] font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[13px] text-soft">{hint}</span>}
    </label>
  );
}

export default function ReservarPage() {
  return (
    <Suspense fallback={<main className="flex min-h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-soft" size={28} /></main>}>
      <ReservarInner />
    </Suspense>
  );
}
