import type { StatusTone } from "@/lib/platform-data";

export function StatusPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: StatusTone }) {
  return <span className={`status-pill status-${tone}`}><span className="status-dot" />{children}</span>;
}
