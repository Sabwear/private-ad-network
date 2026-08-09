-- Loopline starter schema for Supabase/PostgreSQL.
-- All application tables in the exposed public schema use explicit grants and RLS.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon;

create table public.policy_versions (
  id bigint generated always as identity primary key,
  code text not null unique,
  rules jsonb not null,
  effective_at timestamptz not null,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint policy_versions_code_not_blank check (length(btrim(code)) > 0),
  constraint policy_versions_rules_object check (jsonb_typeof(rules) = 'object'),
  constraint policy_versions_dates_valid check (superseded_at is null or superseded_at > effective_at)
);

create unique index policy_versions_one_active_idx
  on public.policy_versions ((superseded_at is null))
  where superseded_at is null;

create table public.organizations (
  id bigint generated always as identity primary key,
  public_id uuid not null default extensions.gen_random_uuid() unique,
  display_name text not null,
  legal_name text,
  category text not null,
  status text not null default 'pending',
  accepted_policy_version_id bigint references public.policy_versions(id),
  billing_profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_display_name_not_blank check (length(btrim(display_name)) > 0),
  constraint organizations_category_not_blank check (length(btrim(category)) > 0),
  constraint organizations_status_valid check (status in ('pending', 'active', 'suspended', 'closed')),
  constraint organizations_billing_profile_object check (jsonb_typeof(billing_profile) = 'object')
);

create table public.organization_memberships (
  organization_id bigint not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  status text not null default 'active',
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  constraint organization_memberships_role_valid check (role in ('owner', 'staff', 'moderator', 'operations', 'finance', 'admin')),
  constraint organization_memberships_status_valid check (status in ('invited', 'active', 'suspended'))
);

create index organization_memberships_user_id_idx
  on public.organization_memberships (user_id, organization_id)
  where status = 'active';

create table public.locations (
  id bigint generated always as identity primary key,
  public_id uuid not null default extensions.gen_random_uuid() unique,
  organization_id bigint not null references public.organizations(id) on delete cascade,
  name text not null,
  address text,
  zone text not null,
  category text not null,
  operating_hours jsonb not null default '{}'::jsonb,
  traffic_band text,
  quality_score numeric(5,2) not null default 100,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint locations_name_not_blank check (length(btrim(name)) > 0),
  constraint locations_zone_not_blank check (length(btrim(zone)) > 0),
  constraint locations_category_not_blank check (length(btrim(category)) > 0),
  constraint locations_operating_hours_object check (jsonb_typeof(operating_hours) = 'object'),
  constraint locations_quality_score_range check (quality_score between 0 and 100),
  constraint locations_status_valid check (status in ('pending', 'active', 'suspended', 'closed'))
);

create index locations_organization_id_idx on public.locations (organization_id);
create index locations_active_zone_idx on public.locations (zone, category) where status = 'active';

create table public.devices (
  id bigint generated always as identity primary key,
  public_id uuid not null default extensions.gen_random_uuid() unique,
  location_id bigint not null references public.locations(id) on delete cascade,
  name text not null,
  activation_status text not null default 'pending',
  key_fingerprint text unique,
  app_version text,
  capabilities jsonb not null default '{}'::jsonb,
  current_manifest_version bigint,
  last_heartbeat_at timestamptz,
  risk_state text not null default 'low',
  suspension_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint devices_name_not_blank check (length(btrim(name)) > 0),
  constraint devices_activation_status_valid check (activation_status in ('pending', 'active', 'suspended', 'revoked')),
  constraint devices_capabilities_object check (jsonb_typeof(capabilities) = 'object'),
  constraint devices_risk_state_valid check (risk_state in ('low', 'review', 'medium', 'high'))
);

create index devices_location_id_idx on public.devices (location_id);
create index devices_online_idx on public.devices (last_heartbeat_at desc)
  where activation_status = 'active';

create table public.media_assets (
  id bigint generated always as identity primary key,
  public_id uuid not null default extensions.gen_random_uuid() unique,
  organization_id bigint not null references public.organizations(id) on delete cascade,
  name text not null,
  original_storage_path text,
  normalized_storage_path text,
  thumbnail_storage_path text,
  duration_ms integer,
  width integer,
  height integer,
  codec text,
  checksum_sha256 text,
  moderation_status text not null default 'draft',
  rights_declared_at timestamptz,
  rejection_reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_assets_name_not_blank check (length(btrim(name)) > 0),
  constraint media_assets_duration_positive check (duration_ms is null or duration_ms > 0),
  constraint media_assets_dimensions_positive check ((width is null and height is null) or (width > 0 and height > 0)),
  constraint media_assets_moderation_status_valid check (moderation_status in ('draft', 'processing', 'in_review', 'approved', 'rejected', 'archived'))
);

create index media_assets_organization_id_idx on public.media_assets (organization_id);
create index media_assets_moderation_queue_idx on public.media_assets (created_at)
  where moderation_status = 'in_review';

create table public.campaigns (
  id bigint generated always as identity primary key,
  public_id uuid not null default extensions.gen_random_uuid() unique,
  organization_id bigint not null references public.organizations(id) on delete cascade,
  media_asset_id bigint not null references public.media_assets(id) on delete restrict,
  policy_version_id bigint not null references public.policy_versions(id) on delete restrict,
  name text not null,
  status text not null default 'draft',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  budget_credits numeric(20,6) not null,
  spent_credits numeric(20,6) not null default 0,
  daily_cap_credits numeric(20,6),
  frequency_cap_per_day integer,
  targeting jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaigns_name_not_blank check (length(btrim(name)) > 0),
  constraint campaigns_status_valid check (status in ('draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled')),
  constraint campaigns_dates_valid check (ends_at > starts_at),
  constraint campaigns_budget_positive check (budget_credits > 0),
  constraint campaigns_spend_valid check (spent_credits >= 0 and spent_credits <= budget_credits),
  constraint campaigns_daily_cap_valid check (daily_cap_credits is null or (daily_cap_credits > 0 and daily_cap_credits <= budget_credits)),
  constraint campaigns_frequency_cap_valid check (frequency_cap_per_day is null or frequency_cap_per_day > 0),
  constraint campaigns_targeting_object check (jsonb_typeof(targeting) = 'object')
);

create index campaigns_organization_id_idx on public.campaigns (organization_id);
create index campaigns_media_asset_id_idx on public.campaigns (media_asset_id);
create index campaigns_delivery_idx on public.campaigns (starts_at, ends_at)
  where status in ('scheduled', 'active');

create table public.playback_sessions (
  id bigint generated always as identity primary key,
  playback_id uuid not null unique,
  device_id bigint not null references public.devices(id) on delete restrict,
  campaign_id bigint not null references public.campaigns(id) on delete restrict,
  media_asset_id bigint not null references public.media_assets(id) on delete restrict,
  advertiser_organization_id bigint not null references public.organizations(id) on delete restrict,
  host_organization_id bigint not null references public.organizations(id) on delete restrict,
  policy_version_id bigint not null references public.policy_versions(id) on delete restrict,
  manifest_id uuid not null,
  assignment_nonce text not null,
  started_at timestamptz,
  completed_at timestamptz,
  verified_seconds numeric(12,3) not null default 0,
  validation_result text not null default 'pending',
  confidence_score numeric(5,2),
  reason_codes text[] not null default '{}',
  settled_ledger_transaction_id bigint,
  created_at timestamptz not null default now(),
  constraint playback_sessions_organizations_different check (advertiser_organization_id <> host_organization_id),
  constraint playback_sessions_verified_seconds_nonnegative check (verified_seconds >= 0),
  constraint playback_sessions_validation_result_valid check (validation_result in ('pending', 'accepted', 'held', 'rejected', 'reversed')),
  constraint playback_sessions_confidence_range check (confidence_score is null or confidence_score between 0 and 100)
);

create unique index playback_sessions_device_nonce_idx on public.playback_sessions (device_id, assignment_nonce);
create index playback_sessions_device_created_idx on public.playback_sessions (device_id, created_at desc);
create index playback_sessions_advertiser_created_idx on public.playback_sessions (advertiser_organization_id, created_at desc);
create index playback_sessions_host_created_idx on public.playback_sessions (host_organization_id, created_at desc);
create index playback_sessions_review_queue_idx on public.playback_sessions (created_at)
  where validation_result = 'held';

create table public.wallets (
  id bigint generated always as identity primary key,
  organization_id bigint references public.organizations(id) on delete cascade,
  wallet_type text not null,
  balance_projection numeric(20,6) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallets_type_valid check (wallet_type in ('purchased', 'earned', 'promotional', 'held', 'platform')),
  constraint wallets_owner_valid check ((wallet_type = 'platform' and organization_id is null) or (wallet_type <> 'platform' and organization_id is not null)),
  unique nulls not distinct (organization_id, wallet_type)
);

create index wallets_organization_id_idx on public.wallets (organization_id) where organization_id is not null;

create table public.ledger_transactions (
  id bigint generated always as identity primary key,
  public_id uuid not null default extensions.gen_random_uuid() unique,
  transaction_type text not null,
  reference_type text not null,
  reference_id text not null,
  policy_version_id bigint references public.policy_versions(id) on delete restrict,
  idempotency_key text not null unique,
  status text not null default 'posted',
  reversal_of_id bigint references public.ledger_transactions(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  constraint ledger_transactions_type_valid check (transaction_type in ('settlement', 'purchase', 'bonus', 'hold', 'hold_release', 'fee', 'adjustment', 'reversal')),
  constraint ledger_transactions_status_valid check (status in ('draft', 'posted', 'void')),
  constraint ledger_transactions_reversal_valid check ((transaction_type = 'reversal' and reversal_of_id is not null) or (transaction_type <> 'reversal'))
);

create index ledger_transactions_reference_idx on public.ledger_transactions (reference_type, reference_id);
create index ledger_transactions_reversal_of_id_idx on public.ledger_transactions (reversal_of_id) where reversal_of_id is not null;

alter table public.playback_sessions
  add constraint playback_sessions_settled_ledger_transaction_id_fkey
  foreign key (settled_ledger_transaction_id) references public.ledger_transactions(id) on delete restrict;

create table public.ledger_entries (
  id bigint generated always as identity primary key,
  transaction_id bigint not null references public.ledger_transactions(id) on delete restrict,
  wallet_id bigint not null references public.wallets(id) on delete restrict,
  amount numeric(20,6) not null,
  description text not null,
  created_at timestamptz not null default now(),
  constraint ledger_entries_amount_nonzero check (amount <> 0),
  constraint ledger_entries_description_not_blank check (length(btrim(description)) > 0)
);

create index ledger_entries_transaction_id_idx on public.ledger_entries (transaction_id);
create index ledger_entries_wallet_created_idx on public.ledger_entries (wallet_id, created_at desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id bigint references public.organizations(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  object_type text not null,
  object_id text not null,
  reason text,
  before_summary jsonb,
  after_summary jsonb,
  request_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_action_not_blank check (length(btrim(action)) > 0),
  constraint audit_logs_context_object check (jsonb_typeof(request_context) = 'object')
);

create index audit_logs_organization_created_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_actor_created_idx on public.audit_logs (actor_user_id, created_at desc) where actor_user_id is not null;

-- Keep updated_at consistent without relying on application code.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();
create trigger organization_memberships_set_updated_at before update on public.organization_memberships
  for each row execute function private.set_updated_at();
create trigger locations_set_updated_at before update on public.locations
  for each row execute function private.set_updated_at();
create trigger devices_set_updated_at before update on public.devices
  for each row execute function private.set_updated_at();
create trigger media_assets_set_updated_at before update on public.media_assets
  for each row execute function private.set_updated_at();
create trigger campaigns_set_updated_at before update on public.campaigns
  for each row execute function private.set_updated_at();
create trigger wallets_set_updated_at before update on public.wallets
  for each row execute function private.set_updated_at();

-- Security-definer helpers stay in an unexposed schema and use a fixed search path.
create or replace function private.is_org_member(target_organization_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = target_organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  );
$$;

create or replace function private.has_org_role(target_organization_id bigint, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = target_organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role = any(allowed_roles)
  );
$$;

create or replace function private.device_organization_id(target_device_id bigint)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select location.organization_id
  from public.devices device
  join public.locations location on location.id = device.location_id
  where device.id = target_device_id;
$$;

-- Reject posted ledger transactions that are not balanced and double-sided.
create or replace function private.assert_ledger_transaction_balances()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_transaction_id bigint;
  target_status text;
  entry_count integer;
  entry_total numeric(20,6);
begin
  if tg_table_name = 'ledger_entries' then
    target_transaction_id := coalesce(new.transaction_id, old.transaction_id);
  else
    target_transaction_id := coalesce(new.id, old.id);
  end if;

  select transaction.status into target_status
  from public.ledger_transactions transaction
  where transaction.id = target_transaction_id;

  if target_status = 'posted' then
    select count(*), coalesce(sum(entry.amount), 0)
      into entry_count, entry_total
    from public.ledger_entries entry
    where entry.transaction_id = target_transaction_id;

    if entry_count < 2 or entry_total <> 0 then
      raise exception 'Posted ledger transaction % must have at least two entries and balance to zero', target_transaction_id;
    end if;
  end if;

  return null;
end;
$$;

create constraint trigger ledger_entries_balance_check
after insert or update or delete on public.ledger_entries
deferrable initially deferred
for each row execute function private.assert_ledger_transaction_balances();

create constraint trigger ledger_transactions_balance_check
after insert or update of status on public.ledger_transactions
deferrable initially deferred
for each row execute function private.assert_ledger_transaction_balances();

-- RLS is enabled for every public table, including server-managed evidence/ledger tables.
alter table public.policy_versions enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.locations enable row level security;
alter table public.devices enable row level security;
alter table public.media_assets enable row level security;
alter table public.campaigns enable row level security;
alter table public.playback_sessions enable row level security;
alter table public.wallets enable row level security;
alter table public.ledger_transactions enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.audit_logs enable row level security;

create policy policy_versions_authenticated_read on public.policy_versions
  for select to authenticated using (true);

create policy organizations_member_read on public.organizations
  for select to authenticated using ((select private.is_org_member(id)));
create policy organizations_owner_update on public.organizations
  for update to authenticated
  using ((select private.has_org_role(id, array['owner']::text[])))
  with check ((select private.has_org_role(id, array['owner']::text[])));

create policy memberships_member_read on public.organization_memberships
  for select to authenticated using ((select private.is_org_member(organization_id)));
create policy memberships_owner_insert on public.organization_memberships
  for insert to authenticated with check ((select private.has_org_role(organization_id, array['owner']::text[])));
create policy memberships_owner_update on public.organization_memberships
  for update to authenticated
  using ((select private.has_org_role(organization_id, array['owner']::text[])))
  with check ((select private.has_org_role(organization_id, array['owner']::text[])));
create policy memberships_owner_delete on public.organization_memberships
  for delete to authenticated using ((select private.has_org_role(organization_id, array['owner']::text[])));

create policy locations_member_read on public.locations
  for select to authenticated using ((select private.is_org_member(organization_id)));
create policy locations_manager_insert on public.locations
  for insert to authenticated with check ((select private.has_org_role(organization_id, array['owner', 'staff']::text[])));
create policy locations_manager_update on public.locations
  for update to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'staff']::text[])))
  with check ((select private.has_org_role(organization_id, array['owner', 'staff']::text[])));

create policy devices_member_read on public.devices
  for select to authenticated
  using ((select private.is_org_member((select private.device_organization_id(id)))));

create policy media_assets_member_read on public.media_assets
  for select to authenticated using ((select private.is_org_member(organization_id)));
create policy media_assets_manager_insert on public.media_assets
  for insert to authenticated with check ((select private.has_org_role(organization_id, array['owner', 'staff']::text[])));
create policy media_assets_manager_update on public.media_assets
  for update to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'staff']::text[])))
  with check ((select private.has_org_role(organization_id, array['owner', 'staff']::text[])));

create policy campaigns_member_read on public.campaigns
  for select to authenticated using ((select private.is_org_member(organization_id)));
create policy campaigns_manager_insert on public.campaigns
  for insert to authenticated with check ((select private.has_org_role(organization_id, array['owner', 'staff']::text[])));
create policy campaigns_manager_update on public.campaigns
  for update to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'staff']::text[])))
  with check ((select private.has_org_role(organization_id, array['owner', 'staff']::text[])));

create policy playback_sessions_participant_read on public.playback_sessions
  for select to authenticated
  using ((select private.is_org_member(advertiser_organization_id)) or (select private.is_org_member(host_organization_id)));

create policy wallets_member_read on public.wallets
  for select to authenticated
  using (organization_id is not null and (select private.is_org_member(organization_id)));

create policy ledger_transactions_member_read on public.ledger_transactions
  for select to authenticated
  using (
    exists (
      select 1
      from public.ledger_entries entry
      join public.wallets wallet on wallet.id = entry.wallet_id
      where entry.transaction_id = ledger_transactions.id
        and wallet.organization_id is not null
        and (select private.is_org_member(wallet.organization_id))
    )
  );

create policy ledger_entries_member_read on public.ledger_entries
  for select to authenticated
  using (
    exists (
      select 1 from public.wallets wallet
      where wallet.id = ledger_entries.wallet_id
        and wallet.organization_id is not null
        and (select private.is_org_member(wallet.organization_id))
    )
  );

create policy audit_logs_member_read on public.audit_logs
  for select to authenticated
  using (organization_id is not null and (select private.has_org_role(organization_id, array['owner']::text[])));

-- Explicit Data API privileges. Anonymous access is intentionally empty.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant usage on schema public to authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_org_member(bigint) to authenticated;
grant execute on function private.has_org_role(bigint, text[]) to authenticated;
grant execute on function private.device_organization_id(bigint) to authenticated;

grant select on public.policy_versions, public.organizations, public.organization_memberships,
  public.locations, public.devices, public.media_assets, public.campaigns,
  public.playback_sessions, public.wallets, public.ledger_transactions,
  public.ledger_entries, public.audit_logs to authenticated;
grant insert, update on public.locations, public.media_assets, public.campaigns to authenticated;
grant insert, update, delete on public.organization_memberships to authenticated;
grant update on public.organizations to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Private media bucket. Objects use <organization-public-id>/<asset-public-id>/<filename>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 104857600, array['video/mp4', 'image/jpeg', 'image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy media_objects_member_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'media'
    and exists (
      select 1 from public.organizations organization
      where organization.public_id::text = (storage.foldername(name))[1]
        and (select private.is_org_member(organization.id))
    )
  );

create policy media_objects_manager_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and exists (
      select 1 from public.organizations organization
      where organization.public_id::text = (storage.foldername(name))[1]
        and (select private.has_org_role(organization.id, array['owner', 'staff']::text[]))
    )
  );

create policy media_objects_manager_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'media'
    and exists (
      select 1 from public.organizations organization
      where organization.public_id::text = (storage.foldername(name))[1]
        and (select private.has_org_role(organization.id, array['owner', 'staff']::text[]))
    )
  )
  with check (
    bucket_id = 'media'
    and exists (
      select 1 from public.organizations organization
      where organization.public_id::text = (storage.foldername(name))[1]
        and (select private.has_org_role(organization.id, array['owner', 'staff']::text[]))
    )
  );

insert into public.policy_versions (code, rules, effective_at)
values (
  'PILOT-1.0',
  jsonb_build_object(
    'credit_unit', 'verified_minute',
    'host_share', 1.0,
    'completion_threshold', 0.97,
    'heartbeat_seconds', 45,
    'offline_limit_hours', 6,
    'self_display_allowed', false
  ),
  now()
);
