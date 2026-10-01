'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, Scissors, CalendarPlus, UsersRound, Menu, ChevronRight, Images, Star, MapPin, Ticket, Gift, BookOpen, MessageCircle, Navigation, CircleUserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ReservarLink } from '../_parts/sede';
import { SiteSheet } from './SiteSheet';
import { haptic } from '@/lib/haptics';

interface Item { href: string; label: string }

const ICONS: Record<string, LucideIcon> = {
  '/trabajos': Images,
  '/opiniones': Star,
  '/visitanos': MapPin,
  '/fila': Ticket,
  '/regalos': Gift,
  '/reclamaciones': BookOpen,
  '/mi-cuenta': CircleUserRound,
};

/**
 * Barra de pestañas del celular, como en una app: Inicio, Servicios, Reservar (al centro),
 * Equipo y Más. "Más" abre una hoja con el resto de secciones y el contacto.
 */
export function AppTabBar({ slug, nav, extra, available, teamLabel, whatsapp, maps }: { slug: string; nav: Item[]; extra: Item[]; available: boolean; teamLabel: string; whatsapp: string | null; maps: string | null }) {
  const raw = usePathname() ?? '/';
  const path = raw.replace(new RegExp(`^/t/${slug}(?=/|$)`), '') || '/';
  const [more, setMore] = useState(false);
  const is = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`));
  const rest = nav.filter((n) => n.href !== '/servicios' && n.href !== '/equipo');
  const moreActive = rest.some((n) => is(n.href));

  const tab = (href: string, label: string, Icon: LucideIcon) => (
    <Link
      href={href}
      onClick={() => haptic.tap()}
      aria-current={is(href) ? 'page' : undefined}
      className={`flex min-w-0 flex-1 flex-col items-center gap-1 pb-1 pt-2 text-[11px] font-semibold transition-opacity active:opacity-60 ${is(href) ? '' : 'opacity-55'}`}
    >
      <Icon size={23} strokeWidth={is(href) ? 2.1 : 1.6} />
      <span className="truncate">{label}</span>
    </Link>
  );

  return (
    <>
      <nav aria-label="Secciones" className="s-bg s-line fixed inset-x-0 bottom-0 z-40 border-t lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto flex max-w-md items-end px-2">
          {tab('/', 'Inicio', House)}
          {tab('/servicios', 'Servicios', Scissors)}
          {available ? (
            <div className="flex flex-1 justify-center">
              <ReservarLink onClick={() => haptic.tap()} className="-mt-5 flex h-[58px] w-[58px] flex-col items-center justify-center rounded-full shadow-[0_8px_24px_rgba(0,0,0,0.25)] transition-transform active:scale-95" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }} aria-label="Reservar cita">
                <CalendarPlus size={24} strokeWidth={1.9} />
              </ReservarLink>
            </div>
          ) : null}
          {tab('/equipo', teamLabel, UsersRound)}
          <button
            type="button"
            onClick={() => { haptic.tap(); setMore(true); }}
            className={`flex min-w-0 flex-1 flex-col items-center gap-1 pb-1 pt-2 text-[11px] font-semibold transition-opacity active:opacity-60 ${moreActive || more ? '' : 'opacity-55'}`}
            aria-haspopup="dialog"
          >
            <Menu size={23} strokeWidth={moreActive ? 2.1 : 1.6} />
            Más
          </button>
        </div>
      </nav>

      <SiteSheet open={more} onClose={() => setMore(false)} title="Más">
        <ul className="s-surface s-radius overflow-hidden">
          {[...rest, ...extra.filter((e) => e.href !== '/reservar')].map((n, i) => {
            const Icon = ICONS[n.href] ?? ChevronRight;
            return (
              <li key={n.href} className={i ? 's-line border-t' : ''}>
                <Link href={n.href} onClick={() => setMore(false)} className="flex min-h-[56px] items-center gap-4 px-4 active:opacity-60">
                  <Icon size={20} strokeWidth={1.6} className="s-mute shrink-0" />
                  <span className="flex-1 text-[17px] font-medium">{n.label}</span>
                  <ChevronRight size={18} strokeWidth={1.6} className="s-mute" />
                </Link>
              </li>
            );
          })}
        </ul>
        {(whatsapp || maps) && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            {maps && (
              <a href={maps} target="_blank" rel="noopener noreferrer" className="s-surface s-radius flex min-h-[72px] flex-col justify-center gap-1 px-4 active:opacity-60">
                <Navigation size={19} strokeWidth={1.6} />
                <span className="text-[15px] font-semibold">Cómo llegar</span>
              </a>
            )}
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="s-surface s-radius flex min-h-[72px] flex-col justify-center gap-1 px-4 active:opacity-60">
                <MessageCircle size={19} strokeWidth={1.6} />
                <span className="text-[15px] font-semibold">WhatsApp</span>
              </a>
            )}
          </div>
        )}
        <div className="s-mute mt-6 flex flex-wrap gap-x-5 gap-y-3 px-1 pb-2 text-[14px]">
          <Link href="/reclamaciones" onClick={() => setMore(false)} className="inline-flex min-h-9 items-center gap-1.5"><BookOpen size={15} strokeWidth={1.6} /> Libro de Reclamaciones</Link>
          <a href="https://date.pe/terminos" className="inline-flex min-h-9 items-center">Términos</a>
          <a href="https://date.pe/privacidad" className="inline-flex min-h-9 items-center">Privacidad</a>
        </div>
      </SiteSheet>
    </>
  );
}
