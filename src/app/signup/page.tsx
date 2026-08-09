import { SignUpForm } from "@/components/auth-forms";
import { AuthShell } from "@/components/auth-shell";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export const metadata = { title: "Create account" };

export default function SignUpPage() {
  return <AuthShell><SignUpForm configured={hasSupabaseEnv()} /></AuthShell>;
}
