import { notFound } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { PageIntro, Closing } from '../../_site/blocks';
import { ReviewsBoard } from '../../_site/StaffReviews';
import { getSite, derive } from '../../_site/data';
import { pageMeta } from '../../_site/meta';

export async function generateMetadata({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return pageMeta(tenant, 'Opiniones', '/opiniones', (n) => `Lo que dicen los clientes de ${n}. Opiniones verificadas de personas que reservaron.`);
}

export default async function OpinionesPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const site = await getSite(tenant);
  if (!site) notFound();
  const d = derive(site, tenant);
  return (
    <>
      <PageIntro eyebrow="Opiniones" title="Lo que *dicen*" sub="Cada opinión viene de un cliente que reservó y vino. Nada de reseñas compradas.">
        {site.googleReviewUrl && (
          <a href={site.googleReviewUrl} target="_blank" rel="noopener noreferrer" className="s-btn-ghost mt-8">Déjanos tu reseña en Google <ExternalLink size={15} strokeWidth={1.75} /></a>
        )}
      </PageIntro>
      <main className="mx-auto max-w-[1240px] px-5 pb-24 md:px-10">
        <ReviewsBoard tenant={tenant} staff={site.staff.filter((s) => s.rating_count > 0).map((s) => ({ id: s.id, name: s.name }))} tz={d.tz} />
      </main>
      <Closing d={d} />
    </>
  );
}
