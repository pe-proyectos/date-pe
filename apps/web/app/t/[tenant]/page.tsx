import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Star, MapPin, Clock, Navigation, ArrowRight, Check, Info } from 'lucide-react';
import { apiFetch, soles, type TenantSite } from '@/lib/api';
import { onColor, DAY_NAMES } from '@/lib/color';

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
  };
}

function hoursSummary(hours: TenantSite['hours']) {
  if (!hours || hours.length === 0) return [];
  // Agrupa días consecutivos con el mismo horario
  const groups: { from: number; to: number; open: string; close: string }[] = [];
  const sorted = [...hours].sort((a, b) => ((a.day_of_week + 6) % 7) - ((b.day_of_week + 6) % 7));
  for (const h of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.open === h.open && last.close === h.close && (last.to + 1) % 7 === h.day_of_week) last.to = h.day_of_week;
    else groups.push({ from: h.day_of_week, to: h.day_of_week, open: h.open, close: h.close });
  }
  return groups.map((g) => ({
    days: g.from === g.to ? DAY_NAMES[g.from] : `${DAY_NAMES[g.from]} a ${DAY_NAMES[g.to].toLowerCase()}`,
    time: `${g.open} a ${g.close}`,
  }));
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
  const from = site.services.length ? Math.min(...site.services.map((s) => s.price_cents)) : null;
  const hours = hoursSummary(site.hours);
  const mapsUrl = loc?.lat && loc?.lng
    ? `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${site.tenant.name} ${loc?.address ?? ''}`)}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HairSalon',
    name: site.tenant.name,
    description: site.branding?.tagline ?? undefined,
    image: site.branding?.cover_url ? `https://${tenant}.date.pe${site.branding.cover_url}` : undefined,
    url: `https://${tenant}.date.pe`,
    priceRange: 'S/',
    address: loc
      ? { '@type': 'PostalAddress', streetAddress: loc.address ?? undefined, addressLocality: loc.district ?? undefined, addressRegion: loc.province ?? 'Lima', addressCountry: 'PE' }
      : undefined,
    geo: loc?.lat ? { '@type': 'GeoCoordinates', latitude: loc.lat, longitude: loc.lng } : undefined,
    ...(rating ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: rating, reviewCount } } : {}),
  };

  return (
    <div style={{ ['--accent' as string]: accent, ['--on-accent' as string]: onAccent }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {site.tenant.is_demo && (
        <div className="flex items-center justify-center gap-2 bg-field px-4 py-2 text-center text-[13px] text-mute">
          <Info size={15} strokeWidth={1.75} className="shrink-0" />
          Barbería de demostración de date.pe. Barberos, precios y opiniones son de ejemplo.
        </div>
      )}

      {/* Barra superior de la barbería */}
      <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-5 md:px-8">
          <a href="#inicio" className="flex items-center gap-3">
            {site.branding?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={site.branding.logo_url} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full text-[15px] font-semibold" style={{ background: accent, color: onAccent }}>
                {site.tenant.name.replace(/^Barber[ií]a\s+/i, '').charAt(0)}
              </span>
            )}
            <span className="text-[17px] font-semibold tracking-[-0.02em]">{site.tenant.name}</span>
          </a>
          <nav className="hidden items-center gap-7 text-[15px] text-mute md:flex">
            <a href="#servicios" className="hover:text-ink">Servicios</a>
            <a href="#equipo" className="hover:text-ink">Equipo</a>
            {reviewCount > 0 && <a href="#opiniones" className="hover:text-ink">Opiniones</a>}
            <a href="#ubicacion" className="hover:text-ink">Ubicación</a>
          </nav>
          <Link href="/reservar" className="rounded-full px-5 py-2.5 text-[15px] font-medium transition-opacity hover:opacity-90" style={{ background: accent, color: onAccent }}>
            Reservar
          </Link>
        </div>
      </header>

      <main id="inicio" className="mx-auto max-w-[1180px] px-5 pb-28 pt-8 md:px-8 md:pb-20">
        {/* Encabezado tipo ficha */}
        <h1 className="text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.05] tracking-[-0.035em]">{site.tenant.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px]">
          {rating && (
            <a href="#opiniones" className="tnum flex items-center gap-1 font-medium underline-offset-4 hover:underline">
              <Star size={15} strokeWidth={0} className="fill-ink" /> {rating.toFixed(1)}
              <span className="font-normal text-mute">({reviewCount} opiniones)</span>
            </a>
          )}
          {loc && (
            <span className="flex items-center gap-1 text-mute">
              <MapPin size={15} strokeWidth={1.75} /> {loc.address ?? loc.district}
            </span>
          )}
        </div>

        <div className="mt-6 overflow-hidden rounded-xl bg-field">
          {site.branding?.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={site.branding.cover_url} alt={`Interior de ${site.tenant.name}`} fetchPriority="high" className="aspect-[16/10] w-full object-cover md:aspect-[21/9]" />
          ) : (
            <div className="aspect-[21/9] w-full" style={{ background: accent }} />
          )}
        </div>

        <div className="mt-10 grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-7">
            {/* Acerca */}
            {(site.branding?.tagline || site.branding?.about) && (
              <section className="border-b border-line pb-10">
                {site.branding?.tagline && <p className="text-[21px] font-medium leading-snug tracking-[-0.02em]">{site.branding.tagline}</p>}
                {site.branding?.about && <p className="mt-3 max-w-[62ch] text-[17px] leading-relaxed text-mute">{site.branding.about}</p>}
              </section>
            )}

            {/* Servicios */}
            <section id="servicios" className="scroll-mt-24 border-b border-line py-10">
              <h2 className="text-[26px] font-semibold tracking-[-0.03em]">Servicios</h2>
              <ul className="mt-4">
                {site.services.map((s) => (
                  <li key={s.id}>
                    <Link href={`/reservar?servicio=${s.id}`} className="group flex items-center justify-between gap-6 border-b border-line py-5 last:border-0">
                      <div className="min-w-0">
                        <div className="text-[17px] font-medium tracking-[-0.01em]">{s.name}</div>
                        {s.description && <div className="mt-0.5 text-[15px] text-mute">{s.description}</div>}
                        <div className="mt-1 flex items-center gap-1 text-[14px] text-soft">
                          <Clock size={14} strokeWidth={1.75} /> {s.duration_min} min
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-4">
                        <span className="tnum text-[17px] font-medium">{soles(s.price_cents)}</span>
                        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-line transition-colors group-hover:border-ink">
                          <ArrowRight size={16} strokeWidth={1.75} className="nudge-x" />
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            {/* Equipo */}
            <section id="equipo" className="scroll-mt-24 border-b border-line py-10">
              <h2 className="text-[26px] font-semibold tracking-[-0.03em]">Equipo</h2>
              <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3">
                {site.staff.map((b) => (
                  <Link key={b.id} href={`/reservar?barbero=${b.id}`} className="group block">
                    <div className="zoom-media aspect-square rounded-xl bg-field">
                      {b.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={b.photo_url} alt={b.name} loading="lazy" className="h-full w-full rounded-xl object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-4xl font-semibold text-line-2">{b.name.charAt(0)}</div>
                      )}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[16px] font-medium">{b.name}</span>
                      {b.rating_count > 0 && (
                        <span className="tnum flex items-center gap-1 text-[14px]">
                          <Star size={13} strokeWidth={0} className="fill-ink" /> {Number(b.rating_avg).toFixed(1)}
                        </span>
                      )}
                    </div>
                    {b.bio && <p className="text-[14px] text-mute">{b.bio}</p>}
                  </Link>
                ))}
              </div>
            </section>

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
                <h2 className="tnum flex items-center gap-2 text-[26px] font-semibold tracking-[-0.03em]">
                  <Star size={22} strokeWidth={0} className="fill-ink" /> {rating?.toFixed(1)}
                  <span className="mx-1 h-1.5 w-1.5 rounded-full bg-ink" aria-hidden />
                  {reviewCount} opiniones
                </h2>
                <div className="mt-6 grid gap-x-10 gap-y-8 sm:grid-cols-2">
                  {site.reviews.map((r, i) => (
                    <figure key={i}>
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-field text-[15px] font-medium">
                          {(r.client_name ?? 'C').charAt(0)}
                        </span>
                        <div>
                          <div className="text-[15px] font-medium">{r.client_name ?? 'Cliente'}</div>
                          <div className="text-[13px] text-soft">
                            {new Date(r.created_at).toLocaleDateString('es-PE', { month: 'long', year: 'numeric' })}
                            {r.staff_name ? ` con ${r.staff_name}` : ''}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex gap-0.5" aria-label={`${r.stars} de 5`}>
                        {Array.from({ length: 5 }, (_, k) => (
                          <Star key={k} size={13} strokeWidth={0} className={k < r.stars ? 'fill-ink' : 'fill-line-2'} />
                        ))}
                      </div>
                      <blockquote className="mt-2 text-[15px] leading-relaxed text-ink-2">{r.comment}</blockquote>
                      {r.reply && <p className="mt-3 border-l border-line-2 pl-3 text-[14px] text-mute">Respuesta: {r.reply}</p>}
                    </figure>
                  ))}
                </div>
              </section>
            )}

            {/* Ubicación */}
            <section id="ubicacion" className="scroll-mt-24 py-10">
              <h2 className="text-[26px] font-semibold tracking-[-0.03em]">Ubicación y horario</h2>
              <div className="mt-6 grid gap-8 sm:grid-cols-2">
                <div>
                  <div className="flex items-start gap-2 text-[16px]">
                    <MapPin size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" />
                    <span>
                      {loc?.address ?? loc?.name}
                      {loc?.district ? <span className="block text-mute">{loc.district}, {loc.province ?? 'Lima'}</span> : null}
                    </span>
                  </div>
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-[15px] font-medium hover:border-ink">
                    <Navigation size={16} strokeWidth={1.75} /> Cómo llegar
                  </a>
                </div>
                {hours.length > 0 && (
                  <dl className="space-y-2 text-[15px]">
                    {hours.map((h) => (
                      <div key={h.days} className="flex justify-between gap-4 border-b border-line pb-2">
                        <dt className="text-mute">{h.days}</dt>
                        <dd className="tnum">{h.time}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </section>
          </div>

          {/* Tarjeta de reserva fija */}
          <aside className="hidden lg:col-span-5 lg:block">
            <div className="sticky top-24 rounded-xl border border-line p-6 shadow-lift">
              {from != null && (
                <div className="tnum text-[22px] font-semibold tracking-[-0.03em]">
                  Desde {soles(from)}
                </div>
              )}
              <p className="mt-1 text-[15px] text-mute">
                {site.settings?.require_deposit && site.settings.deposit_percent > 0
                  ? `Reservas con un adelanto del ${site.settings.deposit_percent}% por Yape, tarjeta o PayPal.`
                  : 'Reservas sin adelanto. Pagas en el local.'}
              </p>
              <div className="mt-5 space-y-2">
                {site.services.slice(0, 4).map((s) => (
                  <Link key={s.id} href={`/reservar?servicio=${s.id}`} className="flex items-center justify-between rounded-lg border border-line px-4 py-3 text-[15px] transition-colors hover:border-ink">
                    <span>{s.name}</span>
                    <span className="tnum text-mute">{soles(s.price_cents)}</span>
                  </Link>
                ))}
              </div>
              <Link href="/reservar" className="mt-5 block rounded-lg py-3.5 text-center text-[16px] font-medium transition-opacity hover:opacity-90" style={{ background: accent, color: onAccent }}>
                Ver horarios disponibles
              </Link>
              {site.settings && site.settings.cancel_window_hours > 0 && (
                <p className="mt-3 text-center text-[13px] text-soft">Puedes cancelar hasta {site.settings.cancel_window_hours} horas antes.</p>
              )}
            </div>
          </aside>
        </div>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-2 px-5 py-8 text-[14px] text-soft md:flex-row md:justify-between md:px-8">
          <span>{site.tenant.name}</span>
          <a href="https://date.pe" className="hover:text-ink">Reservas con date.pe</a>
        </div>
      </footer>

      {/* Barra de reserva en móvil */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-4 border-t border-line bg-white px-5 py-3 lg:hidden">
        {from != null && (
          <div>
            <div className="tnum text-[16px] font-semibold">Desde {soles(from)}</div>
            <div className="text-[13px] text-mute">{site.services.length} servicios</div>
          </div>
        )}
        <Link href="/reservar" className="rounded-lg px-6 py-3 text-[16px] font-medium" style={{ background: accent, color: onAccent }}>
          Reservar
        </Link>
      </div>

      {site.branding?.whatsapp && (
        <a
          href={`https://wa.me/${site.branding.whatsapp.replace(/[^0-9]/g, '')}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Escribir a ${site.tenant.name} por WhatsApp`}
          className="fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lift transition-transform hover:scale-105 lg:bottom-6"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2Zm5.8 14.03c-.24.68-1.4 1.3-1.94 1.35-.5.05-1.13.07-1.82-.11-.42-.13-.96-.31-1.65-.61-2.9-1.25-4.79-4.17-4.94-4.36-.14-.19-1.18-1.57-1.18-2.99 0-1.42.75-2.12 1.01-2.41.26-.29.57-.36.76-.36.19 0 .38 0 .55.01.18.01.41-.07.64.49.24.57.81 1.97.88 2.11.07.14.12.31.02.5-.09.19-.14.31-.28.48-.14.17-.29.37-.42.5-.14.14-.28.29-.12.57.16.28.72 1.19 1.55 1.93 1.06.95 1.96 1.24 2.24 1.38.28.14.44.12.6-.07.16-.19.69-.81.88-1.09.19-.28.37-.23.62-.14.25.09 1.61.76 1.89.9.28.14.46.21.53.33.07.12.07.68-.17 1.36Z" /></svg>
        </a>
      )}
    </div>
  );
}
