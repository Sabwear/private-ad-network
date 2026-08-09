import { BetaUnavailable } from "@/components/beta-unavailable";
import { PageHeading } from "@/components/page-heading";

export const metadata = { title: "Proof of play" };

export default function ProofPage() {
  return <><PageHeading eyebrow="Trust engine" title="Proof of play" description="Verified playback evidence will appear after signed device manifests and event ingestion are enabled." /><BetaUnavailable title="Playback evidence is not collecting yet" description="No sample acceptance or settlement percentages are shown during beta. This page will activate only when device evidence is validated by the server." next="Use the live channel viewer to test media continuity; playback settlement remains out of scope." /></>;
}
