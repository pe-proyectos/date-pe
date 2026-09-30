'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, Newspaper, CircleUserRound } from 'lucide-react';
import { haptic } from '@/lib/haptics';

const TABS = [
  { href: '/', label: 'Inicio', icon: Home, match: (p: string) => p === '/' },
  { href: '/search', label: 'Explorar', icon: Search, match: (p: string) => p.startsWith('/search') || p.startsWith('/barberias') },
  { href: '/blog', label: 'Blog', icon: Newspaper, match: (p: string) => p.startsWith('/blog') },
  { href: '/ingresar', label: 'Mi panel', icon: CircleUserRound, match: (p: string) => p.startsWith('/ingresar') || p.startsWith('/join') },
];

/** Barra inferior de pestañas del sitio en el teléfono. */
export function MobileTabBar() {
  const pathname = usePathname() ?? '/';
  return (
    <nav
      aria-label="Navegación principal"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur-md md:hidden"
    >
      <ul className="grid grid-cols-4">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={() => haptic.tap()}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 pb-1 pt-2.5 text-[11px] font-medium ${active ? 'text-ink' : 'text-soft'}`}
              >
                <Icon size={23} strokeWidth={active ? 2.1 : 1.7} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
