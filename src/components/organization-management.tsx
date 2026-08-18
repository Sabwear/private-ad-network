"use client";

import { Building2, CheckCircle2, LoaderCircle, Plus, Settings2, ShieldCheck } from "lucide-react";
import { useActionState } from "react";
import { createOrganization, type OrganizationActionState, type OrganizationUpdateActionState, updateOrganization } from "@/app/(platform)/business/actions";
import { BusinessChannelAds } from "@/components/business-channel-ads";
import { BusinessLogoUploader } from "@/components/business-logo-uploader";
import { BusinessStreamAccess } from "@/components/business-stream-access";
import { StatusPill } from "@/components/status-pill";
import { businessCategories, operatingDays } from "@/lib/domain-options";
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

function OrganizationEditor({ organization, channels }: { organization: OrganizationAdminRow; channels: OrganizationAdminData["channels"] }) {
  const [state, formAction, pending] = useActionState(updateOrganization, initialUpdateState);
  return <details className="management-editor management-editor-wide">
    <summary><Settings2 size={14} /> Edit business</summary>
    <div className="management-inline-form business-management-panel">
      <form action={formAction} className="business-profile-form" noValidate>
        <header><strong>Business information</strong><small>Identity, contact details, access, and advertiser logo placement.</small></header>
        <input type="hidden" name="organizationId" value={organization.id} />
        {state.message ? <div className={`auth-message auth-message-${state.status}`} role={state.status === "error" ? "alert" : "status"}><ShieldCheck size={16} /><span>{state.message}</span></div> : null}
        <label><span>Display name</span><input name="displayName" defaultValue={organization.name} maxLength={120} required aria-invalid={Boolean(state.fieldErrors?.displayName)} /><FieldError message={state.fieldErrors?.displayName} /></label>
        <label><span>Legal name</span><input name="legalName" defaultValue={organization.legalName === "—" ? "" : organization.legalName} maxLength={160} aria-invalid={Boolean(state.fieldErrors?.legalName)} /><FieldError message={state.fieldErrors?.legalName} /></label>
        <div className="management-field-grid">
          <label><span>Category</span><select name="category" defaultValue={organization.category}>{businessCategories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><FieldError message={state.fieldErrors?.category} /></label>
          <label><span>Access status</span><select name="organizationStatus" defaultValue={organization.status}><option value="active">Active</option><option value="suspended">Suspended</option></select><FieldError message={state.fieldErrors?.organizationStatus} /></label>
        </div>
        <header><strong>Working dates and hours</strong><small>Control the business operating period and weekly schedule.</small></header>
        <div className="management-field-grid">
          <label><span>Operating start date <small>Optional</small></span><input name="operatingStartDate" type="date" defaultValue={organization.operatingStartDate} aria-invalid={Boolean(state.fieldErrors?.operatingStartDate)} /><FieldError message={state.fieldErrors?.operatingStartDate} /></label>
          <label><span>Operating end date <small>Optional</small></span><input name="operatingEndDate" type="date" defaultValue={organization.operatingEndDate} aria-invalid={Boolean(state.fieldErrors?.operatingEndDate)} /><FieldError message={state.fieldErrors?.operatingEndDate} /></label>
        </div>
        <fieldset className="operating-days"><legend>Working days</legend><div>{operatingDays.map(([value, label]) => <label key={value}><input type="checkbox" name="operatingDays" value={value} defaultChecked={organization.operatingDays.includes(value)} /><span>{label}</span></label>)}</div><FieldError message={state.fieldErrors?.operatingDays} /></fieldset>
        <div className="management-field-grid">
          <label><span>Opens at</span><input name="operatingOpensAt" type="time" defaultValue={organization.operatingOpensAt} required aria-invalid={Boolean(state.fieldErrors?.operatingOpensAt)} /><FieldError message={state.fieldErrors?.operatingOpensAt} /></label>
          <label><span>Closes at</span><input name="operatingClosesAt" type="time" defaultValue={organization.operatingClosesAt} required aria-invalid={Boolean(state.fieldErrors?.operatingClosesAt)} /><FieldError message={state.fieldErrors?.operatingClosesAt} /></label>
        </div>
        <label><span>Time zone</span><select name="operatingTimeZone" defaultValue={organization.operatingTimeZone}><option value="Africa/Casablanca">Casablanca</option><option value="UTC">UTC</option><option value="Europe/London">London</option><option value="Europe/Paris">Paris</option><option value="America/New_York">New York</option></select><FieldError message={state.fieldErrors?.operatingTimeZone} /></label>
        <label><span>Website</span><input name="websiteUrl" type="url" defaultValue={organization.websiteUrl} maxLength={500} placeholder="https://business.example" aria-invalid={Boolean(state.fieldErrors?.websiteUrl)} /><FieldError message={state.fieldErrors?.websiteUrl} /></label>
        <div className="management-field-grid">
          <label><span>Contact email</span><input name="contactEmail" type="email" defaultValue={organization.contactEmail} maxLength={254} placeholder="contact@business.example" aria-invalid={Boolean(state.fieldErrors?.contactEmail)} /><FieldError message={state.fieldErrors?.contactEmail} /></label>
          <label><span>Contact phone</span><input name="contactPhone" type="tel" defaultValue={organization.contactPhone} maxLength={40} placeholder="+212 5 00 00 00 00" aria-invalid={Boolean(state.fieldErrors?.contactPhone)} /><FieldError message={state.fieldErrors?.contactPhone} /></label>
        </div>
        <div className="management-field-grid">
          <label><span>Logo position</span><select name="logoPosition" defaultValue={organization.logoPosition}><option value="top-left">Top left</option><option value="top-right">Top right</option><option value="bottom-left">Bottom left</option><option value="bottom-right">Bottom right</option></select><FieldError message={state.fieldErrors?.logoPosition} /></label>
          <label><span>Logo size</span><select name="logoSizePercent" defaultValue={organization.logoSizePercent}>{[6,8,10,12,14,16,18,20,24,28,32].map((size) => <option value={size} key={size}>{size}% of video width</option>)}</select><FieldError message={state.fieldErrors?.logoSizePercent} /></label>
        </div>
        <label><span>Change reason</span><textarea name="reason" rows={2} maxLength={300} required placeholder="Document the business verification or suspension reason." aria-invalid={Boolean(state.fieldErrors?.reason)} /><FieldError message={state.fieldErrors?.reason} /></label>
        <button className="button button-primary" type="submit" disabled={pending}>{pending ? <LoaderCircle className="auth-spinner" size={16} /> : <ShieldCheck size={16} />}{pending ? "Saving…" : "Save business information"}</button>
      </form>
      <BusinessLogoUploader organizationId={organization.id} organizationPublicId={organization.publicId} logoUrl={organization.logoUrl} />
      <BusinessStreamAccess organizationId={organization.id} accessCode={organization.streamAccessCode} accessCodeExpiresAt={organization.streamAccessCodeExpiresAt} earningEnabled={organization.streamEarningEnabled} earningRate={organization.streamEarningRate} consumptionRate={organization.adConsumptionRate} channels={organization.streamChannels} rotations={organization.streamCodeRotations} />
      <BusinessChannelAds organization={organization} channels={channels} />
    </div>
  </details>;
}

export function OrganizationManagement({ data }: { data: OrganizationAdminData }) {
  const [state, formAction, pending] = useActionState(createOrganization, initialState);
  const ready = data.source === "live";

  return <section className="management-section" id="business-onboarding" aria-labelledby="organization-management-title">
    <div className="section-heading"><div><p className="eyebrow">Central administration</p><h2 id="organization-management-title">Businesses</h2><p>Businesses are managed records. They do not own accounts or receive dashboard access.</p></div><span className="management-count"><Building2 size={16} /> {data.organizations.length} businesses</span></div>
    <div className="management-layout">
      <form className="panel management-form" action={formAction} noValidate>
        <div className="panel-header"><div><h2>Create business</h2><p>Add the business directly to the administrator-managed network.</p></div></div>
        <div className="management-form-body">
          {state.message ? <div className={`auth-message auth-message-${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.status === "success" ? <CheckCircle2 size={17} /> : <ShieldCheck size={17} />}<span>{state.message}</span></div> : null}
          {!ready ? <div className="management-setup"><ShieldCheck size={18} /><span><strong>Database setup required</strong><small>Deploy the pending migration before provisioning businesses.</small></span></div> : null}
          <label><span>Business display name</span><input name="displayName" maxLength={120} required aria-invalid={Boolean(state.fieldErrors?.displayName)} placeholder="Atlas Dental" /><FieldError message={state.fieldErrors?.displayName} /></label>
          <label><span>Legal name <small>Optional</small></span><input name="legalName" maxLength={160} aria-invalid={Boolean(state.fieldErrors?.legalName)} placeholder="Atlas Dental SARL" /><FieldError message={state.fieldErrors?.legalName} /></label>
          <label><span>Business category</span><select name="category" defaultValue="" required aria-invalid={Boolean(state.fieldErrors?.category)}><option value="" disabled>Select category</option>{businessCategories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><FieldError message={state.fieldErrors?.category} /></label>
          <label><span>Administrative reason</span><textarea name="reason" maxLength={300} rows={3} required aria-invalid={Boolean(state.fieldErrors?.reason)} placeholder="Approved for the Casablanca pilot after business verification." /><FieldError message={state.fieldErrors?.reason} /></label>
          <button className="button button-primary management-submit" type="submit" disabled={pending || !ready}>{pending ? <LoaderCircle className="auth-spinner" size={17} /> : <Plus size={17} />}{pending ? "Creating business…" : "Create business"}</button>
        </div>
      </form>
      <article className="panel management-registry">
        <div className="panel-header"><div><h2>Business registry</h2><p>Every business is controlled by platform administrators.</p></div></div>
        {data.organizations.length === 0 ? <div className="management-empty"><Building2 size={23} /><strong>No businesses created</strong><p>The first administrator-created business will appear here.</p></div> : <div className="table-scroll"><table><thead><tr><th>Business</th><th>Category</th><th>Ads / channels</th><th>Locations</th><th>Status</th><th>Controls</th></tr></thead><tbody>{data.organizations.map((organization) => <tr key={organization.publicId}><td><strong>{organization.name}</strong><small>{organization.legalName}</small></td><td>{organization.category.replaceAll("-", " ")}</td><td><strong>{organization.approvedAds.length} approved</strong><small>{organization.channelAds.length} assigned</small></td><td>{organization.locationCount}</td><td><StatusPill tone={organizationTone(organization.status)}>{organization.status}</StatusPill></td><td><OrganizationEditor key={organization.updatedAt} organization={organization} channels={data.channels} /></td></tr>)}</tbody></table></div>}
      </article>
    </div>
  </section>;
}
