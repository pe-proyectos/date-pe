import { notFound } from 'next/navigation';
import { Camera } from 'lucide-react';
import { PageIntro, Closing } from '../../_site/blocks';
import { WorksGallery } from '../../_site/WorksGallery';
import { getSite, derive } from '../../_site/data';
import { pageMeta } from '../../_site/meta';

export async function generateMetadata({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return pageMeta(tenant, 'Trabajos', '/trabajos', (n) => `Cortes, fades, barbas y el local de ${n} en fotos.`);
}

export default async function TrabajosPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const site = await getSite(tenant);
  if (!site) notFound();
  const d = derive(site, tenant);
  if (!d.galleryPhotos.length) notFound();
  return (
    <>
      <PageIntro eyebrow="Trabajos" title="El trabajo *habla*" sub="Cortes, barbas y momentos de la casa. Si te gusta uno, reserva con quien lo hizo.">
        {d.instagram && (
          <a href={d.instagram} target="_blank" rel="noopener noreferrer" className="s-btn-ghost mt-8"><Camera size={17} strokeWidth={1.75} /> Más en Instagram</a>
        )}
      </PageIntro>
      <main className="mx-auto max-w-[1240px] px-5 pb-24 md:px-10">
        <WorksGallery photos={d.galleryPhotos} staff={site.staff.map((s) => ({ id: s.id, name: s.name }))} />
      </main>
      <Closing d={d} title="¿Te gustó *alguno*?" />
    </>
  );
}
