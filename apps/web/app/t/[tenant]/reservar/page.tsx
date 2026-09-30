'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, ChevronLeft, ChevronRight, ChevronUp, Clock, Users, Smartphone, CreditCard, Wallet, Ticket, CalendarPlus, Navigation, Loader2, Star, Info,
  MapPin, Plus, Check, BellRing, CircleCheck, CalendarOff, CalendarClock, MailCheck,
} from 'lucide-react';
import { API_BASE_CLIENT } from '@/lib/config';
import { onColor } from '@/lib/color';
import { Toaster } from '@/components/Toaster';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import { Sheet } from '@/components/Sheet';
import { InviteCard, WhatsAppIcon, buildDays, fmtDayLong, fmtTime, icsFor, waLink, TZ } from '../cita/_parts/shared';

interface Service { id: string; name: string; description: string | null; duration_min: number; price_cents: number; is_addon?: boolean }
interface Staff { id: string; location_id?: string | null; name: string; photo_url: string | null; bio: string | null; rating_avg: string; rating_count: number }
interface Location { id: string; name: string; address: string | null; district: string | null; lat: number | null; lng: number | null }
interface Slot { start: string; end: string; staffId: string }
interface Site {
  tenant: { name: string; slug: string; is_demo?: boolean; available?: boolean };
  branding: { color_primary: string; cover_url: string | null; whatsapp?: string | null } | null;
  settings: {
    deposit_percent: number; require_deposit: boolean; cancel_window_hours: number;
    allow_client_reschedule?: boolean; require_verification?: boolean; referral_enabled?: boolean; referral_discount_percent?: number;
  } | null;
  locations: Location[];
  services: Service[];
  staff: Staff[];
}
interface Quote {
  listPriceCents: number; discountCents: number; finalCents: number; depositCents: number; depositPercent: number;
  addons?: { id: string; name: string; priceCents: number; durationMin: number }[];
  durationMin?: number;
  promo: { code: string; valid: boolean; reason?: string; discountCents: number } | null;
  giftCard: { code: string; valid: boolean; reason?: string; appliedCents: number } | null;
}
type Step = 'service' | 'staff' | 'time' | 'you' | 'pay';
const STEPS: Step[] = ['service', 'staff', 'time', 'you', 'pay'];
type Method = 'mercadopago' | 'culqi' | 'paypal';

const soles = (c: number) => `S/ ${(c / 100).toFixed(2)}`;
const limaHour = (iso: string) => Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: TZ }).format(new Date(iso)));
const isEmail = (v: string) => /^\S+@\S+\.\S+$/.test(v.trim());
const toPhone = (v: string) => (v.trim().startsWith('+') ? v.trim() : `+51${v.replace(/\D/g, '')}`);
const RESEND_MS = 60_000;

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
  const [locationId, setLocationId] = useState<string | null>(null);
  const [service, setService] = useState<Service | null>(null);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const addonKey = addonIds.join(',');
  const [staffId, setStaffId] = useState<string | 'any' | null>(null);
  const days = useMemo(() => buildDays(21), []);
  const [dayIdx, setDayIdx] = useState(0);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  useEffect(() => {
    const el = dayStripRef.current?.querySelector<HTMLElement>(`[data-day="${dayIdx}"]`);
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [dayIdx]);
  const autoSeek = useRef(true); // busca el próximo día con horarios tras elegir servicio/barbero
  const pinnedDay = useRef(false); // ?fecha= fija el día: no saltamos a otro
  const [skipped, setSkipped] = useState(0);
  const [you, setYou] = useState({ name: '', phone: '', email: '' });
  const [promoCode, setPromoCode] = useState('');
  const [giftCode, setGiftCode] = useState('');
  const [codesOpen, setCodesOpen] = useState(false);
  const [applied, setApplied] = useState<{ promo?: string; gift?: string }>({});
  const [quote, setQuote] = useState<Quote | null>(null);
  const [method, setMethod] = useState<Method>('mercadopago');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: string; slot: Slot; staffName: string; manageToken: string | null; referralCode: string | null } | null>(null);

  // Lista de espera (día sin horarios)
  const [wlOpen, setWlOpen] = useState(false);
  const [wl, setWl] = useState({ name: '', phone: '', email: '' });
  const [wlBusy, setWlBusy] = useState(false);
  const [wlDone, setWlDone] = useState<string[]>([]);

  // Verificación del correo
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!verifyOpen) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [verifyOpen]);

  // Carga del sitio + preselección desde la URL + datos recordados
  useEffect(() => {
    fetch(`${API_BASE_CLIENT}/api/public/site`, { headers })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Site) => {
        setSite(d);
        const multi = d.locations.length >= 2;
        const sv = d.services.find((s) => s.id === params.get('servicio') && !s.is_addon);
        const stRaw = d.staff.find((s) => s.id === params.get('barbero'));
        let loc: string | null = null;
        if (multi) loc = d.locations.find((l) => l.id === params.get('sede'))?.id ?? stRaw?.location_id ?? null;
        const st = stRaw && (!loc || !stRaw.location_id || stRaw.location_id === loc) ? stRaw : undefined;
        if (loc) setLocationId(loc);
        if (sv) setService(sv);
        if (st) setStaffId(st.id);
        const fi = days.findIndex((x) => x.iso === params.get('fecha'));
        if (fi >= 0) {
          setDayIdx(fi);
          autoSeek.current = false;
          pinnedDay.current = true;
        }
        const needLoc = multi && !loc;
        const initial: Step = needLoc || !sv ? 'service' : st ? 'time' : 'staff';
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
  const multiLoc = (site?.locations.length ?? 0) >= 2;
  const mainServices = useMemo(() => site?.services.filter((s) => !s.is_addon) ?? [], [site]);
  const extras = useMemo(() => site?.services.filter((s) => s.is_addon) ?? [], [site]);
  const selectedAddons = extras.filter((x) => addonIds.includes(x.id));
  const staffList = useMemo(
    () => (site?.staff ?? []).filter((s) => !multiLoc || !locationId || !s.location_id || s.location_id === locationId),
    [site, multiLoc, locationId],
  );
  const staffForSlot = site?.staff.find((s) => s.id === (slot?.staffId ?? (staffId !== 'any' ? staffId : null)));
  const settings = site?.settings;
  const requireVerif = !!settings?.require_verification;
  const referralOn = !!settings?.referral_enabled;
  const referralPct = settings?.referral_discount_percent ?? 0;

  const loadSlots = useCallback(async () => {
    if (!service || !staffId) return;
    const q = new URLSearchParams({ date: days[dayIdx].iso, serviceId: service.id });
    if (staffId !== 'any') q.set('staffId', staffId);
    if (addonKey) q.set('addonIds', addonKey);
    if (multiLoc && locationId) q.set('locationId', locationId);
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
  }, [service, staffId, dayIdx, days, headers, addonKey, multiLoc, locationId]);

  useEffect(() => {
    if (step === 'time' || slot) {
      setSlots(null);
      loadSlots();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, staffId, dayIdx, addonKey, locationId]);

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

  // Cotización (precio, extras, descuentos, adelanto). El celular valida los códigos de amigo.
  const phoneDigits = you.phone.replace(/\D/g, '');
  const phoneOk = phoneDigits.length >= 9;
  const quotePhone = phoneOk ? toPhone(you.phone) : undefined;
  const quoteSeq = useRef(0);
  const codesFeedback = useRef(false);
  useEffect(() => {
    if (!service) return;
    const seq = ++quoteSeq.current;
    const staff = slot?.staffId ?? (staffId && staffId !== 'any' ? staffId : undefined);
    fetch(`${API_BASE_CLIENT}/api/public/quote`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        serviceId: service.id,
        staffId: staff,
        addonIds: addonKey ? addonKey.split(',') : undefined,
        promoCode: applied.promo,
        giftCardCode: applied.gift,
        phone: quotePhone,
      }),
    })
      .then((r) => r.json())
      .then((q: Quote) => {
        if (seq !== quoteSeq.current) return;
        setQuote(q);
        if (!codesFeedback.current) return;
        codesFeedback.current = false;
        if (applied.promo && q.promo) {
          if (q.promo.valid) toast.success(`Código ${q.promo.code} aplicado`);
          else toast.error(q.promo.reason ?? 'Código no válido');
        }
        if (applied.gift && q.giftCard) {
          if (q.giftCard.valid) toast.success('Gift card aplicada');
          else toast.error(q.giftCard.reason ?? 'Gift card no válida');
        }
      })
      .catch(() => {});
  }, [service, staffId, slot, applied, headers, addonKey, quotePhone]);

  function applyCodes() {
    codesFeedback.current = true;
    haptic.tap();
    setApplied({ promo: promoCode.trim() || undefined, gift: giftCode.trim() || undefined });
  }

  const emailOk = requireVerif ? isEmail(you.email) : !you.email || isEmail(you.email);
  const youOk = !!you.name.trim() && phoneOk && emailOk;
  const needsDeposit = (quote?.depositCents ?? 0) > 0;
  const totalMin = (service?.duration_min ?? 0) + selectedAddons.reduce((a, x) => a + x.duration_min, 0);

  // Reinicia la búsqueda de horarios (respeta el día fijado por ?fecha=)
  function resetSeek(resetDay: boolean) {
    setSlot(null);
    setSkipped(0);
    if (pinnedDay.current) {
      autoSeek.current = false;
    } else {
      autoSeek.current = true;
      if (resetDay) setDayIdx(0);
    }
  }

  function pickLocation(id: string) {
    haptic.select();
    setLocationId(id);
    const st = site?.staff.find((s) => s.id === staffId);
    const clash = !!st?.location_id && st.location_id !== id;
    if (clash) setStaffId(null);
    resetSeek(false);
    // Servicio ya elegido (enlace con ?servicio=) y sin extras: seguimos de frente
    if (service && extras.length === 0) goStep(staffId && !clash ? 'time' : 'staff');
  }

  function toggleAddon(id: string) {
    haptic.select();
    setAddonIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
    resetSeek(false);
  }

  const afterService = () => goStep(staffId ? 'time' : 'staff');

  // ------------------------- Verificación por correo -------------------------
  async function requestCode() {
    const email = you.email.trim();
    setVerifyBusy(true);
    try {
      const res = await fetch(`${API_BASE_CLIENT}/api/public/verify/request`, { method: 'POST', headers, body: JSON.stringify({ email }) });
      if (res.ok) {
        toast.info(`Te enviamos un código a ${email}`);
      } else if (res.status === 429) {
        toast.info('Ya te enviamos un código hace un momento. Revisa tu correo.');
      } else {
        toast.error('No pudimos enviar el código. Revisa tu correo e intenta de nuevo.');
        return;
      }
      setCode('');
      setCodeError(null);
      setResendAt(Date.now() + RESEND_MS);
      setNow(Date.now());
      setVerifyOpen(true);
    } catch {
      toast.error('Sin conexión. Intenta de nuevo.');
    } finally {
      setVerifyBusy(false);
    }
  }

  async function checkCode(value: string) {
    if (value.length !== 6 || verifyBusy) return;
    const email = you.email.trim();
    setVerifyBusy(true);
    setCodeError(null);
    try {
      const res = await fetch(`${API_BASE_CLIENT}/api/public/verify/check`, { method: 'POST', headers, body: JSON.stringify({ email, code: value }) });
      if (!res.ok) {
        haptic.error();
        setCode('');
        setCodeError('El código no es correcto. Revísalo e intenta otra vez.');
        return;
      }
      haptic.success();
      setVerifiedEmail(email.toLowerCase());
      setVerifyOpen(false);
      await book();
    } catch {
      toast.error('Sin conexión. Intenta de nuevo.');
    } finally {
      setVerifyBusy(false);
    }
  }

  async function confirm() {
    if (!service || !slot || !site) return;
    if (requireVerif && verifiedEmail !== you.email.trim().toLowerCase()) {
      await requestCode();
      return;
    }
    await book();
  }

  async function book() {
    if (!service || !slot || !site) return;
    setBusy(true);
    try {
      localStorage.setItem('datepe_cliente', JSON.stringify(you));
      const res = await fetch(`${API_BASE_CLIENT}/api/bookings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          serviceId: service.id,
          addonIds: addonIds.length ? addonIds : undefined,
          staffId: slot.staffId,
          locationId: multiLoc && locationId ? locationId : undefined,
          startsAt: slot.start,
          promoCode: quote?.promo?.valid ? quote.promo.code : undefined,
          giftCardCode: quote?.giftCard?.valid ? quote.giftCard.code : undefined,
          client: { name: you.name.trim(), phone: toPhone(you.phone), email: you.email.trim() || undefined },
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        if (d.error === 'slot_ocupado') {
          toast.error('Alguien tomó esa hora hace un momento. Elige otra.');
          setSlot(null);
          goStep('time');
          loadSlots();
        } else if (d.error === 'verificacion_requerida') {
          setVerifiedEmail(null);
          await requestCode();
        } else if (d.error === 'barberia_no_disponible') {
          toast.error('Esta barbería no está recibiendo reservas por ahora.');
        } else toast.error('No pudimos crear la reserva. Revisa tus datos.');
        return;
      }
      const finish = () => {
        setDone({ id: d.appointmentId, slot, staffName: staffForSlot?.name ?? '', manageToken: d.manageToken ?? null, referralCode: d.referralCode ?? null });
        haptic.success();
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

  // ------------------------- Lista de espera -------------------------
  function openWaitlist() {
    haptic.tap();
    setWl({ name: you.name, phone: you.phone.replace(/^\+51\s?/, ''), email: you.email });
    setWlOpen(true);
  }
  const wlOk = !!wl.name.trim() && wl.phone.replace(/\D/g, '').length >= 9 && isEmail(wl.email);
  async function joinWaitlist(e: React.FormEvent) {
    e.preventDefault();
    if (!wlOk) return;
    const day = days[dayIdx].iso;
    setWlBusy(true);
    try {
      const res = await fetch(`${API_BASE_CLIENT}/api/public/waitlist`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          serviceId: service?.id,
          staffId: staffId && staffId !== 'any' ? staffId : undefined,
          day,
          name: wl.name.trim(),
          phone: toPhone(wl.phone),
          email: wl.email.trim(),
        }),
      });
      if (!res.ok) {
        toast.error('No pudimos anotarte. Revisa tus datos e intenta de nuevo.');
        return;
      }
      haptic.success();
      setWlDone((cur) => [...cur, day]);
      setWlOpen(false);
      // Recordamos los datos para la próxima vez
      setYou((y) => ({ name: y.name || wl.name.trim(), phone: y.phone || wl.phone, email: y.email || wl.email.trim() }));
    } catch {
      toast.error('Sin conexión. Intenta de nuevo.');
    } finally {
      setWlBusy(false);
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

  const whatsapp = site.branding?.whatsapp ?? null;

  // ------------------------- Barbería sin reservas -------------------------
  if (site.tenant.available === false) {
    return (
      <main className="pt-safe mx-auto flex min-h-[80dvh] max-w-md flex-col items-center justify-center px-6 py-16 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-field">
          <CalendarOff size={28} strokeWidth={1.75} />
        </span>
        <h1 className="mt-6 text-[26px] font-semibold leading-tight tracking-[-0.03em]">Esta barbería no está recibiendo reservas por ahora</h1>
        <p className="mt-3 text-[16px] text-mute">
          {whatsapp ? `Escríbele a ${site.tenant.name} por WhatsApp para coordinar tu cita.` : 'Vuelve a intentarlo en unos días.'}
        </p>
        {whatsapp && (
          <a
            href={waLink(whatsapp, 'Hola, quisiera reservar una cita.')}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] py-3.5 text-[16px] font-medium text-white"
          >
            <WhatsAppIcon size={20} /> Escribir por WhatsApp
          </a>
        )}
        <Link href="/" className="mt-5 inline-flex min-h-[44px] items-center text-[15px] text-mute underline hover:text-ink">
          Volver a {site.tenant.name}
        </Link>
      </main>
    );
  }

  const loc = (multiLoc ? site.locations.find((l) => l.id === locationId) : null) ?? site.locations[0];
  const serviceLabel = service ? [service.name, ...selectedAddons.map((a) => a.name)].join(' + ') : undefined;

  // ------------------------- Confirmación -------------------------
  if (done) {
    const title = `${serviceLabel ?? ''} en ${site.tenant.name}`;
    const ics = icsFor({ id: done.id, start: done.slot.start, end: done.slot.end, title, location: `${loc?.address ?? ''} ${loc?.district ?? ''}`.trim() });
    const maps = loc?.lat ? `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.tenant.name)}`;
    const rows: [string, string][] = [
      ['Barbería', site.tenant.name],
      ...(multiLoc && loc ? [['Sede', loc.name] as [string, string]] : []),
      ['Servicio', serviceLabel ?? ''],
      ['Barbero', done.staffName],
      ['Cuándo', `${fmtDayLong(done.slot.start)}, ${fmtTime(done.slot.start)}`],
      ['Dirección', `${loc?.address ?? ''}`],
      ['Código de reserva', done.id.slice(0, 8).toUpperCase()],
    ];
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
          {rows.map(([k, v]) => (
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
        {done.manageToken && (
          <Link
            href={`/cita?t=${encodeURIComponent(done.manageToken)}`}
            className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-line py-3.5 text-[15px] font-medium hover:border-ink"
          >
            <CalendarClock size={17} strokeWidth={1.75} /> Ver o cambiar mi reserva
          </Link>
        )}
        {done.referralCode && referralOn && (
          <div className="mt-8">
            <InviteCard
              code={done.referralCode}
              percent={referralPct}
              shopName={site.tenant.name}
              bookUrl={typeof window !== 'undefined' ? `${window.location.origin}/reservar` : ''}
            />
          </div>
        )}
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

  const quoteAddons = quote?.addons ?? [];
  const addonsCents = quoteAddons.reduce((a, x) => a + x.priceCents, 0);

  const summary = (
    <>
            <div className="flex items-center gap-3">
              {site.branding?.cover_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={site.branding.cover_url} alt="" className="h-14 w-14 rounded-lg object-cover" />
              )}
              <div>
                <div className="text-[16px] font-medium">{site.tenant.name}</div>
                <div className="text-[14px] text-mute">{multiLoc && loc && locationId ? loc.name : loc?.district}</div>
              </div>
            </div>
            <dl className="mt-5 space-y-3 border-t border-line pt-5 text-[15px]">
              {multiLoc && <SummaryRow label="Sede" value={locationId ? loc?.name : undefined} />}
              <SummaryRow label="Servicio" value={service?.name} />
              {selectedAddons.length > 0 && <SummaryRow label="Extras" value={selectedAddons.map((a) => a.name).join(', ')} />}
              {service && <SummaryRow label="Duración" value={`${quote?.durationMin ?? totalMin} min`} />}
              <SummaryRow label="Barbero" value={slot ? staffForSlot?.name : staffId === 'any' ? 'Cualquiera disponible' : site.staff.find((s) => s.id === staffId)?.name} />
              <SummaryRow label="Fecha" value={slot ? fmtDayLong(slot.start) : undefined} />
              <SummaryRow label="Hora" value={slot ? fmtTime(slot.start) : undefined} />
            </dl>
            {quote && service && (
              <dl className="rise-in mt-5 space-y-2 border-t border-line pt-5 text-[15px]">
                {quoteAddons.length > 0 ? (
                  <>
                    <div className="flex justify-between gap-4"><dt className="text-mute">{service.name}</dt><dd className="tnum">{soles(quote.listPriceCents - addonsCents)}</dd></div>
                    {quoteAddons.map((a) => (
                      <div key={a.id} className="flex justify-between gap-4"><dt className="text-mute">{a.name}</dt><dd className="tnum">{soles(a.priceCents)}</dd></div>
                    ))}
                  </>
                ) : (
                  <div className="flex justify-between"><dt className="text-mute">Precio</dt><dd className="tnum">{soles(quote.listPriceCents)}</dd></div>
                )}
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
  const stepTitle = { service: multiLoc && !locationId ? 'Elige la sede' : 'Elige el servicio', staff: 'Elige a tu barbero', time: 'Elige día y hora', you: 'Tus datos', pay: needsDeposit ? 'Adelanto' : 'Confirma tu reserva' }[step];
  function goBack() {
    if (stepIdx > 0 && window.history.state?.__step) window.history.back();
    else if (stepIdx > 0) setStep(STEPS[stepIdx - 1]);
    else router.push('/');
  }

  const primaryBtn = 'w-full rounded-lg py-3.5 text-[16px] font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-40';
  const serviceSummary = service
    ? `${multiLoc && loc && locationId ? `${loc.name}, ` : ''}${serviceLabel}, ${totalMin} min`
    : multiLoc && locationId ? loc?.name : undefined;
  const cancelHours = settings?.cancel_window_hours ?? 0;
  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const selectedDay = days[dayIdx].iso;

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
          {/* 1. Sede y servicio */}
          <StepBlock
            n={1} title="Servicio" open={step === 'service'}
            summary={serviceSummary}
            onEdit={() => goStep('service')}
          >
            {multiLoc && (
              locationId && loc ? (
                <div className="mb-5 flex items-center justify-between gap-3 rounded-xl bg-field px-4 py-3">
                  <span className="flex min-w-0 items-center gap-2 text-[15px]">
                    <MapPin size={17} strokeWidth={1.75} className="shrink-0" />
                    <span className="truncate"><span className="font-medium">{loc.name}</span>{loc.address ? <span className="text-mute">, {loc.address}</span> : null}</span>
                  </span>
                  <button type="button" onClick={() => { haptic.tap(); setLocationId(null); }} className="-mr-1 min-h-[44px] shrink-0 px-1 text-[15px] font-medium underline underline-offset-4">
                    Cambiar
                  </button>
                </div>
              ) : (
                <div className="mb-2">
                  <h3 className="mb-3 text-[17px] font-semibold tracking-[-0.02em]">¿En qué sede?</h3>
                  <div className="dim-others grid gap-2 sm:grid-cols-2">
                    {site.locations.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => pickLocation(l.id)}
                        className="flex w-full items-start gap-3 rounded-xl border border-line p-4 text-left transition-colors hover:border-ink"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-field"><MapPin size={18} strokeWidth={1.75} /></span>
                        <span className="min-w-0">
                          <span className="block text-[16px] font-medium">{l.name}</span>
                          {(l.address || l.district) && (
                            <span className="block text-[14px] text-mute">{[l.address, l.district].filter(Boolean).join(', ')}</span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            )}
            {(!multiLoc || locationId) && (
              <>
                <div className="space-y-2">
                  {mainServices.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        haptic.select();
                        setService(s);
                        resetSeek(false);
                        if (extras.length === 0) afterService();
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

                {service && extras.length > 0 && (
                  <div className="rise-in mt-6">
                    <h3 className="text-[17px] font-semibold tracking-[-0.02em]">¿Algún extra?</h3>
                    <p className="mt-0.5 text-[14px] text-mute">Opcional. Se suman a tu {service.name.toLowerCase()}.</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {extras.map((x) => {
                        const on = addonIds.includes(x.id);
                        return (
                          <button
                            key={x.id}
                            type="button"
                            role="switch"
                            aria-checked={on}
                            onClick={() => toggleAddon(x.id)}
                            className={`flex min-h-[64px] w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors ${on ? 'border-ink bg-field' : 'border-line hover:border-ink'}`}
                          >
                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${on ? 'border-ink bg-ink text-white' : 'border-line-2'}`}>
                              {on ? <Check size={14} strokeWidth={2} /> : <Plus size={14} strokeWidth={1.75} className="text-mute" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[15px] font-medium">{x.name}</span>
                              <span className="tnum block text-[13px] text-mute">+{soles(x.price_cents)}, +{x.duration_min} min</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <button type="button" onClick={afterService} className={`mt-5 ${primaryBtn} max-lg:hidden`} style={{ background: accent, color: onAccent }}>
                      Continuar{selectedAddons.length > 0 ? ` con ${selectedAddons.length} ${selectedAddons.length === 1 ? 'extra' : 'extras'}` : ''}
                    </button>
                  </div>
                )}
              </>
            )}
          </StepBlock>

          {/* 2. Barbero */}
          <StepBlock
            n={2} title="Barbero" open={step === 'staff'} disabled={!service || (multiLoc && !locationId)}
            summary={staffId === 'any' ? 'Cualquiera disponible' : site.staff.find((s) => s.id === staffId)?.name}
            onEdit={() => goStep('staff')}
          >
            <div className="dim-others grid grid-cols-2 gap-3 sm:grid-cols-4">
              <button
                type="button"
                onClick={() => { haptic.select(); setStaffId('any'); resetSeek(true); goStep('time'); }}
                className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors ${staffId === 'any' ? 'is-picked border-ink bg-field' : 'border-line hover:border-ink'}`}
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-field"><Users size={24} strokeWidth={1.5} /></span>
                <span className="text-center text-[14px] font-medium leading-tight">Cualquiera disponible</span>
              </button>
              {staffList.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => { haptic.select(); setStaffId(b.id); resetSeek(true); goStep('time'); }}
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
              <button type="button" onClick={() => { autoSeek.current = false; pinnedDay.current = false; setSkipped(0); setWlOpen(false); setDayIdx(Math.max(0, dayIdx - 1)); }} disabled={dayIdx === 0} className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line hover:border-ink disabled:opacity-30 sm:flex" aria-label="Día anterior">
                <ChevronLeft size={18} strokeWidth={1.75} />
              </button>
              <div ref={dayStripRef} className="no-scrollbar -mx-1 flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto px-1 pb-1">
                {days.map((d, i) => (
                  <button
                    key={d.iso}
                    type="button"
                    data-day={i}
                    onClick={() => { haptic.select(); autoSeek.current = false; pinnedDay.current = false; setSkipped(0); setWlOpen(false); setDayIdx(i); setSlot(null); }}
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
              <button type="button" onClick={() => { autoSeek.current = false; pinnedDay.current = false; setSkipped(0); setWlOpen(false); setDayIdx(Math.min(days.length - 1, dayIdx + 1)); }} disabled={dayIdx === days.length - 1} className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line hover:border-ink disabled:opacity-30 sm:flex" aria-label="Día siguiente">
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
                <div className="rounded-xl bg-field p-6">
                  <p className="text-center text-[15px]">No quedan horarios este día.</p>
                  {dayIdx < days.length - 1 && !wlOpen && (
                    <div className="text-center">
                      <button type="button" onClick={() => { autoSeek.current = false; setWlOpen(false); setDayIdx(dayIdx + 1); }} className="mt-2 min-h-[44px] text-[15px] font-medium underline">
                        Ver el día siguiente
                      </button>
                    </div>
                  )}

                  {wlDone.includes(selectedDay) ? (
                    <div className="rise-in mt-4 flex items-start gap-3 rounded-xl bg-white p-4 text-left">
                      <CircleCheck size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ok" />
                      <div>
                        <p className="text-[15px] font-medium">Estás en la lista de espera</p>
                        <p className="text-[14px] text-mute">Te avisaremos por correo si alguien cancela.</p>
                      </div>
                    </div>
                  ) : !wlOpen ? (
                    <button
                      type="button"
                      onClick={openWaitlist}
                      className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 text-[15px] font-medium hover:border-ink"
                    >
                      <BellRing size={17} strokeWidth={1.75} /> Avísame si se libera un horario
                    </button>
                  ) : (
                    <form onSubmit={joinWaitlist} className="rise-in mt-4 space-y-3 rounded-xl bg-white p-4 text-left">
                      <p className="text-[15px] font-medium">Avísame si se libera un horario</p>
                      <p className="-mt-2 text-[13px] text-mute">Para el {fmtDayLong(`${selectedDay}T12:00:00-05:00`).toLowerCase()}. Te escribimos si alguien cancela.</p>
                      <input value={wl.name} onChange={(e) => setWl({ ...wl, name: e.target.value })} autoComplete="name" autoCapitalize="words" className="fld" placeholder="Tu nombre" aria-label="Nombre" />
                      <div className="flex items-center rounded-xl border border-line-2 focus-within:border-ink">
                        <span className="tnum border-r border-line pl-4 pr-3 text-[16px] text-mute">+51</span>
                        <input value={wl.phone} onChange={(e) => setWl({ ...wl, phone: e.target.value })} inputMode="tel" autoComplete="tel-national" className="tnum w-full bg-transparent px-3 py-3.5 text-[16px] outline-none" placeholder="987 654 321" aria-label="Celular" />
                      </div>
                      <input value={wl.email} onChange={(e) => setWl({ ...wl, email: e.target.value })} type="email" autoComplete="email" className="fld" placeholder="tucorreo@gmail.com" aria-label="Correo" />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setWlOpen(false)} className="min-h-[48px] rounded-lg border border-line px-4 text-[15px] font-medium hover:border-ink">Cancelar</button>
                        <button type="submit" disabled={!wlOk || wlBusy} className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-lg text-[15px] font-medium disabled:opacity-40" style={{ background: accent, color: onAccent }}>
                          {wlBusy && <Loader2 size={17} className="animate-spin" />} Avisarme
                        </button>
                      </div>
                    </form>
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
              <Field
                label={requireVerif ? 'Correo' : 'Correo (opcional)'}
                hint={requireVerif ? 'Te enviaremos un código para confirmar que es tuyo.' : 'Te enviamos ahí la confirmación.'}
              >
                <input value={you.email} onChange={(e) => setYou({ ...you, email: e.target.value })} type="email" autoComplete="email" enterKeyHint="done" onKeyDown={(e) => { if (e.key === 'Enter' && youOk) goStep('pay'); }} className="fld" placeholder="tucorreo@gmail.com" />
                {you.email && !emailOk && <p className="mt-1 text-[13px] text-red">Revisa el correo.</p>}
              </Field>
              <button
                type="button"
                disabled={!youOk}
                onClick={() => goStep('pay')}
                className={`${primaryBtn} max-lg:hidden`}
                style={{ background: accent, color: onAccent }}
              >
                Continuar
              </button>
            </div>
          </StepBlock>

          {/* 5. Pago */}
          <StepBlock n={5} title={needsDeposit ? 'Adelanto y confirmación' : 'Confirmación'} open={step === 'pay'} disabled={!slot || !youOk}>
            <button type="button" onClick={() => { haptic.tap(); setCodesOpen(!codesOpen); }} className="flex min-h-[44px] items-center gap-2 text-left text-[15px] font-medium underline-offset-4 hover:underline">
              <Ticket size={17} strokeWidth={1.75} className="shrink-0" /> ¿Tienes un código o una gift card?
            </button>
            {referralOn && referralPct > 0 && (
              <p className="text-[14px] text-mute">¿Te recomendó un amigo? Usa su código y ten {referralPct}% de descuento.</p>
            )}
            {codesOpen && (
              <div className="rise-in mt-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <input value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())} className="fld uppercase" placeholder={referralOn ? 'Código de descuento o de amigo' : 'Código de descuento'} autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
                  <input value={giftCode} onChange={(e) => setGiftCode(e.target.value.toUpperCase())} className="fld uppercase" placeholder="Gift card" autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
                  <button type="button" onClick={applyCodes} className="min-h-[48px] rounded-xl border border-ink px-5 py-3 text-[15px] font-medium hover:bg-field">Aplicar</button>
                </div>
                {applied.promo && quote?.promo && !quote.promo.valid && (
                  <p className="mt-2 text-[14px] text-red">{quote.promo.reason ?? 'Código no válido'}</p>
                )}
                {applied.gift && quote?.giftCard && !quote.giftCard.valid && (
                  <p className="mt-2 text-[14px] text-red">{quote.giftCard.reason ?? 'Gift card no válida'}</p>
                )}
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
                      <input type="radio" name="metodo" value={id} checked={method === id} onChange={() => { haptic.select(); setMethod(id); }} className="sr-only" />
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

            <button type="button" onClick={confirm} disabled={busy || verifyBusy} className={`mt-6 flex items-center justify-center gap-2 max-lg:hidden ${primaryBtn}`} style={{ background: accent, color: onAccent }}>
              {(busy || verifyBusy) && <Loader2 size={18} className="animate-spin" />}
              {needsDeposit ? `Pagar adelanto de ${soles(quote!.depositCents)} y reservar` : 'Confirmar reserva'}
            </button>
            {requireVerif && verifiedEmail !== you.email.trim().toLowerCase() && (
              <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[13px] text-soft">
                <MailCheck size={14} strokeWidth={1.75} /> Te enviaremos un código a tu correo para confirmar.
              </p>
            )}
            {cancelHours > 0 && (
              <p className="mt-3 text-center text-[13px] text-soft">
                Puedes {settings?.allow_client_reschedule ? 'cambiar o cancelar' : 'cancelar'} hasta {cancelHours} horas antes desde el enlace de tu reserva.
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
                  : `${serviceLabel}${slot ? `, ${fmtTime(slot.start)}` : ''}`
                : multiLoc && !locationId ? 'Elige una sede para empezar' : 'Elige un servicio para empezar'}
            </span>
          </button>
          {step === 'service' && service && extras.length > 0 && (!multiLoc || locationId) && (
            <button type="button" onClick={afterService} className="rounded-xl px-6 py-3.5 text-[16px] font-medium" style={{ background: accent, color: onAccent }}>
              Continuar
            </button>
          )}
          {step === 'you' && (
            <button type="button" disabled={!youOk} onClick={() => goStep('pay')} className="rounded-xl px-6 py-3.5 text-[16px] font-medium disabled:opacity-40" style={{ background: accent, color: onAccent }}>
              Continuar
            </button>
          )}
          {step === 'pay' && (
            <button type="button" onClick={confirm} disabled={busy || verifyBusy} className="flex items-center gap-2 rounded-xl px-5 py-3.5 text-[16px] font-medium disabled:opacity-40" style={{ background: accent, color: onAccent }}>
              {(busy || verifyBusy) && <Loader2 size={18} className="animate-spin" />}
              {needsDeposit ? 'Pagar adelanto' : 'Confirmar'}
            </button>
          )}
        </div>
      </div>

      <Sheet open={summaryOpen} onClose={() => setSummaryOpen(false)} title="Tu reserva">
        {summary}
      </Sheet>

      <Sheet open={verifyOpen} onClose={() => setVerifyOpen(false)} title="Confirma tu correo">
        <form onSubmit={(e) => { e.preventDefault(); checkCode(code); }}>
          <p className="text-[15px] text-mute">
            Escribe el código de 6 dígitos que enviamos a <span className="font-medium text-ink">{you.email.trim()}</span>.
          </p>
          <input
            value={code}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 6);
              setCode(v);
              setCodeError(null);
              if (v.length === 6) checkCode(v);
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            autoFocus
            aria-label="Código de 6 dígitos"
            aria-invalid={!!codeError}
            className={`tnum mt-5 w-full rounded-xl border px-4 py-4 text-center text-[28px] font-semibold tracking-[0.5em] outline-none transition-colors ${codeError ? 'border-red' : 'border-line-2 focus:border-ink'}`}
            placeholder="000000"
          />
          {codeError && <p className="mt-2 text-[14px] text-red" role="alert">{codeError}</p>}
          <button type="submit" disabled={code.length !== 6 || verifyBusy || busy} className={`mt-4 flex items-center justify-center gap-2 ${primaryBtn}`} style={{ background: accent, color: onAccent }}>
            {(verifyBusy || busy) && <Loader2 size={18} className="animate-spin" />} Verificar y reservar
          </button>
          <div className="mt-4 flex items-center justify-between gap-3 text-[15px]">
            <button
              type="button"
              disabled={resendIn > 0 || verifyBusy}
              onClick={requestCode}
              className="min-h-[44px] font-medium underline underline-offset-4 disabled:text-soft disabled:no-underline"
            >
              {resendIn > 0 ? `Reenviar código en ${resendIn} s` : 'Reenviar código'}
            </button>
            <button type="button" onClick={() => {
                // Historial: [datos, pago, hoja]. Volver dos entradas cierra la hoja y deja en "Tus datos".
                if (window.history.state?.__layer) window.history.go(-2);
                else { setVerifyOpen(false); goStep('you'); }
              }} className="min-h-[44px] text-mute underline underline-offset-4 hover:text-ink">
              Cambiar correo
            </button>
          </div>
          <p className="mt-2 text-[13px] text-soft">Revisa también la carpeta de spam o promociones.</p>
        </form>
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
