import { MapPin, MonitorUp, Plus, RefreshCw, WifiOff } from "lucide-react";
import Link from "next/link";
import { DeviceInspector, ScreenPairingPanel } from "@/components/screen-management";
import { PageHeading } from "@/components/page-heading";
import { StatusPill } from "@/components/status-pill";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getScreens } from "@/lib/repositories/screens";

export const metadata = { title: "Screens" };

export default async function ScreensPage() {
  const [result, workspace] = await Promise.all([getScreens(), getWorkspaceContext()]);
  const sourceLabel = result.source === "supabase" ? "Live data" : result.source === "setup" ? "Setup required" : "Preview data";
  const setupRequired = result.source === "setup";
  const canManageDevices = workspace.permissions.canManageDevices && result.source === "supabase";
  const { summary } = result;

  return <>
    <PageHeading
      eyebrow="Device network"
      title="Screens"
      description="Pair approved playback devices, monitor operational health, and revoke access when hardware moves."
      actions={<><span className={`data-source data-source-${result.source}`}>{sourceLabel}</span><Link className="button button-secondary" href="/screens"><RefreshCw size={17} /> Refresh status</Link>{canManageDevices ? <Link className="button button-primary" href="#pair-screen"><Plus size={17} /> Pair screen</Link> : null}</>}
    />
    <section className="mini-metric-grid">
      <div><span>Registered screens</span><strong>{summary.registered}</strong><small>Across {summary.locations} locations</small></div>
      <div><span>Online now</span><strong className="success-text">{summary.online}</strong><small>{summary.onlinePercent}% of network</small></div>
      <div><span>Heartbeat target</span><strong>45 sec</strong><small>Offline after 2 minutes</small></div>
      <div><span>Needs action</span><strong className="danger-text">{summary.needsAction}</strong><small>Offline, pairing, or flagged</small></div>
    </section>
    {canManageDevices ? <div id="pair-screen"><ScreenPairingPanel locations={result.locations} /></div> : null}
    {result.screens.length === 0 ? (
      <section className="empty-state">
        <MonitorUp size={27} />
        <h2>{setupRequired ? "Workspace setup required" : "No screens paired yet"}</h2>
        <p>{setupRequired ? "Ask a network administrator to finish workspace setup before pairing screens." : canManageDevices ? "Open device setup on a player, then claim its short-lived pairing code above." : "A workspace operator must pair the first approved playback device."}</p>
        {canManageDevices ? <Link className="button button-primary" href="#pair-screen"><Plus size={17} /> Pair screen</Link> : null}
      </section>
    ) : (
      <section className="panel table-panel">
        <div className="panel-header"><div><h2>Device inventory</h2><p>Server-verified heartbeats and operational device diagnostics.</p></div></div>
        <div className="table-scroll"><table><thead><tr><th>Screen</th><th>Status</th><th>Device</th><th>Network</th><th>Last heartbeat</th><th>Risk</th><th /></tr></thead><tbody>{result.screens.map((screen) => <tr key={screen.id}><td><div className="device-name"><span className={`device-thumbnail device-${screen.tone}`}>{screen.status === "Offline" ? <WifiOff size={18} /> : <MonitorUp size={18} />}</span><div><strong>{screen.name}</strong><small><MapPin size={12} /> {screen.location}</small></div></div></td><td><StatusPill tone={screen.tone}>{screen.status}</StatusPill><small className="screen-table-detail">{screen.current}</small></td><td><strong>{screen.deviceType}</strong><small className="screen-table-detail">{screen.operatingSystem} / {screen.browser}</small></td><td><code>{screen.ipAddress}</code><small className="screen-table-detail">{screen.network}</small></td><td>{screen.heartbeat}</td><td>{screen.risk}</td><td><DeviceInspector screen={screen} /></td></tr>)}</tbody></table></div>
      </section>
    )}
  </>;
}
