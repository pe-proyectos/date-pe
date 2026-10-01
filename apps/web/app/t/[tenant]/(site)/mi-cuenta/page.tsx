import { notFound } from 'next/navigation';
import { getSite } from '../../_site/data';
import { pageMeta } from '../../_site/meta';
import { AccountClient } from '../../_site/AccountClient';

export async function generateMetadata({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const m = await pageMeta(tenant, 'Mi cuenta', '/mi-cuenta', (n) => `Tus citas, puntos y paquetes en ${n}.`);
  return { ...m, robots: { index: false } };
}

export default async function MiCuentaPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const site = await getSite(tenant);
  if (!site) notFound();
  return <AccountClient tenant={tenant} shop={site.tenant.name} tz={site.settings?.timezone || 'America/Lima'} whatsapp={site.branding?.whatsapp ?? null} />;
}
