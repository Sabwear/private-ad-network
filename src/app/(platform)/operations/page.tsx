import { Activity, RadioTower } from "lucide-react";
import { AccessDenied } from "@/components/access-denied";
import { ChannelManagement } from "@/components/channel-management";
import { PageHeading } from "@/components/page-heading";
import { StreamMonitorDashboard } from "@/components/stream-monitor-dashboard";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getChannelManagementData } from "@/lib/repositories/channels";
import { getStreamMonitorData, type MonitorRange } from "@/lib/repositories/stream-monitor";

export const metadata = { title: "Operations" };

function monitorRange(value: string | undefined): MonitorRange {
  const parsed = Number(value);
  return parsed === 1 || parsed === 6 || parsed === 168 ? parsed : 24;
}

export default async function OperationsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const workspace = await getWorkspaceContext();
  if (workspace.account.role !== "admin" || !workspace.permissions.canAccessAdmin) return <AccessDenied />;
  const params = await searchParams;
  const [channels, monitor] = await Promise.all([
    getChannelManagementData(),
    getStreamMonitorData(monitorRange(params.range)),
  ]);

  return <>
    <PageHeading eyebrow="Network operations" title="Operations" description="Manage channels and stream addresses, then monitor viewers, delivery health, credits, infrastructure, and incidents from one place." actions={<span className={`data-source data-source-${channels.source === "live" ? "supabase" : "setup"}`}>{channels.source === "live" ? `${channels.channels.length} channel${channels.channels.length === 1 ? "" : "s"}` : "Setup required"}</span>} />
    <nav className="workspace-section-nav" aria-label="Operations sections"><a href="#channels"><RadioTower size={16} /> Channels & links</a><a href="#monitor"><Activity size={16} /> Live monitor</a></nav>
    <section id="channels" className="workspace-section-anchor">
      <div className="section-heading"><div><p className="eyebrow">Broadcast control</p><h2>Channels and stream links</h2><p>Build playlists, assign businesses, customize public URLs, and control the broadcast.</p></div></div>
      {channels.source === "setup" ? <section className="empty-state"><RadioTower size={28} /><h2>Channel database setup required</h2><p>Deploy the streaming migration before managing channels.</p></section> : <ChannelManagement data={channels} />}
    </section>
    <section id="monitor" className="workspace-section-anchor operations-monitor-section">
      <div className="section-heading"><div><p className="eyebrow">Live telemetry</p><h2>Stream monitor</h2><p>Audience, geography, uptime, validation, credits, server state, and audited incident handling.</p></div></div>
      <StreamMonitorDashboard data={monitor} />
    </section>
  </>;
}
