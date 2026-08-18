import { Eye, LogOut, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import type { WorkspaceContext } from "@/lib/auth/workspace";

export function PendingWorkspace({ workspace, signOutAction }: { workspace: WorkspaceContext; signOutAction: () => Promise<void> }) {
  return (
    <main className="pending-workspace">
      <section className="pending-card">
        <Brand />
        <span className="pending-icon"><Eye size={25} /></span>
        <p className="eyebrow">Viewer access</p>
        <h1>The dashboard is for administrators only</h1>
        <p>{workspace.notice}</p>
        <div className="pending-account"><ShieldCheck size={17} /><span><small>Signed in as</small><strong>{workspace.user.email}</strong></span></div>
        <form action={signOutAction}><button className="button button-secondary" type="submit"><LogOut size={16} /> Sign out</button></form>
        <small className="pending-help">Use the login option on a stream to identify your viewing activity. Business records are managed centrally by platform administrators.</small>
      </section>
    </main>
  );
}
