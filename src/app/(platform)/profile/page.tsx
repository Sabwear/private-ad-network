import { Building2 } from "lucide-react";
import { BusinessStreamAccess } from "@/components/business-stream-access";
import { PageHeading } from "@/components/page-heading";
import { getBusinessStreamProfile } from "@/lib/repositories/business-profile";

export const metadata = { title: "Business profile" };

export default async function BusinessProfilePage({ searchParams }: { searchParams: Promise<{ mode?: string; activity?: string; channel?: string }> }) {
  const query = await searchParams;
  const filters = {
    mode: ["anonymous", "registered"].includes(query.mode ?? "") ? query.mode as "anonymous" | "registered" : "all" as const,
    activity: ["live", "ended"].includes(query.activity ?? "") ? query.activity as "live" | "ended" : "all" as const,
    channelId: /^\d+$/.test(query.channel ?? "") ? Number(query.channel) : null,
  };
  const profile = await getBusinessStreamProfile(filters);
  return <>
    <PageHeading eyebrow="Business profile" title={profile?.organizationName ?? "Network administration"} description="Manage the private viewer code, streaming links, audience visibility, and business-specific credit rates." />
    {profile ? <article className="panel business-profile-page"><BusinessStreamAccess organizationId={profile.organizationId} accessCode={profile.accessCode} accessCodeExpiresAt={profile.accessCodeExpiresAt} earningEnabled={profile.earningEnabled} earningRate={profile.earningRate} consumptionRate={profile.consumptionRate} channels={profile.channels} rotations={profile.rotations} viewers={profile.viewers} summary={profile.summary} filters={profile.filters} showViewers /></article> : <article className="panel management-empty"><Building2 size={24} /><strong>No business profile is assigned</strong><p>Only platform administrators can create business profiles and assign approved owners.</p></article>}
  </>;
}
