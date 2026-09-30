'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { tenantUrl } from '@/lib/config';
import { Logo } from '@/components/brand';

export default function IngresarPage() {
  const [slug, setSlug] = useState('');
  const clean = slug.toLowerCase().replace(/\.date\.pe.*$/, '').replace(/^https?:\/\//, '').replace(/[^a-z0-9-]/g, '');

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-8">
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
        <p className="mt-8 text-[15px] text-mute">
          ¿Aún no tienes cuenta? <Link href="/join" className="font-medium text-ink underline">Registra tu barbería</Link>
        </p>
      </form>
    </main>
  );
}
