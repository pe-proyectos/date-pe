import Link from 'next/link';
import { ArrowRight, BookOpen, CalendarOff, ChevronRight } from 'lucide-react';
import { soles } from '@/lib/api';
import { ReservarLink } from '../_parts/sede';
import { OpenStatus } from '../_parts/OpenStatus';
import { NextSlot } from './NextSlot';
import type { SiteData } from './data';
import { weekTable, nowIn, type HourRow } from '../_parts/hours';

/** Frase con una palabra resaltada entre asteriscos: "La *carta*". */
export function Accent({ text }: { text: string }) {
  const [a, b, c] = text.split('*');
  return (
    <>
      {a}
      {b && <em>{b}</em>}
      {c}
    </>
  );
}

/** Título de sección: número, rótulo y frase grande. */
export function Head({ n, eyebrow, title, sub, action }: { n?: string; eyebrow: string; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
      <div className="min-w-0">
        <p className="s-eyebrow flex items-center gap-3">
          {n && (
            <>
              <span className="tnum">{n}</span>
              <span className="s-line h-px w-8 border-t" aria-hidden />
            </>
          )}
          {eyebrow}
        </p>
        <h2 className="s-display mt-4 text-[clamp(2.6rem,7vw,5rem)]">
          <Accent text={title} />
        </h2>
        {sub && <p className="s-mute mt-4 max-w-[52ch] text-[17px] leading-relaxed">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/** Enlace "Ver todo" hacia la página especializada de cada sección. */
export function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="s-btn-ghost group !min-h-[48px] !text-[15px]">
      {children}
      <ArrowRight size={17} strokeWidth={1.75} className="transition-transform duration-300 group-hover:translate-x-1" />
    </Link>
  );
}

/** Encabezado de las páginas internas (servicios, equipo, trabajos...). */
export function PageIntro({ eyebrow, title, sub, children }: { eyebrow: string; title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-[1240px] px-5 pb-8 pt-[calc(6rem+env(safe-area-inset-top))] md:px-10 md:pb-14 md:pt-40">
      <nav aria-label="Ruta" className="s-mute mb-8 hidden items-center gap-2 text-[14px] md:flex">
        <Link href="/" className="hover:underline">Inicio</Link>
        <ChevronRight size={14} strokeWidth={1.75} aria-hidden />
        <span className="s-ink">{eyebrow}</span>
      </nav>
      <h1 className="s-display s-rise text-[clamp(3.2rem,10vw,7.5rem)]">
        <Accent text={title} />
      </h1>
      {sub && <p className="s-mute s-rise s-rise-2 mt-6 max-w-[56ch] text-[18px] leading-relaxed">{sub}</p>}
      {children}
    </section>
  );
}

/** Semana de horarios a partir de filas sueltas (de un barbero o de una sede). */
export function WeekHours({ rows, tz, compact = false }: { rows: HourRow[]; tz: string; compact?: boolean }) {
  if (!rows.length) return null;
  const week = weekTable(rows);
  const todayDow = nowIn(tz).dow;
  return (
    <dl className={`s-divide ${compact ? 'text-[15px]' : 'text-[16px]'}`}>
      {week.map((w) => {
        const today = w.dow === todayDow;
        return (
          <div key={w.dow} className={`flex items-center justify-between gap-4 ${compact ? 'py-2.5' : 'py-3'} ${today ? 'font-semibold' : ''}`}>
            <dt className={`flex items-center gap-2.5 ${today ? '' : 's-mute'}`}>
              {today && <span className="h-2 w-2 rounded-full" style={{ background: 'var(--accent-text)' }} aria-hidden />}
              {w.day}
              {today && <span className="s-mute text-[13px] font-normal">hoy</span>}
            </dt>
            <dd className={`tnum text-right ${w.time ? '' : 's-mute'}`}>{w.time ?? 'Descansa'}</dd>
          </div>
        );
      })}
    </dl>
  );
}

export function HoursTable({ d }: { d: SiteData }) {
  if (!d.hours.length) return null;
  return (
    <dl className="s-divide text-[16px]">
      {d.week.map((w) => {
        const today = w.dow === d.todayDow;
        return (
          <div key={w.dow} className={`flex items-center justify-between gap-4 py-3 ${today ? 'font-semibold' : ''}`}>
            <dt className={`flex items-center gap-2.5 ${today ? '' : 's-mute'}`}>
              {today && <span className="h-2 w-2 rounded-full" style={{ background: 'var(--accent-text)' }} aria-hidden />}
              {w.day}
              {today && <span className="s-mute text-[13px] font-normal">hoy</span>}
            </dt>
            <dd className={`tnum text-right ${w.time ? '' : 's-mute'}`}>{w.time ?? 'Cerrado'}</dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Cierre con llamada a reservar (foto oscura o superficie del ambiente). */
export function Closing({ d, title = 'Tu próximo corte *empieza aquí*' }: { d: SiteData; title?: string }) {
  if (!d.available) return null;
  const img = d.closingImage;
  return (
    <section className="relative overflow-hidden">
      {img ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img} alt="" loading="lazy" className="s-mood-photo absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-black/65" />
        </>
      ) : (
        <div className="s-surface absolute inset-0"><div className="s-pole absolute inset-x-0 top-0 h-3" /></div>
      )}
      <div className={`relative mx-auto max-w-[1240px] px-5 py-28 text-center md:px-10 md:py-40 ${img ? 's-on-photo s-hero-text text-white' : ''}`}>
        <p className={`s-eyebrow ${img ? '!text-white/85' : ''}`}>{d.todayRow?.time ? `Hoy atendemos de ${d.todayRow.time}` : 'Reserva en un minuto'}</p>
        <p className="s-display mx-auto mt-6 max-w-[14ch] text-[clamp(3rem,9vw,7rem)]">
          <Accent text={title} />
        </p>
        {d.mainServices[0] && (
          <p className="mt-6 flex justify-center text-[16px]">
            <NextSlot tenant={d.tenant} serviceId={d.mainServices[0].id} tz={d.tz} light={!!img} />
          </p>
        )}
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <ReservarLink className="s-btn">Reservar cita</ReservarLink>
          {d.whatsapp && (
            <a href={d.whatsapp} target="_blank" rel="noopener noreferrer" className={`s-btn-ghost ${img ? '!border-white/40 text-white hover:!border-white' : ''}`}>
              Escríbenos por WhatsApp
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

export function SiteFooter({ d }: { d: SiteData }) {
  const { site } = d;
  return (
    <footer className="s-line border-t">
      <div className="mx-auto max-w-[1240px] px-5 pb-[calc(112px+env(safe-area-inset-bottom))] pt-16 md:px-10 lg:pb-12">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-4">
            <div className="flex items-center gap-4">
              {site.branding?.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={site.branding.logo_url} alt="" width={64} height={64} className="h-16 w-16 rounded-full object-cover" />
              )}
              <p className="s-display text-[clamp(2rem,4vw,2.8rem)]">{site.tenant.name}</p>
            </div>
            {site.branding?.tagline && <p className="s-mute mt-4 max-w-[36ch] text-[16px]">{site.branding.tagline}</p>}
          </div>
          <div className="md:col-span-2">
            <p className="s-eyebrow">La casa</p>
            <ul className="mt-3 space-y-0 text-[15px] md:mt-4 md:space-y-2">
              {d.nav.map((n) => <li key={n.href}><Link href={n.href} className="inline-flex min-h-11 items-center hover:underline md:min-h-0">{n.label}</Link></li>)}
            </ul>
          </div>
          <div className="md:col-span-3">
            <p className="s-eyebrow">{d.multiLoc ? 'Sedes' : 'Dirección'}</p>
            <ul className="mt-3 space-y-0 text-[15px] md:mt-4 md:space-y-2">
              {site.locations.map((l) => (
                <li key={l.id}>
                  <a href={d.mapsFor(l)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center hover:underline md:min-h-0">
                    {d.multiLoc ? <span className="font-semibold">{l.name}: </span> : null}
                    {[l.address, l.district].filter(Boolean).join(', ')}
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[15px]">{d.todayRow ? `Hoy ${d.todayRow.time ?? 'cerrado'}` : ''}</p>
          </div>
          <div className="md:col-span-3">
            <p className="s-eyebrow">Más</p>
            <ul className="mt-3 space-y-0 text-[15px] md:mt-4 md:space-y-2">
              {d.available && <li><Link href="/reservar" className="inline-flex min-h-11 items-center hover:underline md:min-h-0">Reservar cita</Link></li>}
              {d.showQueue && <li><Link href="/fila" className="inline-flex min-h-11 items-center hover:underline md:min-h-0">Fila virtual</Link></li>}
              {d.showGifts && <li><Link href="/regalos" className="inline-flex min-h-11 items-center hover:underline md:min-h-0">Regalos y gift cards</Link></li>}
              <li><Link href="/mi-cuenta" className="inline-flex min-h-11 items-center hover:underline md:min-h-0">Mi cuenta</Link></li>
              {d.instagram && <li><a href={d.instagram} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center hover:underline md:min-h-0">Instagram</a></li>}
              {d.whatsapp && <li><a href={d.whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center hover:underline md:min-h-0">WhatsApp</a></li>}
            </ul>
          </div>
        </div>
        <div className="s-line s-mute mt-14 flex flex-col gap-3 border-t pt-6 text-[14px] md:flex-row md:items-center md:justify-between">
          <span>{site.tenant.name}, {new Date().getFullYear()}</span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link href="/reclamaciones" className="inline-flex items-center gap-1.5 hover:underline">
              <BookOpen size={15} strokeWidth={1.75} /> Libro de Reclamaciones
            </Link>
            <a href="https://date.pe/terminos" className="hover:underline">Términos</a>
            <a href="https://date.pe/privacidad" className="hover:underline">Privacidad</a>
            {site.branding?.show_powered_by !== false && <a href="https://date.pe" className="hover:underline">Reservas con date.pe</a>}
          </div>
        </div>
      </div>
    </footer>
  );
}

export function MobileBar({ d }: { d: SiteData }) {
  return (
    <div className="s-bg s-line pb-safe fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-4 border-t px-5 pt-3 lg:hidden">
      <div className="min-w-0">
        {d.from != null && <div className="tnum text-[16px] font-semibold">Desde {soles(d.from)}</div>}
        <OpenStatus hours={d.hours} tz={d.tz} initial={d.status} className="text-[13px]" />
      </div>
      {d.available ? (
        <ReservarLink className="s-btn !min-h-[48px] shrink-0">Reservar</ReservarLink>
      ) : (
        <span className="s-mute flex items-center gap-2 text-right text-[14px]"><CalendarOff size={16} strokeWidth={1.75} className="shrink-0" /> Reservas en pausa</span>
      )}
    </div>
  );
}
