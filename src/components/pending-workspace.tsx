import { Clock3, LogOut, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import type { WorkspaceContext } from "@/lib/auth/workspace";

export function PendingWorkspace({ workspace, signOutAction }: { workspace: WorkspaceContext; signOutAction: () => Promise<void> }) {
  return (
    <main className="pending-workspace">
      <section className="pending-card">
        <Brand />
        <span className="pending-icon"><Clock3 size={25} /></span>
        <p className="eyebrow">Account verified</p>
        <h1>Waiting for administrator assignment</h1>
        <p>{workspace.notice}</p>
        <div className="pending-account"><ShieldCheck size={17} /><span><small>Signed in as</small><strong>{workspace.user.email}</strong></span></div>
        <form action={signOutAction}><button className="button button-secondary" type="submit"><LogOut size={16} /> Sign out</button></form>
        <small className="pending-help">If your business has already been approved, contact the network administrator and provide this email address.</small>
      </section>
    </main>
  );
}
