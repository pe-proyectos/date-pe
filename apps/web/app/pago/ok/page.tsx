'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, CircleAlert } from 'lucide-react';
import { API_BASE_CLIENT } from '@/lib/config';

function PagoOkInner() {
  const sp = useSearchParams();
  const [state, setState] = useState<'loading' | 'ok' | 'fail'>('loading');

  useEffect(() => {
    const token = sp.get('token'); // PayPal devuelve el id de la orden
    if (!token) {
      setState('ok'); // MercadoPago confirma por webhook
      return;
    }
    fetch(`${API_BASE_CLIENT}/api/payments/paypal/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: token }),
    })
      .then((r) => r.json())
      .then((d) => setState(d.ok ? 'ok' : 'fail'))
      .catch(() => setState('fail'));
  }, [sp]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-16">
      {state === 'loading' && (
        <>
          <Loader2 size={36} strokeWidth={1.5} className="animate-spin text-soft" />
          <h1 className="mt-6 text-[clamp(2rem,5vw,2.75rem)] font-semibold tracking-[-0.035em]">Confirmando tu pago</h1>
        </>
      )}
      {state === 'ok' && (
        <>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" className="draw-check text-ok" aria-hidden>
            <circle cx="12" cy="12" r="11" fill="currentColor" />
            <path d="M7 12.5l3.2 3.2L17 9" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h1 className="mt-6 text-[clamp(2rem,5vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.035em]">Recibimos tu adelanto.</h1>
          <p className="mt-3 text-[17px] text-mute">Tu cita queda confirmada en unos segundos. Si dejaste tu correo, ahí te llega el detalle.</p>
        </>
      )}
      {state === 'fail' && (
        <>
          <CircleAlert size={48} strokeWidth={1.5} className="text-red" />
          <h1 className="mt-6 text-[clamp(2rem,5vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.035em]">No pudimos confirmar el pago.</h1>
          <p className="mt-3 text-[17px] text-mute">No se hizo ningún cargo adicional. Vuelve a la barbería e intenta con otro método.</p>
        </>
      )}
      <Link href="/" className="mt-10 inline-block self-start rounded-lg bg-ink px-6 py-3.5 text-[15px] font-medium text-white">Volver</Link>
    </main>
  );
}

export default function PagoOk() {
  return (
    <Suspense fallback={null}>
      <PagoOkInner />
    </Suspense>
  );
}
