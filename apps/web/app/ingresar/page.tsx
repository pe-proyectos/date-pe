'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Loader2, MailCheck } from 'lucide-react';
import { API_BASE_CLIENT, tenantUrl } from '@/lib/config';
import { Logo } from '@/components/brand';
import { Sheet } from '@/components/Sheet';
import { Toaster } from '@/components/Toaster';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';

export default function IngresarPage() {
  const [slug, setSlug] = useState('');
  const [forgot, setForgot] = useState(false);
  const clean = slug.toLowerCase().replace(/\.date\.pe.*$/, '').replace(/^https?:\/\//, '').replace(/[^a-z0-9-]/g, '');

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-8">
      <Toaster />
      <Logo />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (clean.length >= 2) window.location.href = tenantUrl(clean, '/admin');
        }}
        className="my-auto py-16"
      >
        <h1 className="text-[clamp(2rem,6vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.035em]">Ingresa a tu panel</h1>
        <p className="mt-3 text-[17px] text-mute">Escribe la dirección de tu barbería en date.pe.</p>
        <label className="mt-8 block">
          <span className="mb-1.5 block text-[14px] font-medium">Dirección de tu barbería</span>
          <div className="flex items-center rounded-xl border border-line-2 pr-4 focus-within:border-ink">
            <input
              autoFocus
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full bg-transparent py-3.5 pl-4 text-[16px] outline-none"
              placeholder="barberiajuana"
              autoCapitalize="none"
              autoCorrect="off"
            />
            <span className="text-[16px] text-mute">.date.pe</span>
          </div>
        </label>
        <button disabled={clean.length < 2} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-ink py-3.5 text-[16px] font-medium text-white disabled:opacity-40">
          Continuar <ArrowRight size={17} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={() => {
            haptic.tap();
            setForgot(true);
          }}
          className="-mx-2 mt-3 flex min-h-11 items-center rounded-full px-2 text-[15px] font-medium text-ink underline-offset-4 hover:underline"
        >
          ¿Olvidaste tu contraseña?
        </button>
        <p className="mt-6 text-[15px] text-mute">
          ¿Tu barbería aún no trabaja con date.pe? <Link href="/join" className="font-medium text-ink underline">Solicita acceso</Link>
        </p>
      </form>
      <ForgotSheet open={forgot} onClose={() => setForgot(false)} />
    </main>
  );
}

/** Pide el enlace para crear una nueva contraseña. La respuesta es la misma exista o no el correo. */
function ForgotSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  function close() {
    onClose();
    setTimeout(() => setSent(false), 300);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_CLIENT}/api/auth/password/forgot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.status >= 500) throw new Error('server');
      haptic.success();
      setSent(true);
    } catch {
      toast.error('No pudimos enviar el enlace. Intenta de nuevo en unos segundos.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Recupera tu contraseña"
      footer={
        sent ? (
          <button type="button" onClick={close} className="h-12 rounded-full bg-ink px-6 text-[15px] font-medium text-white hover:bg-ink-2">
            Entendido
          </button>
        ) : (
          <>
            <button type="button" onClick={close} className="h-12 rounded-full px-4 text-[15px] font-medium hover:bg-field">
              Cancelar
            </button>
            <button form="forgot-form" disabled={busy || !email.includes('@')} className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-medium text-white hover:bg-ink-2 disabled:opacity-40">
              {busy && <Loader2 size={16} strokeWidth={1.75} className="animate-spin" />} Enviar enlace
            </button>
          </>
        )
      }
    >
      {sent ? (
        <div className="py-2">
          <MailCheck size={28} strokeWidth={1.75} className="text-ink" />
          <p className="mt-4 text-[17px] font-medium tracking-[-0.02em]">Si el correo está registrado, te enviamos un enlace</p>
          <p className="mt-2 text-[15px] text-mute">Revisa tu bandeja de entrada y la carpeta de spam. El enlace vence en 1 hora.</p>
        </div>
      ) : (
        <form id="forgot-form" onSubmit={submit}>
          <p className="text-[15px] text-mute">Escribe el correo con el que ingresas a tu panel y te enviaremos un enlace para crear una nueva contraseña.</p>
          <label className="mt-5 block">
            <span className="mb-1.5 block text-[14px] font-medium">Correo</span>
            <input
              required
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              className="w-full rounded-xl border border-line-2 px-4 py-3.5 text-[16px] outline-none focus:border-ink"
            />
          </label>
        </form>
      )}
    </Sheet>
  );
}
