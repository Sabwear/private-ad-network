-- The dashboard is a single centrally administered platform. Businesses are
-- managed domain records, never user workspaces. Authenticated non-admin users
-- are registered viewers and have no management access.

update public.profiles
set platform_role = 'viewer'
where platform_role <> 'admin';

alter table public.profiles
  alter column platform_role set default 'viewer';
alter table public.profiles
  drop constraint profiles_platform_role_valid;
alter table public.profiles
  add constraint profiles_platform_role_valid check (platform_role in ('viewer', 'admin'));

select set_config('request.audit_reason', 'Removed legacy business-user assignments for administrator-only platform model', true);
delete from public.organization_memberships;
revoke all on public.organization_memberships from authenticated;

-- Disable the legacy tenant predicates everywhere. Existing database functions
-- that contain `(is_platform_admin() or has_org_role(...))` become admin-only,
-- and old policies cannot grant business-scoped access.
create or replace function private.is_org_member(target_organization_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select false;
$$;

create or replace function private.has_org_role(target_organization_id bigint, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select false;
$$;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname in ('public', 'storage')
      and (
        coalesce(qual, '') ilike '%is_org_member%'
        or coalesce(qual, '') ilike '%has_org_role%'
        or coalesce(with_check, '') ilike '%is_org_member%'
        or coalesce(with_check, '') ilike '%has_org_role%'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', policy_record.policyname, policy_record.schemaname, policy_record.tablename);
  end loop;
end;
$$;

-- Some legacy read policies combined administrator and business-member access
-- in one expression. Recreate their administrator-only equivalents after the
-- generic tenant-policy cleanup above.
create policy campaign_target_organizations_platform_admin_read
  on public.campaign_target_organizations
  for select to authenticated
  using ((select private.is_platform_admin()));

create policy campaign_target_locations_platform_admin_read
  on public.campaign_target_locations
  for select to authenticated
  using ((select private.is_platform_admin()));

create policy stream_access_code_rotations_platform_admin_read
  on public.stream_access_code_rotations
  for select to authenticated
  using ((select private.is_platform_admin()));

create or replace function public.admin_create_business(
  p_display_name text,
  p_legal_name text,
  p_category text,
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
  if length(btrim(coalesce(p_display_name, ''))) < 2 then
    raise check_violation using message = 'A business display name is required';
  end if;
  if length(btrim(coalesce(p_category, ''))) < 2 then
    raise check_violation using message = 'A business category is required';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise check_violation using message = 'An administrative reason is required';
  end if;

  select policy.id into active_policy_version_id
  from public.policy_versions policy
  where policy.effective_at <= now()
    and (policy.superseded_at is null or policy.superseded_at > now())
  order by policy.effective_at desc
  limit 1;
  if active_policy_version_id is null then
    raise exception 'No active platform policy is available' using errcode = '55000';
  end if;

  perform set_config('request.audit_reason', btrim(p_reason), true);
  insert into public.organizations (
    display_name, legal_name, category, status, accepted_policy_version_id
  ) values (
    btrim(p_display_name), nullif(btrim(coalesce(p_legal_name, '')), ''),
    btrim(p_category), 'active', active_policy_version_id
  ) returning id into created_organization_id;

  insert into public.wallets (organization_id, wallet_type)
  values
    (created_organization_id, 'purchased'),
    (created_organization_id, 'earned'),
    (created_organization_id, 'promotional'),
    (created_organization_id, 'held');

  return created_organization_id;
end;
$$;

create or replace function public.admin_finalize_platform_invite(
  p_user_id uuid,
  p_full_name text,
  p_platform_role text,
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
  if p_platform_role not in ('admin', 'viewer') then
    raise check_violation using message = 'Account type must be administrator or viewer';
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
      platform_role = p_platform_role,
      account_status = 'active'
  where id = p_user_id;
  if not found then
    raise no_data_found using message = 'The invited account profile is not available';
  end if;
end;
$$;

create or replace function public.admin_update_platform_user_access(
  p_user_id uuid,
  p_account_status text,
  p_reason text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_role text;
begin
  if not (select private.is_platform_admin()) then
    raise insufficient_privilege using message = 'Platform administrator access is required';
  end if;
  if p_user_id = (select auth.uid()) then
    raise check_violation using message = 'Use another administrator to change your own access';
  end if;
  if p_account_status not in ('pending', 'active', 'suspended') then
    raise check_violation using message = 'Account status is invalid';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise check_violation using message = 'An administrative reason is required';
  end if;

  select profile.platform_role into target_role
  from public.profiles profile where profile.id = p_user_id;
  if target_role is null then
    raise no_data_found using message = 'User account not found';
  end if;
  if target_role = 'admin' then
    raise check_violation using message = 'Administrator access is protected';
  end if;

  perform set_config('request.audit_reason', btrim(p_reason), true);
  update public.profiles set account_status = p_account_status where id = p_user_id;
  if p_account_status = 'suspended' then
    update public.user_activity_sessions
    set revoked_at = coalesce(revoked_at, now())
    where user_id = p_user_id and revoked_at is null;
  end if;
end;
$$;

revoke all on function public.admin_create_business(text, text, text, text) from public, anon;
revoke all on function public.admin_finalize_platform_invite(uuid, text, text, text) from public, anon;
revoke all on function public.admin_update_platform_user_access(uuid, text, text) from public, anon;
grant execute on function public.admin_create_business(text, text, text, text) to authenticated;
grant execute on function public.admin_finalize_platform_invite(uuid, text, text, text) to authenticated;
grant execute on function public.admin_update_platform_user_access(uuid, text, text) to authenticated;
