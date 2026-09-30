'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  LayoutDashboard, CalendarDays, Users, Clock, Scissors, Contact, TicketPercent, Star, ChartColumn, Settings, LogOut, ExternalLink, Loader2, Eye, EyeOff, House, Menu, ChevronRight, CreditCard, CirclePause, CalendarClock, MailCheck, ArrowLeft,
  Sun, ListOrdered, Wallet, Package, Megaphone, Landmark, ToggleRight, KeyRound, Radio, BellRing, X, BookOpenText,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { API_BASE_CLIENT, tenantUrl } from '@/lib/config';
import { PoleMark } from '@/components/brand';
import { Toaster } from '@/components/Toaster';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import { pushSupported, subscribePush } from '@/lib/push';
import { Sheet } from '@/components/Sheet';
import { AdminContext, useAdmin, useApi, type Sede } from './_parts/api';
import { SedeSwitcher } from './_parts/sede';
import { PanelContext, featureOn, ROLE_LABEL, type Features, type PanelMe, type Role } from './_parts/ui';
import { Resumen } from './_parts/Resumen';
import { MiDia } from './_parts/MiDia';
import { Agenda } from './_parts/Agenda';
import { Fila } from './_parts/Fila';
import { Caja } from './_parts/Caja';
import { Equipo } from './_parts/Equipo';
import { Horarios } from './_parts/Horarios';
import { Servicios } from './_parts/Servicios';
import { Productos } from './_parts/Productos';
import { Clientes } from './_parts/Clientes';
import { Promociones } from './_parts/Promociones';
import { Marketing } from './_parts/Marketing';
import { Resenas } from './_parts/Resenas';
import { Finanzas } from './_parts/Finanzas';
import { Reportes } from './_parts/Reportes';
import { Funciones } from './_parts/Funciones';
import { Accesos } from './_parts/Accesos';
import { Difusion } from './_parts/Difusion';
import { Ajustes } from './_parts/Ajustes';
import { Reclamos } from './_parts/Reclamos';
import { Facturacion, BILLING_EVENT, diasTexto, type Billing } from './_parts/Facturacion';

type GroupId = 'hoy' | 'clientes' | 'negocio' | 'config';
const GROUPS: [GroupId, string][] = [['hoy', 'Hoy'], ['clientes', 'Clientes'], ['negocio', 'Negocio'], ['config', 'Configuración']];

const SECTIONS = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard, group: 'hoy' },
  { id: 'mi-dia', label: 'Mi día', icon: Sun, group: 'hoy' },
  { id: 'agenda', label: 'Agenda', icon: CalendarDays, group: 'hoy' },
  { id: 'fila', label: 'Fila', icon: ListOrdered, group: 'hoy' },
  { id: 'caja', label: 'Caja', icon: Wallet, group: 'hoy' },
  { id: 'clientes', label: 'Clientes', icon: Contact, group: 'clientes' },
  { id: 'promociones', label: 'Promociones', icon: TicketPercent, group: 'clientes' },
  { id: 'marketing', label: 'Marketing', icon: Megaphone, group: 'clientes' },
  { id: 'resenas', label: 'Reseñas', icon: Star, group: 'clientes' },
  { id: 'servicios', label: 'Servicios', icon: Scissors, group: 'negocio' },
  { id: 'productos', label: 'Productos', icon: Package, group: 'negocio' },
  { id: 'equipo', label: 'Equipo', icon: Users, group: 'negocio' },
  { id: 'horarios', label: 'Horarios', icon: Clock, group: 'negocio' },
  { id: 'finanzas', label: 'Finanzas', icon: Landmark, group: 'negocio' },
  { id: 'reportes', label: 'Reportes', icon: ChartColumn, group: 'negocio' },
  { id: 'funciones', label: 'Funciones', icon: ToggleRight, group: 'config' },
  { id: 'accesos', label: 'Accesos', icon: KeyRound, group: 'config' },
  { id: 'difusion', label: 'Difusión', icon: Radio, group: 'config' },
  { id: 'ajustes', label: 'Ajustes', icon: Settings, group: 'config' },
  { id: 'reclamos', label: 'Reclamaciones', icon: BookOpenText, group: 'config' },
  { id: 'facturacion', label: 'Facturación', icon: CreditCard, group: 'config' },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon; group: GroupId }[];
type SectionId = (typeof SECTIONS)[number]['id'];
type SectionDef = (typeof SECTIONS)[number];

const ALL_IDS = SECTIONS.map((s) => s.id) as SectionId[];

/** Qué ve cada rol. El dueño ve todo; el encargado todo menos el plan. */
const ROLE_SECTIONS: Record<Role, readonly SectionId[]> = {
  owner: ALL_IDS,
  manager: ALL_IDS.filter((id) => id !== 'facturacion'),
  cashier: ['resumen', 'agenda', 'fila', 'caja', 'clientes'],
  staff: ['mi-dia', 'agenda', 'fila', 'caja'],
};

/** Secciones que dependen de una función activable. */
const FEATURE_GATE: Partial<Record<SectionId, (f: Features) => boolean>> = {
  fila: (f) => featureOn(f, 'queue') || featureOn(f, 'tv'),
  caja: (f) => featureOn(f, 'pos'),
  productos: (f) => featureOn(f, 'products'),
  finanzas: (f) => featureOn(f, 'expenses') || featureOn(f, 'payroll'),
  marketing: (f) => featureOn(f, 'marketing'),
};

function visibleIds(role: Role, features: Features): Set<SectionId> {
  return new Set(ROLE_SECTIONS[role].filter((id) => {
    // Funciones siempre queda a mano para volver a encender lo que se apagó
    if (id === 'funciones') return true;
    const gate = FEATURE_GATE[id];
    return gate ? gate(features) : true;
  }));
}

function landingFor(role: Role, vis: Set<SectionId>): SectionId {
  const order: SectionId[] = role === 'staff' ? ['mi-dia', 'agenda'] : role === 'cashier' ? ['caja', 'resumen', 'agenda'] : ['resumen'];
  return order.find((id) => vis.has(id)) ?? ([...vis][0] ?? 'agenda');
}

/** Pestañas de la barra inferior del teléfono según el rol (más "Más"). */
function mobileTabs(role: Role, vis: Set<SectionId>): SectionId[] {
  const want: SectionId[] = role === 'staff' ? ['mi-dia', 'agenda', 'fila'] : role === 'cashier' ? ['caja', 'fila', 'agenda'] : ['resumen', 'agenda', 'caja'];
  const out = want.filter((id) => vis.has(id));
  for (const id of ['clientes', 'agenda', 'caja', 'fila', 'mi-dia', 'resumen'] as SectionId[]) {
    if (out.length >= 3) break;
    if (vis.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** "#caja?cita=123" => "caja" */
const hashSection = () => window.location.hash.slice(1).split('?')[0] as SectionId;

export default function AdminPage() {
  const tenant = useParams().tenant as string;
  const key = `datepe_token_${tenant}`;
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [shopName, setShopName] = useState(tenant);
  // Varias sedes: la elegida se recuerda por dispositivo
  const sedeKey = `datepe_sede_${tenant}`;
  const [locations, setLocations] = useState<Sede[]>([]);
  const [location, setLocationState] = useState<string | null>(null);

  useEffect(() => {
    setToken(localStorage.getItem(key));
    setLocationState(localStorage.getItem(sedeKey));
    // Sin internet se usa lo último que se vio (nombre y sedes), para que la caja siga funcionando
    const siteKey = `datepe_site_${tenant}`;
    try {
      const c = JSON.parse(localStorage.getItem(siteKey) ?? 'null') as { name?: string; locations?: Sede[] } | null;
      if (c?.name) setShopName(c.name);
      if (c?.locations) setLocations(c.locations);
    } catch { /* sin caché */ }
    fetch(`${API_BASE_CLIENT}/api/public/site`, { headers: { 'X-Tenant-Slug': tenant } })
      .then((r) => r.json())
      .then((d) => {
        try { localStorage.setItem(siteKey, JSON.stringify({ name: d?.tenant?.name, locations: (d?.locations ?? []).map((l: Sede) => ({ id: l.id, name: l.name, district: l.district ?? null, address: l.address ?? null })) })); } catch { /* sin espacio */ }
        if (d?.tenant?.name) setShopName(d.tenant.name);
        const locs = (d?.locations ?? []) as Sede[];
        setLocations(locs);
        // Una sede borrada o una sola sede: sin filtro
        const saved = localStorage.getItem(sedeKey);
        if (locs.length < 2 || (saved && !locs.some((l) => l.id === saved))) {
          localStorage.removeItem(sedeKey);
          setLocationState(null);
        }
      })
      .catch(() => {});
  }, [key, tenant, sedeKey]);

  const setLocation = useCallback((id: string | null) => {
    if (id) localStorage.setItem(sedeKey, id);
    else localStorage.removeItem(sedeKey);
    setLocationState(id);
  }, [sedeKey]);

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

  const logout = useCallback(() => {
    localStorage.removeItem(key);
    setToken(null);
  }, [key]);

  if (token === undefined) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="animate-spin text-soft" /></div>;
  if (!token) return <Login tenant={tenant} shopName={shopName} onLogin={(t) => { localStorage.setItem(key, t); setToken(t); }} />;

  return (
    <AdminContext.Provider value={{ tenant, token, logout, location: locations.length > 1 ? location : null, locations, setLocation }}>
      <Toaster />
      <Panel shopName={shopName} />
    </AdminContext.Provider>
  );
}

interface MeResponse { me: PanelMe | null; features: Features; pushPublicKey: string | null }

/** Panel con sesión: arma el menú según el rol y las funciones activas de la barbería. */
function Panel({ shopName }: { shopName: string }) {
  const { tenant, logout, location } = useAdmin();
  const api = useApi();
  const [info, setInfo] = useState<MeResponse | null>(null);
  const [section, setSection] = useState<SectionId | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    api<MeResponse>('/admin/me')
      .then((d) => setInfo({ me: d.me ?? null, features: d.features ?? {}, pushPublicKey: d.pushPublicKey ?? null }))
      .catch((e: Error) => {
        // Si no se pudo leer el rol, seguimos como dueño con todo activo (el API igual protege cada ruta)
        if (e.message !== 'no_autenticado') setInfo({ me: null, features: {}, pushPublicKey: null });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const role: Role = info?.me?.role ?? 'owner';
  const features = useMemo(() => info?.features ?? {}, [info]);
  const vis = useMemo(() => visibleIds(role, features), [role, features]);
  const landing = landingFor(role, vis);

  // Sección inicial desde el hash, y navegación con atrás y adelante
  useEffect(() => {
    if (!info) return;
    const pick = () => {
      const h = hashSection();
      setSection(vis.has(h) ? h : landing);
    };
    pick();
    window.addEventListener('hashchange', pick);
    return () => window.removeEventListener('hashchange', pick);
  }, [info, vis, landing]);

  const go = useCallback((id: string) => {
    window.location.hash = id;
    setSection(id as SectionId);
    window.scrollTo({ top: 0 });
  }, []);

  // Guarda el panel en el dispositivo para que la caja abra aunque se caiga el internet
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
    navigator.serviceWorker.ready
      .then((reg) => {
        const urls = performance.getEntriesByType('resource').map((e) => e.name).filter((u) => u.includes('/_next/static/'));
        reg.active?.postMessage({ type: 'precache', urls });
      })
      .catch(() => {});
  }, []);

  const setFeatures = useCallback((f: Features) => setInfo((p) => (p ? { ...p, features: { ...p.features, ...f } } : p)), []);
  const panelValue = useMemo(() => ({ me: info?.me ?? null, features, pushPublicKey: info?.pushPublicKey ?? null, setFeatures }), [info, features, setFeatures]);

  if (!info || !section) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="animate-spin text-soft" /></div>;

  const current: SectionId = vis.has(section) ? section : landing;
  const visible = SECTIONS.filter((s) => vis.has(s.id));
  const tabs = mobileTabs(role, vis);
  const rest = visible.filter((s) => !tabs.includes(s.id));
  const initial = shopName.replace(/^Barber[ií]a\s+/i, '').charAt(0).toUpperCase();

  const Views: Record<Exclude<SectionId, 'resumen'>, React.ComponentType> = {
    'mi-dia': MiDia, agenda: Agenda, fila: Fila, caja: Caja, clientes: Clientes, promociones: Promociones, marketing: Marketing, resenas: Resenas,
    servicios: Servicios, productos: Productos, equipo: Equipo, horarios: Horarios, finanzas: Finanzas, reportes: Reportes,
    funciones: Funciones, accesos: Accesos, difusion: Difusion, ajustes: Ajustes, reclamos: Reclamos, facturacion: Facturacion,
  };
  const View = current === 'resumen' ? null : Views[current];
  const tabLabel = (s: SectionDef) => (s.id === 'resumen' ? 'Hoy' : s.label);
  const tabIcon = (s: SectionDef): LucideIcon => (s.id === 'resumen' ? House : s.icon);

  return (
    <PanelContext.Provider value={panelValue}>
      <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
        {/* Barra lateral */}
        <aside className="hidden border-r border-line lg:flex lg:flex-col">
          <div className="sticky top-0 flex h-screen flex-col px-4 py-5">
            <div className="flex items-center gap-2.5 px-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-[15px] font-semibold text-white">{initial}</span>
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold tracking-[-0.02em]">{shopName}</div>
                <div className="truncate text-[12px] text-soft">{tenant}.date.pe</div>
              </div>
            </div>
            {role !== 'staff' && <div className="mt-4 px-1"><SedeSwitcher /></div>}
            <nav className="no-scrollbar -mx-1 mt-6 flex-1 space-y-5 overflow-y-auto px-1 pb-4" aria-label="Secciones del panel">
              {GROUPS.map(([g, title]) => {
                const items = visible.filter((s) => s.group === g);
                if (!items.length) return null;
                return (
                  <div key={g}>
                    <p className="px-3 pb-1 text-[12px] font-medium text-soft">{title}</p>
                    <div className="space-y-0.5">
                      {items.map(({ id, label, icon: Icon }) => (
                        <a
                          key={id}
                          href={`#${id}`}
                          onClick={(e) => { e.preventDefault(); go(id); }}
                          aria-current={current === id ? 'page' : undefined}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] transition-colors ${current === id ? 'bg-field font-medium text-ink' : 'text-mute hover:bg-field hover:text-ink'}`}
                        >
                          <Icon size={18} strokeWidth={1.75} /> {label}
                        </a>
                      ))}
                    </div>
                  </div>
                );
              })}
            </nav>
            <div className="space-y-0.5 border-t border-line pt-4">
              {info.me && (
                <div className="flex items-center gap-2.5 px-3 pb-2">
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{info.me.name || info.me.email}</span>
                  <span className="shrink-0 rounded-full bg-field px-2.5 py-0.5 text-[12px] font-medium text-mute">{ROLE_LABEL[role]}</span>
                </div>
              )}
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

        {/* Móvil: barra superior con el nombre de la barbería */}
        <div className="pt-safe sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur-md lg:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <PoleMark size={22} className="shrink-0" />
              <div className="truncate text-[16px] font-semibold tracking-[-0.02em]">{shopName}</div>
            </div>
            {role !== 'staff' && <SedeSwitcher compact />}
            <a href={tenantUrl(tenant)} target="_blank" rel="noopener noreferrer" className="flex h-10 w-10 items-center justify-center rounded-full active:bg-field" aria-label="Ver mi página">
              <ExternalLink size={19} strokeWidth={1.75} />
            </a>
          </div>
        </div>

        {/* Móvil: barra inferior de pestañas, según el rol */}
        <nav aria-label="Secciones del panel" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur-md lg:hidden">
          <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
            {tabs.map((id) => {
              const s = SECTIONS.find((x) => x.id === id)!;
              const Icon = tabIcon(s);
              return (
                <li key={id}>
                  <button type="button" onClick={() => { haptic.tap(); go(id); }} aria-current={current === id ? 'page' : undefined} className={`flex w-full flex-col items-center gap-1 pb-1 pt-2.5 text-[11px] font-medium ${current === id ? 'text-ink' : 'text-soft'}`}>
                    <Icon size={23} strokeWidth={current === id ? 2.1 : 1.7} /> {tabLabel(s)}
                  </button>
                </li>
              );
            })}
            <li>
              <button type="button" onClick={() => { haptic.tap(); setMoreOpen(true); }} className={`flex w-full flex-col items-center gap-1 pb-1 pt-2.5 text-[11px] font-medium ${tabs.includes(current) ? 'text-soft' : 'text-ink'}`}>
                <Menu size={23} strokeWidth={1.7} /> Más
              </button>
            </li>
          </ul>
        </nav>

        <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Más opciones">
          <div className="-mx-2 space-y-4">
            {GROUPS.map(([g, title]) => {
              const items = rest.filter((s) => s.group === g);
              if (!items.length) return null;
              return (
                <div key={g}>
                  <p className="px-3 pb-1 text-[13px] font-medium text-soft">{title}</p>
                  <ul>
                    {items.map(({ id, label, icon: Icon }) => (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => { setMoreOpen(false); setTimeout(() => go(id), 50); }}
                          aria-current={current === id ? 'page' : undefined}
                          className="flex w-full items-center gap-4 rounded-xl px-3 py-3 text-left text-[16px] active:bg-field"
                        >
                          <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${current === id ? 'bg-ink text-white' : 'bg-field'}`}><Icon size={19} strokeWidth={1.75} /></span>
                          <span className="flex-1">{label}</span>
                          <ChevronRight size={18} strokeWidth={1.75} className="text-soft" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            <div className="border-t border-line pt-2">
              {info.me && (
                <p className="px-3 py-2 text-[14px] text-mute">
                  {info.me.name || info.me.email}, <span className="text-ink">{ROLE_LABEL[role].toLowerCase()}</span>
                </p>
              )}
              <button type="button" onClick={logout} className="flex w-full items-center gap-4 rounded-xl px-3 py-3.5 text-left text-[16px] text-red active:bg-field">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-tint"><LogOut size={19} strokeWidth={1.75} /></span>
                Cerrar sesión
              </button>
            </div>
          </div>
        </Sheet>

        <main className="min-w-0 px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-6 md:px-10 lg:py-10">
          {/* El plan solo lo ve (y lo paga) el dueño */}
          {role === 'owner' && <BillingBanner go={go} section={current} />}
          {/* Al cambiar de sede la sección se vuelve a cargar con sus datos */}
          <div key={`${current}:${location ?? 'todas'}`} className="rise-in mx-auto max-w-[1100px]">
            {View ? <View /> : <Resumen go={go} />}
          </div>
        </main>
      </div>
      {info.pushPublicKey && featureOn(features, 'push') && <PushPrompt publicKey={info.pushPublicKey} />}
    </PanelContext.Provider>
  );
}

/** Invitación discreta a recibir una notificación con cada reserva. */
function PushPrompt({ publicKey }: { publicKey: string }) {
  const { tenant } = useAdmin();
  const api = useApi();
  const dismissKey = `datepe_push_prompt_${tenant}`;
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported()) return;
    if (Notification.permission === 'granted') {
      // Ya dio permiso: renovamos la suscripción en silencio una vez por sesión
      if (sessionStorage.getItem(dismissKey)) return;
      sessionStorage.setItem(dismissKey, '1');
      subscribePush(publicKey).then((sub) => sub && api('/admin/push/subscribe', { method: 'POST', body: sub })).catch(() => {});
      return;
    }
    if (Notification.permission === 'denied' || localStorage.getItem(dismissKey)) return;
    const t = setTimeout(() => setShow(true), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey, dismissKey]);

  function dismiss() {
    localStorage.setItem(dismissKey, '1');
    setShow(false);
  }

  async function accept() {
    haptic.tap();
    setBusy(true);
    try {
      const sub = await subscribePush(publicKey);
      if (!sub) {
        toast.info('No activaste las notificaciones. Puedes hacerlo desde los ajustes del navegador.');
      } else {
        await api('/admin/push/subscribe', { method: 'POST', body: sub });
        toast.success('Listo. Te avisaremos con cada reserva.');
      }
      dismiss();
    } catch {
      toast.error('No se pudieron activar las notificaciones.');
    } finally {
      setBusy(false);
    }
  }

  if (!show) return null;
  return (
    <div role="dialog" aria-label="Notificaciones" className="rise-in fixed inset-x-3 top-[calc(64px+env(safe-area-inset-top))] z-40 rounded-xl border border-line bg-white p-4 shadow-pop md:inset-x-auto md:right-6 md:top-auto md:bottom-6 md:w-[380px]">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-field"><BellRing size={19} strokeWidth={1.75} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium">Recibe una notificación con cada reserva</p>
          <p className="mt-0.5 text-[14px] text-mute">También cuando alguien cancela o entra a la fila.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={accept} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-4 text-[14px] font-medium text-white hover:bg-ink-2 disabled:opacity-50">
              {busy && <Loader2 size={16} className="animate-spin" />} Activar
            </button>
            <button type="button" onClick={dismiss} className="min-h-11 rounded-full px-4 text-[14px] font-medium text-mute hover:bg-field">Ahora no</button>
          </div>
        </div>
        <button type="button" onClick={dismiss} className="-mr-1 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-mute hover:bg-field" aria-label="Cerrar">
          <X size={18} strokeWidth={1.75} />
        </button>
      </div>
    </div>
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
