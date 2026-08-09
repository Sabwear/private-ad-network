import { BetaUnavailable } from "@/components/beta-unavailable";
import { PageHeading } from "@/components/page-heading";

export const metadata = { title: "Wallet" };

export default function WalletPage() {
  return <><PageHeading eyebrow="Credit ledger" title="Wallet" description="Balances will appear only after audited campaign holds and settlement are enabled." /><BetaUnavailable title="Real credit movement is still locked" description="The previous prototype balances have been removed so beta testers never mistake demonstration credits for financial records." next="Test business onboarding, screen pairing, media processing, moderation, and channel streaming." /></>;
}
