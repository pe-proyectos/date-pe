import { FlowShell, flowMetadata } from '../_site/FlowShell';

export const metadata = flowMetadata;

export { moodViewport as generateViewport } from '../_site/viewport';

export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return <FlowShell tenant={tenant}>{children}</FlowShell>;
}
