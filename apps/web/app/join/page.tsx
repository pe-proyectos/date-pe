'use client';

import { useState } from 'react';
import Link from 'next/link';
import { API_BASE_CLIENT, tenantUrl } from '@/lib/config';

export default function JoinPage() {
  const [form, setForm] = useState({ shopName: '', slug: '', name: '', email: '', password: '' });
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [url, setUrl] = useState('');

  function slugify(v: string) {
    return v
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setMessage('');
    try {
      const res = await fetch(`${API_BASE_CLIENT}/api/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopName: form.shopName,
          slug: form.slug || slugify(form.shopName),
          owner: { name: form.name, email: form.email, password: form.password },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus('error');
        setMessage(data.error === 'slug_en_uso' ? 'Ese subdominio ya está en uso.' : 'No se pudo crear.');
        return;
      }
      setStatus('ok');
      setUrl(data.url ?? tenantUrl(data.slug));
    } catch {
      setStatus('error');
      setMessage('Error de conexión.');
    }
  }

  if (status === 'ok') {
    return (
      <main className="mx-auto max-w-lg px-6 py-20 text-center">
        <h1 className="text-3xl font-bold">¡Tu barbería está lista! 🎉</h1>
        <p className="mt-4 text-slate-600">Tu página de reservas:</p>
        <a href={url} className="mt-2 block break-all text-lg font-semibold text-slate-900 underline">
          {url}
        </a>
        <a href={`${url}/admin`} className="mt-8 inline-block rounded-xl bg-slate-900 px-6 py-3 font-semibold text-white">
          Ir al panel
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <Link href="/" className="text-sm text-slate-500 hover:text-slate-900">
        ← date.pe
      </Link>
      <h1 className="mt-6 text-3xl font-bold">Crea tu barbería</h1>
      <p className="mt-2 text-slate-600">Tu propia página de reservas por S/50 al mes.</p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <Field label="Nombre de la barbería">
          <input
            required
            value={form.shopName}
            onChange={(e) => setForm({ ...form, shopName: e.target.value, slug: slugify(e.target.value) })}
            className="input"
            placeholder="Barbería Juana"
          />
        </Field>
        <Field label="Subdominio">
          <div className="flex items-center rounded-xl border border-slate-300 px-3">
            <input
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })}
              className="flex-1 py-3 outline-none"
              placeholder="barberiajuana"
            />
            <span className="text-slate-400">.date.pe</span>
          </div>
        </Field>
        <Field label="Tu nombre">
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
        </Field>
        <Field label="Email">
          <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" />
        </Field>
        <Field label="Contraseña">
          <input required type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input" />
        </Field>

        {message && <p className="text-sm text-red-600">{message}</p>}

        <button
          disabled={status === 'loading'}
          className="w-full rounded-xl bg-slate-900 py-3 font-semibold text-white disabled:opacity-50"
        >
          {status === 'loading' ? 'Creando…' : 'Crear barbería'}
        </button>
      </form>

      <style>{`.input{width:100%;border:1px solid #cbd5e1;border-radius:0.75rem;padding:0.75rem;outline:none}`}</style>
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
