import Link from 'next/link';
import { SearchBar } from '@/components/SearchBar';

const DISTRICTS = [
  'Miraflores',
  'San Isidro',
  'Surco',
  'San Borja',
  'La Molina',
  'Barranco',
  'Jesús María',
  'Los Olivos',
];

export default function HomePage() {
  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden bg-slate-900 text-white">
        <div className="mx-auto max-w-5xl px-6 py-20 md:py-28">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-400">
            date.pe
          </p>
          <h1 className="max-w-2xl text-4xl font-bold leading-tight md:text-6xl">
            Reserva tu barbería en segundos.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-slate-300">
            Encuentra las mejores barberías cerca de ti, elige tu barbero y horario, y
            asegura tu cita con una seña por Yape. Sin llamadas, sin esperas.
          </p>

          <div className="mt-8 max-w-3xl">
            <SearchBar />
          </div>

          <div className="mt-6 flex flex-wrap gap-2 text-sm">
            <span className="text-slate-400">Populares:</span>
            {DISTRICTS.slice(0, 5).map((d) => (
              <Link
                key={d}
                href={`/search?district=${encodeURIComponent(d)}`}
                className="rounded-full bg-white/10 px-3 py-1 hover:bg-white/20"
              >
                {d}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Value props */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-8 md:grid-cols-3">
          {[
            ['Elige tu barbero', 'Mira fotos, especialidades y reseñas. Reserva con quien quieras o con “cualquiera disponible”.'],
            ['Paga con Yape', 'Asegura tu cita con una seña por Yape o Plin. Adiós a los plantones.'],
            ['Recordatorios por WhatsApp', 'Te avisamos por WhatsApp. Confirma, cancela o reprograma con un toque.'],
          ].map(([title, body]) => (
            <div key={title} className="rounded-2xl border border-slate-200 p-6">
              <h3 className="text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-slate-600">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Districts SEO */}
      <section className="border-t border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-2xl font-bold">Barberías por distrito en Lima</h2>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {DISTRICTS.map((d) => (
              <Link
                key={d}
                href={`/search?district=${encodeURIComponent(d)}`}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium hover:border-slate-400"
              >
                Barberías en {d}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA join */}
      <section className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-6 px-6 py-16 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-bold">¿Tienes una barbería?</h2>
            <p className="mt-2 text-slate-300">
              Tu propia página de reservas en {`{tunombre}`}.date.pe por S/50 al mes.
            </p>
          </div>
          <Link
            href="/join"
            className="rounded-xl bg-white px-6 py-3 font-semibold text-slate-900 hover:bg-slate-200"
          >
            Crear mi barbería
          </Link>
        </div>
      </section>

      <footer className="mx-auto max-w-5xl px-6 py-10 text-sm text-slate-500">
        <div className="flex flex-wrap gap-6">
          <Link href="/search">Buscar</Link>
          <Link href="/blog">Blog</Link>
          <Link href="/join">Únete</Link>
        </div>
        <p className="mt-4">© {new Date().getFullYear()} date.pe</p>
      </footer>
    </main>
  );
}
