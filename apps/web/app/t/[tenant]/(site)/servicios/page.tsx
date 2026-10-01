import { notFound } from 'next/navigation';
import { ServiceMenu } from '../../_parts/ServiceMenu';
import { ReservarLink } from '../../_parts/sede';
import { soles } from '@/lib/api';
import { PageIntro, Closing } from '../../_site/blocks';
import { getSite, derive } from '../../_site/data';
import { pageMeta } from '../../_site/meta';

export async function generateMetadata({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return pageMeta(tenant, 'Servicios y precios', '/servicios', (n) => `La carta completa de ${n}: cortes, barba, rituales y precios. Reserva en un minuto.`);
}

export default async function ServiciosPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const site = await getSite(tenant);
  if (!site) notFound();
  const d = derive(site, tenant);
  const cats = [...new Set(d.mainServices.map((s) => s.category?.trim() || 'Otros'))];
  const deposit = site.settings?.require_deposit && site.settings.deposit_percent > 0 ? site.settings.deposit_percent : 0;

  return (
    <>
      <PageIntro
        eyebrow="Servicios"
        title={d.mood.leader ? 'La *carta*' : 'Nuestros *servicios*'}
        sub={`${d.mainServices.length} servicios${cats.length > 1 ? ` en ${cats.length} categorías` : ''}. Toca uno para reservarlo: eliges barbero y hora en el siguiente paso.`}
      >
        <dl className="s-line mt-10 grid max-w-[760px] grid-cols-3 border-y py-6">
          <div>
            <dt className="s-mute text-[14px]">Desde</dt>
            <dd className="s-display tnum mt-1 text-[32px]">{d.from != null ? soles(d.from).replace('.00', '') : '-'}</dd>
          </div>
          <div className="s-line border-l pl-5">
            <dt className="s-mute text-[14px]">Adelanto</dt>
            <dd className="s-display tnum mt-1 text-[32px]">{deposit ? `${deposit}%` : 'No'}</dd>
          </div>
          <div className="s-line border-l pl-5">
            <dt className="s-mute text-[14px]">Cancelas hasta</dt>
            <dd className="s-display tnum mt-1 text-[32px]">{site.settings?.cancel_window_hours ?? 12} h antes</dd>
          </div>
        </dl>
      </PageIntro>

      <main className="mx-auto max-w-[1240px] px-5 pb-24 md:px-10">
        <div className="max-w-[980px]">
          <ServiceMenu services={site.services} available={d.available} leader={d.mood.leader} tenant={tenant} tz={d.tz} />
        </div>
        {d.available && (
          <div className="s-surface s-radius mt-16 flex flex-col items-start justify-between gap-6 p-8 md:flex-row md:items-center md:p-10">
            <div>
              <p className="s-display text-[30px] md:text-[36px]">¿No sabes cuál elegir?</p>
              <p className="s-mute mt-2 max-w-[48ch] text-[16px]">Reserva un corte clásico y tu barbero te recomienda en el sillón. Si hace falta, se ajusta ahí mismo.</p>
            </div>
            <ReservarLink servicio={d.mainServices[0]?.id} className="s-btn shrink-0">Reservar ahora</ReservarLink>
          </div>
        )}
      </main>
      <Closing d={d} />
    </>
  );
}
