import { AppShell } from "@/components/app-shell";
import { PendingWorkspace } from "@/components/pending-workspace";
import { signOut } from "@/app/login/actions";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getHeaderData } from "@/lib/repositories/header";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const workspace = await getWorkspaceContext();
  if (workspace.mode === "setup") {
    return <PendingWorkspace workspace={workspace} signOutAction={signOut} />;
  }
  const header = await getHeaderData();
  return <AppShell workspace={workspace} header={header} signOutAction={signOut}>{children}</AppShell>;
}
