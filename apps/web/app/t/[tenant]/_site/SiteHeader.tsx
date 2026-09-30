'use client';

import { useEffect, useState } from 'react';
import { ReservarLink } from '../_parts/sede';

interface NavItem { href: string; label: string }

/**
 * Cabecera de la barbería: transparente sobre la portada con foto y sólida (color del
 * ambiente) al bajar. Solo nombre, secciones y Reservar.
 */
export function SiteHeader({ name, logo, initial, nav, available, overHero }: { name: string; logo: string | null; initial: string; nav: NavItem[]; available: boolean; overHero: boolean }) {
  const [solid, setSolid] = useState(!overHero);

  useEffect(() => {
    if (!overHero) return;
    const on = () => setSolid(window.scrollY > window.innerHeight * 0.55);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [overHero]);

  const clear = overHero && !solid;
  return (
    <header
      className={`pt-safe fixed inset-x-0 top-0 z-40 transition-[background-color,border-color,color] duration-300 ${clear ? 'border-b border-transparent text-white' : 's-bg s-line border-b'}`}
    >
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-4 px-5 md:h-[72px] md:px-10">
        <a href="#inicio" className="flex min-w-0 items-center gap-3" aria-label={`${name}, ir al inicio`}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="s-display flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[20px]" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
              {initial}
            </span>
          )}
          <span className={`s-display truncate text-[20px] leading-none transition-opacity duration-300 md:text-[22px] ${clear ? 'opacity-0 md:opacity-100' : 'opacity-100'}`}>{name}</span>
        </a>
        <nav className="hidden items-center gap-8 text-[15px] font-medium lg:flex" aria-label="Secciones">
          {nav.map((n) => (
            <a key={n.href} href={n.href} className={`transition-opacity hover:opacity-100 ${clear ? 'opacity-85' : 'opacity-70'}`}>
              {n.label}
            </a>
          ))}
        </nav>
        {available && (
          <ReservarLink className="s-btn !min-h-[42px] shrink-0 !px-5 !text-[15px]">Reservar</ReservarLink>
        )}
      </div>
    </header>
  );
}
