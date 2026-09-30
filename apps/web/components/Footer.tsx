import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { Logo } from './brand';
import { DISTRICTS } from '@/lib/districts';

export function Footer() {
  return (
    <footer className="border-t border-line bg-white print:hidden">
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
            ['Solicitar acceso', '/join'],
            ['Ingresar a mi panel', '/ingresar'],
            ['Cómo empezar', '/#empezar'],
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
      <div className="mx-auto flex max-w-[1280px] flex-col gap-4 border-t border-line px-5 py-6 text-sm text-soft md:flex-row md:items-center md:justify-between md:px-8">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span>© {new Date().getFullYear()} date.pe</span>
          <Link href="/terminos" className="transition-colors hover:text-ink">Términos</Link>
          <Link href="/privacidad" className="transition-colors hover:text-ink">Privacidad</Link>
          <Link href="/reclamaciones" className="inline-flex items-center gap-1.5 transition-colors hover:text-ink">
            <BookOpen size={15} strokeWidth={1.75} /> Libro de Reclamaciones
          </Link>
        </div>
        <span>Hecho en Lima, Perú</span>
      </div>
      {/* Espacio para la barra inferior de pestañas en el teléfono */}
      <div className="h-[calc(64px+env(safe-area-inset-bottom))] md:hidden" aria-hidden />
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
