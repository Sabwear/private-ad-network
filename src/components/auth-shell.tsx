import { LockKeyhole } from "lucide-react";
import { Brand } from "@/components/brand";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Brand />
        <div>
          <span className="auth-kicker"><LockKeyhole size={15} /> Private pilot network</span>
          <h1>Every play accounted for. Every credit explainable.</h1>
          <p>Manage every business, campaign, screen, stream, and credit rule from one administrator-controlled platform.</p>
          <ul className="auth-trust-list">
            <li><span>01</span> Central administrator control</li>
            <li><span>02</span> Verified delivery evidence</li>
            <li><span>03</span> Auditable credit settlement</li>
          </ul>
        </div>
        <small>Loopline starter platform · Pilot policy 1.0</small>
      </section>
      <section className="auth-form-wrap">{children}</section>
    </main>
  );
}
