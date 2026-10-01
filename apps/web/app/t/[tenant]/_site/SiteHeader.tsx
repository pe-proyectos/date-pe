'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Share } from 'lucide-react';
import { haptic } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import { ReservarLink } from '../_parts/sede';

interface NavItem { href: string; label: string }

/**
 * Cabecera de la barbería. Sobre la portada con foto es transparente y al bajar se
 * vuelve sólida. En el celular abre un menú a pantalla completa con las secciones.
 */
export function SiteHeader({ name, logo, initial, nav, available, photoHero, slug }: { name: string; logo: string | null; initial: string; nav: NavItem[]; available: boolean; photoHero: boolean; slug: string }) {
  const raw = usePathname() ?? '/';
  // Con dominio propio o subdominio la ruta visible es "/servicios"; internamente "/t/slug/servicios"
  const path = raw.replace(new RegExp(`^/t/${slug}(?=/|$)`), '') || '/';
  const overHero = photoHero && path === '/';
  const [solid, setSolid] = useState(!overHero);

  useEffect(() => {
    if (!overHero) {
      setSolid(true);
      return;
    }
    const on = () => setSolid(window.scrollY > window.innerHeight * 0.55);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [overHero, path]);

  // Compartir la página de la barbería con la hoja nativa del teléfono
  async function share() {
    haptic.tap();
    const url = window.location.href;
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(url);
        toast.success('Enlace copiado. Pégalo donde quieras.');
      } catch {
        toast.info(url);
      }
    };
    if (!navigator.share) return copy();
    try {
      await navigator.share({ title: name, text: `Reserva en ${name}`, url });
    } catch (e) {
      // Si la persona cerró la hoja no hacemos nada; si el teléfono no pudo compartir, copiamos
      if ((e as Error)?.name !== 'AbortError') await copy();
    }
  }

  const clear = overHero && !solid;
  const active = (href: string) => path === href || path.startsWith(`${href}/`);

  return (
    <>
      <header className={`pt-safe fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,color] duration-300 ${clear ? 'border-b border-transparent text-white' : 's-bg s-line border-b'}`}>
        <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-4 px-5 md:h-[72px] md:px-10">
          <Link href="/" className="flex min-w-0 items-center gap-3" aria-label={`${name}, inicio`}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="s-display flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[20px]" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
                {initial}
              </span>
            )}
            <span className={`s-display truncate text-[20px] leading-none transition-opacity duration-300 md:text-[22px] ${clear ? 'opacity-0 md:opacity-100' : 'opacity-100'}`}>{name}</span>
          </Link>
          <nav className="hidden items-center gap-8 text-[15px] font-medium lg:flex" aria-label="Secciones">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active(n.href) ? 'page' : undefined}
                className={`relative py-1 transition-opacity hover:opacity-100 ${active(n.href) ? 'opacity-100' : clear ? 'opacity-85' : 'opacity-65'}`}
              >
                {n.label}
                {active(n.href) && <span className="absolute inset-x-0 -bottom-1 h-[2px] rounded-full" style={{ background: 'var(--accent-text)' }} />}
              </Link>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            {available && <ReservarLink className="s-btn !hidden !min-h-[42px] !px-5 !text-[15px] lg:!inline-flex">Reservar</ReservarLink>}
            <button
              type="button"
              onClick={share}
              aria-label="Compartir"
              className={`flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-95 lg:hidden ${clear ? 'bg-black/25 text-white' : 's-surface'}`}
            >
              <Share size={19} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </header>

    </>
  );
}
