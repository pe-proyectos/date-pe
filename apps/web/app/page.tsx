import Link from 'next/link';
import { SearchBar } from '@/components/SearchBar';
import { Header, Footer } from '@/components/site';

const DISTRICTS = ['Miraflores', 'San Isidro', 'Surco', 'San Borja', 'La Molina', 'Barranco', 'Jesús María', 'Los Olivos', 'Magdalena', 'Lince', 'Pueblo Libre', 'San Miguel'];

type Feature = { icon: () => React.ReactElement; title: string; body: string };

const STEPS: Feature[] = [
  { icon: IconSearch, title: 'Busca', body: 'Encuentra barberías cerca de ti por distrito, servicio y disponibilidad real.' },
  { icon: IconScissors, title: 'Elige', body: 'Selecciona tu barbero (o "cualquiera disponible"), servicio y la hora que prefieras.' },
  { icon: IconCheck, title: 'Confirma', body: 'Paga una seña por Yape y recibe tu confirmación. Te recordamos por WhatsApp.' },
];

const FEATURES: Feature[] = [
  { icon: IconScissors, title: 'Elige tu barbero', body: 'Fotos, especialidades y reseñas de cada barbero. O deja que asignemos al primero disponible.' },
  { icon: IconCalendar, title: 'Agenda en tiempo real', body: 'Disponibilidad que se actualiza al instante. Sin dobles reservas, nunca.' },
  { icon: IconYape, title: 'Seña por Yape / Plin', body: 'Reduce los plantones cobrando un adelanto con los medios que todos usan en Perú.' },
  { icon: IconWhatsapp, title: 'Recordatorios', body: 'Confirmaciones y recordatorios para que tus clientes no falten.' },
  { icon: IconStore, title: 'Tu marca, tu web', body: 'Cada barbería tiene su propio sitio en tunombre.date.pe, con su logo y colores.' },
  { icon: IconChart, title: 'Reportes y equipo', body: 'Gestiona barberos, horarios, comisiones y mira tus ingresos y ocupación.' },
];

export default function HomePage() {
  return (
    <>
      <Header />

      {/* ================= HERO ================= */}
      <section className="relative overflow-hidden">
        <div className="mesh absolute inset-0 -z-10" />
        <div className="aurora -left-20 top-10 -z-10 h-72 w-72" style={{ background: '#6366f1' }} />
        <div className="aurora right-0 top-40 -z-10 h-80 w-80" style={{ background: '#ec4899', animationDelay: '3s' }} />

        <div className="mx-auto max-w-6xl px-6 pb-28 pt-20 text-center md:pt-28">
          <div className="fade-up mx-auto mb-6 inline-flex items-center gap-2 rounded-full glass-dark px-4 py-1.5 text-sm text-white/80">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> Reserva con seña por Yape · sin llamadas
          </div>
          <h1 className="fade-up mx-auto max-w-3xl text-4xl font-bold leading-[1.05] text-white md:text-6xl">
            Tu próxima cita en la barbería, <span className="text-gradient">en 30 segundos.</span>
          </h1>
          <p className="fade-up mx-auto mt-5 max-w-xl text-lg text-white/70">
            Descubre las mejores barberías del Perú, elige a tu barbero y horario, y asegura tu lugar con una seña por Yape. Sin apps, sin esperas.
          </p>

          <div className="fade-up mx-auto mt-9 max-w-3xl text-left">
            <SearchBar />
          </div>

          <div className="fade-up mt-6 flex flex-wrap items-center justify-center gap-2 text-sm">
            <span className="text-white/50">Populares:</span>
            {DISTRICTS.slice(0, 5).map((d) => (
              <Link key={d} href={`/search?district=${encodeURIComponent(d)}`} className="rounded-full bg-white/10 px-3 py-1 text-white/90 backdrop-blur hover:bg-white/20">
                {d}
              </Link>
            ))}
          </div>

          <div className="mt-14 grid grid-cols-3 gap-4 text-white/80">
            {[['+900', 'barberías objetivo'], ['0%', 'comisión por cita'], ['24/7', 'reservas online']].map(([n, l]) => (
              <div key={l}>
                <div className="font-display text-3xl font-bold text-white">{n}</div>
                <div className="text-sm text-white/60">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= CÓMO FUNCIONA ================= */}
      <section id="como-funciona" className="mx-auto max-w-6xl px-6 py-24">
        <SectionTitle kicker="Cómo funciona" title="Reservar nunca fue tan simple" />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="glass card-hover rounded-3xl p-8">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl btn-primary text-white">
                <s.icon />
              </div>
              <div className="mb-1 text-xs font-semibold text-brand">PASO {i + 1}</div>
              <h3 className="text-xl font-bold">{s.title}</h3>
              <p className="mt-2 text-slate-600">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ================= FEATURES ================= */}
      <section className="mesh-light py-24">
        <div className="mx-auto max-w-6xl px-6">
          <SectionTitle kicker="Todo incluido" title="Una plataforma completa, no un simple calendario" />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="glass card-hover rounded-3xl p-6">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <f.icon />
                </div>
                <h3 className="text-lg font-bold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-slate-600">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= COMPARATIVA ================= */}
      <section className="mx-auto max-w-5xl px-6 py-24">
        <SectionTitle kicker="Por qué date.pe" title="Hecho para el Perú, mejor que el resto" />
        <div className="mt-10 overflow-hidden rounded-3xl glass">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200/60 text-left">
                <th className="p-4 font-semibold">Función</th>
                <th className="p-4 text-center font-bold text-brand">date.pe</th>
                <th className="p-4 text-center font-medium text-slate-400">Booksy / Fresha</th>
                <th className="p-4 text-center font-medium text-slate-400">AgendaPro</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Seña por Yape / Plin', true, false, false],
                ['Precio en soles (S/50/mes plano)', true, false, false],
                ['Recordatorios por WhatsApp', true, 'parcial', true],
                ['Sitio white-label por subdominio', true, false, 'parcial'],
                ['Sin comisión por cita', true, false, true],
                ['Reservar sin descargar app', true, false, true],
              ].map(([f, a, b, c]) => (
                <tr key={f as string} className="border-b border-slate-100/60">
                  <td className="p-4">{f as string}</td>
                  <td className="p-4 text-center"><Mark v={a} /></td>
                  <td className="p-4 text-center"><Mark v={b} /></td>
                  <td className="p-4 text-center"><Mark v={c} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ================= PARA BARBERÍAS / PRECIO ================= */}
      <section id="barberias" className="relative overflow-hidden py-24">
        <div className="mesh absolute inset-0 -z-10" />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 md:grid-cols-2">
          <div>
            <div className="mb-4 inline-flex rounded-full glass-dark px-4 py-1.5 text-sm text-white/80">Para barberías</div>
            <h2 className="text-4xl font-bold text-white">Tu barbería, online y llena.</h2>
            <p className="mt-4 text-lg text-white/70">
              Tu propia página de reservas, agenda con tu equipo, pagos con Yape y menos plantones. Todo por un precio plano, sin sorpresas.
            </p>
            <ul className="mt-6 space-y-3 text-white/85">
              {['Tu web en tunombre.date.pe', 'Agenda con calendario y arrastrar-soltar', 'Cobra señas con Yape/Plin, MercadoPago y PayPal', 'Reportes de ingresos, ocupación y no-shows'].map((x) => (
                <li key={x} className="flex items-center gap-3"><span className="text-emerald-400"><IconCheck /></span>{x}</li>
              ))}
            </ul>
          </div>
          <div id="precios" className="glass rounded-3xl p-8">
            <div className="text-sm font-semibold text-brand">Plan Suite · todo incluido</div>
            <div className="mt-2 flex items-end gap-1">
              <span className="font-display text-5xl font-bold">S/50</span>
              <span className="pb-1 text-slate-500">/mes</span>
            </div>
            <p className="mt-2 text-sm text-slate-500">Sin comisión por cita. Sin permanencia.</p>
            <Link href="/join" className="btn-primary mt-6 block rounded-xl py-3 text-center font-semibold">
              Crear mi barbería
            </Link>
            <div className="mt-5 space-y-2 text-sm text-slate-600">
              {['Barberos y horarios ilimitados', 'Sitio white-label + subdominio', 'Pagos Yape/MercadoPago/PayPal', 'Recordatorios y reseñas'].map((x) => (
                <div key={x} className="flex items-center gap-2"><span className="text-brand"><IconCheck /></span>{x}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ================= DISTRITOS SEO ================= */}
      <section id="zonas" className="mx-auto max-w-6xl px-6 py-24">
        <SectionTitle kicker="Explora" title="Barberías por distrito en Lima" />
        <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
          {DISTRICTS.map((d) => (
            <Link key={d} href={`/search?district=${encodeURIComponent(d)}`} className="glass card-hover rounded-2xl px-5 py-4 text-sm font-medium">
              Barberías en {d}
            </Link>
          ))}
        </div>
      </section>

      {/* ================= FAQ ================= */}
      <section className="mx-auto max-w-3xl px-6 pb-24">
        <SectionTitle kicker="Dudas" title="Preguntas frecuentes" />
        <div className="mt-8 space-y-3">
          {[
            ['¿Necesito descargar una app?', 'No. Reservas desde el navegador en segundos, en la web de cada barbería.'],
            ['¿Cómo pago la seña?', 'Con Yape o Plin (también MercadoPago y PayPal). Es un adelanto que asegura tu cita; el resto lo pagas en el local.'],
            ['¿Puedo elegir a mi barbero?', 'Sí, eliges barbero y horario, o dejas que asignemos al primero disponible.'],
            ['Tengo una barbería, ¿cómo empiezo?', 'Crea tu cuenta en /join, configura tus servicios y equipo, y comparte tu link tunombre.date.pe.'],
          ].map(([q, a]) => (
            <details key={q} className="glass group rounded-2xl p-5">
              <summary className="cursor-pointer list-none font-semibold">{q}</summary>
              <p className="mt-2 text-slate-600">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ================= CTA ================= */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <div className="relative overflow-hidden rounded-3xl px-8 py-16 text-center">
          <div className="mesh absolute inset-0 -z-10" />
          <h2 className="text-3xl font-bold text-white md:text-4xl">¿Listo para tu próximo corte?</h2>
          <p className="mx-auto mt-3 max-w-lg text-white/70">Encuentra tu barbería ideal y reserva en segundos.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/search" className="rounded-xl bg-white px-7 py-3 font-semibold text-ink hover:bg-white/90">Buscar barberías</Link>
            <Link href="/join" className="rounded-xl glass-dark px-7 py-3 font-semibold text-white">Crear mi barbería</Link>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}

function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="text-center">
      <div className="mb-3 text-sm font-semibold uppercase tracking-widest text-brand">{kicker}</div>
      <h2 className="mx-auto max-w-2xl text-3xl font-bold md:text-4xl">{title}</h2>
    </div>
  );
}

function Mark({ v }: { v: boolean | string }) {
  if (v === true) return <span className="text-emerald-500"><IconCheck /></span>;
  if (v === 'parcial') return <span className="text-xs font-medium text-amber-500">parcial</span>;
  return <span className="text-slate-300">—</span>;
}

/* ---------- iconos ---------- */
function IconSearch() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>; }
function IconScissors() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12" /></svg>; }
function IconCheck() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>; }
function IconCalendar() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>; }
function IconYape() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M2 10h20M7 15h4" /></svg>; }
function IconWhatsapp() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5Z" /></svg>; }
function IconStore() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 9 4 4h16l1 5M4 9v11h16V9M4 9h16" /></svg>; }
function IconChart() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3v18h18M8 15v3M13 10v8M18 6v12" /></svg>; }
