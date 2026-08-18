import Link from "next/link";
import { Activity, ArrowRight, CalendarDays, CheckCircle2, ChevronRight, CircleAlert, MonitorPlay, Play, Plus, ShieldCheck } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { StatusPill } from "@/components/status-pill";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getCampaignWorkspace } from "@/lib/repositories/campaigns";
import { getMediaLibrary } from "@/lib/repositories/media";
import { getPlaybackOverview } from "@/lib/repositories/overview";
import { getScreens } from "@/lib/repositories/screens";

export const metadata = { title: "Overview" };

function dateRangeLabels() {
  const end = new Date();
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - 13));
  const format = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
  const middle = new Date(start.getTime() + 6 * 86_400_000);
  return [format.format(start), format.format(middle), format.format(end)];
}

export default async function OverviewPage() {
  const [workspace, screensResult, mediaResult, campaignResult, playbackResult] = await Promise.all([
    getWorkspaceContext(),
    getScreens(),
    getMediaLibrary(),
    getCampaignWorkspace(),
    getPlaybackOverview(),
  ]);
  const activeCampaigns = campaignResult.campaigns.filter((campaign) => campaign.status === "Active").length;
  const issues = [
    ...(playbackResult.heldCount > 0 ? [{ title: `${playbackResult.heldCount} playback${playbackResult.heldCount === 1 ? "" : "s"} need review`, detail: "Evidence validation placed these sessions on hold.", tone: "warning" as const, href: "/monitor#proof" }] : []),
    ...screensResult.screens.filter((screen) => screen.status !== "Online").slice(0, 2).map((screen) => ({ title: `${screen.name} is ${screen.status.toLowerCase()}`, detail: `${screen.location} · last heartbeat ${screen.heartbeat}`, tone: "danger" as const, href: "/screens" })),
    ...mediaResult.assets.filter((asset) => asset.processingStatus === "failed").slice(0, 2).map((asset) => ({ title: `${asset.name} failed processing`, detail: asset.processingError || "Open the media library for details.", tone: "warning" as const, href: "/media" })),
  ].slice(0, 3);
  const chartMaximum = Math.max(...playbackResult.deliverySeries, 1);
  const [rangeStart, rangeMiddle, rangeEnd] = dateRangeLabels();

  return <>
    <PageHeading
      eyebrow="Network overview"
      title={`Welcome, ${workspace.organization.name}`}
      description="Here is how your advertising network is performing across the last 14 days."
      actions={<><span className="button button-secondary overview-period"><CalendarDays size={17} /> Last 14 days</span><Link href="/campaigns" className="button button-primary"><Plus size={17} /> {campaignResult.canCreate ? "New campaign" : "View campaigns"}</Link></>}
    />

    <section className="metric-grid" aria-label="Network summary">
      <article className="metric-card metric-teal"><div className="metric-accent" /><span className="metric-label">Registered screens</span><strong>{screensResult.summary.registered}</strong><small>{screensResult.summary.online} online across {screensResult.summary.locations} locations</small></article>
      <article className="metric-card metric-blue"><div className="metric-accent" /><span className="metric-label">Online screens</span><strong>{screensResult.summary.onlinePercent}%</strong><small>{screensResult.summary.needsAction} need attention</small></article>
      <article className="metric-card metric-orange"><div className="metric-accent" /><span className="metric-label">Active campaigns</span><strong>{activeCampaigns}</strong><small>{campaignResult.campaigns.length} total campaign plans</small></article>
      <article className="metric-card metric-violet"><div className="metric-accent" /><span className="metric-label">Verified plays</span><strong>{playbackResult.acceptedCount.toLocaleString()}</strong><small>Accepted during the last 14 days</small></article>
    </section>

    <section className="dashboard-grid">
      <article className="panel chart-panel">
        <div className="panel-header"><div><h2>Verified delivery</h2><p>Accepted plays across your campaigns</p></div><span className={`trend-badge ${playbackResult.acceptanceRate === null ? "trend-badge-neutral" : ""}`}><ShieldCheck size={15} /> {playbackResult.acceptanceRate === null ? "Awaiting data" : `${playbackResult.acceptanceRate}% accepted`}</span></div>
        <div className="chart-summary"><strong>{playbackResult.acceptedCount.toLocaleString()}</strong><span>completed plays in 14 days</span></div>
        {playbackResult.totalCount > 0 ? <><div className="bar-chart" aria-label="Accepted plays over the last 14 days">{playbackResult.deliverySeries.map((value, index) => <span key={index} style={{ height: `${Math.max(value === 0 ? 2 : 8, Math.round((value / chartMaximum) * 100))}%` }}><i>{value}</i></span>)}</div><div className="chart-labels"><span>{rangeStart}</span><span>{rangeMiddle}</span><span>{rangeEnd}</span></div></> : <div className="dashboard-panel-empty dashboard-chart-empty"><Activity size={24} /><strong>No verified delivery yet</strong><p>Accepted device playback will build this 14-day chart automatically.</p></div>}
      </article>
      <article className="panel alerts-panel">
        <div className="panel-header"><div><h2>Needs attention</h2><p>Current operational alerts</p></div><span className="count-badge">{issues.length}</span></div>
        {issues.length ? <div className="alert-list">{issues.map((issue) => <Link href={issue.href} className="alert-item" key={issue.title}><span className={`alert-icon alert-${issue.tone}`}><CircleAlert size={17} /></span><div><strong>{issue.title}</strong><p>{issue.detail}</p></div><ChevronRight size={17} /></Link>)}</div> : <div className="dashboard-panel-empty"><CheckCircle2 size={24} /><strong>Everything looks clear</strong><p>Screen, media, and playback issues will appear here.</p></div>}
      </article>
    </section>

    <section className="panel table-panel">
      <div className="panel-header"><div><h2>Recent campaigns</h2><p>Delivery pace and credit usage</p></div><Link href="/campaigns" className="text-link">View all <ArrowRight size={16} /></Link></div>
      {campaignResult.campaigns.length ? <div className="table-scroll"><table><thead><tr><th>Campaign</th><th>Status</th><th>Delivery</th><th>Verified plays</th><th>Budget</th><th>Pace</th></tr></thead><tbody>{campaignResult.campaigns.slice(0, 3).map((campaign) => { const delivery = campaign.budget === 0 ? 0 : Math.round((campaign.spent / campaign.budget) * 100); const plays = playbackResult.playsByCampaign.get(campaign.publicId) ?? 0; return <tr key={campaign.publicId}><td><strong>{campaign.name}</strong><small>{campaign.asset} creative</small></td><td><StatusPill tone={campaign.tone}>{campaign.status}</StatusPill></td><td><div className="progress-cell"><span><i style={{ width: `${Math.min(delivery, 100)}%` }} /></span><small>{delivery}%</small></div></td><td>{plays.toLocaleString()}</td><td>{campaign.spent} / {campaign.budget} cr</td><td>{campaign.pace}</td></tr>; })}</tbody></table></div> : <div className="dashboard-panel-empty dashboard-table-empty"><Activity size={24} /><strong>No campaigns created yet</strong><p>Your first campaign will appear here once it is saved.</p><Link href="/campaigns" className="text-link">Open campaigns <ArrowRight size={15} /></Link></div>}
    </section>

    <section className="bottom-grid">
      <article className="panel screen-panel"><div className="panel-header"><div><h2>Screen health</h2><p>Live status from your locations</p></div><Link href="/screens" className="text-link">Manage screens <ArrowRight size={16} /></Link></div>{screensResult.screens.length ? screensResult.screens.slice(0, 3).map((screen) => <div className="compact-row" key={screen.id}><span className={`screen-orb orb-${screen.tone}`}><Play size={15} fill="currentColor" /></span><div><strong>{screen.name}</strong><small>{screen.location}</small></div><div className="compact-status"><StatusPill tone={screen.tone}>{screen.status}</StatusPill><small>{screen.heartbeat}</small></div></div>) : <div className="dashboard-panel-empty"><MonitorPlay size={24} /><strong>No screens paired</strong><p>Pair a device to begin monitoring screen health.</p></div>}</article>
      <article className="panel evidence-panel"><div className="panel-header"><div><h2>Latest playback evidence</h2><p>Recent verification activity</p></div><ShieldCheck size={18} className="panel-header-icon" /></div>{playbackResult.latest.length ? playbackResult.latest.map((item) => <div className="settlement-row" key={item.id}><div><strong>{item.asset}</strong><small>{item.host} · {item.received}</small></div><div><StatusPill tone={item.tone}>{item.result}</StatusPill><small>{item.verifiedSeconds.toFixed(1)} sec verified</small></div></div>) : <div className="dashboard-panel-empty"><ShieldCheck size={24} /><strong>No playback evidence yet</strong><p>Verified device sessions will appear here.</p></div>}</article>
    </section>
  </>;
}
