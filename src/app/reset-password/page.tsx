import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { UpdatePasswordForm } from "@/components/auth-forms";
import { AuthShell } from "@/components/auth-shell";

export const metadata = { title: "Choose new password" };

export default async function ResetPasswordPage() {
  const cookieStore = await cookies();
  if (cookieStore.get("ll-password-recovery")?.value !== "1") {
    redirect("/forgot-password");
  }

  return <AuthShell><UpdatePasswordForm /></AuthShell>;
}
