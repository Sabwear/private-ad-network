"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSiteOrigin, safeNextPath } from "@/lib/auth/redirects";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export type AuthActionState = {
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: Partial<Record<"name" | "business" | "email" | "password" | "passwordConfirm" | "terms", string>>;
  values?: { name?: string; business?: string; email?: string };
};

const email = z.string().trim().max(254).email("Enter a valid email address.");
const password = z.string().min(12, "Use at least 12 characters.").max(128, "Use no more than 128 characters.");
const signInSchema = z.object({ email, password: z.string().min(1, "Enter your password.").max(128), next: z.string().max(2048) });
const signUpSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(100),
  business: z.string().trim().min(2, "Enter your business name.").max(120),
  email,
  password,
  passwordConfirm: z.string(),
  terms: z.literal("on", { error: "Confirm that you agree to the pilot terms." }),
}).refine((value) => value.password === value.passwordConfirm, {
  path: ["passwordConfirm"],
  message: "Passwords do not match.",
});
const recoverySchema = z.object({ email });
const updatePasswordSchema = z.object({ password, passwordConfirm: z.string() }).refine(
  (value) => value.password === value.passwordConfirm,
  { path: ["passwordConfirm"], message: "Passwords do not match." },
);

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function errorsFrom(error: z.ZodError) {
  const result: NonNullable<AuthActionState["fieldErrors"]> = {};
  const supportedFields = new Set(["name", "business", "email", "password", "passwordConfirm", "terms"]);
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && supportedFields.has(field) && !result[field as keyof typeof result]) {
      result[field as keyof typeof result] = issue.message;
    }
  }
  return result;
}

function configurationError(): AuthActionState {
  return { status: "error", message: "Authentication is temporarily unavailable. Please contact the network administrator." };
}

export async function signIn(_previousState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const values = { email: stringField(formData, "email").trim() };
  const parsed = signInSchema.safeParse({
    email: values.email,
    password: stringField(formData, "password"),
    next: stringField(formData, "next"),
  });

  if (!parsed.success) {
    return { status: "error", message: "Check the highlighted fields and try again.", fieldErrors: errorsFrom(parsed.error), values };
  }
  if (!hasSupabaseEnv()) return configurationError();

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });

  if (error) {
    const rateLimited = error.status === 429;
    return {
      status: "error",
      message: rateLimited ? "Too many sign-in attempts. Wait a moment and try again." : "Email or password is incorrect.",
      values,
    };
  }

  redirect(safeNextPath(parsed.data.next));
}

export async function signUp(_previousState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const values = {
    name: stringField(formData, "name").trim(),
    business: stringField(formData, "business").trim(),
    email: stringField(formData, "email").trim(),
  };
  if (stringField(formData, "website")) {
    return { status: "success", message: "Check your email for the confirmation link.", values: { email: values.email } };
  }
  const parsed = signUpSchema.safeParse({
    ...values,
    password: stringField(formData, "password"),
    passwordConfirm: stringField(formData, "passwordConfirm"),
    terms: stringField(formData, "terms"),
  });
  if (!parsed.success) {
    return { status: "error", message: "Check the highlighted fields and try again.", fieldErrors: errorsFrom(parsed.error), values };
  }
  if (!hasSupabaseEnv()) return configurationError();

  let origin: string;
  try {
    origin = await getSiteOrigin();
  } catch {
    return configurationError();
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/overview`,
      data: { full_name: parsed.data.name, organization_name: parsed.data.business },
    },
  });

  if (error) {
    return {
      status: "error",
      message: error.status === 429 ? "Too many requests. Wait a few minutes and try again." : "We could not create the account. Please try again.",
      values,
    };
  }

  if (data.session) redirect("/overview");
  return {
    status: "success",
    message: "Check your email for a confirmation link. The link must be opened before you can sign in.",
    values: { email: values.email },
  };
}

export async function requestPasswordReset(_previousState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const values = { email: stringField(formData, "email").trim() };
  const parsed = recoverySchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", message: "Enter a valid email address.", fieldErrors: errorsFrom(parsed.error), values };
  }
  if (!hasSupabaseEnv()) return configurationError();

  try {
    const origin = await getSiteOrigin();
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${origin}/auth/callback?next=/reset-password&flow=recovery`,
    });
  } catch {
    // Keep the response identical so this endpoint cannot enumerate accounts.
  }

  return {
    status: "success",
    message: "If an account exists for that email, a password reset link is on its way.",
    values,
  };
}

export async function updatePassword(_previousState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = updatePasswordSchema.safeParse({
    password: stringField(formData, "password"),
    passwordConfirm: stringField(formData, "passwordConfirm"),
  });
  if (!parsed.success) {
    return { status: "error", message: "Choose a valid new password.", fieldErrors: errorsFrom(parsed.error) };
  }
  if (!hasSupabaseEnv()) return configurationError();

  const cookieStore = await cookies();
  if (cookieStore.get("ll-password-recovery")?.value !== "1") {
    return { status: "error", message: "This recovery link has expired. Request a new password reset email." };
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) {
    return { status: "error", message: "This recovery session has expired. Request a new password reset email." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { status: "error", message: "The password could not be updated. Request a new recovery link and try again." };
  }

  cookieStore.delete("ll-password-recovery");
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login?message=password-updated");
}

export async function signOut() {
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "local" });
  }

  redirect("/login?message=signed-out");
}
