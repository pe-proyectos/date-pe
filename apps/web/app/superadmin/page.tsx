'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_BASE_CLIENT } from '@/lib/config';
import { Toaster } from '@/components/Toaster';
import { toast } from '@/lib/toast';
import { Logo } from '@/components/Logo';

const soles = (c: number) => `S/ ${((c ?? 0) / 100).toFixed(2)}`;
const TOKEN_KEY = 'datepe_admin_token';

interface Tenant {
  id: string; slug: string; name: string; status: string; plan: string;
  barberos: string; citas: string; no_shows: string; senas_cents: string; ultima_cita: string | null;
}

export default function SuperadminPage() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => { setToken(localStorage.getItem(TOKEN_KEY)); }, []);
  if (!token) return <Login onLogin={(t) => { localStorage.setItem(TOKEN_KEY, t); setToken(t); }} />;
  return <Dashboard token={token} onLogout={() => { localStorage.removeItem(TOKEN_KEY); setToken(null); }} />;
}

function Login({ onLogin }: { onLogin: (t: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`${API_BASE_CLIENT}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const d = await res.json();
    if (res.ok && d.user?.isPlatformAdmin) onLogin(d.token);
    else setError('Acceso solo para superadmin.');
  }
  return (
    <main className="mx-auto max-w-sm px-6 py-24">
      <h1 className="text-2xl font-bold">date.pe · Superadmin</h1>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2" />
        <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="w-full rounded-xl bg-slate-900 py-2.5 font-semibold text-white">Entrar</button>
      </form>
    </main>
  );
}

function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const [overview, setOverview] = useState<any>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    const [o, t] = await Promise.all([
      fetch(`${API_BASE_CLIENT}/api/platform/overview`, { headers }).then((r) => r.json()),
      fetch(`${API_BASE_CLIENT}/api/platform/tenants`, { headers }).then((r) => r.json()),
    ]);
    setOverview(o);
    setTenants(t.tenants ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function setStatus(id: string, status: string) {
    await fetch(`${API_BASE_CLIENT}/api/platform/tenants/${id}`, { method: 'PATCH', headers, body: JSON.stringify({ status }) });
    load();
    toast.success(status === 'active' ? 'Barbería activada' : 'Barbería suspendida');
  }

  const t = overview?.totals ?? {};
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <Toaster />
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2"><Logo size={26} /><span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">Superadmin</span></div>
        <div className="flex gap-2">
          <button onClick={() => setShowCreate(true)} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">+ Barbería</button>
          <button onClick={onLogout} className="text-sm text-slate-500">Salir</button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="Barberías" value={t.tenants} sub={`${t.activos ?? 0} activas · ${t.trials ?? 0} trial`} />
        <Card label="Citas (total)" value={t.citas_total} sub={`${t.citas_7d ?? 0} en 7 días`} />
        <Card label="No-shows" value={t.no_shows} />
        <Card label="Señas cobradas" value={soles(Number(t.senas_cents ?? 0))} />
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <Chart title="Nuevas barberías (14d)" data={overview?.signups ?? []} />
        <Chart title="Citas por día (14d)" data={overview?.bookings ?? []} />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Barberías</h2>
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="p-3">Barbería</th><th className="p-3">Estado</th><th className="p-3">Barberos</th>
                <th className="p-3">Citas</th><th className="p-3">No-shows</th><th className="p-3">Señas</th><th className="p-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tn) => (
                <tr key={tn.id} className="border-t border-slate-100">
                  <td className="p-3">
                    <div className="font-medium">{tn.name}</div>
                    <div className="text-xs text-slate-400">{tn.slug}.date.pe</div>
                  </td>
                  <td className="p-3"><Badge status={tn.status} /></td>
                  <td className="p-3">{tn.barberos}</td>
                  <td className="p-3">{tn.citas}</td>
                  <td className="p-3">{tn.no_shows}</td>
                  <td className="p-3">{soles(Number(tn.senas_cents))}</td>
                  <td className="p-3">
                    {tn.status !== 'active'
                      ? <button onClick={() => setStatus(tn.id, 'active')} className="text-green-600">Activar</button>
                      : <button onClick={() => setStatus(tn.id, 'suspended')} className="text-red-600">Suspender</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showCreate && <CreateTenant headers={headers} onClose={() => setShowCreate(false)} onDone={() => { setShowCreate(false); load(); }} />}
    </main>
  );
}

function Card({ label, value, sub }: { label: string; value: unknown; sub?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-bold">{String(value ?? 0)}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function Badge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-700', trial: 'bg-amber-100 text-amber-700',
    suspended: 'bg-red-100 text-red-700', cancelled: 'bg-slate-100 text-slate-500',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? ''}`}>{status}</span>;
}

function Chart({ title, data }: { title: string; data: Array<{ dia: string; n: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="mb-3 text-sm font-semibold">{title}</div>
      <div className="flex h-28 items-end gap-1">
        {data.length === 0 && <span className="text-xs text-slate-400">Sin datos aún</span>}
        {data.map((d) => (
          <div key={d.dia} className="flex-1" title={`${d.dia}: ${d.n}`}>
            <div className="rounded-t bg-slate-800" style={{ height: `${(d.n / max) * 100}%`, minHeight: d.n ? 4 : 0 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function CreateTenant({ headers, onClose, onDone }: { headers: Record<string, string>; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ shopName: '', slug: '', name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const slugify = (v: string) => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`${API_BASE_CLIENT}/api/platform/tenants`, {
      method: 'POST', headers,
      body: JSON.stringify({ shopName: f.shopName, slug: f.slug || slugify(f.shopName), owner: { name: f.name, email: f.email, password: f.password }, status: 'active' }),
    });
    const d = await res.json();
    if (res.ok) { toast.success('Barbería creada'); onDone(); }
    else setError(d.error === 'slug_en_uso' ? 'Subdominio en uso' : 'No se pudo crear');
  }
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-6">
        <h3 className="text-lg font-bold">Dar de alta barbería</h3>
        <input required placeholder="Nombre de la barbería" value={f.shopName} onChange={(e) => setF({ ...f, shopName: e.target.value, slug: slugify(e.target.value) })} className="w-full rounded-xl border border-slate-300 px-3 py-2" />
        <div className="flex items-center rounded-xl border border-slate-300 px-3">
          <input placeholder="subdominio" value={f.slug} onChange={(e) => setF({ ...f, slug: slugify(e.target.value) })} className="flex-1 py-2 outline-none" />
          <span className="text-slate-400">.date.pe</span>
        </div>
        <input required placeholder="Nombre del dueño" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2" />
        <input required type="email" placeholder="Email del dueño" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2" />
        <input required type="password" minLength={8} placeholder="Contraseña" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-slate-500">Cancelar</button>
          <button className="rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white">Crear</button>
        </div>
      </form>
    </div>
  );
}
