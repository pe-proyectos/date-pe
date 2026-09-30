import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  Star, MapPin, Navigation, Check, Info, CalendarOff, Gift, ChevronRight, ChevronDown, ExternalLink, BookOpen,
  CalendarPlus, UsersRound, MessageCircle, Camera, Phone, MapPinned, Clock,
} from 'lucide-react';
import { apiFetch, soles, type TenantSite } from '@/lib/api';
import { onColor } from '@/lib/color';
import { TenantGallery } from '@/components/TenantGallery';
import { QueueCard } from './_parts/QueueCard';
import { SedeProvider, SedePicker, ReservarLink, type PublicLocation } from './_parts/sede';
import { ServiceMenu } from './_parts/ServiceMenu';
import { TeamSection } from './_parts/TeamSection';
import { OpenStatus } from './_parts/OpenStatus';
import { GalleryGrid } from './_parts/GalleryGrid';
import { openState, weekTable, nowIn } from './_parts/hours';

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

export default async function TenantHome({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const site = await getSite(tenant);
  if (!site) notFound();

  const accent = site.branding?.color_primary ?? '#0a0a0a';
  const onAccent = onColor(accent);
  const loc = site.locations[0];
  const rating = site.rating?.avg ? Number(site.rating.avg) : null;
  const reviewCount = Number(site.rating?.count ?? 0);
  // Los complementos (lavado, diseño...) se suman a un servicio principal; no se reservan solos.
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
  const heroImages = galleryPhotos.length
    ? galleryPhotos
    : site.staff.filter((b) => b.photo_url).map((b) => ({ src: b.photo_url as string, alt: `${b.name}${b.bio ? `, ${b.bio.replace(/\.$/, '').toLowerCase()}` : ''}` }));
  const whatsapp = site.branding?.whatsapp ? `https://wa.me/${site.branding.whatsapp.replace(/[^0-9]/g, '')}` : null;
  const ig = site.branding?.instagram?.trim();
  const instagram = ig ? (/^https?:\/\//i.test(ig) ? ig : `https://instagram.com/${ig.replace(/^@/, '').replace(/^(www\.)?instagram\.com\//i, '')}`) : null;
  const phone = !multiLoc ? loc?.phone : null;
  const telHref = (p: string) => `tel:${p.replace(/[^0-9+]/g, '')}`;
  const staffIn = (id: string) => site.staff.filter((b) => !b.location_id || b.location_id === id).length;

  // Datos estructurados: la barbería, cada sede como departamento, horario y carta de servicios.
  const abs = (u: string) => (/^https?:\/\//.test(u) ? u : `https://${tenant}.date.pe${u}`);
  const postal = (l: TenantSite['locations'][number]) => ({
    '@type': 'PostalAddress',
    streetAddress: l.address ?? undefined,
    addressLocality: l.district ?? undefined,
    addressRegion: l.province ?? 'Lima',
    addressCountry: 'PE',
  });
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
      ? {
          department: site.locations.map((l) => ({
            '@type': 'HairSalon',
            name: `${site.tenant.name}, ${l.name}`,
            url: `https://${tenant}.date.pe/reservar?sede=${l.id}`,
            telephone: l.phone ?? undefined,
            address: postal(l),
            geo: geo(l),
            openingHoursSpecification,
          })),
        }
      : {}),
    ...(mainServices.length
      ? {
          hasOfferCatalog: {
            '@type': 'OfferCatalog',
            name: 'Servicios',
            itemListElement: [...catalog.entries()].map(([name, items]) => ({
              '@type': 'OfferCatalog',
              name,
              itemListElement: items.map((s) => ({
                '@type': 'Offer',
                price: (s.price_cents / 100).toFixed(2),
                priceCurrency: 'PEN',
                itemOffered: { '@type': 'Service', name: s.name, description: s.description ?? undefined },
              })),
            })),
          },
        }
      : {}),
  };

  const chip = 'flex min-h-[44px] shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-full border border-line px-4 text-[15px] font-medium transition-colors hover:border-ink';
  const outlineBtn = 'inline-flex min-h-[44px] items-center gap-2 rounded-full border border-line px-4 text-[15px] font-medium transition-colors hover:border-ink';
  const locationsHref = multiLoc ? '#sedes' : '#ubicacion';

  const hoursBlock = hours.length > 0 && (
    <details className="group rounded-xl border border-line">
      <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <OpenStatus hours={hours} tz={tz} initial={status} className="text-[15px]" />
          {todayRow && (
            <span className="tnum mt-0.5 block text-[14px] text-mute">
              Hoy {todayRow.time ?? 'cerrado'}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[14px] font-medium">
          Horario <ChevronDown size={16} strokeWidth={1.75} className="transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <dl className="space-y-2 border-t border-line px-4 py-4 text-[15px]">
        {week.map((d) => (
          <div key={d.dow} className={`flex justify-between gap-4 ${d.dow === todayDow ? 'font-semibold' : ''}`}>
            <dt className={d.dow === todayDow ? '' : 'text-mute'}>{d.day}</dt>
            <dd className={`tnum text-right ${d.time ? '' : 'text-soft'}`}>{d.time ?? 'Cerrado'}</dd>
          </div>
        ))}
      </dl>
    </details>
  );

  return (
    <div style={{ ['--accent' as string]: accent, ['--on-accent' as string]: onAccent }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />

      {site.tenant.is_demo && (
        <div className="flex items-center justify-center gap-2 bg-field px-4 py-2 text-center text-[13px] text-mute">
          <Info size={15} strokeWidth={1.75} className="shrink-0" />
          Barbería de demostración de date.pe. Barberos, precios y opiniones son de ejemplo.
        </div>
      )}

      <SedeProvider slug={tenant} locations={publicLocations}>
        {/* Barra superior de la barbería */}
        <header className="pt-safe sticky top-0 z-40 border-b border-line bg-white">
          <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between gap-4 px-5 md:px-8">
            <a href="#inicio" className="flex min-w-0 items-center gap-3">
              {site.branding?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={site.branding.logo_url} alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold" style={{ background: accent, color: onAccent }}>
                  {site.tenant.name.replace(/^Barber[ií]a\s+/i, '').charAt(0)}
                </span>
              )}
              <span className="truncate text-[17px] font-semibold tracking-[-0.02em]">{site.tenant.name}</span>
            </a>
            <nav className="hidden items-center gap-7 text-[15px] text-mute md:flex">
              <a href="#servicios" className="hover:text-ink">Servicios</a>
              <a href="#equipo" className="hover:text-ink">Equipo</a>
              {reviewCount > 0 && <a href="#opiniones" className="hover:text-ink">Opiniones</a>}
              <a href={locationsHref} className="hover:text-ink">{multiLoc ? 'Sedes' : 'Ubicación'}</a>
            </nav>
            {available ? (
              <ReservarLink className="shrink-0 rounded-full px-5 py-2.5 text-[15px] font-medium transition-opacity hover:opacity-90" style={{ background: accent, color: onAccent }}>
                Reservar
              </ReservarLink>
            ) : (
              <span className="shrink-0 rounded-full bg-field px-4 py-2 text-[13px] font-medium text-mute">Reservas en pausa</span>
            )}
          </div>
        </header>

        {!available && (
          <div className="border-b border-line bg-field">
            <div className="mx-auto flex max-w-[1180px] items-start gap-3 px-5 py-4 text-[15px] md:px-8">
              <CalendarOff size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" />
              <p>
                <span className="font-medium">Esta barbería no está recibiendo reservas por ahora.</span>{' '}
                <span className="text-mute">{whatsapp ? 'Escríbeles por WhatsApp para coordinar tu cita.' : 'Vuelve a intentarlo pronto.'}</span>
              </p>
            </div>
          </div>
        )}

        <main id="inicio" className="mx-auto max-w-[1180px] px-5 pb-8 pt-8 md:px-8 md:pb-20">
          {/* Portada */}
          <h1 className="text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.05] tracking-[-0.035em]">{site.tenant.name}</h1>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-[15px]">
            {rating && (
              <a href="#opiniones" className="tnum flex items-center gap-1 font-medium underline-offset-4 hover:underline">
                <Star size={15} strokeWidth={0} className="fill-ink" /> {rating.toFixed(1)}
                <span className="font-normal text-mute">({reviewCount} {reviewCount === 1 ? 'opinión' : 'opiniones'})</span>
              </a>
            )}
            {multiLoc ? (
              <a href="#sedes" className="flex min-w-0 items-center gap-1 text-mute underline-offset-4 hover:text-ink hover:underline">
                <MapPin size={15} strokeWidth={1.75} className="shrink-0" />
                <span className="truncate">{site.locations.length} sedes en {listDistricts(site.locations.map((l) => l.district ?? l.name))}</span>
              </a>
            ) : (
              loc && (
                <span className="flex min-w-0 items-center gap-1 text-mute">
                  <MapPin size={15} strokeWidth={1.75} className="shrink-0" />
                  <span className="truncate">{loc.address ?? loc.district}</span>
                </span>
              )
            )}
            <OpenStatus hours={hours} tz={tz} initial={status} />
          </div>

          <TenantGallery
            accent={accent}
            cover={site.branding?.cover_url ? { src: site.branding.cover_url, alt: `Interior de ${site.tenant.name}` } : null}
            images={heroImages}
          />

          <div className="mt-10 grid gap-12 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-7">
              {(site.branding?.tagline || site.branding?.about) && (
                <div>
                  {site.branding?.tagline && <p className="text-[21px] font-medium leading-snug tracking-[-0.02em]">{site.branding.tagline}</p>}
                  {site.branding?.about && <p className="mt-3 max-w-[62ch] text-[17px] leading-relaxed text-mute">{site.branding.about}</p>}
                </div>
              )}

              {/* Accesos rápidos */}
              <nav aria-label="Accesos rápidos" className={`no-scrollbar -mx-5 flex snap-x scroll-px-5 gap-2 overflow-x-auto px-5 md:mx-0 md:flex-wrap md:px-0 ${site.branding?.tagline || site.branding?.about ? 'mt-6' : ''}`}>
                {available && (
                  <ReservarLink className={`${chip} border-transparent lg:hidden`} style={{ background: accent, color: onAccent }}>
                    <CalendarPlus size={17} strokeWidth={1.75} /> Reservar
                  </ReservarLink>
                )}
                {showQueue && (
                  <Link href="/fila" className={chip}>
                    <UsersRound size={17} strokeWidth={1.75} /> Fila virtual
                  </Link>
                )}
                {whatsapp && (
                  <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={chip}>
                    <MessageCircle size={17} strokeWidth={1.75} /> WhatsApp
                  </a>
                )}
                {multiLoc ? (
                  <a href="#sedes" className={chip}>
                    <MapPinned size={17} strokeWidth={1.75} /> {site.locations.length} sedes
                  </a>
                ) : (
                  loc && (
                    <a href={mapsFor(loc)} target="_blank" rel="noopener noreferrer" className={chip}>
                      <Navigation size={17} strokeWidth={1.75} /> Cómo llegar
                    </a>
                  )
                )}
                {phone && (
                  <a href={telHref(phone)} className={chip}>
                    <Phone size={17} strokeWidth={1.75} /> Llamar
                  </a>
                )}
                {instagram && (
                  <a href={instagram} target="_blank" rel="noopener noreferrer" className={chip}>
                    <Camera size={17} strokeWidth={1.75} /> Instagram
                  </a>
                )}
              </nav>

              <SedePicker accent={accent} onAccent={onAccent} />

              {/* Servicios */}
              <section id="servicios" className="mt-10 scroll-mt-24 border-t border-line py-10">
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="text-[26px] font-semibold tracking-[-0.03em]">Servicios</h2>
                  {mainServices.length > 0 && <span className="tnum shrink-0 text-[15px] text-mute">{mainServices.length} en total</span>}
                </div>
                {site.services.length > 0 ? (
                  <ServiceMenu services={site.services} available={available} accent={accent} onAccent={onAccent} />
                ) : (
                  <p className="mt-3 text-[15px] text-mute">Pronto publicaremos nuestros servicios.</p>
                )}
              </section>

              {site.staff.length > 0 && <TeamSection staff={site.staff} available={available} />}

              {/* Fila virtual y regalos */}
              {(showQueue || showGifts) && (
                <section aria-label="Sin cita y regalos" className={`grid gap-3 border-b border-line py-8 ${showQueue && showGifts ? 'sm:grid-cols-2' : ''}`}>
                  {showQueue && <QueueCard tenant={tenant} accent={accent} onAccent={onAccent} />}
                  {showGifts && (
                    <Link href="/regalos" className="group flex items-center gap-4 rounded-xl border border-line p-4 transition-colors hover:border-ink">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-field">
                        <Gift size={20} strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[16px] font-medium tracking-[-0.01em]">Regala un corte</span>
                        <span className="block text-[14px] text-mute">
                          {features.giftcards_online && features.packages ? 'Gift cards y paquetes, listos en un minuto.' : features.giftcards_online ? 'Gift card por correo, lista en un minuto.' : 'Paquetes de cortes para ti o para regalar.'}
                        </span>
                      </span>
                      <ChevronRight size={18} strokeWidth={1.75} className="nudge-x shrink-0 text-mute" />
                    </Link>
                  )}
                </section>
              )}

              {/* Membresías */}
              {site.memberships && site.memberships.length > 0 && (
                <section className="border-b border-line py-10">
                  <h2 className="text-[26px] font-semibold tracking-[-0.03em]">Membresías</h2>
                  <p className="mt-1 text-[15px] text-mute">Pregunta por ellas en tu próxima visita.</p>
                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    {site.memberships.map((m) => (
                      <div key={m.id} className="rounded-xl border border-line p-5">
                        <div className="text-[17px] font-medium">{m.name}</div>
                        <div className="tnum mt-1 text-[24px] font-semibold tracking-[-0.03em]">
                          {soles(m.price_cents)}
                          <span className="text-[15px] font-normal text-mute"> al {m.period === 'year' ? 'año' : 'mes'}</span>
                        </div>
                        {m.description && <p className="mt-1 text-[14px] text-mute">{m.description}</p>}
                        {m.perks && (
                          <ul className="mt-4 space-y-2 text-[14px]">
                            {m.perks.split('|').map((p) => (
                              <li key={p} className="flex items-start gap-2">
                                <Check size={16} strokeWidth={2} className="mt-0.5 shrink-0" style={{ color: accent }} />
                                {p}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Opiniones */}
              {site.reviews && site.reviews.length > 0 && (
                <section id="opiniones" className="scroll-mt-24 border-b border-line py-10">
                  <h2 className="tnum flex flex-wrap items-center gap-x-2 text-[26px] font-semibold tracking-[-0.03em]">
                    <Star size={22} strokeWidth={0} className="fill-ink" /> {rating?.toFixed(1)}
                    <span className="font-normal text-mute">de {reviewCount} {reviewCount === 1 ? 'opinión' : 'opiniones'}</span>
                  </h2>
                  <div className="mt-6 grid gap-x-10 gap-y-8 sm:grid-cols-2">
                    {site.reviews.map((r, i) => (
                      <figure key={i} className="min-w-0">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-field text-[15px] font-medium">
                            {(r.client_name ?? 'C').charAt(0)}
                          </span>
                          <div className="min-w-0">
                            <div className="text-[15px] font-medium">{r.client_name ?? 'Cliente'}</div>
                            <div className="text-[13px] text-soft">
                              {new Date(r.created_at).toLocaleDateString('es-PE', { month: 'long', year: 'numeric', timeZone: tz })}
                              {r.staff_name ? ` con ${r.staff_name}` : ''}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 flex gap-0.5" aria-label={`${r.stars} de 5`}>
                          {Array.from({ length: 5 }, (_, k) => (
                            <Star key={k} size={13} strokeWidth={0} className={k < r.stars ? 'fill-ink' : 'fill-line-2'} />
                          ))}
                        </div>
                        {r.comment && <blockquote className="mt-2 text-[15px] leading-relaxed text-ink-2">{r.comment}</blockquote>}
                        {r.reply && <p className="mt-3 border-l border-line-2 pl-3 text-[14px] text-mute">Respuesta: {r.reply}</p>}
                      </figure>
                    ))}
                  </div>
                  {site.googleReviewUrl && (
                    <a href={site.googleReviewUrl} target="_blank" rel="noopener noreferrer" className={`mt-8 ${outlineBtn} px-5`}>
                      Déjanos tu reseña en Google <ExternalLink size={15} strokeWidth={1.75} />
                    </a>
                  )}
                </section>
              )}

              {/* Fotos */}
              {galleryPhotos.length > 0 && (
                <section id="fotos" className="scroll-mt-24 border-b border-line py-10">
                  <h2 className="text-[26px] font-semibold tracking-[-0.03em]">Fotos</h2>
                  <GalleryGrid images={galleryPhotos} />
                </section>
              )}

              {/* Sedes o ubicación, y horario */}
              {multiLoc ? (
                <section id="sedes" className="scroll-mt-24 py-10">
                  <h2 className="text-[26px] font-semibold tracking-[-0.03em]">Sedes</h2>
                  <p className="mt-0.5 text-[15px] text-mute">{site.locations.length} locales para atenderte.</p>
                  <ul className="mt-6 grid gap-4 sm:grid-cols-2">
                    {site.locations.map((l) => {
                      const n = staffIn(l.id);
                      return (
                        <li key={l.id} className="flex min-w-0 flex-col rounded-xl border border-line p-5">
                          <div className="text-[17px] font-semibold tracking-[-0.01em]">{l.name}</div>
                          <div className="mt-1 flex items-start gap-2 text-[15px] text-mute">
                            <MapPin size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
                            <span className="min-w-0">
                              {l.address && <span className="block">{l.address}</span>}
                              {l.district && <span className="block">{l.district}, {l.province ?? 'Lima'}</span>}
                            </span>
                          </div>
                          {n > 0 && (
                            <div className="mt-1 flex items-center gap-2 text-[15px] text-mute">
                              <UsersRound size={16} strokeWidth={1.75} className="shrink-0" /> {n} {n === 1 ? 'barbero' : 'barberos'}
                            </div>
                          )}
                          {l.phone && (
                            <a href={telHref(l.phone)} className="mt-1 flex min-h-[32px] items-center gap-2 text-[15px] font-medium underline-offset-4 hover:underline">
                              <Phone size={16} strokeWidth={1.75} className="shrink-0" /> {l.phone}
                            </a>
                          )}
                          <div className="mt-auto flex flex-wrap gap-2 pt-4">
                            <a href={mapsFor(l)} target="_blank" rel="noopener noreferrer" className={`${outlineBtn} flex-1 justify-center whitespace-nowrap`}>
                              <Navigation size={16} strokeWidth={1.75} /> Cómo llegar
                            </a>
                            {available && (
                              <Link href={`/reservar?sede=${l.id}`} className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 text-[15px] font-medium transition-opacity hover:opacity-90" style={{ background: accent, color: onAccent }}>
                                Reservar en esta sede
                              </Link>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {hours.length > 0 && (
                    <div className="mt-8 max-w-[440px]">
                      <h3 className="mb-3 flex items-center gap-2 text-[17px] font-semibold">
                        <Clock size={18} strokeWidth={1.75} /> Horario de atención
                      </h3>
                      {hoursBlock}
                    </div>
                  )}
                </section>
              ) : (
                <section id="ubicacion" className="scroll-mt-24 py-10">
                  <h2 className="text-[26px] font-semibold tracking-[-0.03em]">Ubicación y horario</h2>
                  <div className="mt-6 grid gap-6 sm:grid-cols-2">
                    {loc && (
                      <div className="min-w-0">
                        <div className="flex items-start gap-2 text-[16px]">
                          <MapPin size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" />
                          <span className="min-w-0">
                            {loc.address ?? loc.name}
                            {loc.district ? <span className="block text-mute">{loc.district}, {loc.province ?? 'Lima'}</span> : null}
                          </span>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <a href={mapsFor(loc)} target="_blank" rel="noopener noreferrer" className={outlineBtn}>
                            <Navigation size={16} strokeWidth={1.75} /> Cómo llegar
                          </a>
                          {loc.phone && (
                            <a href={telHref(loc.phone)} className={outlineBtn}>
                              <Phone size={16} strokeWidth={1.75} /> {loc.phone}
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                    {hoursBlock}
                  </div>
                </section>
              )}
            </div>

            {/* Tarjeta de reserva fija */}
            <aside className="hidden lg:col-span-5 lg:block">
              <div className="sticky top-24 rounded-xl border border-line p-6 shadow-lift">
                {from != null && <div className="tnum text-[22px] font-semibold tracking-[-0.03em]">Desde {soles(from)}</div>}
                {available ? (
                  <>
                    <p className="mt-1 text-[15px] text-mute">
                      {site.settings?.require_deposit && site.settings.deposit_percent > 0
                        ? `Reservas con un adelanto del ${site.settings.deposit_percent}% por Yape, tarjeta o PayPal.`
                        : 'Reservas sin adelanto. Pagas en el local.'}
                    </p>
                    {status && <OpenStatus hours={hours} tz={tz} initial={status} className="mt-3 text-[14px]" />}
                    <div className="mt-5 space-y-2">
                      {mainServices.slice(0, 4).map((s) => (
                        <ReservarLink key={s.id} servicio={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-4 py-3 text-[15px] transition-colors hover:border-ink">
                          <span className="min-w-0 truncate">{s.name}</span>
                          <span className="tnum shrink-0 text-mute">{soles(s.price_cents)}</span>
                        </ReservarLink>
                      ))}
                    </div>
                    {mainServices.length > 4 && (
                      <a href="#servicios" className="mt-2 block text-center text-[14px] text-mute underline-offset-4 hover:text-ink hover:underline">
                        Ver los {mainServices.length} servicios
                      </a>
                    )}
                    <ReservarLink className="mt-5 block rounded-full py-3.5 text-center text-[16px] font-medium transition-opacity hover:opacity-90" style={{ background: accent, color: onAccent }}>
                      Ver horarios disponibles
                    </ReservarLink>
                    {site.settings && site.settings.cancel_window_hours > 0 && (
                      <p className="mt-3 text-center text-[13px] text-soft">Puedes cancelar hasta {site.settings.cancel_window_hours} horas antes.</p>
                    )}
                  </>
                ) : (
                  <div className="mt-4 rounded-lg bg-field p-4 text-[15px]">
                    <p className="flex items-start gap-2 font-medium">
                      <CalendarOff size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" />
                      Esta barbería no está recibiendo reservas por ahora.
                    </p>
                    {whatsapp && <p className="mt-1 pl-[26px] text-mute">Escríbeles por WhatsApp para coordinar tu cita.</p>}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </main>

        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-[1180px] flex-col gap-3 px-5 pb-[calc(104px+env(safe-area-inset-bottom))] pt-8 text-[14px] text-soft md:flex-row md:justify-between md:px-8 lg:pb-8">
            <span>{site.tenant.name}</span>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <Link href="/reclamaciones" className="inline-flex items-center gap-1.5 hover:text-ink">
                <BookOpen size={15} strokeWidth={1.75} /> Libro de Reclamaciones
              </Link>
              <a href="https://date.pe/terminos" className="hover:text-ink">Términos</a>
              <a href="https://date.pe/privacidad" className="hover:text-ink">Privacidad</a>
              {site.branding?.show_powered_by !== false && <a href="https://date.pe" className="hover:text-ink">Reservas con date.pe</a>}
            </div>
          </div>
        </footer>

        {/* Barra de reserva en móvil */}
        <div className="pb-safe fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-4 border-t border-line bg-white px-5 pt-3 lg:hidden">
          {from != null && (
            <div className="min-w-0">
              <div className="tnum text-[16px] font-semibold">Desde {soles(from)}</div>
              <div className="truncate text-[13px] text-mute">{mainServices.length} {mainServices.length === 1 ? 'servicio' : 'servicios'}</div>
            </div>
          )}
          {available ? (
            <ReservarLink className="flex min-h-[48px] shrink-0 items-center rounded-full px-7 text-[16px] font-medium" style={{ background: accent, color: onAccent }}>
              Reservar
            </ReservarLink>
          ) : (
            <span className="flex items-center gap-2 text-right text-[14px] text-mute">
              <CalendarOff size={16} strokeWidth={1.75} className="shrink-0" /> Reservas en pausa
            </span>
          )}
        </div>

        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Escribir a ${site.tenant.name} por WhatsApp`}
            className="fixed bottom-[calc(88px+env(safe-area-inset-bottom))] right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lift transition-transform hover:scale-105 lg:bottom-6"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2Zm5.8 14.03c-.24.68-1.4 1.3-1.94 1.35-.5.05-1.13.07-1.82-.11-.42-.13-.96-.31-1.65-.61-2.9-1.25-4.79-4.17-4.94-4.36-.14-.19-1.18-1.57-1.18-2.99 0-1.42.75-2.12 1.01-2.41.26-.29.57-.36.76-.36.19 0 .38 0 .55.01.18.01.41-.07.64.49.24.57.81 1.97.88 2.11.07.14.12.31.02.5-.09.19-.14.31-.28.48-.14.17-.29.37-.42.5-.14.14-.28.29-.12.57.16.28.72 1.19 1.55 1.93 1.06.95 1.96 1.24 2.24 1.38.28.14.44.12.6-.07.16-.19.69-.81.88-1.09.19-.28.37-.23.62-.14.25.09 1.61.76 1.89.9.28.14.46.21.53.33.07.12.07.68-.17 1.36Z" /></svg>
          </a>
        )}
      </SedeProvider>
    </div>
  );
}
