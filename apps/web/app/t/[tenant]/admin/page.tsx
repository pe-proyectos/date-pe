'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  LayoutDashboard, CalendarDays, Users, Clock, Scissors, Contact, TicketPercent, Star, ChartColumn, Settings, LogOut, ExternalLink, Loader2, Eye, EyeOff, House, Menu, ChevronRight,
} from 'lucide-react';
import { API_BASE_CLIENT, tenantUrl } from '@/lib/config';
import { PoleMark } from '@/components/brand';
import { Toaster } from '@/components/Toaster';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import { Sheet } from '@/components/Sheet';
import { AdminContext } from './_parts/api';
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

  const Other = { agenda: Agenda, equipo: Equipo, horarios: Horarios, servicios: Servicios, clientes: Clientes, promociones: Promociones, resenas: Resenas, reportes: Reportes, ajustes: Ajustes } as const;
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
          <div key={section} className="rise-in mx-auto max-w-[1100px]">
            {View ? <View /> : <Resumen go={go} />}
          </div>
        </main>
      </div>
    </AdminContext.Provider>
  );
}

function Login({ tenant, shopName, onLogin }: { tenant: string; shopName: string; onLogin: (t: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

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
        </form>
      </div>
      <div className="relative hidden bg-field lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/img/shops-owner.webp" alt="" className="absolute inset-0 h-full w-full object-cover" />
      </div>
    </main>
  );
}
