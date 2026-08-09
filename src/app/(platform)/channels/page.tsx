import { RadioTower } from "lucide-react";
import { AccessDenied } from "@/components/access-denied";
import { ChannelManagement } from "@/components/channel-management";
import { PageHeading } from "@/components/page-heading";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getChannelManagementData } from "@/lib/repositories/channels";

export const metadata = { title: "Channels" };

export default async function ChannelsPage() {
  const workspace = await getWorkspaceContext();
  if (!workspace.permissions.canAccessAdmin || workspace.membership.role !== "admin") return <AccessDenied />;
  const data = await getChannelManagementData();
  return <>
    <PageHeading eyebrow="Network streaming" title="Channels" description="Build continuous media streams, assign the businesses that receive them, and control the approved playback queue." actions={<span className={`data-source data-source-${data.source === "live" ? "supabase" : "setup"}`}>{data.source === "live" ? `${data.channels.length} live channel${data.channels.length === 1 ? "" : "s"}` : "Setup required"}</span>} />
    {data.source === "setup" ? <section className="empty-state"><RadioTower size={28} /><h2>Channel database setup required</h2><p>Deploy the streaming migration before managing channels.</p></section> : <ChannelManagement data={data} />}
  </>;
}
