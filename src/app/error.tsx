"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <main className="recovery-page"><section className="recovery-card"><AlertTriangle size={34} /><p className="eyebrow">Temporary interruption</p><h1>We could not load this page</h1><p>Your data is safe. Try the request again, or return to the dashboard if the problem continues.</p>{error.digest ? <small>Reference: {error.digest}</small> : null}<button className="button button-primary" type="button" onClick={reset}><RotateCcw size={15} /> Try again</button></section></main>;
}
