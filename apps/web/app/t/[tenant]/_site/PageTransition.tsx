'use client';

import { usePathname } from 'next/navigation';

/** Entrada suave de cada página al navegar, como en una app (se apaga con movimiento reducido). */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div key={path} className="s-page">
      {children}
    </div>
  );
}
