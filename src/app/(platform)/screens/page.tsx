import { MapPin, MonitorUp, Plus, RefreshCw, WifiOff } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { StatusPill } from "@/components/status-pill";
import { getScreens } from "@/lib/repositories/screens";

export const metadata = { title: "Screens" };

export default async function ScreensPage() {
  const result = await getScreens();
  const sourceLabel = result.source === "supabase" ? "Supabase data" : result.source === "setup" ? "Setup required" : "Demo data";
  const setupRequired = result.source === "setup";
  const { summary } = result;

  return <>
    <PageHeading
      eyebrow="Device network"
      title="Screens"
      description="Pair devices, monitor playback health, and respond before inventory is lost."
      actions={<><span className={`data-source data-source-${result.source}`}>{sourceLabel}</span><button className="button button-secondary"><RefreshCw size={17} /> Refresh status</button><button className="button button-primary" disabled={setupRequired}><Plus size={17} /> Pair screen</button></>}
    />
    <section className="mini-metric-grid">
      <div><span>Registered screens</span><strong>{summary.registered}</strong><small>Across {summary.locations} locations</small></div>
      <div><span>Online now</span><strong className="success-text">{summary.online}</strong><small>{summary.onlinePercent}% of network</small></div>
      <div><span>Heartbeat target</span><strong>45 sec</strong><small>Offline after 2 minutes</small></div>
      <div><span>Needs action</span><strong className="danger-text">{summary.needsAction}</strong><small>Offline, pairing, or flagged</small></div>
    </section>
    {result.screens.length === 0 ? (
      <section className="empty-state">
        <MonitorUp size={27} />
        <h2>{setupRequired ? "Database setup required" : "No screens paired yet"}</h2>
        <p>{setupRequired ? "Apply the Supabase migration and assign this account to an organization before pairing screens." : "Create a location, then pair the first playback device to begin monitoring heartbeats."}</p>
        <button className="button button-primary" disabled={setupRequired}><Plus size={17} /> Pair screen</button>
      </section>
    ) : (
      <section className="panel table-panel">
        <div className="panel-header"><div><h2>Device inventory</h2><p>Heartbeat status updates every 30-60 seconds during active playback.</p></div></div>
        <div className="table-scroll"><table><thead><tr><th>Screen</th><th>Status</th><th>Playback</th><th>Last heartbeat</th><th>Uptime</th><th>Risk</th><th /></tr></thead><tbody>{result.screens.map((screen) => <tr key={screen.id}><td><div className="device-name"><span className={`device-thumbnail device-${screen.tone}`}>{screen.status === "Offline" ? <WifiOff size={18} /> : <MonitorUp size={18} />}</span><div><strong>{screen.name}</strong><small><MapPin size={12} /> {screen.location}</small></div></div></td><td><StatusPill tone={screen.tone}>{screen.status}</StatusPill></td><td>{screen.current}</td><td>{screen.heartbeat}</td><td>{screen.uptime}</td><td>{screen.risk}</td><td><button className="text-button">Inspect</button></td></tr>)}</tbody></table></div>
      </section>
    )}
  </>;
}
