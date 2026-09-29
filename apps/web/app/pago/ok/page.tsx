'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { API_BASE_CLIENT } from '@/lib/config';

function PagoOkInner() {
  const sp = useSearchParams();
  const [msg, setMsg] = useState('Confirmando tu pago…');

  useEffect(() => {
    const token = sp.get('token'); // PayPal orderId
    if (token) {
      fetch(`${API_BASE_CLIENT}/api/payments/paypal/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: token }),
      })
        .then((r) => r.json())
        .then((d) => setMsg(d.ok ? '¡Pago confirmado! Tu cita está reservada.' : 'No pudimos confirmar el pago.'))
        .catch(() => setMsg('No pudimos confirmar el pago.'));
    } else {
      setMsg('¡Gracias! Tu pago se está procesando y tu cita quedará confirmada.');
    }
  }, [sp]);

  return (
    <main className="mx-auto max-w-md px-6 py-24 text-center">
      <h1 className="text-3xl font-bold">Pago recibido</h1>
      <p className="mt-4 text-slate-600">{msg}</p>
      <Link href="/" className="mt-8 inline-block rounded-xl bg-slate-900 px-6 py-3 font-semibold text-white">
        Volver
      </Link>
    </main>
  );
}

export default function PagoOk() {
  return (
    <Suspense fallback={<main className="px-6 py-24 text-center text-slate-500">Cargando…</main>}>
      <PagoOkInner />
    </Suspense>
  );
}
