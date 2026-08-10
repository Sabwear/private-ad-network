import { CalendarDays, LockKeyhole, Target } from "lucide-react";
import { CampaignDraftForm } from "@/components/campaign-draft-form";
import { DeleteCampaignDraft } from "@/components/delete-campaign-draft";
import { PageHeading } from "@/components/page-heading";
import { StatusPill } from "@/components/status-pill";
import { getCampaignWorkspace } from "@/lib/repositories/campaigns";

export const metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  const result = await getCampaignWorkspace();
  const active = result.campaigns.filter((campaign) => campaign.status === "Active").length;
  const scheduled = result.campaigns.filter((campaign) => campaign.status === "Scheduled").length;
  const drafts = result.campaigns.filter((campaign) => campaign.status === "Draft").length;
  const minimumDate = new Date().toISOString().slice(0, 10);

  return <>
    <PageHeading eyebrow="Advertising" title="Campaigns" description="Plan approved media, audiences, dates, and controlled delivery limits." actions={<span className={`data-source data-source-${result.source}`}>{result.source === "supabase" ? "Live data" : "Setup required"}</span>} />
    {result.canCreate ? <CampaignDraftForm media={result.mediaOptions} targets={result.targetOptions} minimumDate={minimumDate} /> : <section className="campaign-owner-note panel"><LockKeyhole size={20} /><div><strong>Business campaign planning</strong><p>Campaign drafts are created by an active business owner or team member. Platform administrators retain oversight without acting as an advertiser.</p></div></section>}
    <div className="segmented" aria-label="Campaign summary"><span className="selected">All <b>{result.campaigns.length}</b></span><span>Drafts <b>{drafts}</b></span><span>Scheduled <b>{scheduled}</b></span><span>Active <b>{active}</b></span></div>
    {result.campaigns.length === 0 ? <section className="empty-state"><Target size={27} /><h2>No campaigns yet</h2><p>{result.canCreate ? "Create the first draft after approved media and a target business are available." : "Campaigns created by business owners will appear here for oversight."}</p></section> : <section className="campaign-grid">{result.campaigns.map((campaign) => <article className="campaign-card" key={campaign.publicId}>
      <div className="campaign-card-top"><span className="creative-icon"><Target size={20} /></span><StatusPill tone={campaign.tone}>{campaign.status}</StatusPill></div>
      <div><h2>{campaign.name}</h2><p>{campaign.asset} · {campaign.targets.length ? campaign.targets.join(", ") : "No target businesses"}</p></div>
      <div className="campaign-stats"><div><span>Verified plays</span><strong>{campaign.plays.toLocaleString()}</strong></div><div><span>Credits spent</span><strong>{campaign.spent}</strong></div><div><span>Delivery state</span><strong>{campaign.pace}</strong></div></div>
      <div className="budget-block"><div><span>Total budget</span><strong>{campaign.spent} / {campaign.budget} cr</strong></div><span className="budget-track"><i style={{ width: `${campaign.spent > 0 ? Math.max(2, campaign.spent / campaign.budget * 100) : 0}%` }} /></span></div>
      <footer><span><CalendarDays size={15} /> {campaign.dates}</span>{result.canCreate && campaign.status === "Draft" ? <DeleteCampaignDraft publicId={campaign.publicId} name={campaign.name} /> : <span>Activation locked</span>}</footer>
    </article>)}</section>}
  </>;
}
