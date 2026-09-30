'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  LayoutDashboard, CalendarDays, Users, Clock, Scissors, Contact, TicketPercent, Star, ChartColumn, Settings, LogOut, ExternalLink, Loader2, Eye, EyeOff, House, Menu, ChevronRight, CreditCard, CirclePause, CalendarClock, MailCheck, ArrowLeft,
} from 'lucide-react';
import { API_BASE_CLIENT, tenantUrl } from '@/lib/config';
import { PoleMark } from '@/components/brand';
import { Toaster } from '@/components/Toaster';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import { Sheet } from '@/components/Sheet';
import { AdminContext, useApi } from './_parts/api';
import { Resumen } from './_parts/Resumen';
import { Agenda } from './_parts/Agenda';
import { Equipo } from './_parts/Equipo';
import { Horarios } from './_parts/Horarios';
import { Servicios } from './_parts/Servicios';
import { Clientes } from './_parts/Clientes';
import { Promociones } from './_parts/Promociones';
import { Resenas } from './_parts/Resenas';
import { Reportes } from './_parts/Reportes';
import { Ajustes } from './_parts/Ajustes';
import { Facturacion, BILLING_EVENT, diasTexto, type Billing } from './_parts/Facturacion';

const SECTIONS = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { id: 'agenda', label: 'Agenda', icon: CalendarDays },
  { id: 'equipo', label: 'Equipo', icon: Users },
  { id: 'horarios', label: 'Horarios', icon: Clock },
  { id: 'servicios', label: 'Servicios', icon: Scissors },
  { id: 'clientes', label: 'Clientes', icon: Contact },
  { id: 'promociones', label: 'Promociones', icon: TicketPercent },
  { id: 'resenas', label: 'Reseñas', icon: Star },
  { id: 'reportes', label: 'Reportes', icon: ChartColumn },
  { id: 'ajustes', label: 'Ajustes', icon: Settings },
  { id: 'facturacion', label: 'Facturación', icon: CreditCard },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

export default function AdminPage() {
  const tenant = useParams().tenant as string;
  const key = `datepe_token_${tenant}`;
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [section, setSection] = useState<SectionId>('resumen');
  const [shopName, setShopName] = useState(tenant);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setToken(localStorage.getItem(key));
    const h = window.location.hash.slice(1) as SectionId;
    if (SECTIONS.some((s) => s.id === h)) setSection(h);
    fetch(`${API_BASE_CLIENT}/api/public/site`, { headers: { 'X-Tenant-Slug': tenant } })
      .then((r) => r.json())
      .then((d) => d?.tenant?.name && setShopName(d.tenant.name))
      .catch(() => {});
  }, [key, tenant]);

  // Vuelta del pago del plan: ?pago=ok o ?pago=error (llega con #facturacion)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pago = params.get('pago');
    if (!pago) return;
    if (pago === 'ok') toast.success('Pago recibido. Tu plan se actualiza en unos segundos.');
    else toast.error('El pago no se completó. Puedes intentarlo de nuevo.');
    params.delete('pago');
    const qs = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
    if (pago !== 'ok') return;
    // El aviso del proveedor puede tardar unos segundos: recargamos el estado del plan
    const t1 = setTimeout(() => window.dispatchEvent(new Event(BILLING_EVENT)), 4000);
    const t2 = setTimeout(() => window.dispatchEvent(new Event(BILLING_EVENT)), 12000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.slice(1) as SectionId;
      if (SECTIONS.some((s) => s.id === h)) setSection(h);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((id: string) => {
    window.location.hash = id;
    setSection(id as SectionId);
    window.scrollTo({ top: 0 });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(key);
    setToken(null);
  }, [key]);

  if (token === undefined) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="animate-spin text-soft" /></div>;
  if (!token) return <Login tenant={tenant} shopName={shopName} onLogin={(t) => { localStorage.setItem(key, t); setToken(t); }} />;

  const Other = { agenda: Agenda, equipo: Equipo, horarios: Horarios, servicios: Servicios, clientes: Clientes, promociones: Promociones, resenas: Resenas, reportes: Reportes, ajustes: Ajustes, facturacion: Facturacion } as const;
  const View = section === 'resumen' ? null : Other[section];

  return (
    <AdminContext.Provider value={{ tenant, token, logout }}>
      <Toaster />
      <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
        {/* Barra lateral */}
        <aside className="hidden border-r border-line lg:flex lg:flex-col">
          <div className="sticky top-0 flex h-screen flex-col px-4 py-5">
            <div className="flex items-center gap-2.5 px-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-[15px] font-semibold text-white">{shopName.replace(/^Barber[ií]a\s+/i, '').charAt(0).toUpperCase()}</span>
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold tracking-[-0.02em]">{shopName}</div>
                <div className="truncate text-[12px] text-soft">{tenant}.date.pe</div>
              </div>
            </div>
            <nav className="mt-8 flex-1 space-y-0.5" aria-label="Secciones del panel">
              {SECTIONS.map(({ id, label, icon: Icon }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  onClick={(e) => { e.preventDefault(); go(id); }}
                  aria-current={section === id ? 'page' : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] transition-colors ${section === id ? 'bg-field font-medium text-ink' : 'text-mute hover:bg-field hover:text-ink'}`}
                >
                  <Icon size={18} strokeWidth={1.75} /> {label}
                </a>
              ))}
            </nav>
            <div className="space-y-0.5 border-t border-line pt-4">
              <a href={tenantUrl(tenant)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] text-mute hover:bg-field hover:text-ink">
                <ExternalLink size={18} strokeWidth={1.75} /> Ver mi página
              </a>
              <button type="button" onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[15px] text-mute hover:bg-field hover:text-ink">
                <LogOut size={18} strokeWidth={1.75} /> Cerrar sesión
              </button>
              <div className="flex items-center gap-2 px-3 pt-3 text-[12px] text-soft"><PoleMark size={16} /> date.pe</div>
            </div>
          </div>
        </aside>

        {/* Móvil: barra superior con el título de la sección */}
        <div className="pt-safe sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur-md lg:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <PoleMark size={22} className="shrink-0" />
              <div className="truncate text-[16px] font-semibold tracking-[-0.02em]">{shopName}</div>
            </div>
            <a href={tenantUrl(tenant)} target="_blank" rel="noopener noreferrer" className="flex h-10 w-10 items-center justify-center rounded-full active:bg-field" aria-label="Ver mi página">
              <ExternalLink size={19} strokeWidth={1.75} />
            </a>
          </div>
        </div>

        {/* Móvil: barra inferior de pestañas */}
        <nav aria-label="Secciones del panel" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur-md lg:hidden">
          <ul className="grid grid-cols-4">
            {([['resumen', 'Hoy', House], ['agenda', 'Agenda', CalendarDays], ['clientes', 'Clientes', Contact]] as const).map(([id, label, Icon]) => (
              <li key={id}>
                <button type="button" onClick={() => { haptic.tap(); go(id); }} aria-current={section === id ? 'page' : undefined} className={`flex w-full flex-col items-center gap-1 pb-1 pt-2.5 text-[11px] font-medium ${section === id ? 'text-ink' : 'text-soft'}`}>
                  <Icon size={23} strokeWidth={section === id ? 2.1 : 1.7} /> {label}
                </button>
              </li>
            ))}
            <li>
              <button type="button" onClick={() => { haptic.tap(); setMoreOpen(true); }} className={`flex w-full flex-col items-center gap-1 pb-1 pt-2.5 text-[11px] font-medium ${['resumen', 'agenda', 'clientes'].includes(section) ? 'text-soft' : 'text-ink'}`}>
                <Menu size={23} strokeWidth={1.7} /> Más
              </button>
            </li>
          </ul>
        </nav>

        <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Más opciones">
          <ul className="-mx-2">
            {SECTIONS.filter((x) => !['resumen', 'agenda', 'clientes'].includes(x.id)).map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => { setMoreOpen(false); setTimeout(() => go(id), 50); }}
                  className="flex w-full items-center gap-4 rounded-xl px-3 py-3.5 text-left text-[16px] active:bg-field"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-field"><Icon size={19} strokeWidth={1.75} /></span>
                  <span className="flex-1">{label}</span>
                  <ChevronRight size={18} strokeWidth={1.75} className="text-soft" />
                </button>
              </li>
            ))}
            <li className="mt-2 border-t border-line pt-2">
              <button type="button" onClick={logout} className="flex w-full items-center gap-4 rounded-xl px-3 py-3.5 text-left text-[16px] text-red active:bg-field">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-tint"><LogOut size={19} strokeWidth={1.75} /></span>
                Cerrar sesión
              </button>
            </li>
          </ul>
        </Sheet>

        <main className="min-w-0 px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-6 md:px-10 lg:py-10">
          <BillingBanner go={go} section={section} />
          <div key={section} className="rise-in mx-auto max-w-[1100px]">
            {View ? <View /> : <Resumen go={go} />}
          </div>
        </main>
      </div>
    </AdminContext.Provider>
  );
}

/** Aviso del plan arriba del contenido: pausa por falta de pago o vencimiento cercano. */
function BillingBanner({ go, section }: { go: (id: string) => void; section: SectionId }) {
  const api = useApi();
  const [b, setB] = useState<Billing | null>(null);
  const load = useCallback(() => api<{ billing: Billing | null }>('/admin/billing').then((d) => setB(d.billing)).catch(() => {}), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
    window.addEventListener(BILLING_EVENT, load);
    return () => window.removeEventListener(BILLING_EVENT, load);
  }, [load]);

  if (!b || b.isDemo || section === 'facturacion') return null;
  if (!b.suspended && !b.needsPayment) return null;

  const days = Math.max(0, b.daysLeft ?? 0);
  const title = b.suspended
    ? 'Tu página de reservas está en pausa'
    : b.status === 'trial'
      ? days === 0 ? 'Tu prueba termina hoy' : `Tu prueba termina en ${diasTexto(days)}`
      : days === 0 ? 'Tu plan vence hoy' : `Tu plan vence en ${diasTexto(days)}`;
  const body = b.suspended
    ? 'Tus clientes no pueden reservar hasta que pagues el plan. El panel sigue funcionando.'
    : 'Paga tu plan para que tu página siga recibiendo reservas sin cortes.';
  const Icon = b.suspended ? CirclePause : CalendarClock;

  return (
    <div className={`mx-auto mb-6 flex max-w-[1100px] flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-center sm:gap-4 md:px-5 ${b.suspended ? 'bg-red-tint' : 'border border-line bg-field'}`} role="status">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Icon size={20} strokeWidth={1.75} className={`mt-0.5 shrink-0 ${b.suspended ? 'text-red-deep' : 'text-ink'}`} />
        <div className="min-w-0">
          <p className={`text-[15px] font-medium ${b.suspended ? 'text-red-deep' : ''}`}>{title}</p>
          <p className="text-[14px] text-mute">{body}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => { haptic.tap(); go('facturacion'); }}
        className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-[14px] font-medium text-white ${b.suspended ? 'bg-red hover:bg-red-deep' : 'bg-ink hover:bg-ink-2'}`}
      >
        <CreditCard size={16} strokeWidth={1.75} /> {b.suspended ? 'Pagar ahora' : 'Pagar'}
      </button>
    </div>
  );
}

function Login({ tenant, shopName, onLogin }: { tenant: string; shopName: string; onLogin: (t: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'login' | 'forgot' | 'sent'>('login');

  async function forgot(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await fetch(`${API_BASE_CLIENT}/api/auth/password/forgot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenant },
        body: JSON.stringify({ email: email.trim() }),
      });
    } catch {
      /* misma respuesta siempre: no revelamos si el correo existe */
    } finally {
      setBusy(false);
      haptic.success();
      setMode('sent');
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_CLIENT}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenant },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const d = await res.json();
      if (res.ok && d.token) onLogin(d.token);
      else toast.error('Correo o contraseña incorrectos.');
    } catch {
      toast.error('Sin conexión. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <Toaster />
      <div className="flex flex-col px-6 py-8 md:px-12">
        <div className="flex items-center gap-2 text-[15px] text-mute"><PoleMark size={22} /> date.pe</div>
        {mode !== 'login' ? (
          <div className="my-auto w-full max-w-sm py-16">
            <button type="button" onClick={() => setMode('login')} className="-ml-2 mb-6 flex h-10 items-center gap-1.5 rounded-full px-2 text-[15px] text-mute hover:bg-field hover:text-ink">
              <ArrowLeft size={18} strokeWidth={1.75} /> Volver a ingresar
            </button>
            {mode === 'forgot' ? (
              <form onSubmit={forgot}>
                <h1 className="text-[clamp(2rem,4vw,2.5rem)] font-semibold leading-[1.05] tracking-[-0.035em]">Recupera tu contraseña</h1>
                <p className="mt-2 text-[16px] text-mute">Escribe el correo de tu cuenta y te enviamos un enlace para crear una nueva.</p>
                <label className="mt-8 block">
                  <span className="mb-1.5 block text-[14px] font-medium">Correo</span>
                  <input autoFocus value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required className="w-full rounded-xl border border-line-2 px-4 py-3.5 text-[16px] outline-none focus:border-ink" />
                </label>
                <button disabled={busy} className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-ink py-3.5 text-[16px] font-medium text-white hover:bg-ink-2 disabled:opacity-50">
                  {busy && <Loader2 size={18} className="animate-spin" />} Enviar enlace
                </button>
              </form>
            ) : (
              <div>
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-field"><MailCheck size={24} strokeWidth={1.75} /></span>
                <h1 className="mt-6 text-[clamp(2rem,4vw,2.5rem)] font-semibold leading-[1.05] tracking-[-0.035em]">Revisa tu correo</h1>
                <p className="mt-2 text-[16px] text-mute">Si el correo está registrado, te enviamos un enlace. Vence en 1 hora; revisa también la carpeta de spam.</p>
                <button type="button" onClick={() => setMode('login')} className="mt-8 flex w-full items-center justify-center rounded-lg border border-line-2 py-3.5 text-[16px] font-medium hover:border-ink">
                  Volver a ingresar
                </button>
              </div>
            )}
          </div>
        ) : (
        <form onSubmit={submit} className="my-auto w-full max-w-sm py-16">
          <h1 className="text-[clamp(2rem,4vw,2.5rem)] font-semibold leading-[1.05] tracking-[-0.035em]">Panel de {shopName}</h1>
          <p className="mt-2 text-[16px] text-mute">Ingresa con el correo con el que creaste tu barbería.</p>
          <label className="mt-8 block">
            <span className="mb-1.5 block text-[14px] font-medium">Correo</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required className="w-full rounded-xl border border-line-2 px-4 py-3.5 text-[16px] outline-none focus:border-ink" />
          </label>
          <label className="mt-4 block">
            <span className="mb-1.5 block text-[14px] font-medium">Contraseña</span>
            <div className="flex items-center rounded-xl border border-line-2 pr-2 focus-within:border-ink">
              <input value={password} onChange={(e) => setPassword(e.target.value)} type={show ? 'text' : 'password'} autoComplete="current-password" required className="w-full bg-transparent px-4 py-3.5 text-[16px] outline-none" />
              <button type="button" onClick={() => setShow(!show)} className="flex h-9 w-9 items-center justify-center rounded-lg text-mute hover:bg-field" aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                {show ? <EyeOff size={18} strokeWidth={1.75} /> : <Eye size={18} strokeWidth={1.75} />}
              </button>
            </div>
          </label>
          <button disabled={busy} className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-ink py-3.5 text-[16px] font-medium text-white hover:bg-ink-2 disabled:opacity-50">
            {busy && <Loader2 size={18} className="animate-spin" />} Ingresar
          </button>
          <button type="button" onClick={() => setMode('forgot')} className="mx-auto mt-4 flex min-h-[44px] items-center px-2 text-[15px] text-mute underline-offset-4 hover:text-ink hover:underline">
            ¿Olvidaste tu contraseña?
          </button>
        </form>
        )}
      </div>
      <div className="relative hidden bg-field lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/img/shops-owner.webp" alt="" className="absolute inset-0 h-full w-full object-cover" />
      </div>
    </main>
  );
}
