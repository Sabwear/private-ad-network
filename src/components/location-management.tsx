"use client";

import { CheckCircle2, Clock3, LoaderCircle, MapPinned, Plus, ShieldCheck } from "lucide-react";
import { useActionState } from "react";
import { createLocation, type LocationActionState } from "@/app/(platform)/locations/actions";
import { StatusPill } from "@/components/status-pill";
import type { LocationManagementData } from "@/lib/repositories/locations";

const initialState: LocationActionState = { status: "idle", message: "" };
const days = [
  ["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"],
  ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"],
] as const;

function FieldError({ message }: { message?: string }) {
  return message ? <small className="management-field-error">{message}</small> : null;
}

export function LocationManagement({ data, fixedOrganizationId }: { data: LocationManagementData; fixedOrganizationId: number | null }) {
  const [state, formAction, pending] = useActionState(createLocation, initialState);
  const ready = data.source === "live" && data.organizations.length > 0;

  return (
    <div className="management-layout location-layout">
      <form className="panel management-form" action={formAction} noValidate>
        <div className="panel-header"><div><h2>Add location</h2><p>Register a venue before pairing its first screen.</p></div></div>
        <div className="management-form-body">
          {state.message ? <div className={`auth-message auth-message-${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.status === "success" ? <CheckCircle2 size={17} /> : <ShieldCheck size={17} />}<span>{state.message}</span></div> : null}
          {fixedOrganizationId !== null ? <input type="hidden" name="organizationId" value={fixedOrganizationId} /> : <label><span>Organization</span><select name="organizationId" defaultValue="" required><option value="" disabled>Select organization</option>{data.organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select><FieldError message={state.fieldErrors?.organizationId} /></label>}
          <label><span>Location name</span><input name="name" maxLength={120} required placeholder="Main branch" aria-invalid={Boolean(state.fieldErrors?.name)} /><FieldError message={state.fieldErrors?.name} /></label>
          <label><span>Street address <small>Optional</small></span><input name="address" maxLength={240} placeholder="12 Example Avenue, Casablanca" aria-invalid={Boolean(state.fieldErrors?.address)} /><FieldError message={state.fieldErrors?.address} /></label>
          <div className="management-field-grid"><label><span>Zone or neighborhood</span><input name="zone" maxLength={100} required placeholder="Maarif" aria-invalid={Boolean(state.fieldErrors?.zone)} /><FieldError message={state.fieldErrors?.zone} /></label><label><span>Category</span><select name="category" defaultValue="" required><option value="" disabled>Select category</option><option value="cafe">Cafe</option><option value="restaurant">Restaurant</option><option value="retail">Retail</option><option value="fitness">Fitness</option><option value="healthcare">Healthcare</option><option value="hospitality">Hospitality</option><option value="professional-services">Professional services</option><option value="other">Other</option></select><FieldError message={state.fieldErrors?.category} /></label></div>
          <label><span>Customer traffic</span><select name="trafficBand" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select><FieldError message={state.fieldErrors?.trafficBand} /></label>
          <fieldset className="operating-days"><legend>Operating days</legend><div>{days.map(([value, label]) => <label key={value}><input type="checkbox" name="days" value={value} defaultChecked={value !== "sun"} /><span>{label}</span></label>)}</div><FieldError message={state.fieldErrors?.days} /></fieldset>
          <div className="management-field-grid"><label><span>Opens</span><input type="time" name="opensAt" defaultValue="09:00" required aria-invalid={Boolean(state.fieldErrors?.opensAt)} /><FieldError message={state.fieldErrors?.opensAt} /></label><label><span>Closes</span><input type="time" name="closesAt" defaultValue="18:00" required aria-invalid={Boolean(state.fieldErrors?.closesAt)} /><FieldError message={state.fieldErrors?.closesAt} /></label></div>
          <button className="button button-primary management-submit" type="submit" disabled={pending || !ready}>{pending ? <LoaderCircle className="auth-spinner" size={17} /> : <Plus size={17} />}{pending ? "Adding location…" : "Add location"}</button>
        </div>
      </form>

      <article className="panel management-registry">
        <div className="panel-header"><div><h2>Registered locations</h2><p>Venue details used for eligibility and device operations.</p></div><span className="management-count"><MapPinned size={15} /> {data.locations.length}</span></div>
        {data.locations.length === 0 ? <div className="management-empty"><MapPinned size={23} /><strong>No locations registered</strong><p>Add the first approved venue to prepare screen pairing.</p></div> : <div className="table-scroll"><table><thead><tr><th>Location</th><th>Organization</th><th>Zone</th><th>Operating hours</th><th>Traffic</th><th>Status</th></tr></thead><tbody>{data.locations.map((location) => <tr key={location.publicId}><td><strong>{location.name}</strong><small>{location.address}</small></td><td>{location.organization}</td><td>{location.zone}</td><td><span className="hours-cell"><Clock3 size={13} /> {location.operatingHours}</span></td><td>{location.trafficBand}</td><td><StatusPill tone={location.status === "active" ? "success" : "warning"}>{location.status}</StatusPill></td></tr>)}</tbody></table></div>}
      </article>
    </div>
  );
}
