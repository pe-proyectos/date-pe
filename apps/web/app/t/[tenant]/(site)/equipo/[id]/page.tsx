import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Star, ArrowLeft, MapPin } from 'lucide-react';
import { ReservarLink } from '../../../_parts/sede';
import { GalleryGrid } from '../../../_parts/GalleryGrid';
import { Card } from '../../../_parts/TeamSection';
import { NextSlot } from '../../../_site/NextSlot';
import { ReviewsBoard } from '../../../_site/StaffReviews';
import { Head, Closing } from '../../../_site/blocks';
import { getSite, derive } from '../../../_site/data';
import { pageMeta } from '../../../_site/meta';

export async function generateMetadata({ params }: { params: Promise<{ tenant: string; id: string }> }) {
  const { tenant, id } = await params;
  const site = await getSite(tenant);
  const b = site?.staff.find((s) => s.id === id);
  return pageMeta(tenant, b ? `${b.name}, barbero` : 'Barbero', `/equipo/${id}`, (n) => (b ? `${b.name} en ${n}. ${b.bio ?? ''} Mira su trabajo y reserva con él.` : `Equipo de ${n}.`));
}

export default async function BarberoPage({ params }: { params: Promise<{ tenant: string; id: string }> }) {
  const { tenant, id } = await params;
  const site = await getSite(tenant);
  if (!site) notFound();
  const b = site.staff.find((s) => s.id === id);
  if (!b) notFound();
  const d = derive(site, tenant);
  const first = b.name.split(' ')[0];
  const works = d.galleryPhotos.filter((g) => g.staffId === b.id);
  const others = site.staff.filter((s) => s.id !== b.id);
  const sede = b.location_id ? site.locations.find((l) => l.id === b.location_id) : null;
  const specialties = (b.specialties ?? []).filter(Boolean);

  return (
    <>
      <section className="mx-auto max-w-[1240px] px-5 pb-16 pt-[calc(6.5rem+env(safe-area-inset-top))] md:px-10 md:pb-24 md:pt-36">
        <Link href="/equipo" className="s-mute mb-10 inline-flex items-center gap-2 text-[15px] hover:underline">
          <ArrowLeft size={16} strokeWidth={1.75} /> Todo el equipo
        </Link>
        <div className="grid items-center gap-10 md:grid-cols-12 md:gap-16">
          <div className="s-radius s-surface s-rise relative aspect-[4/5] overflow-hidden md:col-span-5">
            {b.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.photo_url} alt={b.name} fetchPriority="high" className="h-full w-full object-cover" />
            ) : (
              <div className="s-display s-mute flex h-full items-center justify-center text-[140px]">{b.name.charAt(0)}</div>
            )}
          </div>
          <div className="md:col-span-7">
            <p className="s-eyebrow s-rise">{site.tenant.name}</p>
            <h1 className="s-display s-rise s-rise-2 mt-5 text-[clamp(4rem,12vw,9rem)]">{b.name}</h1>
            {b.rating_count > 0 && (
              <p className="tnum s-rise s-rise-3 mt-5 flex items-center gap-2 text-[17px]">
                <Star size={18} strokeWidth={0} className="fill-current" style={{ color: 'var(--accent-text)' }} /> <b>{Number(b.rating_avg).toFixed(1)}</b>
                <span className="s-mute">de {b.rating_count} {b.rating_count === 1 ? 'opinión' : 'opiniones'}</span>
              </p>
            )}
            {b.bio && <p className="s-display s-casa s-rise s-rise-3 mt-8 max-w-[22ch] text-[clamp(1.7rem,3.2vw,2.5rem)] !leading-[1.15]">{b.bio}</p>}
            {specialties.length > 0 && (
              <div className="s-rise s-rise-4 mt-8">
                <p className="s-eyebrow">Especialidades</p>
                <div className="mt-3 flex flex-wrap gap-2">{specialties.map((t) => <span key={t} className="s-chip">{t}</span>)}</div>
              </div>
            )}
            {d.multiLoc && (
              <p className="s-mute mt-6 flex items-center gap-2 text-[15px]"><MapPin size={16} strokeWidth={1.75} /> {sede ? sede.name : 'Atiende en todas las sedes'}</p>
            )}
            <div className="s-rise s-rise-4 mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
              {d.available && <ReservarLink barbero={b.id} className="s-btn">Reservar con {first}</ReservarLink>}
              {d.available && d.mainServices[0] && <NextSlot tenant={tenant} serviceId={d.mainServices[0].id} staffId={b.id} tz={d.tz} label={`Libre con ${first}`} />}
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-[1240px] px-5 md:px-10">
        {works.length > 0 && (
          <section className="s-reveal s-line border-t py-20 md:py-24">
            <Head eyebrow="Su trabajo" title={`Hecho por *${first}*`} />
            <GalleryGrid images={works} />
          </section>
        )}
        {b.rating_count > 0 && (
          <section className="s-reveal s-line border-t py-20 md:py-24">
            <Head eyebrow="Opiniones" title={`Lo que dicen de *${first}*`} />
            <div className="mt-10"><ReviewsBoard tenant={tenant} fixedStaff={b.id} tz={d.tz} compact /></div>
          </section>
        )}
        {others.length > 0 && (
          <section className="s-reveal s-line border-t py-20 md:py-24">
            <Head eyebrow="Equipo" title="También en *la casa*" />
            <div className="s-no-scrollbar -mx-5 mt-10 flex snap-x gap-4 overflow-x-auto px-5 pb-2 md:mx-0 md:grid md:grid-cols-4 md:px-0">
              {others.slice(0, 4).map((o) => (
                <div key={o.id} className="w-[62%] shrink-0 snap-start md:w-auto">
                  <Card b={o} available={d.available} sede={null} locations={null} chips={2} profiles />
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
      <Closing d={d} title={`Tu próximo corte con *${first}*`} />

      {/* Celular: reservar con este barbero siempre a mano, sobre la barra de pestañas */}
      {d.available && (
        <div className="s-sticky-cta s-bg s-line fixed inset-x-0 z-30 flex items-center gap-3 border-t px-5 py-3 lg:hidden" style={{ bottom: 'calc(64px + env(safe-area-inset-bottom))' }}>
          {b.photo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={b.photo_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
          )}
          <ReservarLink barbero={b.id} className="s-btn !min-h-[46px] flex-1 !text-[15px]">Reservar con {first}</ReservarLink>
        </div>
      )}
    </>
  );
}
