'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Logo } from './brand';
import { MobileTabBar } from './MobileTabBar';

const NAV = [
  { href: '/search', label: 'Explorar' },
  { href: '/#barberias', label: 'Para barberías' },
  { href: '/blog', label: 'Blog' },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <header
        className={`pt-safe sticky top-0 z-40 bg-white/90 backdrop-blur-md transition-[border-color] duration-300 ${
          scrolled ? 'border-b border-line' : 'border-b border-transparent'
        }`}
      >
        <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between px-5 md:h-16 md:px-8">
          <Logo />
          <nav className="hidden items-center gap-8 text-[15px] text-mute md:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="transition-colors hover:text-ink">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/ingresar" className="hidden rounded-full px-4 py-2 text-[15px] text-ink transition-colors hover:bg-field md:block">
              Ingresar
            </Link>
            <Link
              href="/join"
              className="rounded-full bg-ink px-4 py-2 text-[14px] font-medium text-white transition-colors hover:bg-ink-2 md:px-5 md:py-2.5 md:text-[15px]"
            >
              <span className="md:hidden">Soy barbería</span>
              <span className="hidden md:inline">Solicitar acceso</span>
            </Link>
          </div>
        </div>
      </header>
      <MobileTabBar />
    </>
  );
}
