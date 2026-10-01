import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Navigation, Phone, MessageCircle, Clock, UsersRound } from 'lucide-react';
import { OpenStatus } from '../../_parts/OpenStatus';
import { PageIntro, HoursTable, Closing, WeekHours } from '../../_site/blocks';
import { SiteMap } from '../../_site/SiteMap';
import { getSite, derive } from '../../_site/data';
import { pageMeta } from '../../_site/meta';

export async function generateMetadata({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const site = await getSite(tenant);
  const loc = site?.locations[0];
  return pageMeta(tenant, site && site.locations.length > 1 ? 'Sedes' : 'Cómo llegar', '/visitanos', (n) => `Dirección, horario y cómo llegar a ${n}${loc?.address ? `: ${loc.address}, ${loc.district ?? ''}` : ''}.`);
}

export default async function VisitanosPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const site = await getSite(tenant);
  if (!site) notFound();
  const d = derive(site, tenant);
  const { loc, multiLoc } = d;

  return (
    <>
      <PageIntro
        eyebrow={multiLoc ? 'Sedes' : 'Visítanos'}
        title={multiLoc ? `${site.locations.length} sedes, *un estilo*` : 'Te *esperamos*'}
        sub={multiLoc ? `Estamos en ${d.place.replace(/^\d+ sedes en /, '')}. Elige la que te quede más cerca.` : loc ? `${loc.address ?? loc.name}, ${loc.district ?? ''}. ${d.todayRow?.time ? `Hoy atendemos de ${d.todayRow.time}.` : ''}` : undefined}
      >
        <div className="mt-8"><OpenStatus hours={d.hours} tz={d.tz} initial={d.status} className="text-[17px]" /></div>
      </PageIntro>

      <main className="mx-auto max-w-[1240px] px-5 pb-24 md:px-10">
        {d.mapPoints.length > 0 && (
          <SiteMap points={d.mapPoints} palette={d.mapPalette} accent={d.theme.accent} onAccent={d.theme.onAccent} logo={site.branding?.logo_url ?? null} initial={d.initial} className="h-[420px] md:h-[560px]" zoom={16} />
        )}

        <div className="mt-14 grid gap-12 md:grid-cols-12 md:gap-16">
          <div className="md:col-span-7">
            {site.locations.map((l) => {
              const n = d.staffIn(l.id);
              return (
                <div key={l.id} className="s-line border-b py-8 first:pt-0">
                  {multiLoc && <p className="s-eyebrow mb-3">{l.name}</p>}
                  <p className="s-display text-[clamp(2.2rem,4.4vw,3.4rem)] !leading-[1.05]">{l.address ?? l.name}</p>
                  <p className="s-mute mt-2 text-[18px]">{[l.district, l.province ?? 'Lima'].filter(Boolean).join(', ')}</p>
                  {multiLoc && n > 0 && <p className="s-mute mt-3 flex items-center gap-2 text-[15px]"><UsersRound size={16} strokeWidth={1.75} /> {n} {n === 1 ? 'barbero' : 'barberos'}</p>}
                  {multiLoc && (site.locationHours ?? []).some((h) => h.location_id === l.id) && (
                    <div className="mt-5 max-w-md"><WeekHours rows={(site.locationHours ?? []).filter((h) => h.location_id === l.id)} tz={d.tz} compact /></div>
                  )}
                  <div className="mt-6 flex flex-wrap gap-3">
                    <a href={d.mapsFor(l)} target="_blank" rel="noopener noreferrer" className="s-btn"><Navigation size={18} strokeWidth={1.75} /> Abrir en Google Maps</a>
                    {l.lat != null && l.lng != null && (
                      <a href={`https://waze.com/ul?ll=${l.lat},${l.lng}&navigate=yes`} target="_blank" rel="noopener noreferrer" className="s-btn-ghost">Ir con Waze</a>
                    )}
                    {l.phone && <a href={d.telHref(l.phone)} className="s-btn-ghost"><Phone size={18} strokeWidth={1.75} /> {l.phone}</a>}
                    {multiLoc && d.available && <Link href={`/reservar?sede=${l.id}`} className="s-btn-ghost">Reservar aquí</Link>}
                  </div>
                </div>
              );
            })}
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              <div className="s-surface s-radius p-6">
                <Clock size={20} strokeWidth={1.5} className="s-mute" />
                <p className="mt-4 text-[17px] font-semibold">Llega a tu hora</p>
                <p className="s-mute mt-1 text-[15px]">Con reserva te atendemos puntual. Si te retrasas, avísanos desde el enlace de tu cita.</p>
              </div>
              <div className="s-surface s-radius p-6">
                {d.showQueue ? <UsersRound size={20} strokeWidth={1.5} className="s-mute" /> : <MessageCircle size={20} strokeWidth={1.5} className="s-mute" />}
                <p className="mt-4 text-[17px] font-semibold">{d.showQueue ? '¿Sin cita?' : '¿Dudas?'}</p>
                <p className="s-mute mt-1 text-[15px]">
                  {d.showQueue ? <>Saca tu turno desde el celular en la <Link href="/fila" className="s-ink underline underline-offset-4">fila virtual</Link> y te avisamos cuando te toque.</> : d.whatsapp ? <>Escríbenos por <a href={d.whatsapp} className="s-ink underline underline-offset-4">WhatsApp</a>.</> : 'Reserva en línea y recibe la confirmación por correo.'}
                </p>
              </div>
            </div>
          </div>
          <aside className="md:col-span-5">
            <p className="s-eyebrow">{multiLoc ? 'Horario general' : 'Horario'}</p>
            <div className="mt-4"><HoursTable d={d} /></div>
          </aside>
        </div>
      </main>
      <Closing d={d} />
    </>
  );
}
