"use client";

import { Building2, CheckCircle2, LoaderCircle, Settings2, ShieldCheck, UserRoundCheck } from "lucide-react";
import { useActionState } from "react";
import {
  createOrganization,
  type OrganizationActionState,
  type OrganizationUpdateActionState,
  updateOrganization,
} from "@/app/(platform)/admin/actions";
import { StatusPill } from "@/components/status-pill";
import { businessCategories } from "@/lib/domain-options";
import type { OrganizationAdminData, OrganizationAdminRow } from "@/lib/repositories/organizations";

const initialState: OrganizationActionState = { status: "idle", message: "" };
const initialUpdateState: OrganizationUpdateActionState = { status: "idle", message: "" };

function FieldError({ message }: { message?: string }) {
  return message ? <small className="management-field-error">{message}</small> : null;
}

function organizationTone(status: string) {
  if (status === "active") return "success" as const;
  if (status === "suspended" || status === "closed") return "danger" as const;
  return "warning" as const;
}

function OrganizationEditor({ organization }: { organization: OrganizationAdminRow }) {
  const [state, formAction, pending] = useActionState(updateOrganization, initialUpdateState);

  return (
    <details className="management-editor">
      <summary><Settings2 size={14} /> Manage</summary>
      <form action={formAction} className="management-inline-form" noValidate>
        <input type="hidden" name="organizationId" value={organization.id} />
        {state.message ? <div className={`auth-message auth-message-${state.status}`} role={state.status === "error" ? "alert" : "status"}><ShieldCheck size={16} /><span>{state.message}</span></div> : null}
        <label><span>Display name</span><input name="displayName" defaultValue={organization.name} maxLength={120} required aria-invalid={Boolean(state.fieldErrors?.displayName)} /><FieldError message={state.fieldErrors?.displayName} /></label>
        <label><span>Legal name</span><input name="legalName" defaultValue={organization.legalName === "—" ? "" : organization.legalName} maxLength={160} aria-invalid={Boolean(state.fieldErrors?.legalName)} /><FieldError message={state.fieldErrors?.legalName} /></label>
        <div className="management-field-grid">
          <label><span>Category</span><select name="category" defaultValue={organization.category}>{businessCategories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><FieldError message={state.fieldErrors?.category} /></label>
          <label><span>Access status</span><select name="organizationStatus" defaultValue={organization.status}><option value="active">Active</option><option value="suspended">Suspended</option></select><FieldError message={state.fieldErrors?.organizationStatus} /></label>
        </div>
        <label><span>Change reason</span><textarea name="reason" rows={2} maxLength={300} required placeholder="Document the business verification or suspension reason." aria-invalid={Boolean(state.fieldErrors?.reason)} /><FieldError message={state.fieldErrors?.reason} /></label>
        <button className="button button-primary" type="submit" disabled={pending}>{pending ? <LoaderCircle className="auth-spinner" size={16} /> : <ShieldCheck size={16} />}{pending ? "Saving…" : "Save organization"}</button>
      </form>
    </details>
  );
}

export function OrganizationManagement({ data }: { data: OrganizationAdminData }) {
  const [state, formAction, pending] = useActionState(createOrganization, initialState);
  const ready = data.source === "live";
  const hasPendingAccounts = data.pendingAccounts.length > 0;

  return (
    <section className="management-section" aria-labelledby="organization-management-title">
      <div className="section-heading">
        <div><p className="eyebrow">Controlled onboarding</p><h2 id="organization-management-title">Business organizations</h2><p>Only platform administrators can create a tenant and activate its first owner.</p></div>
        <span className="management-count"><Building2 size={16} /> {data.organizations.length} organizations</span>
      </div>

      <div className="management-layout">
        <form className="panel management-form" action={formAction} noValidate>
          <div className="panel-header"><div><h2>Create organization</h2><p>The selected account becomes the business owner immediately.</p></div></div>
          <div className="management-form-body">
            {state.message ? <div className={`auth-message auth-message-${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.status === "success" ? <CheckCircle2 size={17} /> : <ShieldCheck size={17} />}<span>{state.message}</span></div> : null}
            {!ready ? <div className="management-setup"><ShieldCheck size={18} /><span><strong>Database setup required</strong><small>Deploy the pending migration before provisioning organizations.</small></span></div> : null}
            <label><span>Business display name</span><input name="displayName" maxLength={120} required aria-invalid={Boolean(state.fieldErrors?.displayName)} placeholder="Atlas Dental" /><FieldError message={state.fieldErrors?.displayName} /></label>
            <label><span>Legal name <small>Optional</small></span><input name="legalName" maxLength={160} aria-invalid={Boolean(state.fieldErrors?.legalName)} placeholder="Atlas Dental SARL" /><FieldError message={state.fieldErrors?.legalName} /></label>
            <label><span>Business category</span><select name="category" defaultValue="" required aria-invalid={Boolean(state.fieldErrors?.category)}><option value="" disabled>Select category</option>{businessCategories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><FieldError message={state.fieldErrors?.category} /></label>
            <label><span>Owner account</span><select name="ownerUserId" defaultValue="" required disabled={!hasPendingAccounts} aria-invalid={Boolean(state.fieldErrors?.ownerUserId)}><option value="" disabled>{hasPendingAccounts ? "Select a verified account" : "No accounts awaiting assignment"}</option>{data.pendingAccounts.map((account) => <option value={account.id} key={account.id}>{account.name} · {account.email}</option>)}</select><FieldError message={state.fieldErrors?.ownerUserId} />{!hasPendingAccounts && ready ? <small className="management-field-hint">The owner must create and verify an account before assignment.</small> : null}</label>
            <label><span>Administrative reason</span><textarea name="reason" maxLength={300} rows={3} required aria-invalid={Boolean(state.fieldErrors?.reason)} placeholder="Approved for the Casablanca pilot after business verification." /><FieldError message={state.fieldErrors?.reason} /></label>
            <button className="button button-primary management-submit" type="submit" disabled={pending || !ready || !hasPendingAccounts}>{pending ? <LoaderCircle className="auth-spinner" size={17} /> : <UserRoundCheck size={17} />}{pending ? "Creating organization…" : "Create and assign owner"}</button>
          </div>
        </form>

        <article className="panel management-registry">
          <div className="panel-header"><div><h2>Organization registry</h2><p>Administrator-created tenants and accountable owners.</p></div></div>
          {data.organizations.length === 0 ? <div className="management-empty"><Building2 size={23} /><strong>No organizations created</strong><p>The first approved business will appear here.</p></div> : <div className="table-scroll"><table><thead><tr><th>Organization</th><th>Owner</th><th>Category</th><th>Locations</th><th>Status</th><th>Controls</th></tr></thead><tbody>{data.organizations.map((organization) => <tr key={organization.publicId}><td><strong>{organization.name}</strong><small>{organization.legalName}</small></td><td>{organization.owner}</td><td>{organization.category.replaceAll("-", " ")}</td><td>{organization.locationCount}</td><td><StatusPill tone={organizationTone(organization.status)}>{organization.status}</StatusPill></td><td><OrganizationEditor key={organization.updatedAt} organization={organization} /></td></tr>)}</tbody></table></div>}
        </article>
      </div>
    </section>
  );
}
