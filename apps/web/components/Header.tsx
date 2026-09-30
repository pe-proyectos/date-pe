'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { Logo } from './brand';

const NAV = [
  { href: '/search', label: 'Explorar' },
  { href: '/#barberias', label: 'Para barberías' },
  { href: '/blog', label: 'Blog' },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
  }, [open]);

  return (
    <header
      className={`sticky top-0 z-40 bg-white/90 backdrop-blur-md transition-[border-color] duration-300 ${
        scrolled ? 'border-b border-line' : 'border-b border-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-5 md:px-8">
        <Logo />
        <nav className="hidden items-center gap-8 text-[15px] text-mute md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="transition-colors hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Link href="/ingresar" className="rounded-full px-4 py-2 text-[15px] text-ink transition-colors hover:bg-field">
            Ingresar
          </Link>
          <Link
            href="/join"
            className="rounded-full bg-ink px-5 py-2.5 text-[15px] font-medium text-white transition-colors hover:bg-ink-2"
          >
            Registra tu barbería
          </Link>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full hover:bg-field md:hidden"
          aria-label="Abrir menú"
        >
          <Menu size={22} strokeWidth={1.75} />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-white md:hidden">
          <div className="flex h-16 items-center justify-between px-5">
            <Logo />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full hover:bg-field"
              aria-label="Cerrar menú"
            >
              <X size={22} strokeWidth={1.75} />
            </button>
          </div>
          <nav className="flex flex-col px-5 pt-4">
            {[...NAV, { href: '/ingresar', label: 'Ingresar a mi panel' }].map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="border-b border-line py-4 text-2xl font-medium tracking-[-0.03em]"
              >
                {n.label}
              </Link>
            ))}
            <Link
              href="/join"
              onClick={() => setOpen(false)}
              className="mt-8 rounded-full bg-ink py-4 text-center text-[17px] font-medium text-white"
            >
              Registra tu barbería
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
