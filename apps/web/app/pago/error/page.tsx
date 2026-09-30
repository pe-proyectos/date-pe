import Link from 'next/link';
import { CircleAlert } from 'lucide-react';

export default function PagoError() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-16">
      <CircleAlert size={48} strokeWidth={1.5} className="text-red" />
      <h1 className="mt-6 text-[clamp(2rem,5vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.035em]">El pago no se completó.</h1>
      <p className="mt-3 text-[17px] text-mute">Tu hora sigue sin confirmar. Vuelve a reservar y elige otro método de pago.</p>
      <Link href="/reservar" className="mt-10 inline-block self-start rounded-lg bg-ink px-6 py-3.5 text-[15px] font-medium text-white">Volver a reservar</Link>
    </main>
  );
}
