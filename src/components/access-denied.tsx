import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";

export function AccessDenied() {
  return (
    <section className="access-denied">
      <span><ShieldX size={25} /></span>
      <p className="eyebrow">Role restricted</p>
      <h1>Admin access is not enabled for this account</h1>
      <p>Only active platform administrators can open or manage the dashboard. Business and viewer accounts never receive management access.</p>
      <Link className="button button-secondary" href="/overview"><ArrowLeft size={16} /> Return to overview</Link>
    </section>
  );
}
