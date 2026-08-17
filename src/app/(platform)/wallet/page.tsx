import { WalletCards } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Wallet" };

const walletLabels: Record<string, string> = { purchased: "Purchased", earned: "Earned", promotional: "Promotional", held: "Held" };

export default async function WalletPage() {
  const workspace = await getWorkspaceContext();
  const supabase = await createClient();
  const { data: wallets } = workspace.organization.id ? await supabase.from("wallets").select("id,wallet_type,balance_projection,updated_at").eq("organization_id", workspace.organization.id).order("wallet_type") : { data: [] };
  return <>
    <PageHeading eyebrow="Credit ledger" title="Wallet" description="Review live balance projections. Verified stream viewing earns credits when enabled, while every displayed ad consumes the advertiser's configured rate." />
    <section className="mini-metric-grid">{(wallets ?? []).map((wallet) => <div key={wallet.id}><span>{walletLabels[wallet.wallet_type] ?? wallet.wallet_type}</span><strong>{Number(wallet.balance_projection).toFixed(3)} cr</strong><small>Ledger-backed balance projection</small></div>)}</section>
    {!wallets?.length ? <article className="panel management-empty"><WalletCards size={24} /><strong>No business wallet is assigned</strong><p>Wallet balances appear for active business workspaces after the credit migration is deployed.</p></article> : null}
  </>;
}
