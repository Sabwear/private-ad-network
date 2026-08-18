import { Activity, ShieldCheck } from "lucide-react";
import { AccessDenied } from "@/components/access-denied";
import { PageHeading } from "@/components/page-heading";
import { ProofOfPlayPanel } from "@/components/proof-of-play-panel";
import { StreamMonitorDashboard } from "@/components/stream-monitor-dashboard";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getProofOfPlayData, getStreamMonitorData, type MonitorRange } from "@/lib/repositories/stream-monitor";

export const metadata = { title: "Stream monitor" };

function monitorRange(value: string | undefined): MonitorRange {
  const parsed = Number(value);
  return parsed === 1 || parsed === 6 || parsed === 168 ? parsed : 24;
}

export default async function StreamMonitorPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const workspace = await getWorkspaceContext();
  if (workspace.account.role !== "admin" || !workspace.permissions.canAccessAdmin) return <AccessDenied />;
  const params = await searchParams;
  const range = monitorRange(params.range);
  const [monitor, proof] = await Promise.all([getStreamMonitorData(range), getProofOfPlayData(range)]);
  return <>
    <PageHeading eyebrow="Network intelligence" title="Monitor" description="Follow viewers, delivery health, infrastructure, credits, incidents, and verified proof of play from one live workspace." />
    <nav className="workspace-section-nav" aria-label="Monitor sections"><a href="#live"><Activity size={16} /> Live telemetry</a><a href="#proof"><ShieldCheck size={16} /> Proof of play</a></nav>
    <section id="live" className="workspace-section-anchor"><StreamMonitorDashboard data={monitor} /></section>
    <ProofOfPlayPanel data={proof} />
  </>;
}
