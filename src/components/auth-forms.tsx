"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, LoaderCircle, MailCheck, ShieldCheck } from "lucide-react";
import { useActionState, useState } from "react";
import {
  requestPasswordReset,
  signIn,
  signUp,
  updatePassword,
  type AuthActionState,
} from "@/app/login/actions";

const emptyState: AuthActionState = { status: "idle", message: "" };

function AuthServiceStatus({ configured }: { configured: boolean }) {
  if (configured) return null;

  return (
    <div className="auth-message auth-message-error" role="alert">
      <ShieldCheck size={17} />
      <span>Sign-in is temporarily unavailable. Please contact the network administrator.</span>
    </div>
  );
}

function FormMessage({ state }: { state: AuthActionState }) {
  if (!state.message) return null;
  const Icon = state.status === "success" ? CheckCircle2 : ShieldCheck;
  return <div className={`auth-message auth-message-${state.status}`} role={state.status === "error" ? "alert" : "status"} aria-live="polite"><Icon size={17} /><span>{state.message}</span></div>;
}

function FieldError({ message }: { message?: string }) {
  return message ? <small className="auth-field-error">{message}</small> : null;
}

function PasswordField({
  name,
  label,
  autoComplete,
  error,
  hint,
}: {
  name: "password" | "passwordConfirm";
  label: string;
  autoComplete: string;
  error?: string;
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label htmlFor={name}>
      <span>{label}</span>
      <span className="auth-password-input">
        <input id={name} name={name} type={visible ? "text" : "password"} autoComplete={autoComplete} minLength={name === "password" ? 12 : undefined} maxLength={128} required aria-invalid={Boolean(error)} aria-describedby={error ? `${name}-error` : hint ? `${name}-hint` : undefined} />
        <button type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button>
      </span>
      {hint && !error ? <small className="auth-field-hint" id={`${name}-hint`}>{hint}</small> : null}
      {error ? <small className="auth-field-error" id={`${name}-error`}>{error}</small> : null}
    </label>
  );
}

function SubmitButton({ pending, children, configured = true }: { pending: boolean; children: React.ReactNode; configured?: boolean }) {
  return <button className="button button-primary auth-submit" type="submit" disabled={pending || !configured}>{pending ? <LoaderCircle className="auth-spinner" size={17} /> : null}{children}{pending ? null : <ArrowRight size={17} />}</button>;
}

export function LoginForm({ configured, initialState = emptyState, nextPath = "/overview" }: { configured: boolean; initialState?: AuthActionState; nextPath?: string }) {
  const [state, formAction, pending] = useActionState(signIn, initialState);
  return (
    <form className="auth-form" action={formAction} noValidate>
      <AuthServiceStatus configured={configured} />
      <header><p className="eyebrow">Welcome back</p><h2>Sign in to your workspace</h2><p>Use your verified business email to continue.</p></header>
      <FormMessage state={state} />
      <input type="hidden" name="next" value={nextPath} />
      <label htmlFor="email"><span>Email address</span><input id="email" name="email" type="email" autoComplete="email" placeholder="you@business.com" maxLength={254} defaultValue={state.values?.email} required aria-invalid={Boolean(state.fieldErrors?.email)} /><FieldError message={state.fieldErrors?.email} /></label>
      <PasswordField name="password" label="Password" autoComplete="current-password" error={state.fieldErrors?.password} />
      <div className="auth-form-row"><span>Secure cookie-based session</span><Link href="/forgot-password">Forgot password?</Link></div>
      <SubmitButton pending={pending} configured={configured}>Sign in</SubmitButton>
      <p className="auth-switch">New to Loopline? <Link href="/signup">Create a pilot account</Link></p>
    </form>
  );
}

export function SignUpForm({ configured }: { configured: boolean }) {
  const [state, formAction, pending] = useActionState(signUp, emptyState);
  return (
    <form className="auth-form auth-form-wide" action={formAction} noValidate>
      <AuthServiceStatus configured={configured} />
      <header><p className="eyebrow">Pilot access</p><h2>Create your account</h2><p>After email verification, an administrator will assign your approved business workspace.</p></header>
      <FormMessage state={state} />
      {state.status === "success" ? (
        <div className="auth-success-panel"><MailCheck size={34} /><h3>Confirmation email sent</h3><p>Open the link in your inbox, then return here to sign in.</p><Link className="button button-secondary" href="/login">Back to sign in</Link></div>
      ) : (
        <>
          <label htmlFor="name"><span>Full name</span><input id="name" name="name" autoComplete="name" maxLength={100} defaultValue={state.values?.name} required aria-invalid={Boolean(state.fieldErrors?.name)} /><FieldError message={state.fieldErrors?.name} /></label>
          <label htmlFor="email"><span>Business email</span><input id="email" name="email" type="email" autoComplete="email" placeholder="you@business.com" maxLength={254} defaultValue={state.values?.email} required aria-invalid={Boolean(state.fieldErrors?.email)} /><FieldError message={state.fieldErrors?.email} /></label>
          <PasswordField name="password" label="Create password" autoComplete="new-password" error={state.fieldErrors?.password} hint="Use at least 12 characters. A password manager is recommended." />
          <PasswordField name="passwordConfirm" label="Confirm password" autoComplete="new-password" error={state.fieldErrors?.passwordConfirm} />
          <label className="auth-honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
          <label className="auth-terms"><input type="checkbox" name="terms" required /><span>I am authorized to represent this business and agree to the pilot participation terms.</span></label>
          <FieldError message={state.fieldErrors?.terms} />
          <SubmitButton pending={pending} configured={configured}>Create account</SubmitButton>
        </>
      )}
      <p className="auth-switch">Already have an account? <Link href="/login">Sign in</Link></p>
    </form>
  );
}

export function ForgotPasswordForm({ configured }: { configured: boolean }) {
  const [state, formAction, pending] = useActionState(requestPasswordReset, emptyState);
  return (
    <form className="auth-form" action={formAction} noValidate>
      <AuthServiceStatus configured={configured} />
      <header><p className="eyebrow">Account recovery</p><h2>Reset your password</h2><p>We will send a secure, time-limited recovery link.</p></header>
      <FormMessage state={state} />
      <label htmlFor="email"><span>Email address</span><input id="email" name="email" type="email" autoComplete="email" maxLength={254} defaultValue={state.values?.email} required aria-invalid={Boolean(state.fieldErrors?.email)} /><FieldError message={state.fieldErrors?.email} /></label>
      <SubmitButton pending={pending} configured={configured}>Send recovery link</SubmitButton>
      <Link className="auth-back-link" href="/login"><ArrowLeft size={15} /> Back to sign in</Link>
    </form>
  );
}

export function UpdatePasswordForm() {
  const [state, formAction, pending] = useActionState(updatePassword, emptyState);
  return (
    <form className="auth-form" action={formAction} noValidate>
      <header><p className="eyebrow">Secure recovery</p><h2>Choose a new password</h2><p>This recovery session expires after 15 minutes.</p></header>
      <FormMessage state={state} />
      <PasswordField name="password" label="New password" autoComplete="new-password" error={state.fieldErrors?.password} hint="Use at least 12 characters and avoid reusing an old password." />
      <PasswordField name="passwordConfirm" label="Confirm new password" autoComplete="new-password" error={state.fieldErrors?.passwordConfirm} />
      <SubmitButton pending={pending}>Update password</SubmitButton>
    </form>
  );
}
