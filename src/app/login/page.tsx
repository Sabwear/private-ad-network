import { ArrowRight, Database, LockKeyhole } from "lucide-react";
import { Brand } from "@/components/brand";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { signIn } from "@/app/login/actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const configured = hasSupabaseEnv();

  return (
    <main className="auth-page">
      <section className="auth-story">
        <Brand />
        <div>
          <span className="auth-kicker"><LockKeyhole size={15} /> Private pilot network</span>
          <h1>Every play accounted for. Every credit explainable.</h1>
          <p>Manage verified advertising delivery, screen health, and the credit economy from one trusted workspace.</p>
        </div>
        <small>Loopline starter platform · Pilot policy 1.0</small>
      </section>
      <section className="auth-form-wrap">
        <form className="auth-form" action={signIn}>
          <div className="auth-database"><Database size={19} /><span><strong>{configured ? "Supabase connected" : "Setup required"}</strong><small>{configured ? "Authentication is ready" : "Add .env.local credentials first"}</small></span></div>
          <div><p className="eyebrow">Welcome back</p><h2>Sign in to your workspace</h2><p>Use the account assigned to your pilot organization.</p></div>
          {error ? <div className="auth-error" role="alert">{error}</div> : null}
          <label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@business.com" required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" placeholder="At least 8 characters" minLength={8} required /></label>
          <button className="button button-primary auth-submit" type="submit" disabled={!configured}>Sign in <ArrowRight size={17} /></button>
          <p className="auth-help">Accounts are created by the network administrator during pilot onboarding.</p>
        </form>
      </section>
    </main>
  );
}
