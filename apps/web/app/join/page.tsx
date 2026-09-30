'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, X, Loader2, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { API_BASE_CLIENT, tenantUrl } from '@/lib/config';
import { Logo } from '@/components/brand';
import { Toaster } from '@/components/Toaster';
import { toast } from '@/lib/toast';

const slugify = (v: string) =>
  v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export default function JoinPage() {
  const [f, setF] = useState({ shopName: '', slug: '', name: '', email: '', password: '' });
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState<'idle' | 'checking' | 'ok' | 'taken'>('idle');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  const slug = slugTouched ? f.slug : slugify(f.shopName);

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
    }, 300);
    return () => clearTimeout(t);
  }, [slug]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (slugState === 'taken') return toast.error('Ese subdominio ya está en uso. Prueba otro.');
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_CLIENT}/api/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopName: f.shopName.trim(), slug, owner: { name: f.name.trim(), email: f.email.trim(), password: f.password } }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error === 'slug_en_uso' ? 'Ese subdominio ya está en uso.' : 'No pudimos crear la cuenta. Revisa los datos.');
        return;
      }
      setCreated(d.slug);
    } catch {
      toast.error('Sin conexión. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    const url = tenantUrl(created);
    return (
      <main className="mx-auto max-w-xl px-5 py-16 md:py-24">
        <Logo />
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" className="draw-check mt-12 text-ok" aria-hidden>
          <circle cx="12" cy="12" r="11" fill="currentColor" />
          <path d="M7 12.5l3.2 3.2L17 9" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h1 className="mt-6 text-[clamp(2rem,5vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.035em]">Tu barbería ya tiene página.</h1>
        <p className="mt-3 text-[17px] text-mute">
          Vive en <span className="font-medium text-ink">{url.replace(/^https?:\/\//, '')}</span>. Entra a tu panel para dejarla lista:
        </p>
        <ol className="mt-6 space-y-3 text-[16px]">
          {['Agrega a tus barberos y sus horarios', 'Carga tus servicios con precio y duración', 'Sube tu logo y una foto del local'].map((s, i) => (
            <li key={s} className="flex items-center gap-3">
              <span className="tnum flex h-7 w-7 items-center justify-center rounded-full bg-field text-[13px] font-medium">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <a href={`${url}/admin`} className="flex items-center justify-center gap-2 rounded-lg bg-ink px-6 py-3.5 text-[15px] font-medium text-white">
            Ir a mi panel <ArrowRight size={17} strokeWidth={1.75} />
          </a>
          <a href={url} className="flex items-center justify-center rounded-lg border border-line px-6 py-3.5 text-[15px] font-medium hover:border-ink">
            Ver mi página
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <Toaster />
      <div className="mx-auto grid max-w-[1180px] gap-14 px-5 py-8 md:px-8 lg:grid-cols-12 lg:gap-10 lg:py-12">
        <div className="lg:col-span-5">
          <Logo />
          <h1 className="mt-14 text-[clamp(2.25rem,4.5vw,3.5rem)] font-semibold leading-[1.02] tracking-[-0.04em]">
            Tu barbería recibiendo reservas desde hoy.
          </h1>
          <p className="mt-5 text-[18px] leading-relaxed text-mute">
            Creas tu cuenta, cargas tus servicios y compartes tu enlace por WhatsApp e Instagram. Tus clientes reservan solos.
          </p>
          <ul className="mt-8 space-y-3 text-[16px]">
            {['Página propia en tunombre.date.pe', 'Agenda por barbero con arrastrar y soltar', 'Adelantos con Yape, Plin, tarjeta o PayPal', 'Sin comisión por cita'].map((b) => (
              <li key={b} className="flex items-start gap-3">
                <Check size={19} strokeWidth={2} className="mt-0.5 shrink-0" /> {b}
              </li>
            ))}
          </ul>
          <div className="mt-10 border-t border-line pt-6">
            <span className="tnum text-[32px] font-semibold tracking-[-0.04em]">S/ 50</span>
            <span className="text-[16px] text-mute"> al mes. Empiezas en modo prueba, sin tarjeta.</span>
          </div>
          <div className="mt-8 hidden overflow-hidden rounded-xl lg:block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/img/tenant-cover.webp" alt="" className="aspect-[16/9] w-full object-cover" />
          </div>
        </div>

        <form onSubmit={submit} className="lg:col-span-6 lg:col-start-7 lg:pt-20">
          <div className="rounded-xl border border-line p-6 md:p-8">
            <h2 className="text-[22px] font-semibold tracking-[-0.03em]">Crea tu cuenta</h2>

            <fieldset className="mt-6 space-y-4">
              <legend className="mb-1 text-[13px] font-medium text-mute">Tu barbería</legend>
              <Field label="Nombre de la barbería">
                <input required value={f.shopName} onChange={(e) => setF({ ...f, shopName: e.target.value })} className="fld" placeholder="Barbería Juana" autoComplete="organization" />
              </Field>
              <Field label="Tu dirección en date.pe">
                <div className="flex items-center rounded-xl border border-line-2 bg-white pr-3 focus-within:border-ink">
                  <input
                    value={slug}
                    onChange={(e) => { setSlugTouched(true); setF({ ...f, slug: slugify(e.target.value) }); }}
                    className="w-full bg-transparent py-3.5 pl-4 text-[16px] outline-none"
                    placeholder="barberiajuana"
                    aria-describedby="slug-state"
                  />
                  <span className="text-[16px] text-mute">.date.pe</span>
                </div>
                <span id="slug-state" className="mt-1.5 flex h-5 items-center gap-1.5 text-[13px]">
                  {slugState === 'checking' && <><Loader2 size={13} className="animate-spin text-soft" /> <span className="text-soft">Revisando</span></>}
                  {slugState === 'ok' && <><Check size={14} strokeWidth={2.5} className="text-ok" /> <span className="text-ok">Disponible</span></>}
                  {slugState === 'taken' && <><X size={14} strokeWidth={2.5} className="text-red" /> <span className="text-red">Ya está en uso</span></>}
                </span>
              </Field>
            </fieldset>

            <fieldset className="mt-6 space-y-4 border-t border-line pt-6">
              <legend className="mb-1 text-[13px] font-medium text-mute">Tus datos</legend>
              <Field label="Tu nombre">
                <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="fld" autoComplete="name" />
              </Field>
              <Field label="Correo">
                <input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="fld" autoComplete="email" />
              </Field>
              <Field label="Contraseña" hint="Mínimo 8 caracteres.">
                <div className="flex items-center rounded-xl border border-line-2 bg-white pr-2 focus-within:border-ink">
                  <input required minLength={8} type={showPass ? 'text' : 'password'} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="w-full bg-transparent py-3.5 pl-4 text-[16px] outline-none" autoComplete="new-password" />
                  <button type="button" onClick={() => setShowPass(!showPass)} className="flex h-9 w-9 items-center justify-center rounded-lg text-mute hover:bg-field" aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                    {showPass ? <EyeOff size={18} strokeWidth={1.75} /> : <Eye size={18} strokeWidth={1.75} />}
                  </button>
                </div>
              </Field>
            </fieldset>

            <button disabled={busy || slugState === 'taken' || slug.length < 2} className="mt-8 flex w-full items-center justify-center gap-2 rounded-lg bg-ink py-4 text-[16px] font-medium text-white transition-colors hover:bg-ink-2 disabled:opacity-40">
              {busy && <Loader2 size={18} className="animate-spin" />} Crear mi barbería
            </button>
            <p className="mt-4 text-center text-[14px] text-mute">
              ¿Ya tienes cuenta? <Link href="/ingresar" className="font-medium text-ink underline">Ingresa a tu panel</Link>
            </p>
          </div>
        </form>
      </div>
      <style>{`.fld{width:100%;border:1px solid var(--color-line-2);border-radius:12px;padding:0.85rem 1rem;font-size:16px;background:#fff;outline:none;transition:border-color .2s}.fld:focus{border-color:var(--color-ink)}`}</style>
    </main>
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
