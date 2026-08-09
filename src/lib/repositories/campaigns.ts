import { campaigns as demoCampaigns, type StatusTone } from "@/lib/platform-data";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type CampaignCard = {
  name: string;
  asset: string;
  status: string;
  spent: number;
  budget: number;
  plays: number;
  pace: string;
  tone: StatusTone;
  dates: string;
};

function statusTone(status: string): StatusTone {
  if (status === "active") return "success";
  if (status === "scheduled") return "info";
  if (status === "paused") return "neutral";
  if (status === "cancelled") return "danger";
  return "warning";
}

function formatDateRange(startsAt: string, endsAt: string) {
  const format = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${format.format(new Date(startsAt))} - ${format.format(new Date(endsAt))}`;
}

export async function getCampaignCards(): Promise<{ source: "demo" | "supabase" | "setup"; campaigns: CampaignCard[] }> {
  if (!hasSupabaseEnv()) {
    return {
      source: "demo",
      campaigns: demoCampaigns.map((campaign) => ({ ...campaign, dates: "Aug 1 - Aug 31" })),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select("name,status,budget_credits,spent_credits,starts_at,ends_at")
    .order("created_at", { ascending: false });

  if (error) {
    if (error.code === "PGRST205" || error.code === "42501") {
      return { source: "setup", campaigns: [] };
    }
    throw new Error(`Unable to load campaigns: ${error.message}`);
  }

  return {
    source: "supabase",
    campaigns: data.map((campaign) => ({
      name: campaign.name,
      asset: "Approved video",
      status: campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1),
      spent: Number(campaign.spent_credits),
      budget: Number(campaign.budget_credits),
      plays: 0,
      pace: campaign.status === "active" ? "Calculating" : campaign.status === "scheduled" ? "Not started" : "Paused",
      tone: statusTone(campaign.status),
      dates: formatDateRange(campaign.starts_at, campaign.ends_at),
    })),
  };
}
