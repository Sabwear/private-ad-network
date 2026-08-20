"use client";

import { CircleDollarSign, LoaderCircle } from "lucide-react";
import { useActionState } from "react";
import { grantBusinessCredits, type CreditGrantState } from "@/app/(platform)/wallet/actions";

const initialState: CreditGrantState = { status: "idle", message: "" };

export function CreditGrantForm({ businesses }: { businesses: Array<{ id: number; name: string }> }) {
  const [state, action, pending] = useActionState(grantBusinessCredits, initialState);
  return <article className="panel management-editor management-editor-wide">
    <div className="panel-header"><div><h2>Grant advertising credits</h2><p>Fund a business so its approved channel media can enter the live loop. Every grant creates a balanced ledger transaction and audit record.</p></div><CircleDollarSign size={21} /></div>
    <form action={action} className="management-inline-form">
      {state.message ? <div className={`auth-message auth-message-${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</div> : null}
      <div className="management-field-grid">
        <label><span>Business</span><select name="organizationId" defaultValue="" required><option value="" disabled>Select a business</option>{businesses.map((business) => <option value={business.id} key={business.id}>{business.name}</option>)}</select></label>
        <label><span>Promotional credits</span><input name="amount" type="number" min="0.001" max="1000000" step="0.001" placeholder="5000" required /></label>
      </div>
      <label><span>Administrative reason</span><input name="reason" minLength={5} maxLength={300} placeholder="Fund approved advertising campaign" required /></label>
      <button className="button button-primary" type="submit" disabled={pending}>{pending ? <LoaderCircle className="auth-spinner" size={16} /> : <CircleDollarSign size={16} />}{pending ? "Granting…" : "Grant credits"}</button>
    </form>
  </article>;
}
