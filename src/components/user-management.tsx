"use client";

import { Activity, KeyRound, Laptop, LoaderCircle, LockKeyhole, MailPlus, MapPin, Settings2, ShieldAlert, ShieldCheck, UserRoundPlus } from "lucide-react";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { invitePlatformAccount, updateUserAccess, type UserActionState } from "@/app/(platform)/users/actions";
import { StatusPill } from "@/components/status-pill";
import { DismissibleDetails } from "@/components/dismissible-details";
import type { UserAdminData, UserAdminRow } from "@/lib/repositories/users";

const initialState: UserActionState = { status: "idle", message: "" };
function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Casablanca",
  }).format(new Date(value));
}

function FieldError({ message }: { message?: string }) {
  return message ? <small className="management-field-error">{message}</small> : null;
}

function FormMessage({ state }: { state: UserActionState }) {
  if (!state.message) return null;
  return <div className={`auth-message auth-message-${state.status}`} role={state.status === "error" ? "alert" : "status"}><ShieldCheck size={16} /><span>{state.message}</span></div>;
}

function accountTone(status: string) {
  if (status === "active") return "success" as const;
  if (status === "suspended") return "danger" as const;
  return "warning" as const;
}

function UserAccessEditor({ user }: { user: UserAdminRow }) {
  const [state, action, pending] = useActionState(updateUserAccess, initialState);
  if (user.platformRole === "admin") return <span className="user-admin-lock"><LockKeyhole size={13} /> Protected</span>;

  return <DismissibleDetails className="management-editor user-access-editor" summary={<><Settings2 size={14} /> Manage</>} closeLabel={`Close ${user.name} access editor`}>
    <form action={action} className="management-inline-form" noValidate>
      <input type="hidden" name="userId" value={user.id} />
      <header><strong>{user.name}</strong><small>{user.email}</small></header>
      <FormMessage state={state} />
      <label><span>Viewer account access</span><select name="accountStatus" defaultValue={user.accountStatus}><option value="pending">Pending approval</option><option value="active">Approved viewer</option><option value="suspended">Suspended</option></select><FieldError message={state.fieldErrors?.accountStatus} /></label>
      <label><span>Administrative reason</span><textarea name="reason" rows={2} maxLength={300} required placeholder="Document the approval, role change, or suspension reason." aria-invalid={Boolean(state.fieldErrors?.reason)} /><FieldError message={state.fieldErrors?.reason} /></label>
      <button className="button button-primary" type="submit" disabled={pending}>{pending ? <LoaderCircle className="auth-spinner" size={16} /> : <ShieldCheck size={16} />}{pending ? "Saving..." : "Save access"}</button>
    </form>
  </DismissibleDetails>;
}

export function UserManagement({ data }: { data: UserAdminData }) {
  const [inviteState, inviteAction, invitePending] = useActionState(invitePlatformAccount, initialState);
  const router = useRouter();

  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [router]);

  return <>
    <section className="user-control-grid">
      <form className="panel management-form user-invite-form" action={inviteAction} noValidate>
        <div className="panel-header"><div><h2><UserRoundPlus size={18} /> Invite account</h2><p>Create a platform administrator or a registered stream viewer.</p></div></div>
        <div className="management-form-body">
          <FormMessage state={inviteState} />
          {!data.accountCreationReady ? <div className="management-setup"><KeyRound size={18} /><span><strong>Server administrator key required</strong><small>Add the server-only key to this deployment&apos;s protected environment settings before sending invitations.</small></span></div> : null}
          <label><span>User full name</span><input name="name" maxLength={100} required placeholder="Approved account holder" aria-invalid={Boolean(inviteState.fieldErrors?.name)} /><FieldError message={inviteState.fieldErrors?.name} /></label>
          <label><span>Email address</span><input name="email" type="email" maxLength={254} required placeholder="viewer@example.com" aria-invalid={Boolean(inviteState.fieldErrors?.email)} /><FieldError message={inviteState.fieldErrors?.email} /></label>
          <label><span>Account type</span><select name="accountType" defaultValue="viewer"><option value="viewer">Registered stream viewer</option><option value="admin">Platform administrator</option></select><FieldError message={inviteState.fieldErrors?.accountType} /></label>
          <label><span>Administrative reason</span><textarea name="reason" rows={3} maxLength={300} required placeholder="Approved for platform administration or registered viewing." aria-invalid={Boolean(inviteState.fieldErrors?.reason)} /><FieldError message={inviteState.fieldErrors?.reason} /></label>
          <button className="button button-primary management-submit" type="submit" disabled={invitePending || !data.accountCreationReady}>{invitePending ? <LoaderCircle className="auth-spinner" size={17} /> : <MailPlus size={17} />}{invitePending ? "Sending invitation..." : "Create and invite user"}</button>
        </div>
      </form>

      <article className="panel user-policy-card">
        <div className="panel-header"><div><h2><ShieldAlert size={18} /> Controlled access policy</h2><p>Public registration is disabled at the application boundary.</p></div></div>
        <div className="user-policy-list">
          <div><span>1</span><p><strong>Administrator creates access</strong><small>Only an approved email can receive an invitation.</small></p></div>
          <div><span>2</span><p><strong>User sets the password</strong><small>The one-time link opens the secure password setup flow.</small></p></div>
          <div><span>3</span><p><strong>Account type is enforced</strong><small>Administrators manage everything; viewers can only identify themselves while watching.</small></p></div>
          <div><span>4</span><p><strong>Every session is observed</strong><small>IP, device, route, location, and recent activity remain visible here.</small></p></div>
        </div>
      </article>
    </section>

    <section className="management-section" aria-labelledby="user-registry-title">
      <div className="section-heading"><div><p className="eyebrow">Access registry</p><h2 id="user-registry-title">Administrators and viewers</h2><p>Only administrators enter the dashboard. Viewers remain separate from all business records.</p></div><span className="management-count"><ShieldCheck size={16} /> {data.users.length} controlled accounts</span></div>
      <article className="panel management-registry user-registry">
        {data.users.length === 0 ? <div className="management-empty"><UserRoundPlus size={23} /><strong>No users found</strong><p>Invite an administrator or approved viewer above.</p></div> : <div className="table-scroll"><table><thead><tr><th>User</th><th>Account type</th><th>Status</th><th>Sessions</th><th>Last activity</th><th>Controls</th></tr></thead><tbody>{data.users.map((user) => <tr key={user.id}><td><strong>{user.name}</strong><small>{user.email}</small></td><td>{user.platformRole === "admin" ? "Platform administrator" : "Registered viewer"}</td><td><StatusPill tone={accountTone(user.accountStatus)}>{user.accountStatus}</StatusPill>{!user.emailVerifiedAt ? <small>Email setup pending</small> : null}</td><td><strong>{user.liveSessionCount > 0 ? `${user.liveSessionCount} live` : `${user.sessionCount} recorded`}</strong></td><td>{formatDate(user.lastSeenAt)}</td><td><UserAccessEditor user={user} /></td></tr>)}</tbody></table></div>}
      </article>
    </section>

    <section className="management-section" aria-labelledby="session-activity-title">
      <div className="section-heading"><div><p className="eyebrow">Live security</p><h2 id="session-activity-title">Activity sessions</h2><p>Refreshes every 30 seconds. A session is live when seen within the last five minutes.</p></div><span className="management-count"><Activity size={16} /> {data.sessions.filter((session) => session.isLive).length} live sessions</span></div>
      <article className="panel management-registry session-registry">
        {data.sessions.length === 0 ? <div className="management-empty"><Laptop size={23} /><strong>No sessions recorded yet</strong><p>Activity appears after users open a protected workspace page.</p></div> : <div className="table-scroll"><table><thead><tr><th>User</th><th>Session</th><th>Device</th><th>IP address</th><th>Location</th><th>Last route</th><th>Last seen</th></tr></thead><tbody>{data.sessions.map((session) => <tr key={session.id}><td><strong>{session.userName}</strong><small>{session.email}</small></td><td><StatusPill tone={session.isRevoked ? "danger" : session.isLive ? "success" : "neutral"}>{session.isRevoked ? "revoked" : session.isLive ? "live" : "inactive"}</StatusPill></td><td><strong>{session.device}</strong><small>{session.browser} / {session.operatingSystem}</small></td><td>{session.ipAddress}</td><td><span className="session-location"><MapPin size={12} /> {session.location}</span></td><td><code>{session.lastPath}</code></td><td><strong>{formatDate(session.lastSeenAt)}</strong><small>First: {formatDate(session.firstSeenAt)}</small></td></tr>)}</tbody></table></div>}
      </article>
    </section>
  </>;
}
