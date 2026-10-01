import { notFound } from 'next/navigation';
import { PageIntro, Closing } from '../../_site/blocks';
import { TeamDirectory } from '../../_site/TeamDirectory';
import { getSite, derive } from '../../_site/data';
import { pageMeta } from '../../_site/meta';

export async function generateMetadata({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return pageMeta(tenant, 'Equipo', '/equipo', (n) => `Conoce a los barberos de ${n}, sus especialidades y opiniones. Reserva con quien prefieras.`);
}

export default async function EquipoPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const site = await getSite(tenant);
  if (!site) notFound();
  const d = derive(site, tenant);
  return (
    <>
      <PageIntro
        eyebrow={d.solo ? 'Tu barbero' : 'Equipo'}
        title={d.solo ? 'Quién te *atiende*' : 'Las manos *detrás*'}
        sub={d.solo ? 'Una silla, un oficio y toda la atención para ti.' : `${site.staff.length} barberos, cada uno con su estilo. Toca a uno para ver su trabajo, sus opiniones y reservar con él.`}
      />
      <main className="mx-auto max-w-[1240px] px-5 pb-24 md:px-10">
        <TeamDirectory staff={site.staff} available={d.available} />
      </main>
      <Closing d={d} title="Elige tu barbero y *reserva*" />
    </>
  );
}
