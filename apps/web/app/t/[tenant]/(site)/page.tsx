import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Star, MapPin, Navigation, Check, CalendarOff, Gift, ChevronRight, Phone, Scissors, UsersRound, Camera, MessageCircle, ArrowDown } from 'lucide-react';
import { soles, type TenantSite } from '@/lib/api';
import { QueueCard } from '../_parts/QueueCard';
import { SedePicker, ReservarLink } from '../_parts/sede';
import { ServiceMenu } from '../_parts/ServiceMenu';
import { TeamSection } from '../_parts/TeamSection';
import { OpenStatus } from '../_parts/OpenStatus';
import { GalleryGrid } from '../_parts/GalleryGrid';
import { NextSlot } from '../_site/NextSlot';
import { SiteMap } from '../_site/SiteMap';
import { Head, MoreLink, HoursTable, Closing } from '../_site/blocks';
import { getSite, derive } from '../_site/data';

export async function generateMetadata({ params }: { params: Promise<{ tenant: string }> }): Promise<Metadata> {
  const { tenant } = await params;
  const site = await getSite(tenant);
  if (!site) return { title: 'Barbería' };
  const loc = site.locations[0];
  const title = `${site.tenant.name}${loc?.district ? `, ${loc.district}` : ''} | Reserva online`;
  const description = `${site.branding?.tagline ?? 'Reserva tu cita online.'} Elige barbero y hora, y paga el adelanto con Yape.`;
  const img = site.branding?.cover_url ?? '/img/og.jpg';
  return {
    title: { absolute: title },
    description,
    ...(site.branding?.logo_url ? { icons: { icon: site.branding.logo_url, apple: site.branding.logo_url } } : {}),
    alternates: { canonical: `https://${tenant}.date.pe` },
    openGraph: { title, description, url: `https://${tenant}.date.pe`, images: [img] },
    appleWebApp: { capable: true, title: site.tenant.name, statusBarStyle: 'default' },
  };
}

const SCHEMA_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default async function TenantHome({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const site = await getSite(tenant);
  if (!site) notFound();
  const d = derive(site, tenant);
  const { theme, mood, loc, rating, reviewCount, mainServices, available, multiLoc, tz, hours, status, galleryPhotos, cover, photoHero, instagram, whatsapp, prefix, main, initial, solo } = d;

  const eyebrow = [theme.since ? `Desde ${theme.since}` : null, multiLoc || prefix ? d.place : `Barbería en ${d.place}`].filter(Boolean).join(', ');
  const headline = theme.headline ?? site.branding?.tagline ?? null;
  // "La casa" no repite la frase de la portada: cuenta la historia. Si es larga, la primera frase va en grande.
  const tagline = site.branding?.tagline ?? null;
  const about = site.branding?.about ?? null;
  const story = theme.headline ? tagline ?? about : about ?? tagline;
  const firstStop = story ? story.search(/[.!?](\s|$)/) : -1;
  const splitStory = !!story && story.length > 120 && firstStop > 30 && firstStop < story.length - 20;
  const casaTitle = splitStory ? story!.slice(0, firstStop + 1) : story;
  const casaBody = splitStory ? story!.slice(firstStop + 1).trim() : theme.headline && tagline ? about : null;

  const reviews = site.reviews ?? [];
  const [featured, ...moreReviews] = reviews;
  const sigService = mainServices.length >= 4 ? mainServices.find((s) => s.id === site.branding?.site_theme?.signature?.serviceId) ?? [...mainServices].sort((a, b) => b.price_cents - a.price_cents)[0] : null;
  const sigImage = site.branding?.site_theme?.signature?.image ?? galleryPhotos.find((g) => g.src !== cover && g.src !== d.closingImage)?.src ?? null;
  const order = ['servicios', site.staff.length ? 'equipo' : '', galleryPhotos.length ? 'trabajos' : '', featured ? 'opiniones' : '', site.memberships?.length ? 'membresias' : '', 'visitanos'].filter(Boolean);
  const num = (k: string) => String(order.indexOf(k) + 1).padStart(2, '0');
  const nameSize = main.length <= 8 ? 'text-[clamp(4.4rem,19vw,11rem)]' : main.length <= 14 ? 'text-[clamp(3.4rem,13vw,8.5rem)]' : 'text-[clamp(2.6rem,9vw,6.5rem)]';
  const years = theme.since ? Math.max(1, new Date().getFullYear() - theme.since) : null;
  const stats = [
    rating ? { value: rating.toFixed(1), label: `${reviewCount} ${reviewCount === 1 ? 'opinión' : 'opiniones'}`, star: true, href: '/opiniones' } : null,
    site.staff.length ? { value: String(site.staff.length), label: site.staff.length === 1 ? 'barbero' : 'barberos', href: '/equipo' } : null,
    mainServices.length ? { value: String(mainServices.length), label: mainServices.length === 1 ? 'servicio' : 'servicios', href: '/servicios' } : null,
    multiLoc ? { value: String(site.locations.length), label: 'sedes', href: '/visitanos' } : years ? { value: String(years), label: years === 1 ? 'año' : 'años' } : null,
  ].filter(Boolean) as Array<{ value: string; label: string; star?: boolean; href?: string }>;

  // Datos estructurados
  const abs = (u: string) => (/^https?:\/\//.test(u) ? u : `https://${tenant}.date.pe${u}`);
  const postal = (l: TenantSite['locations'][number]) => ({ '@type': 'PostalAddress', streetAddress: l.address ?? undefined, addressLocality: l.district ?? undefined, addressRegion: l.province ?? 'Lima', addressCountry: 'PE' });
  const geo = (l: TenantSite['locations'][number]) => (l.lat != null && l.lng != null ? { '@type': 'GeoCoordinates', latitude: l.lat, longitude: l.lng } : undefined);
  const openingHoursSpecification = hours.length ? hours.map((h) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: `https://schema.org/${SCHEMA_DAYS[h.day_of_week]}`, opens: h.open.slice(0, 5), closes: h.close.slice(0, 5) })) : undefined;
  const catalog = new Map<string, TenantSite['services']>();
  for (const s of mainServices) catalog.set(s.category?.trim() || 'Otros', [...(catalog.get(s.category?.trim() || 'Otros') ?? []), s]);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HairSalon',
    name: site.tenant.name,
    description: site.branding?.tagline ?? undefined,
    image: site.branding?.cover_url ? abs(site.branding.cover_url) : undefined,
    logo: site.branding?.logo_url ? abs(site.branding.logo_url) : undefined,
    url: `https://${tenant}.date.pe`,
    priceRange: 'S/',
    telephone: loc?.phone ?? undefined,
    address: loc ? postal(loc) : undefined,
    geo: loc ? geo(loc) : undefined,
    openingHoursSpecification,
    sameAs: instagram ? [instagram] : undefined,
    ...(rating ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: rating, reviewCount } } : {}),
    ...(multiLoc ? { department: site.locations.map((l) => ({ '@type': 'HairSalon', name: `${site.tenant.name}, ${l.name}`, url: `https://${tenant}.date.pe/reservar?sede=${l.id}`, telephone: l.phone ?? undefined, address: postal(l), geo: geo(l), openingHoursSpecification })) } : {}),
    ...(mainServices.length
      ? {
          hasOfferCatalog: {
            '@type': 'OfferCatalog',
            name: 'Servicios',
            itemListElement: [...catalog.entries()].map(([name, items]) => ({ '@type': 'OfferCatalog', name, itemListElement: items.map((s) => ({ '@type': 'Offer', price: (s.price_cents / 100).toFixed(2), priceCurrency: 'PEN', itemOffered: { '@type': 'Service', name: s.name, description: s.description ?? undefined } })) })),
          },
        }
      : {}),
  };

  const heroCtas = (light: boolean) => (
    <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      {available ? <ReservarLink className="s-btn">Reservar cita</ReservarLink> : <span className="s-btn-ghost opacity-80"><CalendarOff size={18} strokeWidth={1.75} /> Reservas en pausa</span>}
      {d.showQueue ? (
        <Link href="/fila" className={`s-btn-ghost ${light ? '!border-white/40 text-white hover:!border-white' : ''}`}><UsersRound size={18} strokeWidth={1.75} /> Sacar turno sin cita</Link>
      ) : (
        <Link href="/servicios" className={`s-btn-ghost ${light ? '!border-white/40 text-white hover:!border-white' : ''}`}>Ver servicios</Link>
      )}
    </div>
  );
  const heroMeta = (light: boolean) => (
    <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-[15px]">
      {rating && (
        <Link href="/opiniones" className="tnum flex items-center gap-1.5 font-semibold">
          <Star size={16} strokeWidth={0} className="fill-current" /> {rating.toFixed(1)}
          <span className="font-normal opacity-75">{reviewCount} {reviewCount === 1 ? 'opinión' : 'opiniones'}</span>
        </Link>
      )}
      <OpenStatus hours={hours} tz={tz} initial={status} light={light} />
      {d.from != null && <span className="tnum opacity-80">Desde {soles(d.from)}</span>}
      {available && mainServices[0] && <NextSlot tenant={tenant} serviceId={mainServices[0].id} tz={tz} light={light} />}
    </div>
  );
  const nameBlock = (
    <h1 className="s-display">
      {prefix && <span className="s-prefix mb-2 block">{prefix}</span>}
      <span className={`block ${nameSize}`}>{main}</span>
    </h1>
  );

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />

      {/* ============================== Portada ============================== */}
      {photoHero ? (
        <section id="inicio" className="relative flex min-h-[100svh] flex-col justify-end overflow-hidden text-white md:min-h-[94vh]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover!} alt={`Interior de ${site.tenant.name}`} fetchPriority="high" className="s-hero-media s-mood-photo absolute inset-0 h-full w-full object-cover" style={{ objectPosition: `${theme.focus}% 50%` }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 30%, rgba(0,0,0,0.4) 58%, rgba(0,0,0,0.88) 100%)' }} />
          <div className="absolute inset-0 hidden md:block" style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.35) 38%, rgba(0,0,0,0) 68%)' }} />
          <div className="s-hero-text relative mx-auto w-full max-w-[1240px] px-5 pb-28 pt-32 md:px-10 md:pb-20">
            <p className="s-rise s-eyebrow !text-[13px] !text-white">{eyebrow}</p>
            <div className="s-rise s-rise-2 mt-5">{nameBlock}</div>
            {headline && <p className="s-rise s-rise-3 mt-6 max-w-[34ch] text-[clamp(1.15rem,2.2vw,1.5rem)] leading-snug text-white/90">{headline}</p>}
            <div className="s-rise s-rise-4">
              {heroCtas(true)}
              {heroMeta(true)}
            </div>
          </div>
          <a href="#historia" aria-label="Bajar" className="absolute bottom-6 right-6 hidden h-12 w-12 items-center justify-center rounded-full border border-white/30 text-white/80 transition-colors hover:border-white md:flex">
            <ArrowDown size={18} strokeWidth={1.75} />
          </a>
        </section>
      ) : (
        <section id="inicio" className="relative overflow-hidden pt-16 md:pt-[72px]">
          <div className="mx-auto grid max-w-[1240px] items-end gap-10 px-5 pb-16 pt-16 md:grid-cols-12 md:px-10 md:pb-24 md:pt-24">
            <div className="md:col-span-7">
              <p className="s-rise s-eyebrow">{eyebrow}</p>
              <div className="s-rise s-rise-2 mt-5">{nameBlock}</div>
              {headline && <p className="s-rise s-rise-3 s-mute mt-6 max-w-[34ch] text-[clamp(1.15rem,2.2vw,1.5rem)] leading-snug">{headline}</p>}
              <div className="s-rise s-rise-4">
                {heroCtas(false)}
                {heroMeta(false)}
              </div>
            </div>
            <div className="relative md:col-span-5">
              {cover || galleryPhotos.length ? (
                <div className="grid grid-cols-5 grid-rows-6 gap-3" style={{ height: 'clamp(320px, 42vw, 560px)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cover ?? galleryPhotos[0].src} alt="" className="s-radius s-mood-photo col-span-3 row-span-6 h-full w-full object-cover" />
                  {galleryPhotos.filter((g) => g.src !== cover).slice(0, 2).map((g, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={g.src} src={g.src} alt="" className={`s-radius col-span-2 h-full w-full object-cover ${i === 0 ? 'row-span-4' : 'row-span-2'}`} />
                  ))}
                </div>
              ) : (
                <div className="s-surface s-radius relative flex aspect-square items-center justify-center overflow-hidden">
                  <div className="s-pole absolute inset-x-0 top-0 h-6" aria-hidden />
                  <div className="s-pole absolute inset-x-0 bottom-0 h-6" aria-hidden />
                  {site.branding?.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={site.branding.logo_url} alt="" className="h-1/2 w-1/2 rounded-full object-cover" />
                  ) : (
                    <span className="s-display text-[clamp(8rem,20vw,14rem)]" style={{ color: 'var(--accent-text)' }}>{initial}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {!available && (
        <div className="s-surface">
          <div className="mx-auto flex max-w-[1240px] items-start gap-3 px-5 py-4 text-[15px] md:px-10">
            <CalendarOff size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" />
            <p><span className="font-semibold">Esta barbería no está recibiendo reservas por ahora.</span> <span className="s-mute">{whatsapp ? 'Escríbeles por WhatsApp para coordinar tu cita.' : 'Vuelve a intentarlo pronto.'}</span></p>
          </div>
        </div>
      )}

      {/* Cinta con los servicios de la casa */}
      {theme.marquee && mainServices.length >= 3 && (
        <div className="s-line overflow-hidden border-y py-5" aria-hidden>
          <div className="s-marquee">
            {[0, 1].map((k) => (
              <div key={k} className="flex shrink-0 items-center">
                {[...mainServices, ...mainServices].slice(0, Math.max(8, mainServices.length)).map((s, i) => (
                  <span key={`${k}-${i}`} className="s-display flex items-center gap-8 px-8 text-[clamp(1.6rem,3.2vw,2.6rem)] leading-none">
                    {s.name}
                    <Scissors size={18} strokeWidth={1.5} style={{ color: 'var(--accent-text)' }} />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <main className="mx-auto max-w-[1240px] px-5 md:px-10">
        {/* ============================== La casa ============================== */}
        <section id="historia" className="s-reveal scroll-mt-24 py-20 md:py-28">
          <div className="grid gap-12 md:grid-cols-12 md:gap-16">
            <div className="md:col-span-7">
              <p className="s-eyebrow">La casa</p>
              <p className="s-display s-casa mt-5 text-[clamp(2rem,4.4vw,3.4rem)] !leading-[1.08]">{casaTitle ?? `Bienvenido a ${site.tenant.name}`}</p>
              {casaBody && <p className="s-mute mt-6 max-w-[56ch] text-[18px] leading-relaxed">{casaBody}</p>}
              <div className="mt-8 flex flex-wrap gap-2">
                {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="s-chip"><MessageCircle size={16} strokeWidth={1.75} /> WhatsApp</a>}
                {instagram && <a href={instagram} target="_blank" rel="noopener noreferrer" className="s-chip"><Camera size={16} strokeWidth={1.75} /> Instagram</a>}
                {!multiLoc && loc && <a href={d.mapsFor(loc)} target="_blank" rel="noopener noreferrer" className="s-chip"><Navigation size={16} strokeWidth={1.75} /> Cómo llegar</a>}
                {!multiLoc && loc?.phone && <a href={d.telHref(loc.phone)} className="s-chip"><Phone size={16} strokeWidth={1.75} /> Llamar</a>}
              </div>
            </div>
            {stats.length > 0 && (
              <dl className={`grid content-end gap-px self-end overflow-hidden md:col-span-5 ${stats.length === 3 ? 'grid-cols-3' : stats.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`} style={{ background: 'var(--s-line)' }}>
                {stats.map((s, i) => {
                  const body = (
                    <>
                      <dt className="sr-only">{s.label}</dt>
                      <dd>
                        <span className="s-display flex items-center gap-2 text-[clamp(2.6rem,5vw,3.8rem)]">
                          {s.value}
                          {s.star && <Star size={26} strokeWidth={0} className="fill-current" style={{ color: 'var(--accent-text)' }} />}
                        </span>
                        <span className="s-mute mt-2 block text-[15px]">{s.label}</span>
                      </dd>
                    </>
                  );
                  const cls = `s-bg block py-6 pr-4 md:pr-6 ${i % (stats.length === 3 ? 3 : 2) === 0 ? 'pl-0' : 'pl-5 md:pl-6'}`;
                  return s.href ? <Link key={s.label} href={s.href} className={`${cls} transition-opacity hover:opacity-75`}>{body}</Link> : <div key={s.label} className={cls}>{body}</div>;
                })}
              </dl>
            )}
          </div>
          {multiLoc && <div className="mt-14"><SedePicker /></div>}
        </section>

        {/* ============================== La firma de la casa ============================== */}
        {sigService && sigImage && (
          <section aria-label="La firma de la casa" className="s-reveal pb-20 md:pb-28">
            <div className="s-surface s-radius grid overflow-hidden md:grid-cols-2">
              <div className="s-img-zoom relative min-h-[320px] overflow-hidden md:min-h-[520px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sigImage} alt={sigService.name} loading="lazy" className="s-mood-photo absolute inset-0 h-full w-full object-cover" />
              </div>
              <div className="flex flex-col justify-center p-8 md:p-14">
                <p className="s-eyebrow">La firma de la casa</p>
                <p className="s-display mt-5 text-[clamp(2.6rem,5.5vw,4.4rem)]">{sigService.name}</p>
                {sigService.description && <p className="s-mute mt-5 max-w-[40ch] text-[18px] leading-relaxed">{sigService.description}.</p>}
                <div className="s-line mt-8 flex items-center gap-6 border-t pt-6">
                  <span className="s-display tnum text-[40px]">{soles(sigService.price_cents).replace('.00', '')}</span>
                  <span className="s-mute text-[15px]">{sigService.duration_min} minutos</span>
                </div>
                {available && <ReservarLink servicio={sigService.id} className="s-btn mt-8 self-start">Reservar {/^ritual/i.test(sigService.name) ? 'el ritual' : 'ahora'}</ReservarLink>}
              </div>
            </div>
          </section>
        )}

        {/* ============================== Servicios (adelanto) ============================== */}
        <section id="servicios" className="s-reveal s-line scroll-mt-24 border-t py-20 md:py-28">
          <Head n={num('servicios')} eyebrow="Servicios" title={mood.leader ? 'La *carta*' : 'Nuestros *servicios*'} sub={available ? 'Toca un servicio para reservarlo. Eliges barbero y hora en el siguiente paso.' : undefined} />
          {site.services.length > 0 ? (
            <div className="mt-6 max-w-[980px]">
              <ServiceMenu services={site.services} available={available} leader={mood.leader} limit={6} tenant={tenant} tz={tz} />
              {mainServices.length > 6 || site.services.some((s) => s.is_addon) ? (
                <div className="mt-10"><MoreLink href="/servicios">Ver la carta completa ({mainServices.length})</MoreLink></div>
              ) : null}
            </div>
          ) : (
            <p className="s-mute mt-6 text-[16px]">Pronto publicaremos nuestros servicios.</p>
          )}
        </section>

        {/* ============================== Equipo ============================== */}
        {site.staff.length > 0 && (
          <section id="equipo" className="s-reveal s-line scroll-mt-24 border-t py-20 md:py-28">
            <Head n={num('equipo')} eyebrow={solo ? 'Tu barbero' : 'Equipo'} title={solo ? 'Quién te *atiende*' : 'Las manos *detrás*'} action={!solo ? <MoreLink href="/equipo">Conoce al equipo</MoreLink> : undefined} />
            <TeamSection staff={site.staff} available={available} profiles />
          </section>
        )}

        {/* ============================== Trabajos ============================== */}
        {galleryPhotos.length > 0 && (
          <section id="trabajos" className="s-reveal s-line scroll-mt-24 border-t py-20 md:py-28">
            <Head n={num('trabajos')} eyebrow="Trabajos" title="El trabajo *habla*" action={<MoreLink href="/trabajos">Ver todos los trabajos</MoreLink>} />
            <GalleryGrid images={galleryPhotos} max={5} moreHref="/trabajos" />
          </section>
        )}

        {/* ============================== Opiniones ============================== */}
        {featured && (
          <section id="opiniones" className="s-reveal s-line scroll-mt-24 border-t py-20 md:py-28">
            <Head
              n={num('opiniones')}
              eyebrow="Opiniones"
              title="Lo que *dicen*"
              sub={rating ? `${rating.toFixed(1)} de 5, con ${reviewCount} ${reviewCount === 1 ? 'opinión verificada' : 'opiniones verificadas'} de clientes que reservaron.` : undefined}
              action={reviewCount > 4 ? <MoreLink href="/opiniones">Leer las {reviewCount} opiniones</MoreLink> : undefined}
            />
            <figure className="mt-12 max-w-[980px]">
              <div className="flex gap-1" aria-label={`${featured.stars} de 5`} style={{ color: 'var(--accent-text)' }}>
                {Array.from({ length: 5 }, (_, k) => <Star key={k} size={20} strokeWidth={0} className={k < featured.stars ? 'fill-current' : 'fill-current opacity-20'} />)}
              </div>
              <blockquote className="s-display mt-6 text-[clamp(1.8rem,4vw,3.2rem)] !leading-[1.1] normal-case">{featured.comment}</blockquote>
              <figcaption className="s-mute mt-6 text-[16px]"><span className="s-ink font-semibold">{featured.client_name ?? 'Cliente'}</span>{featured.staff_name ? `, con ${featured.staff_name}` : ''}</figcaption>
            </figure>
            {moreReviews.length > 0 && (
              <div className="s-no-scrollbar -mx-5 mt-14 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
                {moreReviews.slice(0, 3).map((r, i) => (
                  <figure key={i} className="s-surface s-radius flex w-[82%] shrink-0 snap-start flex-col p-6 md:w-auto">
                    <div className="flex gap-0.5" aria-label={`${r.stars} de 5`}>
                      {Array.from({ length: 5 }, (_, k) => <Star key={k} size={14} strokeWidth={0} className={k < r.stars ? 'fill-current' : 'fill-current opacity-20'} />)}
                    </div>
                    <blockquote className="mt-4 flex-1 text-[16px] leading-relaxed">{r.comment}</blockquote>
                    <figcaption className="s-mute mt-5 text-[14px]"><span className="s-ink font-semibold">{r.client_name ?? 'Cliente'}</span>{r.staff_name ? `, con ${r.staff_name}` : ''}</figcaption>
                    {r.reply && <p className="s-line s-mute mt-4 border-l-2 pl-3 text-[14px]"><span className="s-ink font-semibold">Respuesta de la casa.</span> {r.reply}</p>}
                  </figure>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ============================== Sin cita, regalos y membresías ============================== */}
        {(d.showQueue || d.showGifts || (site.memberships && site.memberships.length > 0)) && (
          <section aria-label="Más formas de venir" className="s-reveal s-line border-t py-20 md:py-28">
            <div className={`grid gap-4 ${d.showQueue && d.showGifts ? 'md:grid-cols-2' : ''}`}>
              {d.showQueue && <QueueCard tenant={tenant} />}
              {d.showGifts && (
                <Link href="/regalos" className="s-surface s-radius group flex h-full flex-col justify-between gap-8 p-6 md:p-8">
                  <span className="s-eyebrow">Para regalar</span>
                  <div>
                    <p className="s-display text-[34px] md:text-[40px]">Regala un corte</p>
                    <p className="s-mute mt-2 text-[16px]">{d.features.giftcards_online && d.features.packages ? 'Gift cards y paquetes, listos en un minuto.' : d.features.giftcards_online ? 'Gift card por correo, lista en un minuto.' : 'Paquetes de cortes para ti o para regalar.'}</p>
                  </div>
                  <span className="flex items-center gap-2 text-[15px] font-semibold"><Gift size={18} strokeWidth={1.75} /> Elegir regalo <ChevronRight size={18} strokeWidth={1.75} className="nudge-x" /></span>
                </Link>
              )}
            </div>
            {site.memberships && site.memberships.length > 0 && (
              <div className="mt-16">
                <Head n={num('membresias')} eyebrow="Membresías" title="Siempre *impecable*" sub="Un pago al mes y vienes cuando lo necesitas. Pregunta por ellas en tu próxima visita." />
                <div className="mt-10 grid gap-4 md:grid-cols-3">
                  {site.memberships.map((m) => (
                    <div key={m.id} className="s-line s-radius border p-6 md:p-8">
                      <div className="s-eyebrow">{m.name}</div>
                      <div className="tnum mt-4 flex items-baseline gap-1">
                        <span className="s-display text-[48px]">{soles(m.price_cents).replace('.00', '')}</span>
                        <span className="s-mute text-[15px]">al {m.period === 'year' ? 'año' : 'mes'}</span>
                      </div>
                      {m.description && <p className="s-mute mt-2 text-[15px]">{m.description}</p>}
                      {m.perks && (
                        <ul className="mt-6 space-y-2.5 text-[15px]">
                          {m.perks.split('|').map((p) => (
                            <li key={p} className="flex items-start gap-2.5"><Check size={17} strokeWidth={2} className="mt-0.5 shrink-0" style={{ color: 'var(--accent-text)' }} />{p}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ============================== Visítanos ============================== */}
        <section id="visitanos" className="s-reveal s-line scroll-mt-24 border-t py-20 md:py-28">
          <Head n={num('visitanos')} eyebrow={multiLoc ? 'Sedes' : 'Visítanos'} title={multiLoc ? `${site.locations.length} sedes, *un estilo*` : 'Te *esperamos*'} action={<MoreLink href="/visitanos">{multiLoc ? 'Ver todas las sedes' : 'Cómo llegar'}</MoreLink>} />
          <div className="mt-12 grid gap-10 md:grid-cols-12 md:gap-14">
            <div className="md:col-span-7">
              {d.mapPoints.length > 0 ? (
                <SiteMap points={d.mapPoints} palette={d.mapPalette} accent={theme.accent} onAccent={theme.onAccent} logo={site.branding?.logo_url ?? null} initial={initial} className="h-[340px] md:h-[440px]" />
              ) : loc ? (
                <div className="s-surface s-radius flex h-full min-h-[240px] flex-col justify-end p-8">
                  <MapPin size={24} strokeWidth={1.5} className="s-mute" />
                  <p className="s-display mt-4 text-[32px]">{loc.address ?? loc.name}</p>
                </div>
              ) : null}
            </div>
            <div className="md:col-span-5">
              {multiLoc ? (
                <ul className="s-divide">
                  {site.locations.map((l) => (
                    <li key={l.id} className="py-4">
                      <p className="s-display text-[26px]">{l.name}</p>
                      <p className="s-mute mt-1 text-[15px]">{[l.address, l.district].filter(Boolean).join(', ')}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                loc && (
                  <>
                    <p className="s-display text-[clamp(2rem,3.4vw,2.8rem)] !leading-[1.05]">{loc.address ?? loc.name}</p>
                    <p className="s-mute mt-2 text-[17px]">{[loc.district, loc.province ?? 'Lima'].filter(Boolean).join(', ')}</p>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <a href={d.mapsFor(loc)} target="_blank" rel="noopener noreferrer" className="s-btn !min-h-[46px] !text-[15px]"><Navigation size={17} strokeWidth={1.75} /> Cómo llegar</a>
                      {loc.phone && <a href={d.telHref(loc.phone)} className="s-btn-ghost !min-h-[46px] !text-[15px]"><Phone size={17} strokeWidth={1.75} /> {loc.phone}</a>}
                    </div>
                  </>
                )
              )}
              {hours.length > 0 && (
                <div className="mt-8">
                  <OpenStatus hours={hours} tz={tz} initial={status} className="text-[16px]" />
                  <div className="mt-3"><HoursTable d={d} /></div>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      <Closing d={d} />
    </>
  );
}
