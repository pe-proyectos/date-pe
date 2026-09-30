'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, ExternalLink, LogOut, Loader2, Store, LayoutDashboard } from 'lucide-react';
import { API_BASE_CLIENT, tenantUrl } from '@/lib/config';
import { Logo } from '@/components/brand';
import { Toaster } from '@/components/Toaster';
import { toast } from '@/lib/toast';
import { ColumnChart, StatTile } from '@/components/charts';

const TOKEN_KEY = 'datepe_admin_token';
const soles = (c: number | string) => `S/ ${(Number(c) / 100).toFixed(2)}`;

interface Tenant {
  id: string; slug: string; name: string; status: string; plan: string; created_at: string;
  barberos: string; citas: string; no_shows: string; senas_cents: string; ultima_cita: string | null;
}
interface Overview {
  totals: Record<string, string>;
  signups: { dia: string; n: number }[];
  bookings: { dia: string; n: number }[];
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

  const load = useCallback(async () => {
    const [o, t] = await Promise.all([
      fetch(`${API_BASE_CLIENT}/api/platform/overview`, { headers }),
      fetch(`${API_BASE_CLIENT}/api/platform/tenants`, { headers }),
    ]);
    if (o.status === 401 || o.status === 403) return onLogout();
    setOverview(await o.json());
    setTenants((await t.json()).tenants ?? []);
  }, [headers, onLogout]);
  useEffect(() => { load(); }, [load]);

  async function setStatus(tn: Tenant, status: string) {
    await fetch(`${API_BASE_CLIENT}/api/platform/tenants/${tn.id}`, { method: 'PATCH', headers, body: JSON.stringify({ status }) });
    toast.success(status === 'active' ? `${tn.name} activada` : `${tn.name} suspendida`);
    load();
  }

  const t = overview?.totals ?? {};
  const filtered = (tenants ?? []).filter((x) => !q || `${x.name} ${x.slug}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="min-h-screen">
      <Toaster />
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-5 md:px-8">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="rounded-full bg-field px-2.5 py-1 text-[12px] font-medium text-mute">Administración</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[14px] font-medium text-white hover:bg-ink-2">
              <Plus size={16} strokeWidth={2} /> Nueva barbería
            </button>
            <button type="button" onClick={onLogout} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-field" aria-label="Cerrar sesión"><LogOut size={18} strokeWidth={1.75} /></button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-5 py-10 md:px-8">
        <h1 className="text-[28px] font-semibold tracking-[-0.035em]">Plataforma</h1>
        {!overview ? (
          <div className="mt-8 h-32 animate-pulse rounded-xl bg-field" />
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Barberías" value={t.tenants ?? '0'} sub={`${t.activos ?? 0} activas, ${t.trials ?? 0} en prueba`} />
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
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-[15px]">
              <thead>
                <tr className="border-b border-ink text-[13px] text-mute">
                  <th className="py-3 pr-4 font-medium">Barbería</th>
                  <th className="py-3 pr-4 font-medium">Estado</th>
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
                    </td>
                    <td className="py-3.5 pr-4"><TenantStatus status={tn.status} /></td>
                    <td className="tnum py-3.5 pr-4 text-right">{tn.barberos}</td>
                    <td className="tnum py-3.5 pr-4 text-right">{tn.citas}</td>
                    <td className="tnum py-3.5 pr-4 text-right">{tn.no_shows}</td>
                    <td className="tnum py-3.5 pr-4 text-right">{soles(tn.senas_cents)}</td>
                    <td className="py-3.5 pr-4 text-mute">{tn.ultima_cita ? new Date(tn.ultima_cita).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }) : 'Sin citas'}</td>
                    <td className="py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <a href={tenantUrl(tn.slug)} target="_blank" rel="noopener noreferrer" className="flex h-9 w-9 items-center justify-center rounded-full text-mute hover:bg-field hover:text-ink" aria-label={`Abrir sitio de ${tn.name}`}><ExternalLink size={16} strokeWidth={1.75} /></a>
                        <a href={tenantUrl(tn.slug, '/admin')} target="_blank" rel="noopener noreferrer" className="flex h-9 w-9 items-center justify-center rounded-full text-mute hover:bg-field hover:text-ink" aria-label={`Abrir panel de ${tn.name}`}><LayoutDashboard size={16} strokeWidth={1.75} /></a>
                        {tn.status === 'active' ? (
                          <button type="button" onClick={() => setStatus(tn, 'suspended')} className="rounded-full px-3 py-1.5 text-[13px] font-medium text-red hover:bg-red-tint">Suspender</button>
                        ) : (
                          <button type="button" onClick={() => setStatus(tn, 'active')} className="rounded-full px-3 py-1.5 text-[13px] font-medium hover:bg-field">Activar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

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
  const cls = 'w-full rounded-xl border border-line-2 px-3.5 py-2.5 text-[15px] outline-none focus:border-ink';
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal aria-label="Nueva barbería">
      <div className="absolute inset-0 bg-ink/20" onClick={onClose} />
      <form onSubmit={submit} className="drawer-in absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-pop">
        <div className="flex h-16 items-center border-b border-line px-6 text-[17px] font-semibold">Nueva barbería</div>
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <input required placeholder="Nombre de la barbería" value={f.shopName} onChange={(e) => setF({ ...f, shopName: e.target.value, slug: slugify(e.target.value) })} className={cls} />
          <div className="flex items-center rounded-xl border border-line-2 pr-3 focus-within:border-ink">
            <input placeholder="subdominio" value={f.slug} onChange={(e) => setF({ ...f, slug: slugify(e.target.value) })} className="w-full bg-transparent px-3.5 py-2.5 text-[15px] outline-none" />
            <span className="text-mute">.date.pe</span>
          </div>
          <input required placeholder="Nombre del dueño" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={cls} />
          <input required type="email" placeholder="Correo del dueño" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={cls} />
          <input required type="password" minLength={8} placeholder="Contraseña inicial" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className={cls} />
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2.5 text-[14px] font-medium hover:bg-field">Cancelar</button>
          <button disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[14px] font-medium text-white disabled:opacity-50">
            {busy && <Loader2 size={16} className="animate-spin" />} Crear barbería
          </button>
        </div>
      </form>
    </div>
  );
}
