import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return <main className="error-page"><span>404</span><h1>This part of the network is not connected yet.</h1><p>The requested page does not exist or is still planned for a later milestone.</p><Link href="/overview" className="button button-primary"><ArrowLeft size={17} /> Back to overview</Link></main>;
}
