import { redirect } from "next/navigation";

export const metadata = { title: "Create account" };

export default function SignUpPage() {
  redirect("/login?message=invitation-required");
}
