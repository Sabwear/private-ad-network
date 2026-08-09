import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleAlert, Clapperboard, MonitorPlay, Plus, RadioTower, Rocket } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { StatusPill } from "@/components/status-pill";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getCampaignCards } from "@/lib/repositories/campaigns";
import { getChannelManagementData } from "@/lib/repositories/channels";
import { getMediaLibrary } from "@/lib/repositories/media";
import { getScreens } from "@/lib/repositories/screens";

export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  const workspace = await getWorkspaceContext();
  const [screensResult, mediaResult, campaignResult, channelResult] = await Promise.all([
    getScreens(),
    getMediaLibrary(),
    getCampaignCards(),
    getChannelManagementData(),
  ]);
  const activeCampaigns = campaignResult.campaigns.filter((campaign) => campaign.status === "Active").length;
  const activeChannels = channelResult.channels.filter((channel) => channel.status === "active").length;
  const issues = [
    ...screensResult.screens.filter((screen) => screen.status !== "Online").slice(0, 3).map((screen) => ({ title: `${screen.name} is ${screen.status.toLowerCase()}`, detail: `${screen.location} · last heartbeat ${screen.heartbeat}`, tone: "danger" as const, href: "/screens" })),
    ...mediaResult.assets.filter((asset) => asset.processingStatus === "failed").slice(0, 2).map((asset) => ({ title: `${asset.name} failed processing`, detail: asset.processingError || "Open the media library for details.", tone: "warning" as const, href: "/media" })),
  ];

  return <>
    <PageHeading
      eyebrow="Limited beta"
      title={`Welcome, ${workspace.organization.name}`}
      description="Live operational data for the controlled beta. Prototype balances and playback claims have been removed."
      actions={<Link href={workspace.permissions.canAccessAdmin ? "/channels" : "/media"} className="button button-primary"><Plus size={17} /> {workspace.permissions.canAccessAdmin ? "Manage channel" : "Add media"}</Link>}
    />

    <section className="metric-grid" aria-label="Live network summary">
      <article className="metric-card metric-teal"><div className="metric-accent" /><span className="metric-label">Registered screens</span><strong>{screensResult.summary.registered}</strong><small>{screensResult.summary.online} online now</small></article>
      <article className="metric-card metric-blue"><div className="metric-accent" /><span className="metric-label">Approved media</span><strong>{mediaResult.summary.approved}</strong><small>{mediaResult.summary.inReview} waiting for review</small></article>
      <article className="metric-card metric-orange"><div className="metric-accent" /><span className="metric-label">Active channels</span><strong>{activeChannels}</strong><small>{channelResult.channels.reduce((count, channel) => count + channel.organizations.length, 0)} business assignments</small></article>
      <article className="metric-card metric-violet"><div className="metric-accent" /><span className="metric-label">Active campaigns</span><strong>{activeCampaigns}</strong><small>Scheduling enters beta next</small></article>
    </section>

    <section className="dashboard-grid">
      <article className="panel beta-readiness-panel">
        <div className="panel-header"><div><h2>Beta operating flow</h2><p>The real workflows available to controlled testers today.</p></div><Rocket size={19} /></div>
        <div className="beta-flow-list">
          <Link href="/business"><CheckCircle2 size={17} /><span><strong>1. Add the business</strong><small>Administrator-created organization and owner access</small></span><ArrowRight size={15} /></Link>
          <Link href="/screens"><CheckCircle2 size={17} /><span><strong>2. Pair a screen</strong><small>Location assignment, device credentials, and heartbeat</small></span><ArrowRight size={15} /></Link>
          <Link href="/media"><CheckCircle2 size={17} /><span><strong>3. Upload and approve media</strong><small>Private upload, processing, and moderation</small></span><ArrowRight size={15} /></Link>
          {workspace.permissions.canAccessAdmin ? <Link href="/channels"><CheckCircle2 size={17} /><span><strong>4. Build the channel</strong><small>Assign businesses and order approved media</small></span><ArrowRight size={15} /></Link> : null}
        </div>
      </article>
      <article className="panel alerts-panel">
        <div className="panel-header"><div><h2>Needs attention</h2><p>Current operational signals, not sample alerts.</p></div><span className="count-badge">{issues.length}</span></div>
        {issues.length ? <div className="alert-list">{issues.map((issue) => <Link href={issue.href} className="alert-item" key={issue.title}><span className={`alert-icon alert-${issue.tone}`}><CircleAlert size={17} /></span><div><strong>{issue.title}</strong><p>{issue.detail}</p></div><ArrowRight size={15} /></Link>)}</div> : <div className="beta-clear-state"><CheckCircle2 size={25} /><strong>No current alerts</strong><p>Paired-screen and processing issues will appear here.</p></div>}
      </article>
    </section>

    <section className="panel table-panel">
      <div className="panel-header"><div><h2>Screen health</h2><p>Latest live state from registered devices.</p></div><Link href="/screens" className="text-link">Manage screens <ArrowRight size={16} /></Link></div>
      {screensResult.screens.length ? screensResult.screens.slice(0, 4).map((screen) => <div className="compact-row" key={screen.id}><span className={`screen-orb orb-${screen.tone}`}><MonitorPlay size={15} /></span><div><strong>{screen.name}</strong><small>{screen.location}</small></div><div className="compact-status"><StatusPill tone={screen.tone}>{screen.status}</StatusPill><small>{screen.heartbeat}</small></div></div>) : <div className="management-empty"><MonitorPlay size={23} /><strong>No screens paired</strong><p>Add a location and pair the first beta device.</p></div>}
    </section>

    <section className="beta-scope-note"><RadioTower size={19} /><div><strong>Limited beta scope</strong><p>Organization onboarding, locations, screen pairing, media moderation, and channel streaming are enabled. Campaign scheduling, proof-of-play settlement, and real wallet transactions remain disabled until their server workflows are complete.</p></div><Clapperboard size={19} /></section>
  </>;
}
