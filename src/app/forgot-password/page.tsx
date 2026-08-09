import { ForgotPasswordForm } from "@/components/auth-forms";
import { AuthShell } from "@/components/auth-shell";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return <AuthShell><ForgotPasswordForm configured={hasSupabaseEnv()} /></AuthShell>;
}
