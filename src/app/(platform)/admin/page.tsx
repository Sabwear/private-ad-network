import { Activity, BadgeCheck, CircleAlert, FileCheck2, ListChecks, MonitorCog, Scale, Settings2, Store } from "lucide-react";
import { AccessDenied } from "@/components/access-denied";
import { DemoDataControls } from "@/components/demo-data-controls";
import { PageHeading } from "@/components/page-heading";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getDemoDataSummary } from "@/lib/repositories/demo-data";
import { getMediaLibrary } from "@/lib/repositories/media";
import { getOrganizationAdminData } from "@/lib/repositories/organizations";
import { getScreens } from "@/lib/repositories/screens";

export const metadata = { title: "Admin control" };

export default async function AdminPage() {
  const workspace = await getWorkspaceContext();
  if (!workspace.permissions.canAccessAdmin) return <AccessDenied />;
  const [media, screens, organizations, demo] = await Promise.all([getMediaLibrary(), getScreens(), getOrganizationAdminData(), getDemoDataSummary()]);
  const queues = [
    { title: "Media review", count: media.summary.inReview, detail: media.summary.inReview ? "Items are waiting for moderation" : "Moderation queue is clear", icon: FileCheck2, tone: "blue" },
    { title: "Device attention", count: screens.summary.needsAction, detail: `${screens.summary.online} of ${screens.summary.registered} screens online`, icon: MonitorCog, tone: screens.summary.needsAction ? "red" : "blue" },
    { title: "Active businesses", count: organizations.organizations.filter((organization) => organization.status === "active").length, detail: `${organizations.organizations.length} total managed businesses`, icon: Store, tone: "orange" },
  ] as const;

  return <>
    <PageHeading eyebrow="Network operations" title="Admin control" description="Live platform health, controlled beta settings, and security readiness." actions={<button className="button button-secondary" disabled title="Policy editing opens with campaign activation"><Settings2 size={17} /> Policy settings later</button>} />
    <section className="admin-hero"><div><span className="admin-live"><i /> Limited beta operational</span><h2>Core onboarding and streaming services are connected</h2><p>Live database values · Administrator changes are audited</p></div><div className="service-grid"><div><Activity size={17} /><span>Portal access<strong>Protected</strong></span></div><div><Scale size={17} /><span>Campaign activation<strong>Locked</strong></span></div><div><BadgeCheck size={17} /><span>Tenant isolation<strong>Enforced</strong></span></div></div></section>
    <section className="queue-grid">{queues.map(({ title, count, detail, icon: Icon, tone }) => <article className="queue-card" key={title}><span className={`queue-icon queue-${tone}`}><Icon size={21} /></span><div><p>{title}</p><strong>{count}</strong><small>{detail}</small></div></article>)}</section>
    <section className="admin-grid">
      <article className="panel"><div className="panel-header"><div><h2>Operational checklist</h2><p>Required before external beta invitations</p></div></div><div className="check-list"><label><input type="checkbox" defaultChecked disabled /><span><strong>Administrator-managed onboarding</strong><small>Businesses are managed records and never receive dashboard ownership</small></span></label><label><input type="checkbox" defaultChecked disabled /><span><strong>Private streaming channels</strong><small>Business targeting and access-key rotation are operational</small></span></label><label><input type="checkbox" disabled /><span><strong>Administrator MFA</strong><small>Must be enforced before external invitations</small></span></label><label><input type="checkbox" disabled /><span><strong>72-hour endurance test</strong><small>Required after the native TV player is operational</small></span></label></div></article>
      <article className="panel"><div className="panel-header"><div><h2>Policy snapshot</h2><p>Current design limits for later activation</p></div></div><dl className="policy-list"><div><dt>Campaign state</dt><dd>Draft only</dd></div><div><dt>Completion threshold</dt><dd>≥ 97%</dd></div><div><dt>Heartbeat interval</dt><dd>45 seconds</dd></div><div><dt>Offline earning limit</dt><dd>6 hours</dd></div><div><dt>Settlement</dt><dd>Disabled in beta</dd></div></dl><button className="button button-secondary full-button" disabled><ListChecks size={17} /> Policy history coming later</button></article>
    </section>
    {workspace.permissions.canProvisionOrganizations ? <DemoDataControls summary={demo} /> : null}
    <div className="admin-warning"><CircleAlert size={19} /><div><strong>Central administrator control is enforced</strong><p>Businesses are managed entities without dashboard accounts, viewers cannot enter management pages, and every privileged data change is recorded.</p></div></div>
  </>;
}
