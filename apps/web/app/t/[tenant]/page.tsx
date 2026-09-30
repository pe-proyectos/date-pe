import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Star, MapPin, Navigation, Check, CalendarOff, Gift, ChevronRight, ExternalLink, BookOpen, Phone, Scissors, UsersRound, Camera, MessageCircle, ArrowDown } from 'lucide-react';
import { apiFetch, soles, type TenantSite } from '@/lib/api';
import { QueueCard } from './_parts/QueueCard';
import { SedeProvider, SedePicker, ReservarLink, type PublicLocation } from './_parts/sede';
import { ServiceMenu } from './_parts/ServiceMenu';
import { TeamSection } from './_parts/TeamSection';
import { OpenStatus } from './_parts/OpenStatus';
import { GalleryGrid } from './_parts/GalleryGrid';
import { openState, weekTable, nowIn } from './_parts/hours';
import { SiteHeader } from './_site/SiteHeader';
import { fontVars } from './_site/fonts';
import { resolveTheme, themeVars } from './_site/theme';
import './_site/site.css';

async function getSite(tenant: string): Promise<TenantSite | null> {
  try {
    return await apiFetch<TenantSite>('/api/public/site', { tenantSlug: tenant });
  } catch {
    return null;
  }
}

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
    alternates: { canonical: `https://${tenant}.date.pe` },
    openGraph: { title, description, url: `https://${tenant}.date.pe`, images: [img] },
    appleWebApp: { capable: true, title: site.tenant.name, statusBarStyle: 'default' },
  };
}

const SCHEMA_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Barranco", "Barranco y Miraflores", "Barranco, Miraflores y 2 más". */
function listDistricts(names: string[]) {
  const u = [...new Set(names.filter(Boolean))];
  if (u.length <= 1) return u[0] ?? '';
  if (u.length === 2) return `${u[0]} y ${u[1]}`;
  if (u.length === 3) return `${u[0]}, ${u[1]} y ${u[2]}`;
  return `${u[0]}, ${u[1]} y ${u.length - 2} más`;
}

/** "Barbería Juana" se muestra como "Barbería" chico y "Juana" en grande. */
function splitName(name: string): { prefix: string | null; main: string } {
  const m = name.match(/^(barber[ií]a|barbershop|barber shop|peluquer[ií]a)\s+(.+)$/i);
  return m ? { prefix: m[1], main: m[2] } : { prefix: null, main: name };
}

/** Título de sección con número, rótulo y frase grande. La palabra entre * va resaltada. */
function Head({ n, eyebrow, title, sub, action }: { n: string; eyebrow: string; title: string; sub?: string; action?: React.ReactNode }) {
  const [a, b, c] = title.split('*');
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="min-w-0">
        <p className="s-eyebrow flex items-center gap-3">
          <span className="tnum">{n}</span>
          <span className="s-line h-px w-8 border-t" aria-hidden />
          {eyebrow}
        </p>
        <h2 className="s-display mt-4 text-[clamp(2.6rem,7vw,5rem)]">
          {a}
          {b && <em>{b}</em>}
          {c}
        </h2>
        {sub && <p className="s-mute mt-4 max-w-[52ch] text-[17px] leading-relaxed">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export default async function TenantHome({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const site = await getSite(tenant);
  if (!site) notFound();

  const theme = resolveTheme(site.branding?.site_theme, site.branding?.color_primary);
  const { mood } = theme;
  const loc = site.locations[0];
  const rating = site.rating?.avg ? Number(site.rating.avg) : null;
  const reviewCount = Number(site.rating?.count ?? 0);
  const mainServices = site.services.filter((s) => !s.is_addon);
  const available = site.tenant.available !== false;
  const multiLoc = site.locations.length >= 2;
  const mapsFor = (l: TenantSite['locations'][number]) =>
    l.lat != null && l.lng != null
      ? `https://www.google.com/maps/search/?api=1&query=${l.lat},${l.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${site.tenant.name} ${[l.address ?? l.name, l.district].filter(Boolean).join(', ')}`)}`;
  const publicLocations: PublicLocation[] = site.locations.map((l) => ({ id: l.id, name: l.name, address: l.address, district: l.district, maps: mapsFor(l) }));
  const from = mainServices.length ? Math.min(...mainServices.map((s) => s.price_cents)) : null;
  const tz = site.settings?.timezone || 'America/Lima';
  const hours = site.hours ?? [];
  const status = openState(hours, tz);
  const week = weekTable(hours);
  const todayDow = nowIn(tz).dow;
  const todayRow = week.find((d) => d.dow === todayDow);
  const features = site.features ?? {};
  const showQueue = available && !!features.queue;
  const showGifts = available && !!(features.giftcards_online || features.packages);
  const gallery = (site.branding?.gallery ?? []).filter((g) => g?.url);
  const galleryPhotos = gallery.map((g, i) => ({ src: g.url, alt: g.caption || `Foto ${i + 1} de ${site.tenant.name}` }));
  const cover = site.branding?.cover_url ?? galleryPhotos[0]?.src ?? null;
  const photoHero = theme.hero === 'imagen' && !!cover;
  const closingImage = galleryPhotos.find((g) => g.src !== cover)?.src ?? cover;
  const whatsapp = site.branding?.whatsapp ? `https://wa.me/${site.branding.whatsapp.replace(/[^0-9]/g, '')}` : null;
  const ig = site.branding?.instagram?.trim();
  const instagram = ig ? (/^https?:\/\//i.test(ig) ? ig : `https://instagram.com/${ig.replace(/^@/, '').replace(/^(www\.)?instagram\.com\//i, '')}`) : null;
  const telHref = (p: string) => `tel:${p.replace(/[^0-9+]/g, '')}`;
  const staffIn = (id: string) => site.staff.filter((b) => !b.location_id || b.location_id === id).length;
  const { prefix, main } = splitName(site.tenant.name);
  const initial = main.charAt(0).toUpperCase();
  const place = multiLoc ? `${site.locations.length} sedes en ${listDistricts(site.locations.map((l) => l.district ?? l.name))}` : [...new Set([loc?.district, loc?.province ?? 'Lima'].filter(Boolean))].join(', ');
  const eyebrow = [theme.since ? `Desde ${theme.since}` : null, multiLoc || /^barber/i.test(site.tenant.name) ? place : `Barbería en ${place}`].filter(Boolean).join(', ');
  const headline = theme.headline ?? site.branding?.tagline ?? null;
  // "La casa" no repite la frase de la portada: cuenta la historia
  const tagline = site.branding?.tagline ?? null;
  const about = site.branding?.about ?? null;
  const casaTitle = theme.headline ? tagline ?? about : about ?? tagline;
  const casaBody = theme.headline && tagline ? about : null;
  const solo = site.staff.length === 1;
  const reviews = site.reviews ?? [];
  const [featured, ...moreReviews] = reviews;

  // Numeración de secciones seguida, según las que existen
  const order = ['servicios', site.staff.length ? 'equipo' : '', galleryPhotos.length ? 'trabajos' : '', featured ? 'opiniones' : '', site.memberships?.length ? 'membresias' : '', 'visitanos'].filter(Boolean);
  const num = (k: string) => String(order.indexOf(k) + 1).padStart(2, '0');

  const nav = [
    { href: '#servicios', label: 'Servicios' },
    { href: '#equipo', label: solo ? 'Barbero' : 'Equipo' },
    ...(galleryPhotos.length ? [{ href: '#trabajos', label: 'Trabajos' }] : []),
    ...(reviews.length ? [{ href: '#opiniones', label: 'Opiniones' }] : []),
    { href: '#visitanos', label: multiLoc ? 'Sedes' : 'Visítanos' },
  ];

  // Datos estructurados
  const abs = (u: string) => (/^https?:\/\//.test(u) ? u : `https://${tenant}.date.pe${u}`);
  const postal = (l: TenantSite['locations'][number]) => ({ '@type': 'PostalAddress', streetAddress: l.address ?? undefined, addressLocality: l.district ?? undefined, addressRegion: l.province ?? 'Lima', addressCountry: 'PE' });
  const geo = (l: TenantSite['locations'][number]) => (l.lat != null && l.lng != null ? { '@type': 'GeoCoordinates', latitude: l.lat, longitude: l.lng } : undefined);
  const openingHoursSpecification = hours.length
    ? hours.map((h) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: `https://schema.org/${SCHEMA_DAYS[h.day_of_week]}`, opens: h.open.slice(0, 5), closes: h.close.slice(0, 5) }))
    : undefined;
  const catalog = new Map<string, TenantSite['services']>();
  for (const s of mainServices) {
    const k = s.category?.trim() || 'Otros';
    catalog.set(k, [...(catalog.get(k) ?? []), s]);
  }
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
    ...(multiLoc
      ? { department: site.locations.map((l) => ({ '@type': 'HairSalon', name: `${site.tenant.name}, ${l.name}`, url: `https://${tenant}.date.pe/reservar?sede=${l.id}`, telephone: l.phone ?? undefined, address: postal(l), geo: geo(l), openingHoursSpecification })) }
      : {}),
    ...(mainServices.length
      ? {
          hasOfferCatalog: {
            '@type': 'OfferCatalog',
            name: 'Servicios',
            itemListElement: [...catalog.entries()].map(([name, items]) => ({
              '@type': 'OfferCatalog',
              name,
              itemListElement: items.map((s) => ({ '@type': 'Offer', price: (s.price_cents / 100).toFixed(2), priceCurrency: 'PEN', itemOffered: { '@type': 'Service', name: s.name, description: s.description ?? undefined } })),
            })),
          },
        }
      : {}),
  };

  const stats = [
    rating ? { value: rating.toFixed(1), label: `${reviewCount} ${reviewCount === 1 ? 'opinión' : 'opiniones'}`, star: true } : null,
    site.staff.length ? { value: String(site.staff.length), label: site.staff.length === 1 ? 'barbero' : 'barberos' } : null,
    mainServices.length ? { value: String(mainServices.length), label: mainServices.length === 1 ? 'servicio' : 'servicios' } : null,
    multiLoc ? { value: String(site.locations.length), label: 'sedes' } : theme.since ? { value: String(new Date().getFullYear() - theme.since || 1), label: new Date().getFullYear() - theme.since === 1 ? 'año' : 'años' } : null,
  ].filter(Boolean) as Array<{ value: string; label: string; star?: boolean }>;

  const heroCtas = (light: boolean) => (
    <div className="mt-9 flex flex-wrap gap-3">
      {available ? (
        <ReservarLink className="s-btn">Reservar cita</ReservarLink>
      ) : (
        <span className="s-btn-ghost opacity-80"><CalendarOff size={18} strokeWidth={1.75} /> Reservas en pausa</span>
      )}
      {showQueue ? (
        <Link href="/fila" className={`s-btn-ghost ${light ? '!border-white/40 text-white hover:!border-white' : ''}`}>
          <UsersRound size={18} strokeWidth={1.75} /> Sacar turno sin cita
        </Link>
      ) : (
        <a href="#servicios" className={`s-btn-ghost ${light ? '!border-white/40 text-white hover:!border-white' : ''}`}>Ver servicios</a>
      )}
    </div>
  );

  const heroMeta = (light: boolean) => (
    <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-[15px]">
      {rating && (
        <a href="#opiniones" className="tnum flex items-center gap-1.5 font-semibold">
          <Star size={16} strokeWidth={0} className="fill-current" /> {rating.toFixed(1)}
          <span className="font-normal opacity-75">{reviewCount} {reviewCount === 1 ? 'opinión' : 'opiniones'}</span>
        </a>
      )}
      <OpenStatus hours={hours} tz={tz} initial={status} light={light} />
      {from != null && <span className="tnum opacity-80">Desde {soles(from)}</span>}
    </div>
  );

  // Nombres cortos van enormes; los largos bajan de tamaño para no partirse feo
  const nameSize = main.length <= 8 ? 'text-[clamp(4.4rem,19vw,11rem)]' : main.length <= 14 ? 'text-[clamp(3.4rem,13vw,8.5rem)]' : 'text-[clamp(2.6rem,9vw,6.5rem)]';
  const nameBlock = () => (
    <h1 className="s-display">
      {prefix && <span className="s-prefix mb-2 block">{prefix}</span>}
      <span className={`block ${nameSize}`}>{main}</span>
    </h1>
  );

  const hoursTable = hours.length > 0 && (
    <dl className="s-divide text-[16px]">
      {week.map((d) => {
        const today = d.dow === todayDow;
        return (
          <div key={d.dow} className={`flex items-center justify-between gap-4 py-3 ${today ? 'font-semibold' : ''}`}>
            <dt className={`flex items-center gap-2.5 ${today ? '' : 's-mute'}`}>
              {today && <span className="h-2 w-2 rounded-full" style={{ background: 'var(--accent-text)' }} aria-hidden />}
              {d.day}
              {today && <span className="s-mute text-[13px] font-normal">hoy</span>}
            </dt>
            <dd className={`tnum text-right ${d.time ? '' : 's-mute'}`}>{d.time ?? 'Cerrado'}</dd>
          </div>
        );
      })}
    </dl>
  );

  return (
    <div className={`site ${fontVars}`} data-mood={mood.id} style={themeVars(theme) as React.CSSProperties}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />

      <SedeProvider slug={tenant} locations={publicLocations}>
        <SiteHeader name={site.tenant.name} logo={site.branding?.logo_url ?? null} initial={initial} nav={nav} available={available} overHero={photoHero} />

        {/* ============================== Portada ============================== */}
        {photoHero ? (
          <section id="inicio" className="relative flex min-h-[100svh] flex-col justify-end overflow-hidden text-white md:min-h-[94vh]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover!} alt={`Interior de ${site.tenant.name}`} fetchPriority="high" className="s-hero-media s-mood-photo absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.12) 32%, rgba(0,0,0,0.35) 60%, rgba(0,0,0,0.86) 100%)' }} />
            <div className="relative mx-auto w-full max-w-[1240px] px-5 pb-28 pt-32 md:px-10 md:pb-20">
              {site.tenant.is_demo && <p className="s-rise mb-6 inline-flex rounded-full border border-white/30 px-3 py-1 text-[12px] font-medium">Barbería de demostración. Datos de ejemplo.</p>}
              <p className="s-rise s-eyebrow !text-white/80">{eyebrow}</p>
              <div className="s-rise s-rise-2 mt-5">{nameBlock()}</div>
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
                {site.tenant.is_demo && <p className="s-line s-mute mb-6 inline-flex rounded-full border px-3 py-1 text-[12px] font-medium">Barbería de demostración. Datos de ejemplo.</p>}
                <p className="s-rise s-eyebrow">{eyebrow}</p>
                <div className="s-rise s-rise-2 mt-5">{nameBlock()}</div>
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
                    <img src={cover ?? galleryPhotos[0].src} alt="" className="s-radius col-span-3 row-span-6 h-full w-full object-cover" />
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
              <p>
                <span className="font-semibold">Esta barbería no está recibiendo reservas por ahora.</span>{' '}
                <span className="s-mute">{whatsapp ? 'Escríbeles por WhatsApp para coordinar tu cita.' : 'Vuelve a intentarlo pronto.'}</span>
              </p>
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
          <section id="historia" className="scroll-mt-24 py-20 md:py-28">
            <div className="grid gap-12 md:grid-cols-12 md:gap-16">
              <div className="md:col-span-7">
                <p className="s-eyebrow">La casa</p>
                <p className="s-display s-casa mt-5 text-[clamp(2rem,4.4vw,3.4rem)] !leading-[1.08]">
                  {casaTitle ?? `Bienvenido a ${site.tenant.name}`}
                </p>
                {casaBody && <p className="s-mute mt-6 max-w-[56ch] text-[18px] leading-relaxed">{casaBody}</p>}
                <div className="mt-8 flex flex-wrap gap-2">
                  {whatsapp && (
                    <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="s-chip"><MessageCircle size={16} strokeWidth={1.75} /> WhatsApp</a>
                  )}
                  {instagram && (
                    <a href={instagram} target="_blank" rel="noopener noreferrer" className="s-chip"><Camera size={16} strokeWidth={1.75} /> Instagram</a>
                  )}
                  {!multiLoc && loc && (
                    <a href={mapsFor(loc)} target="_blank" rel="noopener noreferrer" className="s-chip"><Navigation size={16} strokeWidth={1.75} /> Cómo llegar</a>
                  )}
                  {!multiLoc && loc?.phone && (
                    <a href={telHref(loc.phone)} className="s-chip"><Phone size={16} strokeWidth={1.75} /> Llamar</a>
                  )}
                </div>
              </div>
              {stats.length > 0 && (
                <dl className={`grid content-end gap-px self-end overflow-hidden md:col-span-5 ${stats.length === 3 ? 'grid-cols-3' : stats.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`} style={{ background: 'var(--s-line)' }}>
                  {stats.map((s) => (
                    <div key={s.label} className="s-bg px-1 py-6 pr-4 first:pl-0 md:px-6">
                      <dt className="sr-only">{s.label}</dt>
                      <dd>
                        <span className="s-display flex items-center gap-2 text-[clamp(2.6rem,5vw,3.8rem)]">
                          {s.value}
                          {s.star && <Star size={26} strokeWidth={0} className="fill-current" style={{ color: 'var(--accent-text)' }} />}
                        </span>
                        <span className="s-mute mt-2 block text-[15px]">{s.label}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
            {multiLoc && (
              <div className="mt-14">
                <SedePicker />
              </div>
            )}
          </section>

          {/* ============================== Servicios ============================== */}
          <section id="servicios" className="s-line scroll-mt-24 border-t py-20 md:py-28">
            <Head
              n={num('servicios')}
              eyebrow="Servicios"
              title={mood.leader ? 'La *carta*' : 'Nuestros *servicios*'}
              sub={available ? 'Toca un servicio para reservarlo. Eliges barbero y hora en el siguiente paso.' : undefined}
            />
            {site.services.length > 0 ? (
              <div className="mt-6 max-w-[980px]">
                <ServiceMenu services={site.services} available={available} leader={mood.leader} />
              </div>
            ) : (
              <p className="s-mute mt-6 text-[16px]">Pronto publicaremos nuestros servicios.</p>
            )}
          </section>

          {/* ============================== Equipo ============================== */}
          {site.staff.length > 0 && (
            <section id="equipo" className="s-line scroll-mt-24 border-t py-20 md:py-28">
              <Head n={num('equipo')} eyebrow={solo ? 'Tu barbero' : 'Equipo'} title={solo ? 'Quién te *atiende*' : 'Las manos *detrás*'} />
              <TeamSection staff={site.staff} available={available} />
            </section>
          )}

          {/* ============================== Trabajos ============================== */}
          {galleryPhotos.length > 0 && (
            <section id="trabajos" className="s-line scroll-mt-24 border-t py-20 md:py-28">
              <Head
                n={num('trabajos')}
                eyebrow="Trabajos"
                title="El trabajo *habla*"
                action={instagram ? <a href={instagram} target="_blank" rel="noopener noreferrer" className="s-btn-ghost !min-h-[44px] !text-[15px]"><Camera size={16} strokeWidth={1.75} /> Ver más en Instagram</a> : undefined}
              />
              <GalleryGrid images={galleryPhotos} />
            </section>
          )}

          {/* ============================== Opiniones ============================== */}
          {featured && (
            <section id="opiniones" className="s-line scroll-mt-24 border-t py-20 md:py-28">
              <Head
                n={num('opiniones')}
                eyebrow="Opiniones"
                title="Lo que *dicen*"
                sub={rating ? `${rating.toFixed(1)} de 5, con ${reviewCount} ${reviewCount === 1 ? 'opinión verificada' : 'opiniones verificadas'} de clientes que reservaron.` : undefined}
              />
              <figure className="mt-12 max-w-[980px]">
                <div className="flex gap-1" aria-label={`${featured.stars} de 5`} style={{ color: 'var(--accent-text)' }}>
                  {Array.from({ length: 5 }, (_, k) => <Star key={k} size={20} strokeWidth={0} className={k < featured.stars ? 'fill-current' : 'fill-current opacity-20'} />)}
                </div>
                <blockquote className="s-display mt-6 text-[clamp(1.8rem,4vw,3.2rem)] !leading-[1.1] normal-case">
                  {featured.comment}
                </blockquote>
                <figcaption className="s-mute mt-6 text-[16px]">
                  <span className="s-ink font-semibold">{featured.client_name ?? 'Cliente'}</span>
                  {featured.staff_name ? `, con ${featured.staff_name}` : ''}
                </figcaption>
              </figure>
              {moreReviews.length > 0 && (
                <div className="s-no-scrollbar -mx-5 mt-14 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
                  {moreReviews.slice(0, 6).map((r, i) => (
                    <figure key={i} className="s-surface s-radius flex w-[82%] shrink-0 snap-start flex-col p-6 md:w-auto">
                      <div className="flex gap-0.5" aria-label={`${r.stars} de 5`}>
                        {Array.from({ length: 5 }, (_, k) => <Star key={k} size={14} strokeWidth={0} className={k < r.stars ? 'fill-current' : 'fill-current opacity-20'} />)}
                      </div>
                      <blockquote className="mt-4 flex-1 text-[16px] leading-relaxed">{r.comment}</blockquote>
                      <figcaption className="s-mute mt-5 text-[14px]">
                        <span className="s-ink font-semibold">{r.client_name ?? 'Cliente'}</span>
                        {r.staff_name ? `, con ${r.staff_name}` : ''}
                      </figcaption>
                      {r.reply && <p className="s-line s-mute mt-4 border-l-2 pl-3 text-[14px]">Respuesta: {r.reply}</p>}
                    </figure>
                  ))}
                </div>
              )}
              {site.googleReviewUrl && (
                <a href={site.googleReviewUrl} target="_blank" rel="noopener noreferrer" className="s-btn-ghost mt-10 !min-h-[44px] !text-[15px]">
                  Déjanos tu reseña en Google <ExternalLink size={15} strokeWidth={1.75} />
                </a>
              )}
            </section>
          )}

          {/* ============================== Sin cita, regalos y membresías ============================== */}
          {(showQueue || showGifts || (site.memberships && site.memberships.length > 0)) && (
            <section aria-label="Más formas de venir" className="s-line border-t py-20 md:py-28">
              <div className={`grid gap-4 ${showQueue && showGifts ? 'md:grid-cols-2' : ''}`}>
                {showQueue && <QueueCard tenant={tenant} />}
                {showGifts && (
                  <Link href="/regalos" className="s-surface s-radius group flex h-full flex-col justify-between gap-8 p-6 md:p-8">
                    <span className="s-eyebrow">Para regalar</span>
                    <div>
                      <p className="s-display text-[34px] md:text-[40px]">Regala un corte</p>
                      <p className="s-mute mt-2 text-[16px]">
                        {features.giftcards_online && features.packages ? 'Gift cards y paquetes, listos en un minuto.' : features.giftcards_online ? 'Gift card por correo, lista en un minuto.' : 'Paquetes de cortes para ti o para regalar.'}
                      </p>
                    </div>
                    <span className="flex items-center gap-2 text-[15px] font-semibold">
                      <Gift size={18} strokeWidth={1.75} /> Elegir regalo <ChevronRight size={18} strokeWidth={1.75} className="nudge-x" />
                    </span>
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
                              <li key={p} className="flex items-start gap-2.5">
                                <Check size={17} strokeWidth={2} className="mt-0.5 shrink-0" style={{ color: 'var(--accent-text)' }} />
                                {p}
                              </li>
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
          <section id="visitanos" className="s-line scroll-mt-24 border-t py-20 md:py-28">
            <Head n={num('visitanos')} eyebrow={multiLoc ? 'Sedes' : 'Visítanos'} title={multiLoc ? `${site.locations.length} sedes, *un estilo*` : 'Te *esperamos*'} />
            {multiLoc ? (
              <>
                <ul className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {site.locations.map((l) => {
                    const n = staffIn(l.id);
                    return (
                      <li key={l.id} className="s-surface s-radius flex min-w-0 flex-col p-6 md:p-8">
                        <p className="s-display text-[32px]">{l.name}</p>
                        <p className="s-mute mt-3 flex items-start gap-2 text-[16px]">
                          <MapPin size={17} strokeWidth={1.75} className="mt-0.5 shrink-0" />
                          <span>{l.address}{l.district && !(l.address ?? '').includes(l.district) ? `, ${l.district}` : ''}</span>
                        </p>
                        {n > 0 && <p className="s-mute mt-1.5 flex items-center gap-2 text-[16px]"><UsersRound size={17} strokeWidth={1.75} /> {n} {n === 1 ? 'barbero' : 'barberos'}</p>}
                        {l.phone && <a href={telHref(l.phone)} className="mt-1.5 flex items-center gap-2 text-[16px] font-semibold"><Phone size={17} strokeWidth={1.75} /> {l.phone}</a>}
                        <div className="mt-auto flex flex-wrap gap-2 pt-8">
                          <a href={mapsFor(l)} target="_blank" rel="noopener noreferrer" className="s-btn-ghost !min-h-[46px] flex-1 !text-[15px]"><Navigation size={16} strokeWidth={1.75} /> Cómo llegar</a>
                          {available && <Link href={`/reservar?sede=${l.id}`} className="s-btn !min-h-[46px] flex-1 !text-[15px]">Reservar aquí</Link>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {hours.length > 0 && (
                  <div className="mt-14 max-w-[520px]">
                    <p className="s-eyebrow">Horario</p>
                    <div className="mt-3"><OpenStatus hours={hours} tz={tz} initial={status} className="text-[16px]" /></div>
                    <div className="mt-4">{hoursTable}</div>
                  </div>
                )}
              </>
            ) : (
              <div className="mt-12 grid gap-12 md:grid-cols-2 md:gap-16">
                {loc && (
                  <div>
                    <p className="s-display text-[clamp(2rem,4vw,3rem)] !leading-[1.05]">{loc.address ?? loc.name}</p>
                    <p className="s-mute mt-3 text-[18px]">{[loc.district, loc.province ?? 'Lima'].filter(Boolean).join(', ')}</p>
                    <div className="mt-8 flex flex-wrap gap-3">
                      <a href={mapsFor(loc)} target="_blank" rel="noopener noreferrer" className="s-btn"><Navigation size={18} strokeWidth={1.75} /> Cómo llegar</a>
                      {loc.phone && <a href={telHref(loc.phone)} className="s-btn-ghost"><Phone size={18} strokeWidth={1.75} /> {loc.phone}</a>}
                    </div>
                  </div>
                )}
                {hours.length > 0 && (
                  <div>
                    <OpenStatus hours={hours} tz={tz} initial={status} className="text-[16px]" />
                    <div className="mt-4">{hoursTable}</div>
                  </div>
                )}
              </div>
            )}
          </section>
        </main>

        {/* ============================== Cierre ============================== */}
        {available && (
          <section className="relative overflow-hidden">
            {closingImage ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={closingImage} alt="" loading="lazy" className="s-mood-photo absolute inset-0 h-full w-full object-cover" />
                <div className="absolute inset-0 bg-black/65" />
              </>
            ) : (
              <div className="s-surface absolute inset-0"><div className="s-pole absolute inset-x-0 top-0 h-3" /></div>
            )}
            <div className={`relative mx-auto max-w-[1240px] px-5 py-28 text-center md:px-10 md:py-40 ${closingImage ? 's-on-photo text-white' : ''}`}>
              <p className={`s-eyebrow ${closingImage ? '!text-white/75' : ''}`}>{todayRow?.time ? `Hoy atendemos ${todayRow.time}` : 'Reserva en un minuto'}</p>
              <p className="s-display mx-auto mt-6 max-w-[14ch] text-[clamp(3rem,9vw,7rem)]">
                Tu próximo corte <em>empieza aquí</em>
              </p>
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <ReservarLink className="s-btn">Reservar cita</ReservarLink>
                {whatsapp && (
                  <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={`s-btn-ghost ${closingImage ? '!border-white/40 text-white hover:!border-white' : ''}`}>
                    <MessageCircle size={18} strokeWidth={1.75} /> Escríbenos
                  </a>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ============================== Pie ============================== */}
        <footer className="s-line border-t">
          <div className="mx-auto max-w-[1240px] px-5 pb-[calc(112px+env(safe-area-inset-bottom))] pt-16 md:px-10 lg:pb-12">
            <div className="grid gap-10 md:grid-cols-12">
              <div className="md:col-span-5">
                <p className="s-display text-[clamp(2.4rem,5vw,3.6rem)]">{site.tenant.name}</p>
                {site.branding?.tagline && <p className="s-mute mt-3 max-w-[36ch] text-[16px]">{site.branding.tagline}</p>}
              </div>
              <div className="md:col-span-3">
                <p className="s-eyebrow">{multiLoc ? 'Sedes' : 'Dirección'}</p>
                <ul className="mt-4 space-y-2 text-[15px]">
                  {site.locations.map((l) => (
                    <li key={l.id}>
                      <a href={mapsFor(l)} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {multiLoc ? <span className="font-semibold">{l.name}: </span> : null}
                        {l.address ?? l.district}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="md:col-span-2">
                <p className="s-eyebrow">Horario</p>
                <p className="mt-4 text-[15px]">{todayRow ? `Hoy ${todayRow.time ?? 'cerrado'}` : 'Consulta por WhatsApp'}</p>
                <a href="#visitanos" className="s-mute mt-1 block text-[14px] hover:underline">Ver la semana</a>
              </div>
              <div className="md:col-span-2">
                <p className="s-eyebrow">Síguenos</p>
                <ul className="mt-4 space-y-2 text-[15px]">
                  {instagram && <li><a href={instagram} target="_blank" rel="noopener noreferrer" className="hover:underline">Instagram</a></li>}
                  {whatsapp && <li><a href={whatsapp} target="_blank" rel="noopener noreferrer" className="hover:underline">WhatsApp</a></li>}
                  {showQueue && <li><Link href="/fila" className="hover:underline">Fila virtual</Link></li>}
                  {showGifts && <li><Link href="/regalos" className="hover:underline">Regalos</Link></li>}
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

        {/* Barra de reserva en el celular */}
        <div className="s-bg s-line pb-safe fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-4 border-t px-5 pt-3 lg:hidden">
          <div className="min-w-0">
            {from != null && <div className="tnum text-[16px] font-semibold">Desde {soles(from)}</div>}
            <OpenStatus hours={hours} tz={tz} initial={status} className="text-[13px]" />
          </div>
          {available ? (
            <ReservarLink className="s-btn !min-h-[48px] shrink-0">Reservar</ReservarLink>
          ) : (
            <span className="s-mute flex items-center gap-2 text-right text-[14px]"><CalendarOff size={16} strokeWidth={1.75} className="shrink-0" /> Reservas en pausa</span>
          )}
        </div>
      </SedeProvider>
    </div>
  );
}
