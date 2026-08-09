import Link from "next/link";
import { ArrowRight, Construction } from "lucide-react";

export function BetaUnavailable({ title, description, next }: { title: string; description: string; next: string }) {
  return <section className="beta-unavailable panel"><span><Construction size={26} /></span><p className="eyebrow">Not enabled in limited beta</p><h2>{title}</h2><p>{description}</p><div><strong>What testers can use now</strong><small>{next}</small></div><Link href="/overview" className="button button-secondary">Return to beta overview <ArrowRight size={15} /></Link></section>;
}
