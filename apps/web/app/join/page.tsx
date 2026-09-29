'use client';

import { useState } from 'react';
import Link from 'next/link';
import { API_BASE_CLIENT, tenantUrl } from '@/lib/config';
import { Logo } from '@/components/Logo';
import { Toaster } from '@/components/Toaster';
import { toast } from '@/lib/toast';

const BENEFITS = [
  'Tu web en tunombre.date.pe',
  'Agenda con calendario y arrastrar-soltar',
  'Cobra señas con Yape, MercadoPago y PayPal',
  'Recordatorios y reportes',
];

export default function JoinPage() {
  const [form, setForm] = useState({ shopName: '', slug: '', name: '', email: '', password: '' });
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok'>('idle');
  const [url, setUrl] = useState('');

  const slugify = (v: string) =>
    v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    try {
      const res = await fetch(`${API_BASE_CLIENT}/api/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopName: form.shopName, slug: form.slug || slugify(form.shopName), owner: { name: form.name, email: form.email, password: form.password } }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus('idle');
        toast.error(data.error === 'slug_en_uso' ? 'Ese subdominio ya está en uso.' : 'No se pudo crear.');
        return;
      }
      setUrl(data.url ?? tenantUrl(data.slug));
      setStatus('ok');
      toast.success('¡Barbería creada!');
    } catch {
      setStatus('idle');
      toast.error('Error de conexión.');
    }
  }

  if (status === 'ok') {
    return (
      <main className="relative flex min-h-screen items-center justify-center px-6">
        <div className="mesh absolute inset-0 -z-10" />
        <Toaster />
        <div className="glass max-w-md rounded-3xl p-10 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">🎉</div>
          <h1 className="text-2xl font-bold">¡Tu barbería está lista!</h1>
          <p className="mt-3 text-slate-600">Tu página de reservas:</p>
          <a href={url} className="mt-1 block break-all font-semibold text-brand underline">{url}</a>
          <a href={`${url}/admin`} className="btn-primary mt-8 inline-block rounded-xl px-6 py-3 font-semibold">Ir a mi panel</a>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen">
      <div className="mesh absolute inset-0 -z-10" />
      <Toaster />
      <div className="mx-auto grid max-w-5xl items-center gap-10 px-6 py-14 md:grid-cols-2">
        <div className="text-white">
          <Link href="/"><Logo dark /></Link>
          <h1 className="mt-10 text-4xl font-bold">Tu barbería, online y llena.</h1>
          <p className="mt-4 text-lg text-white/70">Crea tu página de reservas en minutos. Sin comisión por cita, por S/50 al mes.</p>
          <ul className="mt-8 space-y-3">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-center gap-3 text-white/85">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-emerald-400">✓</span>{b}
              </li>
            ))}
          </ul>
        </div>

        <form onSubmit={submit} className="glass rounded-3xl p-8">
          <h2 className="text-xl font-bold">Crea tu cuenta</h2>
          <div className="mt-5 space-y-4">
            <Field label="Nombre de la barbería">
              <input required value={form.shopName} onChange={(e) => setForm({ ...form, shopName: e.target.value, slug: slugify(e.target.value) })} className="fld" placeholder="Barbería Juana" />
            </Field>
            <Field label="Subdominio">
              <div className="flex items-center rounded-xl border border-slate-300 bg-white px-3">
                <input value={form.slug} onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })} className="flex-1 bg-transparent py-3 outline-none" placeholder="barberiajuana" />
                <span className="text-slate-400">.date.pe</span>
              </div>
            </Field>
            <Field label="Tu nombre"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="fld" /></Field>
            <Field label="Email"><input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="fld" /></Field>
            <Field label="Contraseña"><input required type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="fld" /></Field>
          </div>
          <button disabled={status === 'loading'} className="btn-primary mt-6 w-full rounded-xl py-3 font-semibold disabled:opacity-50">
            {status === 'loading' ? 'Creando…' : 'Crear mi barbería'}
          </button>
          <p className="mt-3 text-center text-xs text-slate-500">14 días de prueba · sin tarjeta</p>
        </form>
      </div>
      <style>{`.fld{width:100%;border:1px solid #cbd5e1;border-radius:0.75rem;padding:0.75rem;background:#fff;outline:none}.fld:focus{border-color:var(--color-brand)}`}</style>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  );
}
