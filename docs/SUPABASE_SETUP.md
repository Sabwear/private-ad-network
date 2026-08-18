# Supabase Starter Setup

## What is already configured

- Supabase CLI 2.113.0 is pinned in the web application
- `@supabase/supabase-js` and `@supabase/ssr` are installed
- Cookie-based browser/server clients and a Next.js request proxy are implemented
- Password sign-in and auth callback routes are implemented
- A PostgreSQL 17 migration defines the initial domain schema
- A second migration adds profiles, platform administrators, audited organization provisioning, and location creation
- A third migration adds audited organization/location editing, suspension controls, and location category exclusions
- A fourth migration adds private hashed device activation/credential storage, operational observations, secure pairing, heartbeats, and revocation
- Later media migrations harden the private bucket and add controlled upload preparation, resumable submission, integrity metadata, direct administrator approval, deletion, and audit records
- User-access migrations add administrator/viewer accounts, suspension enforcement, and portal session observations
- `20260817231040_admin_only_platform_model.sql` removes business-user assignments, disables tenant predicates, and enforces administrator-only management functions and read policies
- A seventh migration adds durable media-processing jobs, worker-only claim/complete/fail functions, derivative storage access, retries, and approval gating
- Every public application table has RLS enabled
- Data API privileges are explicit; the anonymous role receives no table access
- Private media storage has administrator-only mutation policies and authorized player delivery
- Campaigns read from Supabase after configuration and otherwise show demonstration data

## Create the hosted starter project

1. Create a new project in the Supabase Dashboard.
2. Keep the generated database password in a password manager.
3. In the project's Connect dialog, copy the Project URL and publishable key.
4. Copy `apps/web/.env.example` to `apps/web/.env.local` and fill in:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
SUPABASE_SECRET_KEY=sb_secret_your_server_key
STREAM_VIEWER_HASH_SECRET=replace_with_at_least_32_random_bytes
```

The secret key is required only by server-side account invitations and protected service operations. Never place a secret or service-role key in a `NEXT_PUBLIC_` variable. Add it through the deployment provider's protected environment-variable settings. For Vercel, configure it under Project Settings > Environment Variables for Production, Preview, and Development as appropriate.

## Link and apply the migration

Run from `apps/web`:

```powershell
pnpm exec supabase login
pnpm exec supabase --workdir . link --project-ref YOUR_PROJECT_REF
pnpm db:push:check
pnpm exec supabase --workdir . db push
pnpm exec supabase --workdir . migration list
```

Do not include the seed file when pushing to production. It intentionally contains no business or user data.

## Bootstrap the first platform administrator

The first administrator is the only manual SQL bootstrap. After that, administrators create businesses and invite administrator or viewer accounts from the dashboard with audit records.

1. Create and verify the administrator account through the application.
2. Apply all database migrations.
3. In the SQL Editor, run this once using the administrator's email:

```sql
update public.profiles
set platform_role = 'admin', account_status = 'active'
where lower(email) = lower('ADMIN_EMAIL');
```

Sign out and sign back in. The administrator can create businesses independently and invite either another administrator or an approved viewer. Businesses are never assigned to accounts.

## Authentication configuration

Add these redirect URLs in Authentication > URL Configuration:

- `http://localhost:3000/auth/callback`
- The production origin followed by `/auth/callback`

Use email/password for the initial pilot. Enable email confirmation and a production SMTP provider before external onboarding.

Disable **Allow new users to sign up** under Authentication > Sign In / Providers. Administrator invitations continue to create approved accounts while public registration remains blocked.

## Local development

The repository includes `supabase/config.toml`, migrations, and a safe seed file. Running the local stack requires Docker Desktop or another Docker-compatible runtime:

```powershell
pnpm db:start
pnpm db:reset
```

Docker is not installed in the current workstation environment, so the local containers cannot be started yet. The hosted project workflow above does not require local Docker.

## Generate fresh database types

After linking and applying the schema:

```powershell
pnpm db:types > src/lib/supabase/database.generated.ts
```

Review the output and replace the starter hand-maintained `database.types.ts` import after the schema stabilizes.

## Security defaults

- Public tables are not automatically exposed
- `anon` has no application-table privileges
- `authenticated` table access is constrained by administrator-only policies; viewer accounts have no dashboard data access
- Evidence, devices, wallets, ledger entries, and audit logs are administrator-controlled
- Server/service operations create device evidence and ledger settlements
- Authorization uses the protected profile platform role, never user-editable authentication metadata
- Platform administrator authority is stored in protected profile data, never user-editable metadata
- Business creation and wallet initialization run in one protected operation and produce database audit records
- Organization and location edits require explicit authorization and an audit reason
- Media paths begin with the organization's public UUID
- Storage replacement is covered by SELECT, INSERT, and UPDATE policies
