import { AccessDenied } from "@/components/access-denied";
import { LocationManagement } from "@/components/location-management";
import { PageHeading } from "@/components/page-heading";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getLocationManagementData } from "@/lib/repositories/locations";

export const metadata = { title: "Locations" };

export default async function LocationsPage() {
  const workspace = await getWorkspaceContext();
  if (!workspace.permissions.canManageLocations) return <AccessDenied />;

  const data = await getLocationManagementData(workspace);

  return (
    <>
      <PageHeading
        eyebrow="Business network"
        title="Locations"
        description="Manage approved venues, operating hours, service zones, and screen-ready inventory."
      />
      <LocationManagement data={data} fixedOrganizationId={workspace.organization.id} />
    </>
  );
}
