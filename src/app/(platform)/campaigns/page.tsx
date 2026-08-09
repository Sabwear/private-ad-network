import { CalendarDays, MoreHorizontal, Plus, Target } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { StatusPill } from "@/components/status-pill";
import { getCampaignCards } from "@/lib/repositories/campaigns";

export const metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  const result = await getCampaignCards();
  const active = result.campaigns.filter((campaign) => campaign.status === "Active").length;
  const scheduled = result.campaigns.filter((campaign) => campaign.status === "Scheduled").length;
  const paused = result.campaigns.filter((campaign) => campaign.status === "Paused").length;
  const sourceLabel = result.source === "supabase" ? "Supabase data" : result.source === "setup" ? "Setup required" : "Demo data";
  const setupRequired = result.source === "setup";

  return (
    <>
      <PageHeading
        eyebrow="Advertising"
        title="Campaigns"
        description="Allocate credits, control delivery, and track every verified play."
        actions={<><span className={`data-source data-source-${result.source}`}>{sourceLabel}</span><button className="button button-primary" disabled={setupRequired}><Plus size={17} /> Create campaign</button></>}
      />
      <div className="segmented">
        <button className="selected">All campaigns <span>{result.campaigns.length}</span></button>
        <button>Active <span>{active}</span></button>
        <button>Scheduled <span>{scheduled}</span></button>
        <button>Paused <span>{paused}</span></button>
      </div>
      {result.campaigns.length === 0 ? (
        <section className="empty-state">
          <Target size={27} />
          <h2>{setupRequired ? "Database setup required" : "No campaigns yet"}</h2>
          <p>{setupRequired ? "Apply the Supabase migration and assign this account to an organization before creating campaigns." : "Create the first campaign after an approved media asset and wallet are available."}</p>
          <button className="button button-primary" disabled={setupRequired}><Plus size={17} /> Create campaign</button>
        </section>
      ) : (
        <section className="campaign-grid">
          {result.campaigns.map((campaign) => (
            <article className="campaign-card" key={campaign.name}>
              <div className="campaign-card-top"><span className="creative-icon"><Target size={20} /></span><button className="icon-button" aria-label={`Actions for ${campaign.name}`}><MoreHorizontal size={19} /></button></div>
              <div><StatusPill tone={campaign.tone}>{campaign.status}</StatusPill><h2>{campaign.name}</h2><p>{campaign.asset} · All eligible locations</p></div>
              <div className="campaign-stats"><div><span>Verified plays</span><strong>{campaign.plays.toLocaleString()}</strong></div><div><span>Credits spent</span><strong>{campaign.spent}</strong></div><div><span>Delivery pace</span><strong>{campaign.pace}</strong></div></div>
              <div className="budget-block"><div><span>Total budget</span><strong>{campaign.spent} / {campaign.budget} cr</strong></div><span className="budget-track"><i style={{ width: `${Math.max(2, campaign.spent / campaign.budget * 100)}%` }} /></span></div>
              <footer><span><CalendarDays size={15} /> {campaign.dates}</span><button className="text-button">View details</button></footer>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
