import Link from 'next/link';

export default function PagoError() {
  return (
    <main className="relative flex min-h-screen items-center justify-center px-6">
      <div className="mesh absolute inset-0 -z-10" />
      <div className="glass max-w-md rounded-3xl p-10 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-3xl">⚠️</div>
        <h1 className="text-2xl font-bold">Pago no completado</h1>
        <p className="mt-3 text-slate-600">No se completó el pago de tu seña. Puedes intentar reservar nuevamente.</p>
        <Link href="/" className="btn-primary mt-8 inline-block rounded-xl px-6 py-3 font-semibold">Volver</Link>
      </div>
    </main>
  );
}
