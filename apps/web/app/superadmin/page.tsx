'use client';

import { Solicitudes } from './Solicitudes';
import { Estado } from './Estado';
import { Reclamos } from './Reclamos';
import { Sheet } from '@/components/Sheet';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, ExternalLink, LogOut, Loader2, Store, LayoutDashboard, Settings2, Globe, Receipt, Activity, BookOpen } from 'lucide-react';
import { API_BASE_CLIENT, tenantUrl } from '@/lib/config';
import { Logo } from '@/components/brand';
import { Toaster } from '@/components/Toaster';
import { toast } from '@/lib/toast';
import { ColumnChart, StatTile } from '@/components/charts';
import { haptic } from '@/lib/haptics';

const TOKEN_KEY = 'datepe_admin_token';
const soles = (c: number | string) => `S/ ${(Number(c) / 100).toFixed(2)}`;

interface Tenant {
  id: string; slug: string; name: string; status: string; plan: string; created_at: string;
  barberos: string; citas: string; no_shows: string; senas_cents: string; ultima_cita: string | null;
  is_demo: boolean; trial_ends_at: string | null; paid_until: string | null;
  custom_domain: string | null; domain_status: 'pending' | 'active' | 'error' | null; monthly_price_cents: number;
}
interface Invoice {
  id: string; amount_cents: number; months: number; status: string; provider: string | null;
  paid_at: string | null; tenant_name: string; slug: string;
}

const BASE_PRICE_CENTS = 5000;
const SERVER_IP = '75.119.145.29';

/** Fecha corta en Lima; agrega el año si no es el actual. */
function fecha(iso: string) {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric', timeZone: 'America/Lima' }).replace('.', '');
}

type Tone = 'ok' | 'warn' | 'bad' | 'mute';
const TONES: Record<Tone, string> = {
  ok: 'bg-ok-tint text-ok',
  warn: 'bg-[#fff4e0] text-[#8a5300]',
  bad: 'bg-red-tint text-red-deep',
  mute: 'bg-field text-mute',
};

/** Estado de la suscripción de la barbería a date.pe. */
function planOf(tn: Tenant): { label: string; tone: Tone } {
  if (tn.is_demo) return { label: 'Demo', tone: 'mute' };
  if (tn.status === 'suspended') return { label: 'En pausa', tone: 'bad' };
  const now = Date.now();
  const paid = tn.paid_until && new Date(tn.paid_until).getTime() > now;
  const trial = tn.trial_ends_at && new Date(tn.trial_ends_at).getTime() > now;
  if (paid) return { label: `Pagado hasta ${fecha(tn.paid_until!)}`, tone: 'ok' };
  if (trial) return { label: `Prueba hasta ${fecha(tn.trial_ends_at!)}`, tone: 'warn' };
  if (tn.paid_until || tn.trial_ends_at) return { label: 'En pausa', tone: 'bad' };
  return { label: 'Sin fecha de cobro', tone: 'mute' };
}

function priceNote(tn: Tenant): string | null {
  const c = Number(tn.monthly_price_cents ?? BASE_PRICE_CENTS);
  if (c === BASE_PRICE_CENTS) return null;
  return c === 0 ? 'Gratis' : `${soles(c)} al mes`;
}

const DOMAIN_STATUS: Record<string, [string, Tone]> = {
  active: ['Activo', 'ok'],
  pending: ['Esperando DNS', 'warn'],
  error: ['Error', 'bad'],
};

function Pill({ label, tone }: { label: string; tone: Tone }) {
  return <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium ${TONES[tone]}`}>{label}</span>;
}

function PlanCell({ tn }: { tn: Tenant }) {
  const plan = planOf(tn);
  const price = priceNote(tn);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Pill {...plan} />
      {price && <span className="tnum text-[13px] text-mute">{price}</span>}
    </div>
  );
}

function DomainLine({ tn }: { tn: Tenant }) {
  if (!tn.custom_domain) return null;
  const [l, tone] = DOMAIN_STATUS[tn.domain_status ?? 'pending'] ?? DOMAIN_STATUS.pending;
  return (
    <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] text-mute">
      <Globe size={13} strokeWidth={1.75} className="shrink-0" />
      <span className="truncate">{tn.custom_domain}</span>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${TONES[tone]}`}>{l}</span>
    </div>
  );
}

const PROVIDERS: Record<string, string> = { manual: 'Manual', mercadopago: 'MercadoPago', paypal: 'PayPal', culqi: 'Culqi' };
interface Overview {
  totals: Record<string, string>;
  signups: { dia: string; n: number }[];
  bookings: { dia: string; n: number }[];
}

type Tab = 'resumen' | 'estado' | 'reclamos';
const TABS: Array<{ id: Tab; label: string; icon: typeof Activity }> = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { id: 'estado', label: 'Estado', icon: Activity },
  { id: 'reclamos', label: 'Reclamos', icon: BookOpen },
];
const tabFromHash = (): Tab => {
  const h = window.location.hash.replace('#', '');
  return h === 'estado' || h === 'reclamos' ? h : 'resumen';
};

/** Pestaña activa guardada en el hash de la URL (#estado, #reclamos). */
function useHashTab(): [Tab, (t: Tab) => void] {
  const [tab, setTab] = useState<Tab>('resumen');
  useEffect(() => {
    const sync = () => setTab(tabFromHash());
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  const go = useCallback((t: Tab) => {
    haptic.select();
    history.replaceState(history.state, '', t === 'resumen' ? window.location.pathname + window.location.search : `#${t}`);
    setTab(t);
    window.scrollTo({ top: 0 });
  }, []);
  return [tab, go];
}

export default function SuperadminPage() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => setToken(localStorage.getItem(TOKEN_KEY)), []);
  if (token === undefined) return null;
  if (!token) return <Login onLogin={(t) => { localStorage.setItem(TOKEN_KEY, t); setToken(t); }} />;
  return <Dashboard token={token} onLogout={() => { localStorage.removeItem(TOKEN_KEY); setToken(null); }} />;
}

function fillDays(rows: { dia: string; n: number }[], days = 14) {
  const map = new Map(rows.map((r) => [r.dia, r.n]));
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' });
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - (days - 1 - i) * 864e5);
    const iso = fmt.format(d);
    const [, m, dd] = iso.split('-');
    return {
      label: `${Number(dd)}/${Number(m)}`,
      value: map.get(iso) ?? 0,
      detail: d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Lima' }),
    };
  });
}

function Login({ onLogin }: { onLogin: (t: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_CLIENT}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const d = await res.json();
      if (res.ok && d.user?.isPlatformAdmin) onLogin(d.token);
      else toast.error('Acceso solo para el equipo de date.pe.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col px-5 py-8">
      <Toaster />
      <Logo />
      <form onSubmit={submit} className="my-auto py-16">
        <h1 className="text-[32px] font-semibold tracking-[-0.035em]">Administración</h1>
        <p className="mt-2 text-[16px] text-mute">Solo para el equipo de date.pe.</p>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Correo" className="mt-8 w-full rounded-xl border border-line-2 px-4 py-3.5 text-[16px] outline-none focus:border-ink" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Contraseña" className="mt-3 w-full rounded-xl border border-line-2 px-4 py-3.5 text-[16px] outline-none focus:border-ink" />
        <button disabled={busy} className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-ink py-3.5 text-[16px] font-medium text-white disabled:opacity-50">
          {busy && <Loader2 size={18} className="animate-spin" />} Ingresar
        </button>
      </form>
    </main>
  );
}

function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const headers = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [managingId, setManagingId] = useState<string | null>(null);
  const [tab, setTab] = useHashTab();

  const load = useCallback(async () => {
    const [o, t, i] = await Promise.all([
      fetch(`${API_BASE_CLIENT}/api/platform/overview`, { headers }),
      fetch(`${API_BASE_CLIENT}/api/platform/tenants`, { headers }),
      fetch(`${API_BASE_CLIENT}/api/platform/invoices`, { headers }).catch(() => null),
    ]);
    if (o.status === 401 || o.status === 403) return onLogout();
    setOverview(await o.json());
    setTenants((await t.json()).tenants ?? []);
    setInvoices(i && i.ok ? ((await i.json()).invoices ?? []) : []);
  }, [headers, onLogout]);
  useEffect(() => { load(); }, [load]);

  const managing = (tenants ?? []).find((x) => x.id === managingId) ?? null;
  const openManage = (tn: Tenant) => {
    haptic.tap();
    setManagingId(tn.id);
  };

  const t = overview?.totals ?? {};
  const filtered = (tenants ?? []).filter((x) => !q || `${x.name} ${x.slug}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="min-h-screen">
      <Toaster />
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-5 md:px-8">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="hidden rounded-full bg-field px-2.5 py-1 text-[12px] font-medium text-mute sm:inline">Administración</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setCreating(true)} aria-label="Nueva barbería" className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-3 text-[14px] font-medium text-white hover:bg-ink-2 sm:px-4">
              <Plus size={18} strokeWidth={2} /> <span className="hidden sm:inline">Nueva barbería</span>
            </button>
            <button type="button" onClick={onLogout} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-field" aria-label="Cerrar sesión"><LogOut size={18} strokeWidth={1.75} /></button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-5 py-10 md:px-8">
        <h1 className="text-[28px] font-semibold tracking-[-0.035em]">Plataforma</h1>
        <nav className="no-scrollbar -mx-5 mt-5 flex gap-1 overflow-x-auto border-b border-line px-5 md:mx-0 md:px-0" aria-label="Secciones">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={`-mb-px inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-[15px] font-medium transition-colors ${tab === id ? 'border-ink text-ink' : 'border-transparent text-mute hover:text-ink'}`}
            >
              <Icon size={17} strokeWidth={1.75} /> {label}
            </button>
          ))}
        </nav>

        {tab === 'estado' && <Estado headers={headers} />}
        {tab === 'reclamos' && <Reclamos headers={headers} />}

        {tab === 'resumen' && (
        <>
        {!overview ? (
          <div className="mt-8 h-32 animate-pulse rounded-xl bg-field" />
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
              <StatTile label="MRR" value={soles(t.mrr_cents ?? 0)} sub="Barberías con pago vigente" />
              <StatTile label="Cobrado este mes" value={soles(t.cobrado_mes_cents ?? 0)} sub="Suscripciones pagadas" />
              <div className="col-span-2 lg:col-span-1">
                <StatTile label="Suspendidas" value={t.suspendidas ?? '0'} sub="No reciben reservas" />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Barberías" value={t.tenants ?? '0'} sub={`${t.activos ?? 0} ${Number(t.activos) === 1 ? 'activa' : 'activas'}, ${t.trials ?? 0} en prueba`} />
              <StatTile label="Citas" value={t.citas_total ?? '0'} sub={`${t.citas_7d ?? 0} en los últimos 7 días`} />
              <StatTile label="Clientes" value={t.clientes ?? '0'} sub={`${t.no_shows ?? 0} ausencias registradas`} />
              <StatTile label="Adelantos cobrados" value={soles(t.senas_cents ?? 0)} />
            </div>
            <div className="mt-10 grid gap-10 border-b border-line pb-12 xl:grid-cols-2">
              <ColumnChart title="Barberías nuevas por día" data={fillDays(overview.signups)} format={(v) => String(Math.round(v))} height={200} integer />
              <ColumnChart title="Citas creadas por día" data={fillDays(overview.bookings)} format={(v) => String(Math.round(v))} height={200} integer />
            </div>
          </>
        )}

        <Solicitudes headers={headers} onApproved={load} />

        <div className="mt-12 flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-[22px] font-semibold tracking-[-0.03em]">Barberías</h2>
          <div className="flex w-full max-w-sm items-center gap-2 rounded-full border border-line-2 px-4 focus-within:border-ink">
            <Search size={17} strokeWidth={1.75} className="text-mute" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o subdominio" className="w-full bg-transparent py-2.5 text-[15px] outline-none" />
          </div>
        </div>

        {!tenants ? (
          <div className="mt-6 h-40 animate-pulse rounded-xl bg-field" />
        ) : filtered.length === 0 ? (
          <div className="mt-6 flex items-center gap-3 rounded-xl border border-dashed border-line-2 p-8 text-mute"><Store size={20} strokeWidth={1.5} /> No hay barberías que coincidan.</div>
        ) : (
          <>
          <ul className="mt-6 space-y-3 md:hidden">
            {filtered.map((tn) => (
              <li key={tn.id} className="rounded-xl border border-line p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{tn.name}</div>
                    <div className="truncate text-[13px] text-mute">{tn.slug}.date.pe</div>
                    <DomainLine tn={tn} />
                  </div>
                  <TenantStatus status={tn.status} />
                </div>
                <div className="mt-3"><PlanCell tn={tn} /></div>
                <dl className="tnum mt-3 grid grid-cols-4 gap-2 text-[13px]">
                  <div><dt className="text-mute">Barberos</dt><dd className="font-medium">{tn.barberos}</dd></div>
                  <div><dt className="text-mute">Citas</dt><dd className="font-medium">{tn.citas}</dd></div>
                  <div><dt className="text-mute">Ausencias</dt><dd className="font-medium">{tn.no_shows}</dd></div>
                  <div><dt className="text-mute">Adelantos</dt><dd className="font-medium">{soles(tn.senas_cents)}</dd></div>
                </dl>
                <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                  <a href={tenantUrl(tn.slug)} target="_blank" rel="noopener noreferrer" className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-field text-[14px] font-medium"><ExternalLink size={16} strokeWidth={1.75} /> Sitio</a>
                  <a href={tenantUrl(tn.slug, '/admin')} target="_blank" rel="noopener noreferrer" className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-field text-[14px] font-medium"><LayoutDashboard size={16} strokeWidth={1.75} /> Panel</a>
                  <button type="button" onClick={() => openManage(tn)} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-ink text-[14px] font-medium text-white active:bg-ink-2"><Settings2 size={16} strokeWidth={1.75} /> Gestionar</button>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-6 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1040px] text-left text-[15px]">
              <thead>
                <tr className="border-b border-ink text-[13px] text-mute">
                  <th className="py-3 pr-4 font-medium">Barbería</th>
                  <th className="py-3 pr-4 font-medium">Estado</th>
                  <th className="py-3 pr-4 font-medium">Plan</th>
                  <th className="py-3 pr-4 text-right font-medium">Barberos</th>
                  <th className="py-3 pr-4 text-right font-medium">Citas</th>
                  <th className="py-3 pr-4 text-right font-medium">Ausencias</th>
                  <th className="py-3 pr-4 text-right font-medium">Adelantos</th>
                  <th className="py-3 pr-4 font-medium">Última cita</th>
                  <th className="py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((tn) => (
                  <tr key={tn.id} className="border-b border-line">
                    <td className="py-3.5 pr-4">
                      <div className="font-medium">{tn.name}</div>
                      <div className="text-[13px] text-mute">{tn.slug}.date.pe</div>
                      <DomainLine tn={tn} />
                    </td>
                    <td className="py-3.5 pr-4"><TenantStatus status={tn.status} /></td>
                    <td className="py-3.5 pr-4"><PlanCell tn={tn} /></td>
                    <td className="tnum py-3.5 pr-4 text-right">{tn.barberos}</td>
                    <td className="tnum py-3.5 pr-4 text-right">{tn.citas}</td>
                    <td className="tnum py-3.5 pr-4 text-right">{tn.no_shows}</td>
                    <td className="tnum py-3.5 pr-4 text-right">{soles(tn.senas_cents)}</td>
                    <td className="py-3.5 pr-4 text-mute">{tn.ultima_cita ? new Date(tn.ultima_cita).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', timeZone: 'America/Lima' }) : 'Sin citas'}</td>
                    <td className="py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <a href={tenantUrl(tn.slug)} target="_blank" rel="noopener noreferrer" className="flex h-9 w-9 items-center justify-center rounded-full text-mute hover:bg-field hover:text-ink" aria-label={`Abrir sitio de ${tn.name}`}><ExternalLink size={16} strokeWidth={1.75} /></a>
                        <a href={tenantUrl(tn.slug, '/admin')} target="_blank" rel="noopener noreferrer" className="flex h-9 w-9 items-center justify-center rounded-full text-mute hover:bg-field hover:text-ink" aria-label={`Abrir panel de ${tn.name}`}><LayoutDashboard size={16} strokeWidth={1.75} /></a>
                        <button type="button" onClick={() => openManage(tn)} className="ml-1 inline-flex h-9 items-center gap-1.5 rounded-full border border-line-2 px-3 text-[13px] font-medium hover:border-ink"><Settings2 size={15} strokeWidth={1.75} /> Gestionar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}

        <h2 className="mt-14 text-[22px] font-semibold tracking-[-0.03em]">Cobros recientes</h2>
        {!invoices ? (
          <div className="mt-6 h-24 animate-pulse rounded-xl bg-field" />
        ) : invoices.length === 0 ? (
          <div className="mt-6 flex items-center gap-3 rounded-xl border border-dashed border-line-2 p-8 text-mute"><Receipt size={20} strokeWidth={1.5} /> Todavía no hay cobros de suscripción.</div>
        ) : (
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-4 py-3.5">
                <div className="min-w-0">
                  <div className="truncate font-medium">{inv.tenant_name}</div>
                  <div className="truncate text-[13px] text-mute">
                    {inv.months === 1 ? '1 mes' : `${inv.months} meses`}, {PROVIDERS[inv.provider ?? ''] ?? inv.provider ?? 'Sin medio'}
                    {inv.paid_at ? `, ${fecha(inv.paid_at)}` : ''}
                  </div>
                </div>
                <span className="tnum shrink-0 font-medium">{soles(inv.amount_cents)}</span>
              </li>
            ))}
          </ul>
        )}
        </>
        )}
      </main>

      <ManageTenant tenant={managing} headers={headers} onClose={() => setManagingId(null)} onChanged={load} />
      {creating && <CreateTenant headers={headers} onClose={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} />}
    </div>
  );
}

function TenantStatus({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    active: ['Activa', 'bg-ok-tint text-ok'],
    trial: ['En prueba', 'bg-[#fff4e0] text-[#8a5300]'],
    suspended: ['Suspendida', 'bg-red-tint text-red-deep'],
    cancelled: ['Cancelada', 'bg-field text-mute'],
  };
  const [l, c] = map[status] ?? [status, 'bg-field text-mute'];
  return <span className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${c}`}>{l}</span>;
}

function CreateTenant({ headers, onClose, onDone }: { headers: Record<string, string>; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ shopName: '', slug: '', name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const slugify = (v: string) => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_CLIENT}/api/platform/tenants`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ shopName: f.shopName, slug: f.slug || slugify(f.shopName), owner: { name: f.name, email: f.email, password: f.password }, status: 'active' }),
      });
      const d = await res.json();
      if (res.ok) {
        toast.success(`${f.shopName} creada`);
        onDone();
      } else toast.error(d.error === 'slug_en_uso' ? 'Subdominio en uso' : 'Revisa los datos');
    } finally {
      setBusy(false);
    }
  }
  const cls = 'w-full rounded-xl border border-line-2 px-3.5 py-3 text-[16px] outline-none focus:border-ink';
  return (
    <Sheet
      open
      onClose={onClose}
      title="Nueva barbería"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-full px-4 py-3 text-[15px] font-medium hover:bg-field">Cancelar</button>
          <button form="new-tenant" disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[15px] font-medium text-white disabled:opacity-50">
            {busy && <Loader2 size={16} className="animate-spin" />} Crear barbería
          </button>
        </>
      }
    >
      <form id="new-tenant" onSubmit={submit} className="space-y-4">
        <input required placeholder="Nombre de la barbería" value={f.shopName} onChange={(e) => setF({ ...f, shopName: e.target.value, slug: slugify(e.target.value) })} className={cls} />
        <div className="flex items-center rounded-xl border border-line-2 pr-3 focus-within:border-ink">
          <input placeholder="subdominio" autoCapitalize="none" autoCorrect="off" value={f.slug} onChange={(e) => setF({ ...f, slug: slugify(e.target.value) })} className="w-full bg-transparent px-3.5 py-3 text-[16px] outline-none" />
          <span className="text-mute">.date.pe</span>
        </div>
        <input required placeholder="Nombre del dueño" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={cls} />
        <input required type="email" inputMode="email" autoCapitalize="none" placeholder="Correo del dueño" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={cls} />
        <input required type="password" minLength={8} autoComplete="new-password" placeholder="Contraseña inicial" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className={cls} />
      </form>
    </Sheet>
  );
}

/** Botón de dos pasos: el primer toque pide confirmar y el segundo ejecuta. */
function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  danger = false,
  disabled = false,
  busy = false,
  className = '',
}: {
  label: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  danger?: boolean;
  disabled?: boolean;
  busy?: boolean;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  const base = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-medium transition-colors disabled:opacity-40';
  const look = armed
    ? danger ? 'bg-red text-white hover:bg-red-deep' : 'bg-ink text-white hover:bg-ink-2'
    : danger ? 'text-red hover:bg-red-tint' : 'border border-line-2 hover:border-ink';
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          haptic.select();
          setArmed(true);
        }
      }}
      className={`${base} ${look} ${className}`}
    >
      {busy && <Loader2 size={16} strokeWidth={1.75} className="animate-spin" />}
      {armed ? confirmLabel : label}
    </button>
  );
}

function Chips<T extends number>({ options, value, onChange, format }: { options: T[]; value: T; onChange: (v: T) => void; format: (v: T) => string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => {
            haptic.select();
            onChange(o);
          }}
          aria-pressed={value === o}
          className={`min-h-11 rounded-full px-4 text-[15px] font-medium transition-colors ${value === o ? 'bg-ink text-white' : 'bg-field text-ink hover:bg-line'}`}
        >
          {format(o)}
        </button>
      ))}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line py-6 first:pt-0 last:border-b-0 last:pb-0">
      <h3 className="text-[17px] font-semibold tracking-[-0.02em]">{title}</h3>
      {hint && <p className="mt-1 text-[14px] text-mute">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const DOMAIN_ERRORS: Record<string, string> = {
  dominio_invalido: 'Ese dominio no es válido',
  dominio_reservado: 'No se puede usar un dominio de date.pe',
  dominio_en_uso: 'Ese dominio ya lo usa otra barbería',
};

/** Hoja para gestionar la suscripción, el precio, el dominio y el estado de una barbería. */
function ManageTenant({ tenant, headers, onClose, onChanged }: { tenant: Tenant | null; headers: Record<string, string>; onClose: () => void; onChanged: () => Promise<void> | void }) {
  const [trialDays, setTrialDays] = useState<7 | 14 | 30>(14);
  const [months, setMonths] = useState<1 | 3 | 6 | 12>(1);
  const [note, setNote] = useState('');
  const [price, setPrice] = useState('');
  const [domain, setDomain] = useState('');
  const [dns, setDns] = useState<{ ok: boolean; found: string[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const id = tenant?.id;
  useEffect(() => {
    if (!tenant) return;
    setTrialDays(14);
    setMonths(1);
    setNote('');
    setPrice((Number(tenant.monthly_price_cents ?? BASE_PRICE_CENTS) / 100).toString());
    setDomain(tenant.custom_domain ?? '');
    setDns(null);
    // Solo al abrir otra barbería; los cambios propios no deben pisar lo que se escribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!tenant) return null;
  const tn = tenant;

  async function call(key: string, path: string, method: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    setBusy(key);
    try {
      const res = await fetch(`${API_BASE_CLIENT}/api/platform/tenants/${tn.id}${path}`, { method, headers, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok) await onChanged();
      return { ok: res.ok, data };
    } catch {
      return { ok: false, data: {} };
    } finally {
      setBusy(null);
    }
  }

  async function extendTrial() {
    const r = await call('trial', '/extend-trial', 'POST', { days: trialDays });
    if (r.ok) toast.success(`Prueba extendida ${trialDays} días`);
    else toast.error('No se pudo extender la prueba');
  }

  const monthly = Number(tn.monthly_price_cents ?? BASE_PRICE_CENTS);
  async function markPaid() {
    const r = await call('paid', '/mark-paid', 'POST', { months, ...(note.trim() ? { note: note.trim().slice(0, 80) } : {}) });
    if (r.ok) {
      toast.success(`Pago registrado: ${soles(monthly * months)}`);
      setNote('');
    } else toast.error('No se pudo registrar el pago');
  }

  const priceCents = Math.round(Number(price.replace(',', '.')) * 100);
  const priceValid = price.trim() !== '' && Number.isFinite(priceCents) && priceCents >= 0 && priceCents <= 100000;
  async function savePrice() {
    if (!priceValid) return;
    const r = await call('price', '/price', 'PATCH', { monthlyPriceCents: priceCents });
    if (r.ok) toast.success(`Precio acordado: ${soles(priceCents)} al mes`);
    else toast.error('No se pudo guardar el precio');
  }

  async function saveDomain(value: string | null) {
    const r = await call(value ? 'domain' : 'domain-off', '/domain', 'PUT', { domain: value });
    if (r.ok) {
      const d = r.data as { domain?: string | null; status?: string | null; dns?: { ok: boolean; found: string[] } };
      setDns(d.dns ?? null);
      if (!value) {
        setDomain('');
        toast.success('Dominio quitado');
      } else if (d.status === 'active') toast.success('Dominio activo');
      else if (d.status === 'error') toast.error('Se guardó, pero no se pudo configurar la ruta');
      else toast.info('Dominio guardado. Falta que el DNS apunte al servidor.');
    } else {
      toast.error(DOMAIN_ERRORS[String(r.data.error)] ?? 'No se pudo guardar el dominio');
    }
  }

  async function setStatus(status: 'active' | 'suspended') {
    const r = await call('status', '', 'PATCH', { status });
    if (r.ok) toast.success(status === 'active' ? `${tn.name} activada` : `${tn.name} suspendida`);
    else toast.error('No se pudo cambiar el estado');
  }

  const plan = planOf(tn);
  const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const domainChanged = cleanDomain !== (tn.custom_domain ?? '');
  const field = 'w-full rounded-xl border border-line-2 px-3.5 py-3 text-[16px] outline-none focus:border-ink';

  return (
    <Sheet open onClose={onClose} title={tn.name}>
      <div className="-mt-1 mb-6 flex flex-wrap items-center gap-2">
        <TenantStatus status={tn.status} />
        <Pill {...plan} />
        {priceNote(tn) && <span className="tnum text-[13px] text-mute">{priceNote(tn)}</span>}
      </div>

      {tn.is_demo && (
        <p className="mb-6 rounded-xl bg-field px-4 py-3 text-[14px] text-mute">Es la barbería de demostración: no paga suscripción. Evita cambiarle el plan.</p>
      )}

      <Section title="Extender prueba" hint={tn.trial_ends_at ? `La prueba ${new Date(tn.trial_ends_at).getTime() > Date.now() ? 'vence' : 'venció'} el ${fecha(tn.trial_ends_at)}.` : 'Nunca tuvo prueba.'}>
        <Chips options={[7, 14, 30] as (7 | 14 | 30)[]} value={trialDays} onChange={setTrialDays} format={(d) => `${d} días`} />
        <button type="button" onClick={extendTrial} disabled={!!busy} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-medium text-white hover:bg-ink-2 disabled:opacity-40">
          {busy === 'trial' && <Loader2 size={16} strokeWidth={1.75} className="animate-spin" />} Extender {trialDays} días
        </button>
      </Section>

      <Section title="Registrar pago manual" hint={`Para transferencias o Yape directo. ${tn.paid_until ? `Pagado hasta el ${fecha(tn.paid_until)}.` : 'Aún no tiene pagos.'}`}>
        <Chips options={[1, 3, 6, 12] as (1 | 3 | 6 | 12)[]} value={months} onChange={setMonths} format={(m) => (m === 1 ? '1 mes' : `${m} meses`)} />
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} placeholder="Nota (ej. Yape del 28/9, op. 123456)" className={`${field} mt-3`} />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <ConfirmButton
            label={<>Registrar {soles(monthly * months)}</>}
            confirmLabel={`Confirmar pago de ${soles(monthly * months)}`}
            onConfirm={markPaid}
            busy={busy === 'paid'}
            disabled={!!busy && busy !== 'paid'}
          />
        </div>
      </Section>

      <Section title="Precio mensual acordado" hint="Lo que paga esta barbería cada mes. Usa 0 si no paga.">
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center rounded-xl border border-line-2 pl-3.5 focus-within:border-ink">
            <span className="text-[16px] text-mute">S/</span>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9.,]/g, ''))}
              inputMode="decimal"
              aria-label="Precio mensual en soles"
              className="tnum w-full bg-transparent px-2 py-3 text-[16px] outline-none"
            />
          </div>
          <button
            type="button"
            onClick={savePrice}
            disabled={!priceValid || priceCents === monthly || !!busy}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-medium text-white hover:bg-ink-2 disabled:opacity-40"
          >
            {busy === 'price' && <Loader2 size={16} strokeWidth={1.75} className="animate-spin" />} Guardar
          </button>
        </div>
        {!priceValid && price.trim() !== '' && <p className="mt-1.5 text-[13px] text-red">Entre S/ 0 y S/ 1000</p>}
      </Section>

      <Section title="Dominio propio" hint="La barbería se verá en su propio dominio, además de su dirección en date.pe.">
        <div className="flex items-center gap-2">
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="barberiajuana.com"
            autoCapitalize="none"
            autoCorrect="off"
            inputMode="url"
            className={field}
          />
          <button
            type="button"
            onClick={() => saveDomain(cleanDomain)}
            disabled={!cleanDomain || !domainChanged || !!busy}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-medium text-white hover:bg-ink-2 disabled:opacity-40"
          >
            {busy === 'domain' && <Loader2 size={16} strokeWidth={1.75} className="animate-spin" />} Guardar
          </button>
        </div>
        {tn.custom_domain && (
          <div className="mt-3 flex items-center justify-between gap-3">
            <DomainLine tn={tn} />
            <ConfirmButton label="Quitar dominio" confirmLabel="Confirmar quitar" danger onConfirm={() => saveDomain(null)} busy={busy === 'domain-off'} disabled={!!busy && busy !== 'domain-off'} />
          </div>
        )}
        {dns && !dns.ok && (
          <p className="mt-3 text-[14px] text-mute">
            El DNS todavía no apunta al servidor.{dns.found.length ? ` Hoy apunta a ${dns.found.join(', ')}.` : ' No encontramos registros A.'}
          </p>
        )}
        <div className="mt-4 rounded-xl border border-line p-4 text-[14px]">
          <p className="font-medium">Cómo conectarlo</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-mute">
            <li>En el proveedor del dominio, crea un registro <span className="font-medium text-ink">A</span> para el dominio (host @).</li>
            <li>Apúntalo a la IP <span className="tnum select-all font-medium text-ink">{SERVER_IP}</span>. No uses CNAME.</li>
            <li>El certificado HTTPS se emite solo cuando el DNS apunte. Puede tardar unas horas.</li>
          </ol>
        </div>
      </Section>

      <Section title="Estado" hint={tn.status === 'suspended' ? 'Suspendida: el sitio no acepta reservas; el panel sigue funcionando para pagar.' : 'Si la suspendes, su sitio deja de aceptar reservas.'}>
        {tn.status === 'suspended' ? (
          <button type="button" onClick={() => setStatus('active')} disabled={!!busy} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-medium text-white hover:bg-ink-2 disabled:opacity-40">
            {busy === 'status' && <Loader2 size={16} strokeWidth={1.75} className="animate-spin" />} Activar barbería
          </button>
        ) : (
          <ConfirmButton label="Suspender barbería" confirmLabel="Confirmar suspender" danger onConfirm={() => setStatus('suspended')} busy={busy === 'status'} disabled={!!busy && busy !== 'status'} className="-ml-5" />
        )}
      </Section>
    </Sheet>
  );
}
