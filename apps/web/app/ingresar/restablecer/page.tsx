'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CircleCheck, Eye, EyeOff, Link2Off, Loader2 } from 'lucide-react';
import { API_BASE_CLIENT } from '@/lib/config';
import { Logo } from '@/components/brand';
import { Toaster } from '@/components/Toaster';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';

export default function RestablecerPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-8">
      <Toaster />
      <Logo />
      <Suspense fallback={<div className="my-auto h-64 animate-pulse rounded-xl bg-field" />}>
        <ResetForm />
      </Suspense>
    </main>
  );
}

type State = 'form' | 'done' | 'expired';

function ResetForm() {
  const token = (useSearchParams().get('token') ?? '').trim();
  const validToken = /^[0-9a-f]{48}$/i.test(token);
  const [state, setState] = useState<State>(validToken ? 'form' : 'expired');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = repeat.length > 0 && repeat !== password;
  const ready = password.length >= 8 && repeat === password;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_CLIENT}/api/auth/password/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        haptic.success();
        setState('done');
      } else if (d.error === 'enlace_vencido') {
        haptic.error();
        setState('expired');
      } else {
        toast.error('No pudimos guardar la contraseña. Revisa los datos e intenta de nuevo.');
      }
    } catch {
      toast.error('Sin conexión. Intenta de nuevo en unos segundos.');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'done') {
    return (
      <div className="my-auto py-16">
        <CircleCheck size={36} strokeWidth={1.75} className="text-ok" />
        <h1 className="mt-5 text-[clamp(2rem,6vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.035em]">Listo, ya tienes nueva contraseña</h1>
        <p className="mt-3 text-[17px] text-mute">Ingresa a tu panel con tu correo y la contraseña que acabas de crear.</p>
        <Link href="/ingresar" className="mt-8 flex h-12 w-full items-center justify-center rounded-lg bg-ink text-[16px] font-medium text-white hover:bg-ink-2">
          Ir a ingresar
        </Link>
      </div>
    );
  }

  if (state === 'expired') {
    return (
      <div className="my-auto py-16">
        <Link2Off size={32} strokeWidth={1.75} className="text-soft" />
        <h1 className="mt-5 text-[clamp(2rem,6vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.035em]">Este enlace ya no sirve</h1>
        <p className="mt-3 text-[17px] text-mute">Venció o ya se usó. Los enlaces duran 1 hora y funcionan una sola vez. Pide uno nuevo desde la pantalla de ingreso.</p>
        <Link href="/ingresar" className="mt-8 flex h-12 w-full items-center justify-center rounded-lg bg-ink text-[16px] font-medium text-white hover:bg-ink-2">
          Pedir un enlace nuevo
        </Link>
      </div>
    );
  }

  const input = 'w-full bg-transparent py-3.5 pl-4 text-[16px] outline-none';
  return (
    <form onSubmit={submit} className="my-auto py-16" noValidate>
      <h1 className="text-[clamp(2rem,6vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.035em]">Crea una nueva contraseña</h1>
      <p className="mt-3 text-[17px] text-mute">Usa al menos 8 caracteres. Evita la misma que usas en otros sitios.</p>

      <label className="mt-8 block">
        <span className="mb-1.5 block text-[14px] font-medium">Nueva contraseña</span>
        <div className={`flex items-center rounded-xl border pr-1 focus-within:border-ink ${tooShort ? 'border-red' : 'border-line-2'}`}>
          <input
            autoFocus
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={input}
            aria-invalid={tooShort}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-mute hover:bg-field hover:text-ink"
            aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {show ? <EyeOff size={18} strokeWidth={1.75} /> : <Eye size={18} strokeWidth={1.75} />}
          </button>
        </div>
        {tooShort && <span className="mt-1.5 block text-[13px] text-red">Mínimo 8 caracteres</span>}
      </label>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-[14px] font-medium">Repite la contraseña</span>
        <div className={`flex items-center rounded-xl border pr-4 focus-within:border-ink ${mismatch ? 'border-red' : 'border-line-2'}`}>
          <input
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            className={input}
            aria-invalid={mismatch}
          />
        </div>
        {mismatch && <span className="mt-1.5 block text-[13px] text-red">Las contraseñas no coinciden</span>}
      </label>

      <button disabled={!ready || busy} className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-ink text-[16px] font-medium text-white hover:bg-ink-2 disabled:opacity-40">
        {busy && <Loader2 size={18} strokeWidth={1.75} className="animate-spin" />} Guardar contraseña
      </button>
      <p className="mt-8 text-[15px] text-mute">
        ¿Te acordaste? <Link href="/ingresar" className="font-medium text-ink underline">Volver a ingresar</Link>
      </p>
    </form>
  );
}
