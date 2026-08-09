-- Platform administrators create business organizations manually.
-- Business accounts may self-register, but they receive no tenant access until
-- an administrator creates an organization and assigns the account as owner.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  email_verified_at timestamptz,
  account_status text not null default 'pending',
  platform_role text not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_not_blank check (length(btrim(email)) > 0),
  constraint profiles_account_status_valid check (account_status in ('pending', 'active', 'suspended')),
  constraint profiles_platform_role_valid check (platform_role in ('member', 'admin'))
);

create unique index profiles_email_unique_idx on public.profiles (lower(email));
create index profiles_pending_accounts_idx on public.profiles (created_at)
  where account_status = 'pending' and email_verified_at is not null;
create index profiles_platform_admin_idx on public.profiles (id)
  where platform_role = 'admin' and account_status = 'active';
create unique index locations_organization_name_unique_idx
  on public.locations (organization_id, lower(name))
  where status <> 'closed';

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null then
    return new;
  end if;

  insert into public.profiles (id, email, full_name, email_verified_at)
  values (
    new.id,
    lower(new.email),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    new.email_confirmed_at
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        email_verified_at = excluded.email_verified_at;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function private.handle_new_auth_user();

insert into public.profiles (id, email, full_name, email_verified_at)
select
  auth_user.id,
  lower(auth_user.email),
  nullif(btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
  auth_user.email_confirmed_at
from auth.users auth_user
where auth_user.email is not null
on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(public.profiles.full_name, excluded.full_name),
      email_verified_at = excluded.email_verified_at;

-- Preserve any administrators created with the former membership-role model.
update public.profiles profile
set platform_role = 'admin', account_status = 'active'
from public.organization_memberships membership
where membership.user_id = profile.id
  and membership.role = 'admin'
  and membership.status = 'active';

delete from public.organization_memberships where role = 'admin';
alter table public.organization_memberships
  drop constraint organization_memberships_role_valid;
alter table public.organization_memberships
  add constraint organization_memberships_role_valid
  check (role in ('owner', 'staff', 'moderator', 'operations', 'finance'));

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.platform_role = 'admin'
      and profile.account_status = 'active'
  );
$$;

alter table public.profiles enable row level security;

create policy profiles_self_read on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);
create policy profiles_platform_admin_read on public.profiles
  for select to authenticated
  using ((select private.is_platform_admin()));
create policy profiles_platform_admin_update on public.profiles
  for update to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));

create policy organizations_platform_admin_read on public.organizations
  for select to authenticated using ((select private.is_platform_admin()));
create policy organizations_platform_admin_insert on public.organizations
  for insert to authenticated with check ((select private.is_platform_admin()));
create policy organizations_platform_admin_update on public.organizations
  for update to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));

create policy memberships_platform_admin_read on public.organization_memberships
  for select to authenticated using ((select private.is_platform_admin()));
create policy memberships_platform_admin_insert on public.organization_memberships
  for insert to authenticated with check ((select private.is_platform_admin()));
create policy memberships_platform_admin_update on public.organization_memberships
  for update to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));
create policy memberships_platform_admin_delete on public.organization_memberships
  for delete to authenticated using ((select private.is_platform_admin()));

create policy locations_platform_admin_read on public.locations
  for select to authenticated using ((select private.is_platform_admin()));
create policy locations_platform_admin_insert on public.locations
  for insert to authenticated with check ((select private.is_platform_admin()));
create policy locations_platform_admin_update on public.locations
  for update to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));

create policy devices_platform_admin_read on public.devices
  for select to authenticated using ((select private.is_platform_admin()));

create policy media_assets_platform_admin_read on public.media_assets
  for select to authenticated using ((select private.is_platform_admin()));
create policy campaigns_platform_admin_read on public.campaigns
  for select to authenticated using ((select private.is_platform_admin()));
create policy playback_sessions_platform_admin_read on public.playback_sessions
  for select to authenticated using ((select private.is_platform_admin()));

create policy wallets_platform_admin_read on public.wallets
  for select to authenticated using ((select private.is_platform_admin()));
create policy wallets_platform_admin_insert on public.wallets
  for insert to authenticated with check ((select private.is_platform_admin()));

create policy ledger_transactions_platform_admin_read on public.ledger_transactions
  for select to authenticated using ((select private.is_platform_admin()));
create policy ledger_entries_platform_admin_read on public.ledger_entries
  for select to authenticated using ((select private.is_platform_admin()));

create policy audit_logs_platform_admin_read on public.audit_logs
  for select to authenticated using ((select private.is_platform_admin()));

-- Audit organization, membership, location, and account changes at the database boundary.
create or replace function private.audit_managed_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_record jsonb;
  after_record jsonb;
  record_data jsonb;
  target_organization_id bigint;
  target_object_id text;
begin
  before_record := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  after_record := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  record_data := coalesce(after_record, before_record);

  if tg_table_name = 'organizations' then
    target_organization_id := (record_data ->> 'id')::bigint;
    target_object_id := record_data ->> 'public_id';
  elsif tg_table_name = 'profiles' then
    target_organization_id := null;
    target_object_id := record_data ->> 'id';
  else
    target_organization_id := (record_data ->> 'organization_id')::bigint;
    target_object_id := coalesce(record_data ->> 'public_id', record_data ->> 'user_id');
  end if;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    object_type,
    object_id,
    reason,
    before_summary,
    after_summary
  ) values (
    target_organization_id,
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    target_object_id,
    nullif(current_setting('request.audit_reason', true), ''),
    before_record,
    after_record
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger organizations_audit_change
  after insert or update on public.organizations
  for each row execute function private.audit_managed_row_change();
create trigger memberships_audit_change
  after insert or update or delete on public.organization_memberships
  for each row execute function private.audit_managed_row_change();
create trigger locations_audit_change
  after insert or update on public.locations
  for each row execute function private.audit_managed_row_change();
create trigger profiles_audit_change
  after update on public.profiles
  for each row execute function private.audit_managed_row_change();

create or replace function public.admin_create_organization(
  p_display_name text,
  p_legal_name text,
  p_category text,
  p_owner_user_id uuid,
  p_reason text
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_organization_id bigint;
  active_policy_version_id bigint;
begin
  if not (select private.is_platform_admin()) then
    raise insufficient_privilege using message = 'Platform administrator access is required';
  end if;

  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise check_violation using message = 'An administrative reason is required';
  end if;

  if not exists (
    select 1 from public.profiles profile
    where profile.id = p_owner_user_id
      and profile.account_status = 'pending'
      and profile.platform_role = 'member'
      and profile.email_verified_at is not null
  ) then
    raise check_violation using message = 'The selected account is not awaiting organization assignment';
  end if;

  if exists (
    select 1 from public.organization_memberships membership
    where membership.user_id = p_owner_user_id
      and membership.status = 'active'
  ) then
    raise unique_violation using message = 'The selected account already belongs to an organization';
  end if;

  select policy.id into active_policy_version_id
  from public.policy_versions policy
  where policy.superseded_at is null
  order by policy.effective_at desc
  limit 1;

  perform set_config('request.audit_reason', btrim(p_reason), true);

  insert into public.organizations (
    display_name,
    legal_name,
    category,
    status,
    accepted_policy_version_id
  ) values (
    btrim(p_display_name),
    nullif(btrim(coalesce(p_legal_name, '')), ''),
    btrim(p_category),
    'active',
    active_policy_version_id
  )
  returning id into created_organization_id;

  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    status,
    invited_by
  ) values (
    created_organization_id,
    p_owner_user_id,
    'owner',
    'active',
    (select auth.uid())
  );

  insert into public.wallets (organization_id, wallet_type)
  values
    (created_organization_id, 'purchased'),
    (created_organization_id, 'earned'),
    (created_organization_id, 'promotional'),
    (created_organization_id, 'held');

  update public.profiles
  set account_status = 'active'
  where id = p_owner_user_id;

  return created_organization_id;
end;
$$;

create or replace function public.create_location(
  p_organization_id bigint,
  p_name text,
  p_address text,
  p_zone text,
  p_category text,
  p_traffic_band text,
  p_operating_hours jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_location_id bigint;
begin
  if not (
    (select private.is_platform_admin())
    or (select private.has_org_role(p_organization_id, array['owner', 'staff']::text[]))
  ) then
    raise insufficient_privilege using message = 'Location management access is required';
  end if;

  perform set_config('request.audit_reason', 'Location created through portal', true);

  insert into public.locations (
    organization_id,
    name,
    address,
    zone,
    category,
    traffic_band,
    operating_hours,
    status
  ) values (
    p_organization_id,
    btrim(p_name),
    nullif(btrim(coalesce(p_address, '')), ''),
    btrim(p_zone),
    btrim(p_category),
    nullif(btrim(coalesce(p_traffic_band, '')), ''),
    coalesce(p_operating_hours, '{}'::jsonb),
    'active'
  )
  returning id into created_location_id;

  return created_location_id;
end;
$$;

-- New Data API entities and functions are explicitly granted because current
-- projects do not automatically expose newly-created database objects.
revoke all on public.profiles from anon;
grant select, update on public.profiles to authenticated;
grant insert on public.organizations to authenticated;
grant insert on public.wallets to authenticated;
grant execute on function private.is_platform_admin() to authenticated;

revoke all on function public.admin_create_organization(text, text, text, uuid, text) from public, anon;
grant execute on function public.admin_create_organization(text, text, text, uuid, text) to authenticated;
revoke all on function public.create_location(bigint, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.create_location(bigint, text, text, text, text, text, jsonb) to authenticated;
