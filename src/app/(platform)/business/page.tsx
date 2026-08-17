import { Building2, Clapperboard, MapPinned, MonitorPlay, Plus, UserRoundCheck } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/access-denied";
import { BusinessViewerOverview } from "@/components/business-viewer-overview";
import { OrganizationManagement } from "@/components/organization-management";
import { PageHeading } from "@/components/page-heading";
import { ScreenNetworkSection } from "@/components/screen-network-section";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getOrganizationAdminData } from "@/lib/repositories/organizations";
import { getScreens } from "@/lib/repositories/screens";
import { getStreamMonitorData } from "@/lib/repositories/stream-monitor";

export const metadata = { title: "Business" };

const onboardingFlow = [
  { step: "1", title: "Create business", detail: "Verify the client and assign its accountable owner.", href: "#business-onboarding", icon: Building2 },
  { step: "2", title: "Add locations", detail: "Configure campaign delivery venues and exclusions.", href: "/campaigns#locations", icon: MapPinned },
  { step: "3", title: "Pair screens", detail: "Assign each physical device to an active location.", href: "#screens", icon: MonitorPlay },
  { step: "4", title: "Approve media", detail: "Review creatives before they can enter a campaign.", href: "/media", icon: Clapperboard },
] as const;

export default async function BusinessPage() {
  const workspace = await getWorkspaceContext();
  if (!workspace.permissions.canProvisionOrganizations) return <AccessDenied />;

  const [data, screens, monitor] = await Promise.all([getOrganizationAdminData(), getScreens(), getStreamMonitorData(24)]);
  const active = data.organizations.filter((organization) => organization.status === "active").length;
  const locations = data.organizations.reduce((total, organization) => total + organization.locationCount, 0);

  return <>
    <PageHeading
      eyebrow="Client network"
      title="Business"
      description="Manage each business together with its owners, access, screens, stream connections, and current viewers."
      actions={<><span className={`data-source data-source-${data.source === "live" ? "supabase" : "setup"}`}>{data.source === "live" ? "Live registry" : "Setup required"}</span><Link className="button button-primary" href="#business-onboarding"><Plus size={17} /> Add business</Link></>}
    />

    <section className="mini-metric-grid">
      <div><span>Total businesses</span><strong>{data.organizations.length}</strong><small>Administrator-created clients</small></div>
      <div><span>Active businesses</span><strong className="success-text">{active}</strong><small>Allowed to operate</small></div>
      <div><span>Screens</span><strong>{screens.summary.registered}</strong><small>{screens.summary.online} online across {locations} locations</small></div>
      <div><span>Watching now</span><strong className="success-text">{monitor.summary.activeViewers}</strong><small>{monitor.summary.registeredViewers} registered viewers</small></div>
    </section>

    <section className="business-flow" aria-label="Business onboarding flow">
      <div className="section-heading"><div><p className="eyebrow">Operating flow</p><h2>From client approval to active media</h2><p>Complete these stages in order for every business joining the network.</p></div><span className="management-count"><UserRoundCheck size={16} /> Controlled onboarding</span></div>
      <div className="business-flow-grid">{onboardingFlow.map(({ step, title, detail, href, icon: Icon }) => <Link href={href} key={step}><span>{step}</span><Icon size={20} /><strong>{title}</strong><small>{detail}</small></Link>)}</div>
    </section>

    <OrganizationManagement data={data} />
    <ScreenNetworkSection result={screens} canManageDevices={workspace.permissions.canManageDevices && screens.source === "supabase"} />
    <BusinessViewerOverview monitor={monitor} />
  </>;
}
