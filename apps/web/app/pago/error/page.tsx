import Link from 'next/link';

export default function PagoError() {
  return (
    <main className="mx-auto max-w-md px-6 py-24 text-center">
      <h1 className="text-3xl font-bold">Pago no completado</h1>
      <p className="mt-4 text-slate-600">
        No se completó el pago de tu seña. Puedes intentar reservar nuevamente.
      </p>
      <Link href="/reservar" className="mt-8 inline-block rounded-xl bg-slate-900 px-6 py-3 font-semibold text-white">
        Reintentar
      </Link>
    </main>
  );
}
