import { Activity, ShieldCheck } from "lucide-react";
import { AccessDenied } from "@/components/access-denied";
import { PageHeading } from "@/components/page-heading";
import { UserManagement } from "@/components/user-management";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getUserAdminData } from "@/lib/repositories/users";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const workspace = await getWorkspaceContext();
  if (!workspace.permissions.canProvisionOrganizations) return <AccessDenied />;
  const data = await getUserAdminData();
  const activeUsers = data.users.filter((user) => user.accountStatus === "active").length;
  const liveUsers = data.users.filter((user) => user.liveSessionCount > 0).length;
  const suspendedUsers = data.users.filter((user) => user.accountStatus === "suspended").length;

  return <>
    <PageHeading
      eyebrow="Identity and access"
      title="Users"
      description="Invite approved owners, manage account permissions, and monitor recent portal sessions."
      actions={<span className={`data-source data-source-${data.source === "live" ? "supabase" : "setup"}`}><ShieldCheck size={15} /> {data.source === "live" ? "Access controls live" : "Setup required"}</span>}
    />
    <section className="mini-metric-grid">
      <div><span>Total users</span><strong>{data.users.length}</strong><small>Administrator-controlled accounts</small></div>
      <div><span>Active access</span><strong className="success-text">{activeUsers}</strong><small>Allowed to enter a workspace</small></div>
      <div><span>Live now</span><strong className="success-text">{liveUsers}</strong><small><Activity size={12} /> Seen in the last five minutes</small></div>
      <div><span>Suspended</span><strong className="danger-text">{suspendedUsers}</strong><small>Authentication and sessions blocked</small></div>
    </section>
    <UserManagement data={data} />
  </>;
}
