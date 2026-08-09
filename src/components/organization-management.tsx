"use client";

import { Building2, CheckCircle2, LoaderCircle, ShieldCheck, UserRoundCheck } from "lucide-react";
import { useActionState } from "react";
import { createOrganization, type OrganizationActionState } from "@/app/(platform)/admin/actions";
import { StatusPill } from "@/components/status-pill";
import type { OrganizationAdminData } from "@/lib/repositories/organizations";

const initialState: OrganizationActionState = { status: "idle", message: "" };

function FieldError({ message }: { message?: string }) {
  return message ? <small className="management-field-error">{message}</small> : null;
}

function organizationTone(status: string) {
  if (status === "active") return "success" as const;
  if (status === "suspended" || status === "closed") return "danger" as const;
  return "warning" as const;
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
            <label><span>Business category</span><select name="category" defaultValue="" required aria-invalid={Boolean(state.fieldErrors?.category)}><option value="" disabled>Select category</option><option value="cafe">Cafe</option><option value="restaurant">Restaurant</option><option value="retail">Retail</option><option value="fitness">Fitness</option><option value="healthcare">Healthcare</option><option value="hospitality">Hospitality</option><option value="professional-services">Professional services</option><option value="other">Other</option></select><FieldError message={state.fieldErrors?.category} /></label>
            <label><span>Owner account</span><select name="ownerUserId" defaultValue="" required disabled={!hasPendingAccounts} aria-invalid={Boolean(state.fieldErrors?.ownerUserId)}><option value="" disabled>{hasPendingAccounts ? "Select a verified account" : "No accounts awaiting assignment"}</option>{data.pendingAccounts.map((account) => <option value={account.id} key={account.id}>{account.name} · {account.email}</option>)}</select><FieldError message={state.fieldErrors?.ownerUserId} />{!hasPendingAccounts && ready ? <small className="management-field-hint">The owner must create and verify an account before assignment.</small> : null}</label>
            <label><span>Administrative reason</span><textarea name="reason" maxLength={300} rows={3} required aria-invalid={Boolean(state.fieldErrors?.reason)} placeholder="Approved for the Casablanca pilot after business verification." /><FieldError message={state.fieldErrors?.reason} /></label>
            <button className="button button-primary management-submit" type="submit" disabled={pending || !ready || !hasPendingAccounts}>{pending ? <LoaderCircle className="auth-spinner" size={17} /> : <UserRoundCheck size={17} />}{pending ? "Creating organization…" : "Create and assign owner"}</button>
          </div>
        </form>

        <article className="panel management-registry">
          <div className="panel-header"><div><h2>Organization registry</h2><p>Administrator-created tenants and accountable owners.</p></div></div>
          {data.organizations.length === 0 ? <div className="management-empty"><Building2 size={23} /><strong>No organizations created</strong><p>The first approved business will appear here.</p></div> : <div className="table-scroll"><table><thead><tr><th>Organization</th><th>Owner</th><th>Category</th><th>Locations</th><th>Status</th></tr></thead><tbody>{data.organizations.map((organization) => <tr key={organization.publicId}><td><strong>{organization.name}</strong><small>{organization.legalName}</small></td><td>{organization.owner}</td><td>{organization.category.replaceAll("-", " ")}</td><td>{organization.locationCount}</td><td><StatusPill tone={organizationTone(organization.status)}>{organization.status}</StatusPill></td></tr>)}</tbody></table></div>}
        </article>
      </div>
    </section>
  );
}
