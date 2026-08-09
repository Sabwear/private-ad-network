import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/auth-forms";
import type { AuthActionState } from "@/app/login/actions";
import { safeNextPath } from "@/lib/auth/redirects";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export const metadata = { title: "Sign in" };

const messages: Record<string, AuthActionState> = {
  "password-updated": { status: "success", message: "Your password was updated. Sign in with the new password." },
  "signed-out": { status: "success", message: "You have been signed out securely." },
  "auth-callback-failed": { status: "error", message: "That authentication link is invalid or has expired. Request a new link and try again." },
  "service-unavailable": { status: "error", message: "Sign-in is temporarily unavailable. Please contact the network administrator." },
  "access-revoked": { status: "error", message: "Your account or session no longer has access. Contact the network administrator." },
  "invitation-required": { status: "error", message: "Access is invitation-only. Contact the network administrator for an account." },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; next?: string }>;
}) {
  const params = await searchParams;
  const initialState = params.message ? messages[params.message] : undefined;

  return (
    <AuthShell>
      <LoginForm configured={hasSupabaseEnv()} initialState={initialState} nextPath={safeNextPath(params.next)} />
    </AuthShell>
  );
}
