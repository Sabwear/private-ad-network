import Link from "next/link";
import { CalendarDays, LockKeyhole, Plus, Target } from "lucide-react";
import { CampaignDraftEditor } from "@/components/campaign-draft-editor";
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
    <PageHeading eyebrow="Advertising" title="Campaigns" description="Create, edit, and manage advertiser campaigns with approved media, audiences, dates, and controlled delivery limits." actions={<><span className={`data-source data-source-${result.source}`}>{result.source === "supabase" ? "Live data" : "Setup required"}</span>{result.canCreate ? <Link href="#create-campaign" className="button button-primary"><Plus size={16} /> Add campaign</Link> : null}</>} />
    {result.canCreate ? <CampaignDraftForm advertisers={result.advertiserOptions} media={result.mediaOptions} targets={result.targetOptions} minimumDate={minimumDate} initialOrganizationId={result.isPlatformAdmin ? null : result.advertiserOptions[0]?.id ?? null} isPlatformAdmin={result.isPlatformAdmin} /> : <section className="campaign-owner-note panel"><LockKeyhole size={20} /><div><strong>Campaign management access required</strong><p>An active platform administrator, business owner, or authorized team member is required.</p></div></section>}
    <div className="segmented" aria-label="Campaign summary"><span className="selected">All <b>{result.campaigns.length}</b></span><span>Drafts <b>{drafts}</b></span><span>Scheduled <b>{scheduled}</b></span><span>Active <b>{active}</b></span></div>
    {result.campaigns.length === 0 ? <section className="empty-state"><Target size={27} /><h2>No campaigns yet</h2><p>{result.canCreate ? "Create the first draft after approved media and a target business are available." : "Campaigns will appear here after an authorized manager creates one."}</p></section> : <section className="campaign-grid">{result.campaigns.map((campaign) => <article className="campaign-card" key={campaign.publicId}>
      <div className="campaign-card-top"><span className="creative-icon"><Target size={20} /></span><StatusPill tone={campaign.tone}>{campaign.status}</StatusPill></div>
      <div><h2>{campaign.name}</h2><p>{campaign.organization} · {campaign.asset} · {campaign.targets.length ? campaign.targets.join(", ") : "No target businesses"}</p></div>
      <div className="campaign-stats"><div><span>Verified plays</span><strong>{campaign.plays.toLocaleString()}</strong></div><div><span>Credits spent</span><strong>{campaign.spent}</strong></div><div><span>Delivery state</span><strong>{campaign.pace}</strong></div></div>
      <div className="budget-block"><div><span>Total budget</span><strong>{campaign.spent} / {campaign.budget} cr</strong></div><span className="budget-track"><i style={{ width: `${campaign.spent > 0 ? Math.max(2, campaign.spent / campaign.budget * 100) : 0}%` }} /></span></div>
      <footer><span><CalendarDays size={15} /> {campaign.dates}</span>{result.canManage && campaign.status === "Draft" ? <div className="campaign-card-actions"><CampaignDraftEditor publicId={campaign.publicId} organizationId={campaign.organizationId} defaults={{ name: campaign.name, mediaAssetId: campaign.mediaAssetId, startsOn: campaign.startsOn, endsOn: campaign.endsOn, budgetCredits: campaign.budget, dailyCapCredits: campaign.dailyCapCredits, frequencyCapPerDay: campaign.frequencyCapPerDay, targetIds: campaign.targetIds }} advertisers={result.advertiserOptions} media={result.mediaOptions} targets={result.targetOptions} minimumDate={minimumDate} /><DeleteCampaignDraft publicId={campaign.publicId} name={campaign.name} /></div> : <span>Activation locked</span>}</footer>
    </article>)}</section>}
  </>;
}
