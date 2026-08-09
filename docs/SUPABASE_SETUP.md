# Supabase Starter Setup

## What is already configured

- Supabase CLI 2.113.0 is pinned in the web application
- `@supabase/supabase-js` and `@supabase/ssr` are installed
- Cookie-based browser/server clients and a Next.js request proxy are implemented
- Password sign-in and auth callback routes are implemented
- A PostgreSQL 17 migration defines the initial domain schema
- A second migration adds profiles, platform administrators, audited organization provisioning, and location creation
- A third migration adds audited organization/location editing, suspension controls, and location category exclusions
- A fourth migration adds private hashed device activation/credential storage, tenant-scoped operational observations, secure pairing, heartbeats, and revocation
- A fifth migration hardens the private media bucket and adds controlled upload preparation, submission, integrity metadata, administrator moderation, and audit records
- Every public application table has RLS enabled
- Data API privileges are explicit; the anonymous role receives no table access
- Private media storage has tenant-aware select/insert/update policies
- Campaigns read from Supabase after configuration and otherwise show demonstration data

## Create the hosted starter project

1. Create a new project in the Supabase Dashboard.
2. Keep the generated database password in a password manager.
3. In the project's Connect dialog, copy the Project URL and publishable key.
4. Copy `apps/web/.env.example` to `apps/web/.env.local` and fill in:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

Never place a secret or service-role key in a `NEXT_PUBLIC_` variable.

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

The first administrator is the only manual SQL bootstrap. After that, organizations and owners are provisioned from Admin control with audit records.

1. Create and verify the administrator account through the application.
2. Apply all database migrations.
3. In the SQL Editor, run this once using the administrator's email:

```sql
update public.profiles
set platform_role = 'admin', account_status = 'active'
where lower(email) = lower('ADMIN_EMAIL');
```

Sign out and sign back in. The administrator can then select verified pending accounts in Admin control, create organizations, and assign their owners. Business users cannot perform this operation.

## Authentication configuration

Add these redirect URLs in Authentication > URL Configuration:

- `http://localhost:3000/auth/callback`
- The production origin followed by `/auth/callback`

Use email/password for the initial pilot. Enable email confirmation and a production SMTP provider before external onboarding.

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
- `authenticated` gets only the operations needed by business users
- Evidence, devices, wallets, ledger entries, and audit logs are read-only to business users
- Server/service operations create device evidence and ledger settlements
- Authorization uses memberships stored in the database, never user-editable metadata
- Platform administrator authority is stored in protected profile data, never user-editable metadata
- Organization creation and owner assignment run in one transaction and produce database audit records
- Organization and location edits require explicit authorization and an audit reason
- Media paths begin with the organization's public UUID
- Storage replacement is covered by SELECT, INSERT, and UPDATE policies
