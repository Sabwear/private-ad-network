import { RadioTower } from "lucide-react";
import { AccessDenied } from "@/components/access-denied";
import { ChannelManagement } from "@/components/channel-management";
import { PageHeading } from "@/components/page-heading";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getChannelManagementData } from "@/lib/repositories/channels";

export const metadata = { title: "Operations" };

export default async function OperationsPage() {
  const workspace = await getWorkspaceContext();
  if (workspace.account.role !== "admin" || !workspace.permissions.canAccessAdmin) return <AccessDenied />;
  const channels = await getChannelManagementData();

  return <>
    <PageHeading eyebrow="Network operations" title="Operations" description="Manage channels, business assignments, ordered playlists, stream addresses, and broadcast controls." actions={<span className={`data-source data-source-${channels.source === "live" ? "supabase" : "setup"}`}>{channels.source === "live" ? `${channels.channels.length} channel${channels.channels.length === 1 ? "" : "s"}` : "Setup required"}</span>} />
    <nav className="workspace-section-nav" aria-label="Operations sections"><a href="#channels"><RadioTower size={16} /> Channels & links</a></nav>
    <section id="channels" className="workspace-section-anchor">
      <div className="section-heading"><div><p className="eyebrow">Broadcast control</p><h2>Channels and stream links</h2><p>Build playlists, assign businesses, customize public URLs, and control the broadcast.</p></div></div>
      {channels.source === "setup" ? <section className="empty-state"><RadioTower size={28} /><h2>Channel database setup required</h2><p>Deploy the streaming migration before managing channels.</p></section> : <ChannelManagement data={channels} />}
    </section>
  </>;
}
