'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { API_BASE_CLIENT } from '@/lib/config';

function PagoOkInner() {
  const sp = useSearchParams();
  const [ok, setOk] = useState<boolean | null>(null);
  const [msg, setMsg] = useState('Confirmando tu pago…');

  useEffect(() => {
    const token = sp.get('token');
    if (token) {
      fetch(`${API_BASE_CLIENT}/api/payments/paypal/capture`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: token }),
      })
        .then((r) => r.json())
        .then((d) => { setOk(d.ok); setMsg(d.ok ? '¡Pago confirmado! Tu cita está reservada.' : 'No pudimos confirmar el pago.'); })
        .catch(() => { setOk(false); setMsg('No pudimos confirmar el pago.'); });
    } else {
      setOk(true);
      setMsg('¡Gracias! Tu pago se está procesando y tu cita quedará confirmada.');
    }
  }, [sp]);

  return (
    <main className="relative flex min-h-screen items-center justify-center px-6">
      <div className="mesh absolute inset-0 -z-10" />
      <div className="glass max-w-md rounded-3xl p-10 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">
          {ok === false ? '⚠️' : '✅'}
        </div>
        <h1 className="text-2xl font-bold">{ok === false ? 'Pago no confirmado' : 'Pago recibido'}</h1>
        <p className="mt-3 text-slate-600">{msg}</p>
        <Link href="/" className="btn-primary mt-8 inline-block rounded-xl px-6 py-3 font-semibold">Volver al inicio</Link>
      </div>
    </main>
  );
}

export default function PagoOk() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center text-slate-500">Cargando…</main>}>
      <PagoOkInner />
    </Suspense>
  );
}
