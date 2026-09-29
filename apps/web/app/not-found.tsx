import Link from 'next/link';
import { Logo } from '@/components/Logo';

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="mesh absolute inset-0 -z-10" />
      <Logo dark size={40} />
      <h1 className="mt-10 font-display text-7xl font-bold text-white">404</h1>
      <p className="mt-2 text-lg text-white/70">No encontramos esta página.</p>
      <Link href="/" className="btn-primary mt-8 rounded-xl px-6 py-3 font-semibold">Ir al inicio</Link>
    </main>
  );
}
