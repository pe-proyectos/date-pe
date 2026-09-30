'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, MailX, CircleCheck } from 'lucide-react';
import { API_BASE_CLIENT } from '@/lib/config';
import { onColor } from '@/lib/color';
import { Toaster } from '@/components/Toaster';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';

function BajaInner() {
  const tenant = useParams().tenant as string;
  const token = useSearchParams().get('t') ?? '';
  const [shop, setShop] = useState<{ name: string; accent: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<'ask' | 'done' | 'missing'>(token.length >= 16 ? 'ask' : 'missing');

  useEffect(() => {
    fetch(`${API_BASE_CLIENT}/api/public/site`, { headers: { 'X-Tenant-Slug': tenant } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.tenant && setShop({ name: d.tenant.name, accent: d.branding?.color_primary ?? '#0a0a0a' }))
      .catch(() => {});
  }, [tenant]);

  useEffect(() => {
    if (shop) document.title = `Dejar de recibir correos | ${shop.name}`;
  }, [shop]);

  async function confirm() {
    haptic.tap();
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_CLIENT}/api/public/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenant },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        haptic.success();
        setState('done');
      } else if (res.status === 404 || res.status === 400) setState('missing');
      else toast.error('No pudimos completar tu pedido. Intenta de nuevo.');
    } catch {
      toast.error('Sin conexión. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  const name = shop?.name ?? 'la barbería';
  const accent = shop?.accent ?? '#0a0a0a';

  return (
    <main className="mx-auto max-w-lg px-5 py-12 md:py-20">
      <Toaster />
      <Link href="/" className="inline-flex min-h-[44px] items-center gap-1.5 text-[15px] text-mute hover:text-ink">
        <ArrowLeft size={17} strokeWidth={1.75} /> Volver
      </Link>

      {state === 'ask' && (
        <div className="mt-8">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-field">
            <MailX size={22} strokeWidth={1.75} />
          </span>
          <h1 className="mt-6 text-[clamp(2rem,5vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.035em]">¿Dejar de recibir promociones?</h1>
          <p className="mt-3 text-[17px] text-mute">
            Ya no te enviaremos novedades ni descuentos de {name} por correo. Seguirás recibiendo los avisos de tus reservas, como la confirmación y el recordatorio.
          </p>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="mt-8 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-lg text-[16px] font-medium disabled:opacity-40"
            style={{ background: accent, color: onColor(accent) }}
          >
            {busy && <Loader2 size={18} className="animate-spin" />} Sí, no quiero más correos
          </button>
          <Link href="/" className="mt-3 flex min-h-[48px] items-center justify-center rounded-lg text-[15px] font-medium text-mute hover:bg-field hover:text-ink">
            Mejor sigo recibiéndolos
          </Link>
        </div>
      )}

      {state === 'done' && (
        <div className="rise-in mt-8">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ok-tint text-ok">
            <CircleCheck size={22} strokeWidth={1.75} />
          </span>
          <h1 className="mt-6 text-[clamp(2rem,5vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.035em]">Listo, ya no te escribiremos.</h1>
          <p className="mt-3 text-[17px] text-mute">
            Te quitamos de la lista de promociones de {name}. Si cambias de idea, avísale a la barbería en tu próxima visita. Te esperamos cuando quieras.
          </p>
          <Link href="/reservar" className="mt-8 inline-flex min-h-[48px] items-center rounded-lg bg-ink px-6 text-[15px] font-medium text-white">
            Reservar una cita
          </Link>
        </div>
      )}

      {state === 'missing' && (
        <div className="mt-8">
          <h1 className="text-[clamp(2rem,5vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.035em]">Este enlace no es válido.</h1>
          <p className="mt-3 text-[17px] text-mute">
            Abre el enlace &quot;No quiero recibir más correos&quot; desde el último correo que te llegó, o pídele a {name} que te quite de su lista.
          </p>
          <Link href="/" className="mt-8 inline-flex min-h-[48px] items-center rounded-full border border-line px-5 text-[15px] font-medium hover:border-ink">
            Ir a la página de {name}
          </Link>
        </div>
      )}
    </main>
  );
}

export default function BajaPage() {
  return (
    <Suspense fallback={null}>
      <BajaInner />
    </Suspense>
  );
}
