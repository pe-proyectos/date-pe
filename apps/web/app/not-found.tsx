import Link from 'next/link';
import { Logo, PoleMark } from '@/components/brand';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[1180px] flex-col px-5 py-8 md:px-8">
      <Logo />
      <div className="my-auto max-w-xl py-20">
        <PoleMark size={64} live />
        <h1 className="mt-8 text-[clamp(2.5rem,6vw,4rem)] font-semibold leading-[1] tracking-[-0.04em]">Esta página no existe.</h1>
        <p className="mt-4 text-[18px] text-mute">Puede que el enlace esté mal escrito o que la barbería haya cambiado de dirección.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/" className="rounded-full bg-ink px-6 py-3.5 text-[15px] font-medium text-white">Ir al inicio</Link>
          <Link href="/search" className="rounded-full border border-line px-6 py-3.5 text-[15px] font-medium hover:border-ink">Buscar barberías</Link>
        </div>
      </div>
    </main>
  );
}
