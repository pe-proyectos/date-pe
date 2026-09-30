import Link from 'next/link';
import { ArrowUpRight, ArrowRight, Check, Minus, Plus, X } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { SearchBar } from '@/components/SearchBar';
import { BookingDemo } from '@/components/BookingDemo';
import { DISTRICTS, DISTRICT_PHOTOS } from '@/lib/districts';

const FEATURED = ['miraflores', 'barranco', 'san-isidro', 'surco'];

const SERVICES = [
  { name: 'Corte', note: 'Tijera y máquina', img: '/img/svc-corte.webp' },
  { name: 'Fade', note: 'Degradado a piel', img: '/img/svc-fade.webp' },
  { name: 'Barba', note: 'Perfilado y arreglo', img: '/img/svc-barba.webp' },
  { name: 'Afeitado con navaja', note: 'Toalla caliente y navaja', img: '/img/svc-navaja.webp' },
];

const BEFORE = [
  'Escribes por WhatsApp o Instagram',
  'Esperas a que alguien conteste',
  'Te ofrecen una hora que no te queda',
  'Nadie te recuerda la cita',
];
const AFTER = [
  'Ves los horarios libres al momento',
  'Eliges barbero, día y hora',
  'Pagas el adelanto con Yape o Plin',
  'Te llega la confirmación por correo',
];

const COMPARE: { label: string; us: boolean; booksy: boolean; fresha: boolean }[] = [
  { label: 'Adelanto con Yape o Plin', us: true, booksy: false, fresha: false },
  { label: 'Precio fijo en soles', us: true, booksy: false, fresha: false },
  { label: 'Sin comisión por clientes nuevos', us: true, booksy: false, fresha: false },
  { label: 'Web con tu nombre en tunombre.date.pe', us: true, booksy: false, fresha: false },
  { label: 'Tus clientes reservan sin instalar una app', us: true, booksy: true, fresha: true },
];

const FAQ = [
  ['¿Tengo que instalar una app?', 'No. Reservas desde el navegador de tu celular, en la página de cada barbería.'],
  [
    '¿Cómo pago el adelanto?',
    'Con Yape o Plin a través de MercadoPago, con tarjeta o con PayPal. El adelanto se descuenta del precio y el resto lo pagas en la barbería.',
  ],
  [
    '¿Y si no puedo ir?',
    'Cada barbería define cuánto cobra de adelanto y hasta cuándo puedes cancelar. Lo ves antes de pagar y puedes escribirle a la barbería por su WhatsApp.',
  ],
  [
    'Tengo una barbería, ¿cuánto me cuesta?',
    'S/ 50 al mes, sin comisión por cita. Empiezas en modo prueba y no te pedimos tarjeta para crear tu cuenta.',
  ],
  ['¿Puedo usar mi propio dominio?', 'Por ahora tu página vive en tunombre.date.pe, con tu logo, tus colores y tus fotos.'],
];

export default function HomePage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', name: 'date.pe', url: 'https://date.pe', logo: 'https://date.pe/icon.svg' },
      {
        '@type': 'WebSite',
        name: 'date.pe',
        url: 'https://date.pe',
        potentialAction: {
          '@type': 'SearchAction',
          target: 'https://date.pe/search?district={search_term_string}',
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'FAQPage',
        mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Header />

      <main>
        {/* ============ Primera vista ============ */}
        <section className="mx-auto grid max-w-[1280px] items-center gap-12 px-5 pb-20 pt-10 md:px-8 lg:grid-cols-12 lg:gap-8 lg:pb-28 lg:pt-16">
          <div className="relative z-10 lg:col-span-7">
            <h1 className="text-[clamp(2.75rem,5.6vw,5.25rem)] font-semibold leading-[0.98] tracking-[-0.04em]">
              Reserva tu corte
              <span className="block text-soft">sin llamar a nadie.</span>
            </h1>
            <p className="mt-6 max-w-[34rem] text-[18px] leading-relaxed text-mute md:text-[19px]">
              Elige la barbería, el barbero y la hora que te queda. Pagas un adelanto con Yape y la cita queda confirmada.
            </p>
            <div className="mt-9 lg:max-w-[640px]">
              <SearchBar />
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2 text-[14px]">
              <span className="mr-1 text-soft">Populares</span>
              {['Miraflores', 'Surco', 'San Isidro', 'Barranco', 'San Borja'].map((d) => (
                <Link
                  key={d}
                  href={`/search?district=${encodeURIComponent(d)}`}
                  className="rounded-full border border-line px-3.5 py-1.5 text-ink transition-colors hover:border-ink"
                >
                  {d}
                </Link>
              ))}
            </div>
          </div>

          <div className="relative lg:col-span-5">
            <div className="relative overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/img/hero-barberia.webp"
                alt="Barbero terminando un fade en una barbería con luz natural"
                width={1200}
                height={1500}
                fetchPriority="high"
                className="aspect-[4/5] w-full object-cover"
              />
            </div>
            <div className="relative -mt-28 flex justify-center sm:justify-start sm:pl-6 lg:absolute lg:-left-14 lg:bottom-8 lg:mt-0 lg:pl-0">
              <BookingDemo />
            </div>
          </div>
        </section>

        {/* ============ Distritos ============ */}
        <section className="mx-auto max-w-[1280px] px-5 py-20 md:px-8 lg:py-24">
          <div className="flex items-end justify-between gap-6" data-reveal>
            <h2 className="text-[clamp(2rem,3.6vw,3rem)] font-semibold leading-[1.05]">Barberías por distrito</h2>
            <Link href="/search" className="group hidden items-center gap-1 text-[15px] font-medium sm:flex">
              Ver todas <ArrowUpRight size={17} strokeWidth={1.75} className="nudge" />
            </Link>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-x-5 gap-y-8 lg:grid-cols-4">
            {FEATURED.map((slug, i) => {
              const d = DISTRICTS.find((x) => x.slug === slug)!;
              return (
                <Link
                  key={slug}
                  href={`/barberias/${d.province}/${d.slug}`}
                  className="group block"
                  data-reveal
                >
                  <div className="zoom-media aspect-[4/5] rounded-xl bg-field">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={DISTRICT_PHOTOS[slug]} alt={d.name} loading="lazy" className="h-full w-full rounded-xl object-cover" />
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[17px] font-medium tracking-[-0.02em]">{d.name}</span>
                    <ArrowUpRight size={18} strokeWidth={1.75} className="nudge text-mute" />
                  </div>
                </Link>
              );
            })}
          </div>
          <div className="mt-10 flex flex-wrap gap-2" data-reveal>
            {DISTRICTS.filter((d) => !FEATURED.includes(d.slug)).map((d) => (
              <Link
                key={d.slug}
                href={`/barberias/${d.province}/${d.slug}`}
                className="rounded-full bg-field px-4 py-2 text-[14px] transition-colors hover:bg-line"
              >
                {d.name}
              </Link>
            ))}
          </div>
        </section>

        {/* ============ Servicios ============ */}
        <section className="mx-auto max-w-[1280px] px-5 py-20 md:px-8 lg:py-24">
          <h2 className="max-w-2xl text-[clamp(2rem,3.6vw,3rem)] font-semibold leading-[1.05]" data-reveal>
            ¿Qué te vas a hacer?
          </h2>
          <div className="mt-10 grid grid-cols-2 gap-x-5 gap-y-8 lg:grid-cols-4">
            {SERVICES.map((s, i) => (
              <Link
                key={s.name}
                href={`/search?service=${encodeURIComponent(s.name)}`}
                className="group block"
                data-reveal
              >
                <div className="zoom-media aspect-[4/5] rounded-xl bg-field">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.img} alt={s.name} loading="lazy" className="h-full w-full rounded-xl object-cover" />
                </div>
                <div className="mt-3 text-[17px] font-medium tracking-[-0.02em]">{s.name}</div>
                <div className="text-[15px] text-mute">{s.note}</div>
              </Link>
            ))}
          </div>
        </section>

        {/* ============ Antes y ahora ============ */}
        <section className="bg-field">
          <div className="mx-auto max-w-[1280px] px-5 py-20 md:px-8 lg:py-28">
            <h2 className="max-w-3xl text-[clamp(2rem,3.6vw,3rem)] font-semibold leading-[1.05]" data-reveal>
              Deja de escribir por WhatsApp para pedir hora.
            </h2>
            <div className="mt-12 grid gap-10 md:grid-cols-2 md:gap-0">
              <div className="md:border-r md:border-line-2 md:pr-12" data-reveal>
                <div className="text-[15px] font-medium text-mute">Cómo reservas hoy</div>
                <ul className="mt-5 space-y-4">
                  {BEFORE.map((b) => (
                    <li key={b} className="flex items-start gap-3 text-[18px] text-mute">
                      <X size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-soft" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="md:pl-12" data-reveal>
                <div className="text-[15px] font-medium text-ink">Con date.pe</div>
                <ul className="mt-5 space-y-4">
                  {AFTER.map((a) => (
                    <li key={a} className="flex items-start gap-3 text-[18px] text-ink">
                      <Check size={20} strokeWidth={2} className="mt-0.5 shrink-0 text-red" />
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ============ Para barberías ============ */}
        <section id="barberias" className="mx-auto max-w-[1280px] scroll-mt-20 px-5 py-20 md:px-8 lg:py-28">
          <div className="grid items-center gap-14 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-5" data-reveal>
              <h2 className="text-[clamp(2rem,3.6vw,3rem)] font-semibold leading-[1.05]">
                Tu barbería con web propia y agenda.
              </h2>
              <p className="mt-5 text-[18px] leading-relaxed text-mute">
                Tu página vive en tunombre.date.pe con tu logo y tus fotos. Tu equipo trabaja con una agenda compartida y
                cobras el adelanto antes de que el cliente llegue.
              </p>
              <ul className="mt-7 space-y-3 text-[16px]">
                {[
                  'Agenda por barbero, con arrastrar y soltar',
                  'Horarios, servicios y precios que cambias en segundos',
                  'Adelantos con Yape, Plin, tarjeta o PayPal',
                  'Reportes de ingresos, ocupación y ausencias',
                ].map((x) => (
                  <li key={x} className="flex items-start gap-3">
                    <Check size={19} strokeWidth={2} className="mt-0.5 shrink-0" />
                    {x}
                  </li>
                ))}
              </ul>

              <div id="precio" className="mt-10 scroll-mt-24 border-t border-line pt-8">
                <div className="flex items-baseline gap-2">
                  <span className="tnum text-5xl font-semibold tracking-[-0.04em]">S/ 50</span>
                  <span className="text-[17px] text-mute">al mes</span>
                </div>
                <p className="mt-2 text-[15px] text-mute">Sin comisión por cita. Barberos y reservas ilimitados.</p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Link href="/join" className="rounded-full bg-ink px-6 py-3.5 text-[15px] font-medium text-white transition-colors hover:bg-ink-2">
                    Registra tu barbería
                  </Link>
                  <a
                    href="https://barberiajuana.date.pe"
                    className="group inline-flex items-center gap-1.5 rounded-full px-4 py-3.5 text-[15px] font-medium hover:bg-field"
                  >
                    Ver una barbería de ejemplo <ArrowRight size={16} strokeWidth={1.75} className="nudge-x" />
                  </a>
                </div>
              </div>
            </div>

            <div className="relative lg:col-span-7" data-reveal>
              <div className="overflow-hidden rounded-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/img/shops-owner.webp"
                  alt="Dueña de una barbería revisando las citas del día en una tablet"
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
              </div>
              <AgendaCard />
            </div>
          </div>
        </section>

        {/* ============ Comparación ============ */}
        <section className="mx-auto max-w-[1280px] px-5 pb-20 md:px-8 lg:pb-28">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-4" data-reveal>
              <h2 className="text-[clamp(1.75rem,3vw,2.5rem)] font-semibold leading-[1.08]">Pensado para cómo se paga en el Perú.</h2>
              <p className="mt-4 text-[16px] leading-relaxed text-mute">
                Las apps globales cobran en dólares, trabajan con tarjeta y se quedan un porcentaje de cada cliente nuevo.
              </p>
            </div>
            <div className="min-w-0 lg:col-span-8" data-reveal>
              <div className="-mx-5 overflow-x-auto px-5 md:mx-0 md:px-0">
                <table className="w-full min-w-[520px] text-left text-[15px]">
                  <thead>
                    <tr className="border-b border-ink">
                      <th className="py-3 pr-4 font-medium" />
                      <th className="w-24 py-3 text-center font-semibold">date.pe</th>
                      <th className="w-24 py-3 text-center font-medium text-mute">Booksy</th>
                      <th className="w-24 py-3 text-center font-medium text-mute">Fresha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COMPARE.map((r) => (
                      <tr key={r.label} className="border-b border-line">
                        <td className="py-4 pr-4">{r.label}</td>
                        {[r.us, r.booksy, r.fresha].map((v, i) => (
                          <td key={i} className="py-4 text-center">
                            {v ? (
                              <Check size={19} strokeWidth={2.25} className={`mx-auto ${i === 0 ? 'text-red' : 'text-ink'}`} aria-label="Sí" />
                            ) : (
                              <Minus size={19} strokeWidth={1.75} className="mx-auto text-line-2" aria-label="No" />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[13px] text-soft">Según la información pública de cada servicio, septiembre de 2026.</p>
            </div>
          </div>
        </section>

        {/* ============ Preguntas ============ */}
        <section id="preguntas" className="border-t border-line">
          <div className="mx-auto grid max-w-[1280px] gap-10 px-5 py-20 md:px-8 lg:grid-cols-12 lg:py-28">
            <h2 className="text-[clamp(2rem,3.6vw,3rem)] font-semibold leading-[1.05] lg:col-span-4" data-reveal>
              Preguntas frecuentes
            </h2>
            <div className="lg:col-span-8" data-reveal>
              {FAQ.map(([q, a]) => (
                <details key={q} className="group border-b border-line">
                  <summary className="flex items-center justify-between gap-6 py-6 text-[18px] font-medium tracking-[-0.02em]">
                    {q}
                    <Plus size={20} strokeWidth={1.75} className="acc-icon shrink-0 text-mute" />
                  </summary>
                  <div className="acc-body">
                    <div>
                      <p className="max-w-[62ch] pb-6 text-[16px] leading-relaxed text-mute">{a}</p>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ============ Cierre ============ */}
        <section className="bg-red text-white">
          <div className="mx-auto flex max-w-[1280px] flex-col items-start justify-between gap-8 px-5 py-20 md:px-8 lg:flex-row lg:items-end lg:py-24">
            <h2 className="max-w-2xl text-[clamp(2.25rem,4.5vw,3.75rem)] font-semibold leading-[1.02]" data-reveal>
              Tu próxima cita está a un minuto.
            </h2>
            <div className="flex flex-wrap gap-3" data-reveal>
              <Link href="/search" className="rounded-full bg-white px-6 py-3.5 text-[15px] font-medium text-ink transition-colors hover:bg-white/90">
                Buscar barberías
              </Link>
              <Link
                href="/join"
                className="rounded-full border border-white/40 px-6 py-3.5 text-[15px] font-medium text-white transition-colors hover:border-white"
              >
                Registra tu barbería
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}

/** Tarjeta de agenda superpuesta a la foto: muestra el panel real de la barbería. */
function AgendaCard() {
  const cols = [
    { name: 'Carlos', img: '/img/staff-carlos.webp', blocks: [{ t: '10:00', c: 'Luis R.', h: 2, top: 0, dark: true }, { t: '11:30', c: 'Andrés', h: 1, top: 3 }] },
    { name: 'María', img: '/img/staff-maria.webp', blocks: [{ t: '10:30', c: 'Diego P.', h: 1, top: 1 }, { t: '11:00', c: 'Kevin', h: 2, top: 2, dark: true }] },
    { name: 'Diego', img: '/img/staff-diego.webp', blocks: [{ t: '10:00', c: 'Jorge', h: 1, top: 0 }, { t: '12:00', c: 'Sin cita', h: 1, top: 4 }] },
  ];
  return (
    <div className="relative mx-auto -mt-20 w-[min(420px,92%)] rounded-xl bg-white p-4 shadow-pop lg:absolute lg:-bottom-10 lg:-left-10 lg:mt-0">
      <div className="flex items-center justify-between">
        <div className="text-[14px] font-medium">Hoy, agenda del equipo</div>
        <span className="rounded-full bg-field px-2.5 py-1 text-[11px] font-medium text-mute">Ejemplo</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {cols.map((col) => (
          <div key={col.name}>
            <div className="mb-2 flex items-center gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={col.img} alt="" className="h-6 w-6 rounded-full object-cover" />
              <span className="text-[12px] font-medium">{col.name}</span>
            </div>
            <div className="relative h-[150px] rounded-lg bg-field">
              {col.blocks.map((b) => (
                <div
                  key={b.t}
                  className={`absolute inset-x-1 rounded-md px-2 py-1 text-[11px] leading-tight ${b.dark ? 'bg-ink text-white' : 'bg-white text-ink'}`}
                  style={{ top: `${b.top * 30 + 4}px`, height: `${b.h * 30 - 4}px` }}
                >
                  <div className="tnum font-medium">{b.t}</div>
                  <div className="truncate opacity-75">{b.c}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
