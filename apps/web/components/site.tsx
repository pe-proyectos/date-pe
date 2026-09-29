import Link from 'next/link';
import { Logo } from './Logo';

export function Header() {
  return (
    <header className="sticky top-0 z-40 px-4 pt-4">
      <div className="mx-auto flex max-w-6xl items-center justify-between rounded-2xl glass px-5 py-3">
        <Link href="/"><Logo /></Link>
        <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
          <Link href="/search" className="hover:text-slate-900">Buscar</Link>
          <Link href="/#como-funciona" className="hover:text-slate-900">Cómo funciona</Link>
          <Link href="/#barberias" className="hover:text-slate-900">Para barberías</Link>
          <Link href="/blog" className="hover:text-slate-900">Blog</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/search" className="hidden rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 sm:block">
            Explorar
          </Link>
          <Link href="/join" className="btn-primary rounded-xl px-4 py-2 text-sm font-semibold">
            Crear mi barbería
          </Link>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-24 border-t border-slate-100 bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-4">
        <div className="md:col-span-1">
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-slate-500">
            Reserva en las mejores barberías del Perú. Elige barbero, horario y paga tu seña con Yape.
          </p>
        </div>
        <FooterCol title="Producto" links={[['Buscar barberías', '/search'], ['Cómo funciona', '/#como-funciona'], ['Blog', '/blog']]} />
        <FooterCol title="Para barberías" links={[['Crear mi barbería', '/join'], ['Precios', '/#precios'], ['Panel', '/join']]} />
        <FooterCol title="Zonas" links={[['Miraflores', '/search?district=Miraflores'], ['San Isidro', '/search?district=San Isidro'], ['Surco', '/search?district=Surco'], ['Barranco', '/search?district=Barranco']]} />
      </div>
      <div className="border-t border-slate-100 py-6 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} date.pe · Hecho en Perú 🇵🇪
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h4 className="mb-3 text-sm font-semibold text-slate-900">{title}</h4>
      <ul className="space-y-2 text-sm text-slate-500">
        {links.map(([label, href]) => (
          <li key={href + label}>
            <Link href={href} className="hover:text-slate-900">{label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
