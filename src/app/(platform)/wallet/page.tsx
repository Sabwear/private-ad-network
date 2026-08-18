import { WalletCards } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Wallets" };

const walletLabels: Record<string, string> = { purchased: "Purchased", earned: "Earned", promotional: "Promotional", held: "Held" };

export default async function WalletPage() {
  const workspace = await getWorkspaceContext();
  if (!workspace.permissions.canAccessAdmin) return null;
  const supabase = await createClient();
  const [walletResult, businessResult] = await Promise.all([
    supabase.from("wallets").select("id,organization_id,wallet_type,balance_projection,updated_at").not("organization_id", "is", null).order("organization_id"),
    supabase.from("organizations").select("id,display_name").order("display_name"),
  ]);
  const wallets = walletResult.data ?? [];
  const businessNames = new Map((businessResult.data ?? []).map((business) => [business.id, business.display_name]));
  const total = wallets.reduce((sum, wallet) => sum + Number(wallet.balance_projection), 0);
  const earned = wallets.filter((wallet) => wallet.wallet_type === "earned").reduce((sum, wallet) => sum + Number(wallet.balance_projection), 0);
  const held = wallets.filter((wallet) => wallet.wallet_type === "held").reduce((sum, wallet) => sum + Number(wallet.balance_projection), 0);

  return <>
    <PageHeading eyebrow="Credit ledger" title="Business wallets" description="Administrators review every business balance and the network-wide credit position from one place." />
    <section className="mini-metric-grid"><div><span>Total projected credits</span><strong>{total.toFixed(3)} cr</strong><small>Across all business wallets</small></div><div><span>Earned credits</span><strong>{earned.toFixed(3)} cr</strong><small>Available business earnings</small></div><div><span>Held credits</span><strong>{held.toFixed(3)} cr</strong><small>Reserved across campaigns</small></div><div><span>Businesses</span><strong>{businessNames.size}</strong><small>Administrator-managed entities</small></div></section>
    {!wallets.length ? <article className="panel management-empty"><WalletCards size={24} /><strong>No business wallets available</strong><p>Wallets are created automatically when an administrator creates a business.</p></article> : <article className="panel management-registry"><div className="panel-header"><div><h2>Wallet registry</h2><p>Live ledger-backed balance projections for every business.</p></div></div><div className="table-scroll"><table><thead><tr><th>Business</th><th>Wallet</th><th>Balance</th><th>Last updated</th></tr></thead><tbody>{wallets.map((wallet) => <tr key={wallet.id}><td><strong>{businessNames.get(wallet.organization_id!) ?? "Unknown business"}</strong></td><td>{walletLabels[wallet.wallet_type] ?? wallet.wallet_type}</td><td><strong>{Number(wallet.balance_projection).toFixed(3)} cr</strong></td><td>{new Date(wallet.updated_at).toLocaleString("en-GB", { timeZone: "Africa/Casablanca" })}</td></tr>)}</tbody></table></div></article>}
  </>;
}
