import Link from "next/link";
import { ArrowRight, CalendarDays, ChevronRight, CircleAlert, Download, Play, Plus, TrendingUp } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { StatusPill } from "@/components/status-pill";
import { alerts, campaigns, deliverySeries, evidence, metrics, screens } from "@/lib/platform-data";

export const metadata = { title: "Overview" };

export default function OverviewPage() {
  return (
    <>
      <PageHeading eyebrow="Sunday, 9 August" title="Good morning, Central Cafe" description="Here is how your advertising network is performing today." actions={<><button className="button button-secondary"><CalendarDays size={17} /> Last 14 days</button><Link href="/campaigns" className="button button-primary"><Plus size={17} /> New campaign</Link></>} />
      <section className="metric-grid" aria-label="Network summary">
        {metrics.map((metric) => <article className={`metric-card metric-${metric.tone}`} key={metric.label}><div className="metric-accent" /><span className="metric-label">{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></article>)}
      </section>
      <section className="dashboard-grid">
        <article className="panel chart-panel">
          <div className="panel-header"><div><h2>Verified delivery</h2><p>Accepted plays across your campaigns</p></div><span className="trend-badge"><TrendingUp size={15} /> 12.6%</span></div>
          <div className="chart-summary"><strong>7,842</strong><span>completed plays</span></div>
          <div className="bar-chart" aria-label="Completed plays over 14 days">{deliverySeries.map((value, index) => <span key={index} style={{ height: `${Math.round((value / 118) * 100)}%` }}><i>{value}</i></span>)}</div>
          <div className="chart-labels"><span>Jul 27</span><span>Aug 2</span><span>Aug 9</span></div>
        </article>
        <article className="panel alerts-panel">
          <div className="panel-header"><div><h2>Needs attention</h2><p>Operational alerts from the network</p></div><span className="count-badge">3</span></div>
          <div className="alert-list">{alerts.map((alert) => <div className="alert-item" key={alert.title}><span className={`alert-icon alert-${alert.tone}`}><CircleAlert size={17} /></span><div><strong>{alert.title}</strong><p>{alert.detail}</p><small>{alert.time}</small></div><ChevronRight size={17} /></div>)}</div>
        </article>
      </section>
      <section className="panel table-panel">
        <div className="panel-header"><div><h2>Active campaigns</h2><p>Delivery pace and credit usage</p></div><Link href="/campaigns" className="text-link">View all <ArrowRight size={16} /></Link></div>
        <div className="table-scroll"><table><thead><tr><th>Campaign</th><th>Status</th><th>Delivery</th><th>Completed plays</th><th>Budget</th><th>Pace</th></tr></thead><tbody>{campaigns.slice(0, 3).map((campaign) => <tr key={campaign.name}><td><strong>{campaign.name}</strong><small>{campaign.asset} creative</small></td><td><StatusPill tone={campaign.tone}>{campaign.status}</StatusPill></td><td><div className="progress-cell"><span><i style={{ width: `${campaign.spent / campaign.budget * 100}%` }} /></span><small>{Math.round(campaign.spent / campaign.budget * 100)}%</small></div></td><td>{campaign.plays.toLocaleString()}</td><td>{campaign.spent} / {campaign.budget} cr</td><td>{campaign.pace}</td></tr>)}</tbody></table></div>
      </section>
      <section className="bottom-grid">
        <article className="panel screen-panel"><div className="panel-header"><div><h2>Screen health</h2><p>Live status from your locations</p></div><Link href="/screens" className="text-link">Manage screens <ArrowRight size={16} /></Link></div>{screens.slice(0,3).map((screen) => <div className="compact-row" key={screen.name}><span className={`screen-orb orb-${screen.tone}`}><Play size={15} fill="currentColor" /></span><div><strong>{screen.name}</strong><small>{screen.location}</small></div><div className="compact-status"><StatusPill tone={screen.tone}>{screen.status}</StatusPill><small>{screen.heartbeat}</small></div></div>)}</article>
        <article className="panel evidence-panel"><div className="panel-header"><div><h2>Latest settlements</h2><p>Validated playback and credit movement</p></div><button className="icon-button" aria-label="Download"><Download size={18} /></button></div>{evidence.slice(0,3).map((item) => <div className="settlement-row" key={item.id}><div><strong>{item.asset}</strong><small>{item.host} · {item.received}</small></div><div><span className={item.result === "Accepted" ? "amount-positive" : "amount-muted"}>{item.result === "Accepted" ? `+${item.credits} cr` : item.result}</span><small>{item.id}</small></div></div>)}</article>
      </section>
    </>
  );
}
