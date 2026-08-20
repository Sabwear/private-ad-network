import Link from "next/link";
import { ArrowDownRight, ArrowLeft, ArrowUpRight, Building2, CircleDollarSign, Clock3, CreditCard, Eye, Megaphone, ReceiptText, UserRound, WalletCards } from "lucide-react";
import { CreditGrantForm } from "@/components/credit-grant-form";
import { PageHeading } from "@/components/page-heading";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Wallets" };

type BusinessWalletSummary = { id: number; name: string; status: string; balance: number; promotionalBalance: number; purchasedBalance: number; earnedBalance: number; heldBalance: number; fundedCredits: number; spentCredits: number; earnedCredits: number; lastActivityAt: string | null; lastFundedBy: string };
type WalletDetail = { id: number; type: string; balance: number; updatedAt: string };
type FundingActivity = { id: number; transactionId: number; publicId: string; amount: number; walletType: string; type: string; referenceType: string; referenceId: string; description: string; reason: string | null; fundedBy: string; funderEmail: string | null; createdAt: string };
type SpendActivity = { id: number; transactionId: number; publicId: string; amount: number; walletType: string; type: string; referenceType: string; referenceId: string; description: string; reason: string | null; createdAt: string; asset: string | null; hostBusiness: string | null; verifiedSeconds: number | null; busyMultiplier: string | null; validationResult: string | null };
type SelectedBusiness = { id: number; name: string; status: string; balance: number; fundedCredits: number; spentCredits: number; earnedCredits: number; activeCampaigns: number; campaignBudget: number; campaignSpent: number; lastActivityAt: string | null; wallets: WalletDetail[]; fundingHistory: FundingActivity[]; spendHistory: SpendActivity[] };
type WalletReport = { generatedAt: string; businesses: BusinessWalletSummary[]; selectedBusiness: SelectedBusiness | null };

const walletLabels: Record<string, string> = { purchased: "Purchased", earned: "Earned", promotional: "Promotional", held: "Held" };
const transactionLabels: Record<string, string> = { bonus: "Promotional grant", purchase: "Credit purchase", adjustment: "Adjustment", settlement: "Ad delivery" };

function credits(value: number) { return `${Number(value).toLocaleString("en-GB", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} cr`; }
function dateTime(value: string | null) { return value ? new Date(value).toLocaleString("en-GB", { timeZone: "Africa/Casablanca", dateStyle: "medium", timeStyle: "short" }) : "No activity yet"; }
function shortReference(publicId: string, transactionId: number) { return publicId ? publicId.slice(0, 8).toUpperCase() : `TX-${transactionId}`; }

export default async function WalletPage({ searchParams }: { searchParams: Promise<{ business?: string }> }) {
  const workspace = await getWorkspaceContext();
  if (!workspace.permissions.canAccessAdmin) return null;
  const query = await searchParams;
  const selectedId = /^\d+$/.test(query.business ?? "") ? Number(query.business) : null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_admin_wallet_report", { p_organization_id: selectedId, p_history_limit: 100 });
  const report = data as unknown as WalletReport | null;
  const businesses = report?.businesses ?? [];
  const selected = report?.selectedBusiness ?? null;
  const total = businesses.reduce((sum, business) => sum + Number(business.balance), 0);
  const funded = businesses.reduce((sum, business) => sum + Number(business.fundedCredits), 0);
  const spent = businesses.reduce((sum, business) => sum + Number(business.spentCredits), 0);
  const formBusinesses = businesses.map((business) => ({ id: business.id, name: business.name }));

  return <>
    <PageHeading eyebrow="Credit intelligence" title="Business wallets" description="Track who funded every business, the credits available now, and exactly how those credits are spent." />
    {error ? <article className="wallet-report-error"><ReceiptText size={18} /><div><strong>Wallet intelligence is not available</strong><p>{error.code === "PGRST202" ? "Deploy the administrator wallet-reporting migration to load funding and spend history." : "The ledger report could not be loaded. No balance data has been changed."}</p></div></article> : null}
    <section className="mini-metric-grid wallet-network-metrics">
      <div><span>Available across businesses</span><strong>{credits(total)}</strong><small>Current ledger-backed balance</small></div>
      <div><span>Lifetime business funding</span><strong>{credits(funded)}</strong><small>Purchases, grants, and adjustments</small></div>
      <div><span>Lifetime advertising spend</span><strong>{credits(spent)}</strong><small>Debited from spendable wallets</small></div>
      <div><span>Businesses tracked</span><strong>{businesses.length}</strong><small>{report ? `Report refreshed ${dateTime(report.generatedAt)}` : "Waiting for report"}</small></div>
    </section>
    <CreditGrantForm businesses={formBusinesses} />

    {selected ? <section className="wallet-business-detail" id="business-wallet-detail">
      <header className="wallet-detail-heading"><div><Link href="/wallet"><ArrowLeft size={14} />All businesses</Link><span className="eyebrow">Business credit profile</span><h2>{selected.name}</h2><p>Lifetime accounting totals, wallet positions, funders, and detailed advertising consumption.</p></div><span className={`wallet-business-status ${selected.status}`}>{selected.status}</span></header>
      <div className="wallet-detail-metrics">
        <article><span className="wallet-detail-icon teal"><WalletCards size={18} /></span><div><small>Available now</small><strong>{credits(selected.balance)}</strong><p>Across all wallet sources</p></div></article>
        <article><span className="wallet-detail-icon blue"><ArrowDownRight size={18} /></span><div><small>Total funded</small><strong>{credits(selected.fundedCredits)}</strong><p>Lifetime incoming business credit</p></div></article>
        <article><span className="wallet-detail-icon orange"><ArrowUpRight size={18} /></span><div><small>Total spent</small><strong>{credits(selected.spentCredits)}</strong><p>Verified advertising consumption</p></div></article>
        <article><span className="wallet-detail-icon purple"><Megaphone size={18} /></span><div><small>Campaign position</small><strong>{selected.activeCampaigns} active</strong><p>{credits(selected.campaignSpent)} of {credits(selected.campaignBudget)}</p></div></article>
      </div>
      <div className="wallet-source-grid">{selected.wallets.map((wallet) => <article key={wallet.id}><span className={`wallet-source-icon ${wallet.type}`}><CreditCard size={17} /></span><div><small>{walletLabels[wallet.type] ?? wallet.type}</small><strong>{credits(wallet.balance)}</strong><p>Updated {dateTime(wallet.updatedAt)}</p></div></article>)}</div>
      <div className="wallet-history-grid">
        <article className="panel wallet-history-panel"><div className="panel-header"><div><h2>Funding history</h2><p>Who added credits, how much they issued, and the administrative reason.</p></div><CircleDollarSign size={20} /></div><div className="table-scroll"><table><thead><tr><th>Date</th><th>Funded by</th><th>Details</th><th>Wallet</th><th>Amount</th></tr></thead><tbody>
          {selected.fundingHistory.map((activity) => <tr key={activity.id}><td><strong>{dateTime(activity.createdAt)}</strong><small>{shortReference(activity.publicId, activity.transactionId)}</small></td><td><div className="wallet-actor"><span><UserRound size={14} /></span><div><strong>{activity.fundedBy}</strong><small>{activity.funderEmail ?? "Authenticated platform administrator"}</small></div></div></td><td><strong>{transactionLabels[activity.type] ?? activity.type}</strong><small>{activity.reason ?? activity.description}</small></td><td><span className={`wallet-type-chip ${activity.walletType}`}>{walletLabels[activity.walletType] ?? activity.walletType}</span></td><td className="wallet-amount-positive">+{credits(activity.amount)}</td></tr>)}
          {!selected.fundingHistory.length ? <tr><td colSpan={5} className="wallet-empty-row">No funding has been recorded for this business.</td></tr> : null}
        </tbody></table></div></article>
        <article className="panel wallet-history-panel"><div className="panel-header"><div><h2>Detailed spend history</h2><p>Every wallet debit, with the delivered asset, host business, timing, and pricing evidence.</p></div><ReceiptText size={20} /></div><div className="table-scroll"><table><thead><tr><th>Date</th><th>Delivery</th><th>Evidence</th><th>Paid from</th><th>Spent</th></tr></thead><tbody>
          {selected.spendHistory.map((activity) => <tr key={activity.id}><td><strong>{dateTime(activity.createdAt)}</strong><small>{shortReference(activity.publicId, activity.transactionId)}</small></td><td><strong>{activity.asset ?? transactionLabels[activity.type] ?? activity.description}</strong><small>{activity.hostBusiness ? `Shown at ${activity.hostBusiness}` : activity.description}</small></td><td><strong>{activity.verifiedSeconds === null ? "Ledger transaction" : `${Number(activity.verifiedSeconds).toFixed(1)} verified sec`}</strong><small>{activity.busyMultiplier ? `${Number(activity.busyMultiplier).toFixed(2)}× venue multiplier` : activity.validationResult ?? activity.referenceType.replaceAll("_", " ")}</small></td><td><span className={`wallet-type-chip ${activity.walletType}`}>{walletLabels[activity.walletType] ?? activity.walletType}</span></td><td className="wallet-amount-negative">−{credits(activity.amount)}</td></tr>)}
          {!selected.spendHistory.length ? <tr><td colSpan={5} className="wallet-empty-row">No credit spend has been recorded for this business.</td></tr> : null}
        </tbody></table></div></article>
      </div>
    </section> : null}

    {!businesses.length && !error ? <article className="panel management-empty"><WalletCards size={24} /><strong>No business wallets available</strong><p>Wallets are created automatically when an administrator creates a business.</p></article> : businesses.length ? <article className="panel management-registry wallet-business-registry"><div className="panel-header"><div><h2>Business credit registry</h2><p>Select a business to inspect its complete funding position and recent spend evidence.</p></div><span>{businesses.length} businesses</span></div><div className="table-scroll"><table><thead><tr><th>Business</th><th>Available now</th><th>Lifetime funded</th><th>Lifetime spent</th><th>Last funded by</th><th>Last activity</th><th /></tr></thead><tbody>{businesses.map((business) => {
      const href = `/wallet?business=${business.id}#business-wallet-detail`;
      return <tr key={business.id} className={selected?.id === business.id ? "selected" : undefined}><td><Link href={href} className="wallet-row-link"><span className="wallet-business-mark"><Building2 size={15} /></span><span><strong>{business.name}</strong><small>{business.status} · {credits(business.earnedCredits)} earned</small></span></Link></td><td><Link href={href} className="wallet-row-link"><strong>{credits(business.balance)}</strong><small>{credits(business.promotionalBalance)} promotional</small></Link></td><td><Link href={href} className="wallet-row-link"><strong>{credits(business.fundedCredits)}</strong><small>Lifetime incoming</small></Link></td><td><Link href={href} className="wallet-row-link"><strong>{credits(business.spentCredits)}</strong><small>Advertising consumed</small></Link></td><td><Link href={href} className="wallet-row-link"><strong>{business.lastFundedBy}</strong><small>Most recent funder</small></Link></td><td><Link href={href} className="wallet-row-link"><strong>{dateTime(business.lastActivityAt)}</strong><small><Clock3 size={11} /> Ledger activity</small></Link></td><td><Link href={href} className="wallet-inspect-link" aria-label={`View ${business.name} wallet details`}><Eye size={14} />View details</Link></td></tr>;
    })}</tbody></table></div></article> : null}
  </>;
}
