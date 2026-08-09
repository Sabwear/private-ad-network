import { Orbit } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="Loopline platform">
      <span className="brand-mark"><Orbit size={22} strokeWidth={2.1} /></span>
      {compact ? null : <span className="brand-copy"><strong>Loopline</strong><small>Ad exchange</small></span>}
    </div>
  );
}
