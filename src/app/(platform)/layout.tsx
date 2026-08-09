import { AppShell } from "@/components/app-shell";
import { PendingWorkspace } from "@/components/pending-workspace";
import { signOut } from "@/app/login/actions";
import { getWorkspaceContext } from "@/lib/auth/workspace";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const workspace = await getWorkspaceContext();
  if (workspace.mode === "setup") {
    return <PendingWorkspace workspace={workspace} signOutAction={signOut} />;
  }
  return <AppShell workspace={workspace} signOutAction={signOut}>{children}</AppShell>;
}
