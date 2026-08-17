import { AccessDenied } from "@/components/access-denied";
import { PageHeading } from "@/components/page-heading";
import { StreamMonitorDashboard } from "@/components/stream-monitor-dashboard";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getStreamMonitorData, type MonitorRange } from "@/lib/repositories/stream-monitor";

export const metadata = { title: "Stream monitor" };

function monitorRange(value: string | undefined): MonitorRange {
  const parsed = Number(value);
  return parsed === 1 || parsed === 6 || parsed === 168 ? parsed : 24;
}

export default async function StreamMonitorPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const workspace = await getWorkspaceContext();
  if (workspace.membership.role !== "admin" || !workspace.permissions.canProvisionOrganizations) return <AccessDenied />;
  const params = await searchParams;
  const data = await getStreamMonitorData(monitorRange(params.range));
  return <>
    <PageHeading eyebrow="Network operations" title="Stream monitor" description="Real-time visibility and audited handling for viewer sessions, channel health, geography, playback validation, credits, and platform services." />
    <StreamMonitorDashboard data={data} />
  </>;
}
