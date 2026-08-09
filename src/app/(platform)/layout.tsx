import { AppShell } from "@/components/app-shell";
import { signOut } from "@/app/login/actions";
import { getWorkspaceContext } from "@/lib/auth/workspace";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const workspace = await getWorkspaceContext();
  return <AppShell workspace={workspace} signOutAction={signOut}>{children}</AppShell>;
}
