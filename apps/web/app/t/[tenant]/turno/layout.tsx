import { FlowShell } from '../_site/FlowShell';

export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return <FlowShell tenant={tenant}>{children}</FlowShell>;
}
