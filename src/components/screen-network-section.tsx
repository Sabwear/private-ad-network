import { MapPin, MonitorUp, Plus, WifiOff } from "lucide-react";
import Link from "next/link";
import { DeviceInspector, ScreenPairingPanel } from "@/components/screen-management";
import { StatusPill } from "@/components/status-pill";
import type { ScreensResult } from "@/lib/repositories/screens";

export function ScreenNetworkSection({ result, canManageDevices }: { result: ScreensResult; canManageDevices: boolean }) {
  const setupRequired = result.source === "setup";
  return <section id="screens" className="workspace-section-anchor business-network-section">
    <div className="section-heading"><div><p className="eyebrow">Device network</p><h2>Screens</h2><p>Administrators pair playback devices to any business location and monitor the entire network.</p></div><span className="management-count"><MonitorUp size={16} /> {result.summary.registered} screens</span></div>
    <section className="mini-metric-grid">
      <div><span>Registered screens</span><strong>{result.summary.registered}</strong><small>Across {result.summary.locations} locations</small></div>
      <div><span>Online now</span><strong className="success-text">{result.summary.online}</strong><small>{result.summary.onlinePercent}% of network</small></div>
      <div><span>Heartbeat target</span><strong>45 sec</strong><small>Offline after 2 minutes</small></div>
      <div><span>Needs action</span><strong className="danger-text">{result.summary.needsAction}</strong><small>Offline, pairing, or flagged</small></div>
    </section>
    {canManageDevices ? <div id="pair-screen"><ScreenPairingPanel locations={result.locations} /></div> : null}
    {result.screens.length === 0 ? <section className="empty-state"><MonitorUp size={27} /><h2>{setupRequired ? "Platform setup required" : "No screens paired yet"}</h2><p>{setupRequired ? "Complete the platform connection before pairing screens." : canManageDevices ? "Open device setup on a player, then claim its pairing code here." : "A platform administrator must pair the first approved playback device."}</p>{canManageDevices ? <Link className="button button-primary" href="#pair-screen"><Plus size={17} /> Pair screen</Link> : null}</section> : <section className="panel table-panel"><div className="panel-header"><div><h2>Device inventory</h2><p>Server-verified heartbeats and operational diagnostics.</p></div></div><div className="table-scroll"><table><thead><tr><th>Screen</th><th>Status</th><th>Device</th><th>Network</th><th>Last heartbeat</th><th>Risk</th><th /></tr></thead><tbody>{result.screens.map((screen) => <tr key={screen.id}><td><div className="device-name"><span className={`device-thumbnail device-${screen.tone}`}>{screen.status === "Offline" ? <WifiOff size={18} /> : <MonitorUp size={18} />}</span><div><strong>{screen.name}</strong><small><MapPin size={12} /> {screen.location}</small></div></div></td><td><StatusPill tone={screen.tone}>{screen.status}</StatusPill><small className="screen-table-detail">{screen.current}</small></td><td><strong>{screen.deviceType}</strong><small className="screen-table-detail">{screen.operatingSystem} / {screen.browser}</small></td><td><code>{screen.ipAddress}</code><small className="screen-table-detail">{screen.network}</small></td><td>{screen.heartbeat}</td><td>{screen.risk}</td><td><DeviceInspector screen={screen} /></td></tr>)}</tbody></table></div></section>}
  </section>;
}
