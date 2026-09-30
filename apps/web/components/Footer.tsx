import Link from 'next/link';
import { Logo } from './brand';
import { DISTRICTS } from '@/lib/districts';

export function Footer() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto grid max-w-[1280px] gap-12 px-5 py-16 md:grid-cols-12 md:px-8">
        <div className="md:col-span-4">
          <Logo />
          <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-mute">
            Reservas para barberías en el Perú. Eliges barbero y hora, pagas el adelanto con Yape y listo.
          </p>
        </div>
        <FooterCol
          title="Explorar"
          links={[
            ['Buscar barberías', '/search'],
            ['Blog', '/blog'],
            ['Preguntas frecuentes', '/#preguntas'],
          ]}
        />
        <FooterCol
          title="Barberías"
          links={[
            ['Registra tu barbería', '/join'],
            ['Ingresar a mi panel', '/ingresar'],
            ['Precio', '/#precio'],
          ]}
        />
        <div className="md:col-span-4">
          <h4 className="mb-4 text-sm font-medium text-ink">Barberías en Lima</h4>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-[15px] text-mute">
            {DISTRICTS.slice(0, 10).map((d) => (
              <li key={d.slug}>
                <Link href={`/barberias/${d.province}/${d.slug}`} className="transition-colors hover:text-ink">
                  {d.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mx-auto flex max-w-[1280px] flex-col gap-2 border-t border-line px-5 py-6 text-sm text-soft md:flex-row md:justify-between md:px-8">
        <span>© {new Date().getFullYear()} date.pe</span>
        <span>Hecho en Lima, Perú</span>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div className="md:col-span-2">
      <h4 className="mb-4 text-sm font-medium text-ink">{title}</h4>
      <ul className="space-y-2.5 text-[15px] text-mute">
        {links.map(([label, href]) => (
          <li key={label}>
            <Link href={href} className="transition-colors hover:text-ink">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
