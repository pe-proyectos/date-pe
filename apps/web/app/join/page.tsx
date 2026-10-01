'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, X, Loader2, ArrowLeft, ArrowRight, Store, Users, MessageCircle, PhoneCall, Mail, CalendarCheck, Sparkles, ShieldCheck } from 'lucide-react';
import { API_BASE_CLIENT } from '@/lib/config';
import { DISTRICTS } from '@/lib/districts';
import { Logo } from '@/components/brand';
import { Toaster } from '@/components/Toaster';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';

const slugify = (v: string) =>
  v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

const STAFF = [
  { v: '0-5', l: 'De 1 a 5', d: 'Barbería de barrio o estudio' },
  { v: '5-15', l: 'De 5 a 15', d: 'Equipo mediano' },
  { v: '15-30', l: 'De 15 a 30', d: 'Varias sillas y turnos' },
  { v: '30+', l: 'Más de 30', d: 'Cadena o franquicia' },
];
const LOCATIONS = [
  { v: '1', l: '1 local' },
  { v: '2-3', l: '2 o 3' },
  { v: '4-10', l: '4 a 10' },
  { v: '10+', l: 'Más de 10' },
];
const DAILY = [
  { v: '1-10', l: 'Hasta 10' },
  { v: '10-30', l: '10 a 30' },
  { v: '30-60', l: '30 a 60' },
  { v: '60-100', l: '60 a 100' },
  { v: '100+', l: 'Más de 100' },
];
const YEARS = ['Por abrir', 'Menos de 1 año', '1 a 3 años', '3 a 10 años', 'Más de 10 años'];
const SERVICES = ['Corte', 'Fade', 'Barba', 'Afeitado con navaja', 'Diseños', 'Tintes', 'Cejas', 'Tratamientos', 'Niños', 'Venta de productos'];
const BOOKING_TODAY = ['WhatsApp', 'Llamadas', 'Cuaderno o agenda', 'Instagram', 'Otra app', 'Solo sin cita'];
const INTERESTS = [
  'Reservas en línea',
  'Fila virtual y pantalla de TV',
  'Caja y cobros',
  'Adelantos para evitar ausencias',
  'Recordatorios automáticos',
  'Comisiones y pagos al equipo',
  'Inventario de productos',
  'Marketing y clientes frecuentes',
  'Reportes y ganancias',
  'Varias sedes',
];
const PAYMENTS = ['Efectivo', 'Yape', 'Plin', 'Tarjeta', 'Transferencia'];
const HEARD = ['Instagram', 'TikTok', 'Google', 'Recomendación', 'Un cliente', 'Otro'];
const ROLES = ['Dueño o dueña', 'Socio', 'Administrador', 'Barbero'];

type Form = {
  shopName: string;
  desiredSlug: string;
  district: string;
  city: string;
  address: string;
  yearsOpen: string;
  instagram: string;
  website: string;
  staffSize: string;
  locationsCount: string;
  dailyClients: string;
  services: string[];
  paymentMethods: string[];
  currentBooking: string[];
  currentSoftware: string;
  interests: string[];
  ownerName: string;
  role: string;
  email: string;
  phone: string;
  contactPref: 'whatsapp' | 'llamada' | 'correo';
  contactTime: string;
  heardFrom: string;
  comments: string;
  acceptTerms: boolean;
  company: string;
};

const EMPTY: Form = {
  shopName: '', desiredSlug: '', district: '', city: 'Lima', address: '', yearsOpen: '', instagram: '', website: '',
  staffSize: '', locationsCount: '', dailyClients: '', services: [], paymentMethods: [], currentBooking: [], currentSoftware: '', interests: [],
  ownerName: '', role: '', email: '', phone: '', contactPref: 'whatsapp', contactTime: '', heardFrom: '', comments: '', acceptTerms: false, company: '',
};
const DRAFT_KEY = 'datepe_solicitud_borrador';
const STEPS = [
  { id: 'barberia', title: 'Tu barbería', icon: Store },
  { id: 'operacion', title: 'Cómo es tu negocio', icon: Users },
  { id: 'hoy', title: 'Cómo trabajas hoy', icon: CalendarCheck },
  { id: 'contacto', title: 'Cómo te contactamos', icon: MessageCircle },
] as const;

export default function JoinPage() {
  const [f, setF] = useState<Form>(EMPTY);
  const [step, setStep] = useState(0);
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState<'idle' | 'checking' | 'ok' | 'taken'>('idle');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ name: string; pref: Form['contactPref']; updated: boolean } | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  // Borrador guardado: si se cierra la página, no se pierde nada
  useEffect(() => {
    try {
      const d = localStorage.getItem(DRAFT_KEY);
      if (d) setF({ ...EMPTY, ...JSON.parse(d), acceptTerms: false, company: '' });
    } catch { /* */ }
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => localStorage.setItem(DRAFT_KEY, JSON.stringify(f)), 400);
    return () => clearTimeout(t);
  }, [f]);

  const slug = slugTouched ? f.desiredSlug : slugify(f.shopName);
  useEffect(() => {
    if (slug.length < 2) return setSlugState('idle');
    setSlugState('checking');
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`${API_BASE_CLIENT}/api/onboarding/slug?slug=${slug}`).then((x) => x.json());
        setSlugState(r.available ? 'ok' : 'taken');
      } catch {
        setSlugState('idle');
      }
    }, 350);
    return () => clearTimeout(t);
  }, [slug]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const toggle = (k: 'services' | 'paymentMethods' | 'currentBooking' | 'interests', v: string) => {
    haptic.select();
    setF((p) => ({ ...p, [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v] }));
  };

  const phoneOk = f.phone.replace(/\D/g, '').length >= 9;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim());
  const valid = useMemo(
    () => [
      f.shopName.trim().length >= 2 && !!f.district,
      !!f.staffSize && !!f.locationsCount && !!f.dailyClients,
      f.currentBooking.length > 0,
      f.ownerName.trim().length >= 2 && emailOk && phoneOk && f.acceptTerms,
    ],
    [f, emailOk, phoneOk],
  );
  const missing = [
    !f.shopName.trim() ? 'el nombre de tu barbería' : !f.district ? 'tu distrito' : '',
    !f.staffSize ? 'cuántas personas trabajan' : !f.locationsCount ? 'cuántos locales tienes' : !f.dailyClients ? 'cuántos clientes atiendes al día' : '',
    f.currentBooking.length === 0 ? 'cómo reciben reservas hoy' : '',
    !f.ownerName.trim() ? 'tu nombre' : !emailOk ? 'un correo válido' : !phoneOk ? 'tu celular' : !f.acceptTerms ? 'aceptar el tratamiento de datos' : '',
  ];

  function go(to: number) {
    setStep(to);
    haptic.tap();
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  function next() {
    if (!valid[step]) return toast.error(`Falta ${missing[step]}.`);
    if (step < STEPS.length - 1) go(step + 1);
    else void submit();
  }

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_CLIENT}/api/onboarding/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...f,
          desiredSlug: slugState === 'taken' ? '' : slug,
          phone: `+51${f.phone.replace(/\D/g, '').slice(-9)}`,
          instagram: f.instagram.trim() || undefined,
          website: f.website.trim() || undefined,
          address: f.address.trim() || undefined,
          currentSoftware: f.currentSoftware.trim() || undefined,
          comments: f.comments.trim() || undefined,
          role: f.role || undefined,
          yearsOpen: f.yearsOpen || undefined,
          heardFrom: f.heardFrom || undefined,
          contactTime: f.contactTime || undefined,
          company: f.company || undefined,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(res.status === 429 ? 'Enviaste varias solicitudes seguidas. Intenta en un rato.' : 'Revisa los datos e intenta de nuevo.');
        return;
      }
      haptic.success();
      localStorage.removeItem(DRAFT_KEY);
      setDone({ name: f.ownerName.split(' ')[0], pref: f.contactPref, updated: !!d.updated });
    } catch {
      toast.error('Sin conexión. Tu solicitud sigue guardada en este equipo, intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const via = done.pref === 'correo' ? 'correo' : done.pref === 'llamada' ? 'una llamada' : 'WhatsApp';
    return (
      <main className="mx-auto max-w-xl px-5 py-12 md:py-20">
        <Logo />
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" className="draw-check mt-12 text-ok" aria-hidden>
          <circle cx="12" cy="12" r="11" fill="currentColor" />
          <path d="M7 12.5l3.2 3.2L17 9" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h1 className="mt-6 text-[clamp(2rem,5vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.035em]">
          {done.updated ? 'Actualizamos tu solicitud' : `Listo, ${done.name}. Recibimos tu solicitud.`}
        </h1>
        <p className="mt-3 text-[17px] leading-relaxed text-mute">Te enviamos una copia a tu correo. Esto es lo que sigue:</p>
        <ol className="mt-8 space-y-6">
          {[
            ['Te contactamos', `En menos de 24 horas hábiles, por ${via}.`],
            ['Te mostramos date.pe con tus datos', 'Una demo corta con tus servicios, tu equipo y tu forma de trabajar.'],
            ['Armamos tu plan', 'Según tu equipo, tus locales y las funciones que vas a usar.'],
            ['Activamos tu barbería', 'Recibes el acceso a tu panel y tu página queda lista para compartir.'],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-4">
              <span className="tnum flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-[14px] font-semibold text-white">{i + 1}</span>
              <div>
                <p className="text-[16px] font-medium">{t}</p>
                <p className="mt-0.5 text-[15px] text-mute">{d}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <a href="https://barberiajuana.date.pe" className="flex items-center justify-center gap-2 rounded-lg bg-ink px-6 py-3.5 text-[15px] font-medium text-white">
            Mira una barbería de ejemplo <ArrowRight size={17} strokeWidth={1.75} />
          </a>
          <Link href="/" className="flex items-center justify-center rounded-lg border border-line px-6 py-3.5 text-[15px] font-medium hover:border-ink">
            Volver al inicio
          </Link>
        </div>
      </main>
    );
  }

  const StepIcon = STEPS[step].icon;
  return (
    <main className="min-h-screen pb-[calc(96px+env(safe-area-inset-bottom))] lg:pb-16">
      <Toaster />
      <div className="mx-auto grid max-w-[1180px] gap-10 px-5 py-6 md:px-8 lg:grid-cols-12 lg:py-10">
        {/* Lado izquierdo: por qué y qué pasa después */}
        <aside className="lg:col-span-4">
          <Logo />
          <h1 className="mt-10 text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.04] tracking-[-0.04em]">Lleva tu barbería a date.pe.</h1>
          <p className="mt-4 text-[17px] leading-relaxed text-mute">
            Cuéntanos cómo trabajas. Te contactamos, te mostramos el sistema con tus datos y armamos juntos el plan que le queda a tu barbería.
          </p>
          <ul className="mt-7 hidden space-y-3 text-[15px] lg:block">
            {['Página propia con reservas en línea', 'Fila virtual y pantalla de TV en tiempo real', 'Caja, comisiones y reportes del negocio', 'Sin comisión por cita'].map((b) => (
              <li key={b} className="flex items-start gap-3">
                <Check size={18} strokeWidth={2} className="mt-0.5 shrink-0" /> {b}
              </li>
            ))}
          </ul>
          <div className="mt-8 hidden items-start gap-3 rounded-xl bg-field p-4 text-[14px] text-mute lg:flex">
            <ShieldCheck size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ink" />
            Tus datos solo los usa el equipo de date.pe para contactarte. Guardamos tu avance en este equipo por si cierras la página.
          </div>
        </aside>

        <div ref={topRef} className="scroll-mt-4 lg:col-span-7 lg:col-start-6">
          {/* Progreso */}
          <div className="flex items-center gap-2" aria-label={`Paso ${step + 1} de ${STEPS.length}`}>
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => (i < step || valid.slice(0, i).every(Boolean) ? go(i) : toast.error(`Falta ${missing[valid.findIndex((v) => !v)]}.`))}
                aria-label={`Paso ${i + 1}: ${s.title}`}
                aria-current={i === step ? 'step' : undefined}
                className="group min-h-11 flex-1 py-2 text-left"
              >
                <span className={`block h-1.5 rounded-full transition-colors ${i <= step ? 'bg-ink' : 'bg-line'}`} />
                <span className={`mt-2 hidden text-[13px] sm:block ${i === step ? 'font-medium text-ink' : 'text-soft'}`}>{s.title}</span>
              </button>
            ))}
          </div>

          <div className="mt-6 rounded-xl border border-line p-5 md:p-8">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-field"><StepIcon size={19} strokeWidth={1.75} /></span>
              <div>
                <p className="text-[13px] text-mute">Paso {step + 1} de {STEPS.length}</p>
                <h2 className="text-[22px] font-semibold tracking-[-0.03em]">{STEPS[step].title}</h2>
              </div>
            </div>

            {step === 0 && (
              <div className="mt-7 space-y-5">
                <Field label="Nombre de la barbería">
                  <input value={f.shopName} onChange={(e) => set('shopName', e.target.value)} className="fld" placeholder="Barbería Don Lucho" autoComplete="organization" />
                </Field>
                <Field label="La dirección que te gustaría" hint="Podemos ajustarla cuando activemos tu cuenta.">
                  <div className="flex items-center rounded-xl border border-line-2 bg-white pr-3 focus-within:border-ink">
                    <input
                      value={slug}
                      onChange={(e) => { setSlugTouched(true); set('desiredSlug', slugify(e.target.value)); }}
                      className="w-full bg-transparent py-3.5 pl-4 text-[16px] outline-none"
                      placeholder="donlucho"
                      autoCapitalize="none"
                      autoCorrect="off"
                    />
                    <span className="text-[16px] text-mute">.date.pe</span>
                  </div>
                  <span className="mt-1.5 flex h-5 items-center gap-1.5 text-[13px]">
                    {slugState === 'checking' && <><Loader2 size={13} className="animate-spin text-soft" /> <span className="text-soft">Revisando</span></>}
                    {slugState === 'ok' && <><Check size={14} strokeWidth={2.5} className="text-ok" /> <span className="text-ok">Disponible</span></>}
                    {slugState === 'taken' && <><X size={14} strokeWidth={2.5} className="text-red" /> <span className="text-red">Ya está en uso, prueba otra</span></>}
                  </span>
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Distrito">
                    <input list="distritos" value={f.district} onChange={(e) => set('district', e.target.value)} className="fld" placeholder="Miraflores" />
                    <datalist id="distritos">{DISTRICTS.map((d) => <option key={d.slug} value={d.name} />)}</datalist>
                  </Field>
                  <Field label="Ciudad">
                    <input value={f.city} onChange={(e) => set('city', e.target.value)} className="fld" />
                  </Field>
                </div>
                <Field label="Dirección del local (opcional)">
                  <input value={f.address} onChange={(e) => set('address', e.target.value)} className="fld" placeholder="Av. Larco 1234" autoComplete="street-address" />
                </Field>
                <Field label="¿Hace cuánto abrieron?">
                  <Chips options={YEARS.map((y) => ({ v: y, l: y }))} value={f.yearsOpen} onChange={(v) => set('yearsOpen', v)} />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Instagram (opcional)">
                    <input value={f.instagram} onChange={(e) => set('instagram', e.target.value)} className="fld" placeholder="@donlucho" autoCapitalize="none" />
                  </Field>
                  <Field label="Página web (opcional)">
                    <input value={f.website} onChange={(e) => set('website', e.target.value)} className="fld" placeholder="donlucho.pe" autoCapitalize="none" inputMode="url" />
                  </Field>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="mt-7 space-y-7">
                <Field label="¿Cuántas personas trabajan en la barbería?">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {STAFF.map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        onClick={() => { haptic.select(); set('staffSize', o.v); }}
                        aria-pressed={f.staffSize === o.v}
                        className={`rounded-xl border p-4 text-left transition-colors ${f.staffSize === o.v ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink'}`}
                      >
                        <span className="block text-[16px] font-semibold">{o.l}</span>
                        <span className={`block text-[13px] ${f.staffSize === o.v ? 'text-white/75' : 'text-mute'}`}>{o.d}</span>
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="¿Cuántos locales tienen?">
                  <Chips options={LOCATIONS} value={f.locationsCount} onChange={(v) => set('locationsCount', v)} />
                </Field>
                <Field label="¿Cuántos clientes atienden en un día normal? (entre todos los locales)">
                  <Chips options={DAILY} value={f.dailyClients} onChange={(v) => set('dailyClients', v)} />
                </Field>
                <Field label="Servicios que ofrecen">
                  <MultiChips options={SERVICES} value={f.services} onToggle={(v) => toggle('services', v)} />
                </Field>
                <Field label="Cómo les pagan">
                  <MultiChips options={PAYMENTS} value={f.paymentMethods} onToggle={(v) => toggle('paymentMethods', v)} />
                </Field>
              </div>
            )}

            {step === 2 && (
              <div className="mt-7 space-y-7">
                <Field label="¿Cómo reciben reservas hoy?" hint="Marca todas las que usen.">
                  <MultiChips options={BOOKING_TODAY} value={f.currentBooking} onToggle={(v) => toggle('currentBooking', v)} />
                </Field>
                <Field label="Si usan otro sistema, ¿cuál? (opcional)">
                  <input value={f.currentSoftware} onChange={(e) => set('currentSoftware', e.target.value)} className="fld" placeholder="Ej. Booksy, Fresha, un Excel" />
                </Field>
                <Field label="¿Qué te gustaría resolver con date.pe?" hint="Nos ayuda a preparar tu demo.">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {INTERESTS.map((o) => {
                      const on = f.interests.includes(o);
                      return (
                        <button
                          key={o}
                          type="button"
                          onClick={() => toggle('interests', o)}
                          aria-pressed={on}
                          className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-[15px] transition-colors ${on ? 'border-ink bg-field' : 'border-line hover:border-ink'}`}
                        >
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${on ? 'border-ink bg-ink text-white' : 'border-line-2'}`}>
                            {on && <Check size={13} strokeWidth={3} />}
                          </span>
                          {o}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </div>
            )}

            {step === 3 && (
              <div className="mt-7 space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Tu nombre">
                    <input value={f.ownerName} onChange={(e) => set('ownerName', e.target.value)} className="fld" autoComplete="name" />
                  </Field>
                  <Field label="Tu rol">
                    <select value={f.role} onChange={(e) => set('role', e.target.value)} className="fld">
                      <option value="">Elige</option>
                      {ROLES.map((r) => <option key={r}>{r}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Celular">
                    <div className="flex items-center rounded-xl border border-line-2 bg-white focus-within:border-ink">
                      <span className="border-r border-line px-3.5 py-3.5 text-[16px] text-mute">+51</span>
                      <input value={f.phone} onChange={(e) => set('phone', e.target.value.replace(/[^\d ]/g, ''))} className="w-full bg-transparent px-3.5 py-3.5 text-[16px] outline-none" inputMode="tel" autoComplete="tel-national" placeholder="987 654 321" />
                    </div>
                  </Field>
                  <Field label="Correo">
                    <input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} className="fld" autoComplete="email" inputMode="email" autoCapitalize="none" />
                  </Field>
                </div>
                <Field label="¿Cómo prefieres que te contactemos?">
                  <div className="grid grid-cols-3 gap-2">
                    {([['whatsapp', 'WhatsApp', MessageCircle], ['llamada', 'Llamada', PhoneCall], ['correo', 'Correo', Mail]] as const).map(([v, l, Icon]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => { haptic.select(); set('contactPref', v); }}
                        aria-pressed={f.contactPref === v}
                        className={`flex flex-col items-center gap-1.5 rounded-xl border py-3.5 text-[14px] font-medium transition-colors ${f.contactPref === v ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink'}`}
                      >
                        <Icon size={19} strokeWidth={1.75} /> {l}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="¿En qué horario?">
                  <Chips options={['Mañana', 'Tarde', 'Noche'].map((x) => ({ v: x.toLowerCase(), l: x }))} value={f.contactTime} onChange={(v) => set('contactTime', v)} />
                </Field>
                <Field label="¿Cómo te enteraste de date.pe?">
                  <Chips options={HEARD.map((x) => ({ v: x, l: x }))} value={f.heardFrom} onChange={(v) => set('heardFrom', v)} />
                </Field>
                <Field label="¿Algo más que debamos saber? (opcional)">
                  <textarea value={f.comments} onChange={(e) => set('comments', e.target.value)} rows={3} className="fld resize-none" placeholder="Ej. abrimos un segundo local en diciembre" />
                </Field>
                {/* Trampa para bots */}
                <input tabIndex={-1} autoComplete="off" value={f.company} onChange={(e) => set('company', e.target.value)} className="hidden" aria-hidden />
                <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-field p-4 text-[14px] leading-relaxed">
                  <input type="checkbox" checked={f.acceptTerms} onChange={(e) => set('acceptTerms', e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#0a0a0a]" />
                  <span>Acepto que date.pe use estos datos para contactarme sobre mi solicitud. No los compartimos con nadie.</span>
                </label>
              </div>
            )}

            {/* Navegación (escritorio) */}
            <div className="mt-8 hidden items-center justify-between lg:flex">
              {step > 0 ? (
                <button type="button" onClick={() => go(step - 1)} className="flex items-center gap-2 rounded-lg px-4 py-3 text-[15px] font-medium hover:bg-field">
                  <ArrowLeft size={17} strokeWidth={1.75} /> Atrás
                </button>
              ) : (
                <span />
              )}
              <button type="button" onClick={next} disabled={busy} className="flex items-center gap-2 rounded-lg bg-ink px-6 py-3.5 text-[15px] font-medium text-white hover:bg-ink-2 disabled:opacity-50">
                {busy && <Loader2 size={17} className="animate-spin" />}
                {step === STEPS.length - 1 ? 'Enviar solicitud' : 'Continuar'}
                {step < STEPS.length - 1 && <ArrowRight size={17} strokeWidth={1.75} />}
              </button>
            </div>
          </div>
          <p className="mt-4 flex items-center justify-center gap-2 text-center text-[14px] text-mute">
            <Sparkles size={15} strokeWidth={1.75} /> ¿Ya trabajas con date.pe? <Link href="/ingresar" className="font-medium text-ink underline">Ingresa a tu panel</Link>
          </p>
        </div>
      </div>

      {/* Barra inferior en el teléfono */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-5 pt-3 backdrop-blur-md lg:hidden">
        <div className="flex items-center gap-3 pb-3">
          {step > 0 && (
            <button type="button" onClick={() => go(step - 1)} className="flex h-12 w-12 items-center justify-center rounded-xl border border-line" aria-label="Atrás">
              <ArrowLeft size={20} strokeWidth={1.75} />
            </button>
          )}
          <button type="button" onClick={next} disabled={busy} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-ink text-[16px] font-medium text-white disabled:opacity-50">
            {busy && <Loader2 size={18} className="animate-spin" />}
            {step === STEPS.length - 1 ? 'Enviar solicitud' : 'Continuar'}
          </button>
        </div>
      </div>
      <style>{`.fld{width:100%;border:1px solid var(--color-line-2);border-radius:12px;padding:0.85rem 1rem;font-size:16px;background:#fff;outline:none;transition:border-color .2s}.fld:focus{border-color:var(--color-ink)}`}</style>
    </main>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-2 block text-[15px] font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[13px] text-soft">{hint}</span>}
    </div>
  );
}

function Chips({ options, value, onChange }: { options: Array<{ v: string; l: string }>; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => { haptic.select(); onChange(value === o.v ? '' : o.v); }}
          aria-pressed={value === o.v}
          className={`rounded-full border px-4 py-2.5 text-[15px] transition-colors ${value === o.v ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink'}`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function MultiChips({ options, value, onToggle }: { options: string[]; value: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => onToggle(o)}
            aria-pressed={on}
            className={`flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-[15px] transition-colors ${on ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink'}`}
          >
            {on && <Check size={14} strokeWidth={2.5} />} {o}
          </button>
        );
      })}
    </div>
  );
}
