-- Administrator-controlled user access and portal session observations.
-- Authentication remains in Supabase Auth; authorization and operational
-- activity are recorded in application-owned tables with explicit RLS.

create table public.user_activity_sessions (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_path text,
  ip_address inet,
  user_agent text,
  country_code text,
  edge_colo text,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_activity_sessions_path_length check (last_path is null or length(last_path) <= 500),
  constraint user_activity_sessions_user_agent_length check (user_agent is null or length(user_agent) <= 1000),
  constraint user_activity_sessions_country_code_valid check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  constraint user_activity_sessions_edge_colo_valid check (edge_colo is null or edge_colo ~ '^[A-Z0-9]{3,8}$')
);

create index user_activity_sessions_user_last_seen_idx
  on public.user_activity_sessions (user_id, last_seen_at desc);
create index user_activity_sessions_live_idx
  on public.user_activity_sessions (last_seen_at desc)
  where revoked_at is null;

create trigger user_activity_sessions_set_updated_at
  before update on public.user_activity_sessions
  for each row execute function private.set_updated_at();

alter table public.user_activity_sessions enable row level security;

create policy user_activity_sessions_platform_admin_read
  on public.user_activity_sessions
  for select to authenticated
  using ((select private.is_platform_admin()));

-- Suspended accounts must lose tenant Data API access even while an already
-- issued access token is waiting to expire.
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
    join public.profiles profile on profile.id = membership.user_id
    where membership.organization_id = target_organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and profile.account_status = 'active'
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
    join public.profiles profile on profile.id = membership.user_id
    where membership.organization_id = target_organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role = any(allowed_roles)
      and profile.account_status = 'active'
  );
$$;

create or replace function private.record_user_activity(
  p_path text,
  p_ip text,
  p_user_agent text,
  p_country_code text,
  p_edge_colo text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_session_id uuid;
  account_allowed boolean;
begin
  begin
    current_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  if current_user_id is null or current_session_id is null then
    return false;
  end if;

  select profile.account_status <> 'suspended'
    into account_allowed
  from public.profiles profile
  where profile.id = current_user_id;

  if not coalesce(account_allowed, false) then
    return false;
  end if;

  if exists (
    select 1 from public.user_activity_sessions activity
    where activity.session_id = current_session_id
      and activity.revoked_at is not null
  ) then
    return false;
  end if;

  insert into public.user_activity_sessions (
    session_id,
    user_id,
    last_path,
    ip_address,
    user_agent,
    country_code,
    edge_colo
  ) values (
    current_session_id,
    current_user_id,
    left(nullif(btrim(coalesce(p_path, '')), ''), 500),
    case when nullif(btrim(coalesce(p_ip, '')), '') is null then null else btrim(p_ip)::inet end,
    left(nullif(btrim(coalesce(p_user_agent, '')), ''), 1000),
    case when upper(btrim(coalesce(p_country_code, ''))) ~ '^[A-Z]{2}$' then upper(btrim(p_country_code)) else null end,
    case when upper(btrim(coalesce(p_edge_colo, ''))) ~ '^[A-Z0-9]{3,8}$' then upper(btrim(p_edge_colo)) else null end
  )
  on conflict (session_id) do update
    set last_seen_at = now(),
        last_path = excluded.last_path,
        ip_address = excluded.ip_address,
        user_agent = excluded.user_agent,
        country_code = excluded.country_code,
        edge_colo = excluded.edge_colo
  where public.user_activity_sessions.user_id = current_user_id
    and public.user_activity_sessions.revoked_at is null;

  return found;
exception when invalid_text_representation then
  return false;
end;
$$;

create or replace function public.record_user_activity(
  p_path text,
  p_ip text,
  p_user_agent text,
  p_country_code text,
  p_edge_colo text
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.record_user_activity(p_path, p_ip, p_user_agent, p_country_code, p_edge_colo);
$$;

create or replace function public.admin_finalize_user_invite(
  p_user_id uuid,
  p_full_name text,
  p_reason text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (select private.is_platform_admin()) then
    raise insufficient_privilege using message = 'Platform administrator access is required';
  end if;
  if length(btrim(coalesce(p_full_name, ''))) < 2 then
    raise check_violation using message = 'A valid account holder name is required';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise check_violation using message = 'An administrative reason is required';
  end if;

  perform set_config('request.audit_reason', btrim(p_reason), true);
  update public.profiles
  set full_name = btrim(p_full_name),
      platform_role = 'member',
      account_status = 'pending'
  where id = p_user_id;

  if not found then
    raise no_data_found using message = 'The invited account profile is not available';
  end if;
end;
$$;

create or replace function public.admin_update_user_access(
  p_user_id uuid,
  p_account_status text,
  p_membership_role text,
  p_reason text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_membership public.organization_memberships%rowtype;
  target_platform_role text;
begin
  if not (select private.is_platform_admin()) then
    raise insufficient_privilege using message = 'Platform administrator access is required';
  end if;
  if p_user_id = (select auth.uid()) then
    raise check_violation using message = 'Use a separate administrator to change your own access';
  end if;
  if p_account_status not in ('pending', 'active', 'suspended') then
    raise check_violation using message = 'Account status is invalid';
  end if;
  if p_membership_role is not null and p_membership_role not in ('owner', 'staff', 'moderator', 'operations', 'finance') then
    raise check_violation using message = 'The selected organization role is invalid';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise check_violation using message = 'An administrative reason is required';
  end if;

  select profile.platform_role into target_platform_role
  from public.profiles profile where profile.id = p_user_id;

  if target_platform_role is null then
    raise no_data_found using message = 'User account not found';
  end if;
  if target_platform_role = 'admin' then
    raise check_violation using message = 'Platform administrator access cannot be changed here';
  end if;

  select membership.* into current_membership
  from public.organization_memberships membership
  where membership.user_id = p_user_id
  order by membership.created_at asc
  limit 1;

  if current_membership.user_id is not null and p_account_status = 'pending' then
    raise check_violation using message = 'Assigned organization users cannot return to pending status';
  end if;

  if current_membership.user_id is not null
    and current_membership.role = 'owner'
    and (p_account_status = 'suspended' or coalesce(p_membership_role, 'owner') <> 'owner')
    and not exists (
      select 1
      from public.organization_memberships other_membership
      join public.profiles other_profile on other_profile.id = other_membership.user_id
      where other_membership.organization_id = current_membership.organization_id
        and other_membership.user_id <> p_user_id
        and other_membership.role = 'owner'
        and other_membership.status = 'active'
        and other_profile.account_status = 'active'
    ) then
    raise check_violation using message = 'Assign another active owner before changing this owner account';
  end if;

  perform set_config('request.audit_reason', btrim(p_reason), true);

  update public.profiles
  set account_status = p_account_status
  where id = p_user_id;

  if current_membership.user_id is not null then
    update public.organization_memberships
    set role = coalesce(p_membership_role, role),
        status = case when p_account_status = 'active' then 'active' else 'suspended' end
    where organization_id = current_membership.organization_id
      and user_id = p_user_id;
  end if;

  if p_account_status = 'suspended' then
    update public.user_activity_sessions
    set revoked_at = coalesce(revoked_at, now())
    where user_id = p_user_id and revoked_at is null;
  end if;
end;
$$;

revoke all on public.user_activity_sessions from anon;
grant select on public.user_activity_sessions to authenticated;
grant execute on function private.record_user_activity(text, text, text, text, text) to authenticated;

revoke all on function public.record_user_activity(text, text, text, text, text) from public, anon;
grant execute on function public.record_user_activity(text, text, text, text, text) to authenticated;
revoke all on function public.admin_finalize_user_invite(uuid, text, text) from public, anon;
grant execute on function public.admin_finalize_user_invite(uuid, text, text) to authenticated;
revoke all on function public.admin_update_user_access(uuid, text, text, text) from public, anon;
grant execute on function public.admin_update_user_access(uuid, text, text, text) to authenticated;
