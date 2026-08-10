-- Complete draft campaign CRUD while preserving advertiser ownership. Platform
-- administrators may operate on behalf of an explicitly selected business;
-- business owners and staff remain restricted to their own organization.

drop policy if exists campaigns_platform_admin_insert_draft on public.campaigns;
create policy campaigns_platform_admin_insert_draft on public.campaigns
  for insert to authenticated
  with check (
    (select private.is_platform_admin())
    and status = 'draft'
    and spent_credits = 0
    and created_by = (select auth.uid())
    and exists (
      select 1 from public.organizations organization
      where organization.id = organization_id and organization.status = 'active'
    )
    and exists (
      select 1 from public.media_assets asset
      where asset.id = media_asset_id
        and asset.organization_id = campaigns.organization_id
        and asset.moderation_status = 'approved'
        and asset.processing_status = 'ready'
    )
  );

drop policy if exists campaigns_platform_admin_update_draft on public.campaigns;
create policy campaigns_platform_admin_update_draft on public.campaigns
  for update to authenticated
  using ((select private.is_platform_admin()) and status = 'draft')
  with check (
    (select private.is_platform_admin())
    and status = 'draft'
    and spent_credits = 0
    and exists (
      select 1 from public.media_assets asset
      where asset.id = media_asset_id
        and asset.organization_id = campaigns.organization_id
        and asset.moderation_status = 'approved'
        and asset.processing_status = 'ready'
    )
  );

drop policy if exists campaigns_platform_admin_delete_draft on public.campaigns;
create policy campaigns_platform_admin_delete_draft on public.campaigns
  for delete to authenticated
  using ((select private.is_platform_admin()) and status = 'draft');

drop policy if exists campaign_targets_platform_admin_insert on public.campaign_target_organizations;
create policy campaign_targets_platform_admin_insert on public.campaign_target_organizations
  for insert to authenticated
  with check (
    (select private.is_platform_admin())
    and created_by = (select auth.uid())
    and exists (
      select 1
      from public.campaigns campaign
      join public.organizations target on target.id = organization_id
      where campaign.id = campaign_id
        and campaign.status = 'draft'
        and campaign.organization_id <> organization_id
        and target.status = 'active'
    )
  );

drop policy if exists campaign_targets_platform_admin_delete on public.campaign_target_organizations;
create policy campaign_targets_platform_admin_delete on public.campaign_target_organizations
  for delete to authenticated
  using (
    (select private.is_platform_admin())
    and exists (
      select 1 from public.campaigns campaign
      where campaign.id = campaign_id and campaign.status = 'draft'
    )
  );

grant insert, update, delete on public.campaigns to authenticated;

create or replace function public.create_campaign_draft_for_organization(
  p_organization_id bigint,
  p_name text,
  p_media_asset_id bigint,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_budget_credits numeric,
  p_daily_cap_credits numeric,
  p_frequency_cap_per_day integer,
  p_target_organization_ids bigint[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  active_policy_id bigint;
  created_campaign_id bigint;
  created_campaign_public_id uuid;
  distinct_target_count integer;
begin
  if not ((select private.is_platform_admin()) or (select private.has_org_role(p_organization_id, array['owner', 'staff']::text[]))) then
    raise exception 'Campaign management access is required.' using errcode = '42501';
  end if;

  if length(btrim(p_name)) < 3 or length(btrim(p_name)) > 120 then
    raise exception 'Campaign name must contain between 3 and 120 characters.' using errcode = '22023';
  end if;

  select count(distinct target_id)::integer into distinct_target_count
  from unnest(p_target_organization_ids) target_id;
  if distinct_target_count < 1 or distinct_target_count > 50 then
    raise exception 'Select between 1 and 50 target businesses.' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(p_target_organization_ids) target_id
    left join public.organizations target on target.id = target_id
    where target.id is null or target.status <> 'active' or target.id = p_organization_id
  ) then
    raise exception 'Every target must be another active business.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.organizations organization
    where organization.id = p_organization_id and organization.status = 'active'
  ) then
    raise exception 'The advertiser business must be active.' using errcode = '22023';
  end if;

  select policy.id into active_policy_id
  from public.policy_versions policy
  where policy.effective_at <= now()
    and (policy.superseded_at is null or policy.superseded_at > now())
  order by policy.effective_at desc
  limit 1;
  if active_policy_id is null then
    raise exception 'No active campaign policy is available.' using errcode = '55000';
  end if;

  insert into public.campaigns (
    organization_id, media_asset_id, policy_version_id, name, status,
    starts_at, ends_at, budget_credits, daily_cap_credits,
    frequency_cap_per_day, targeting, created_by
  ) values (
    p_organization_id, p_media_asset_id, active_policy_id, btrim(p_name), 'draft',
    p_starts_at, p_ends_at, p_budget_credits, p_daily_cap_credits,
    p_frequency_cap_per_day,
    jsonb_build_object('mode', 'selected_businesses', 'target_count', distinct_target_count),
    (select auth.uid())
  ) returning id, public_id into created_campaign_id, created_campaign_public_id;

  insert into public.campaign_target_organizations (campaign_id, organization_id, created_by)
  select created_campaign_id, target_id, (select auth.uid())
  from (select distinct unnest(p_target_organization_ids) as target_id) targets;

  return created_campaign_public_id;
end;
$$;

create or replace function public.update_campaign_draft(
  p_campaign_public_id uuid,
  p_name text,
  p_media_asset_id bigint,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_budget_credits numeric,
  p_daily_cap_credits numeric,
  p_frequency_cap_per_day integer,
  p_target_organization_ids bigint[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_campaign public.campaigns%rowtype;
  distinct_target_count integer;
begin
  select * into target_campaign
  from public.campaigns campaign
  where campaign.public_id = p_campaign_public_id and campaign.status = 'draft'
  for update;
  if target_campaign.id is null then
    raise exception 'Campaign draft was not found.' using errcode = 'P0002';
  end if;

  if not ((select private.is_platform_admin()) or (select private.has_org_role(target_campaign.organization_id, array['owner', 'staff']::text[]))) then
    raise exception 'Campaign management access is required.' using errcode = '42501';
  end if;
  if length(btrim(p_name)) < 3 or length(btrim(p_name)) > 120 then
    raise exception 'Campaign name must contain between 3 and 120 characters.' using errcode = '22023';
  end if;

  select count(distinct target_id)::integer into distinct_target_count
  from unnest(p_target_organization_ids) target_id;
  if distinct_target_count < 1 or distinct_target_count > 50 then
    raise exception 'Select between 1 and 50 target businesses.' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_target_organization_ids) target_id
    left join public.organizations target on target.id = target_id
    where target.id is null or target.status <> 'active' or target.id = target_campaign.organization_id
  ) then
    raise exception 'Every target must be another active business.' using errcode = '22023';
  end if;

  update public.campaigns
  set name = btrim(p_name), media_asset_id = p_media_asset_id,
      starts_at = p_starts_at, ends_at = p_ends_at,
      budget_credits = p_budget_credits, daily_cap_credits = p_daily_cap_credits,
      frequency_cap_per_day = p_frequency_cap_per_day,
      targeting = jsonb_build_object('mode', 'selected_businesses', 'target_count', distinct_target_count),
      updated_at = now()
  where id = target_campaign.id;

  delete from public.campaign_target_organizations where campaign_id = target_campaign.id;
  insert into public.campaign_target_organizations (campaign_id, organization_id, created_by)
  select target_campaign.id, target_id, (select auth.uid())
  from (select distinct unnest(p_target_organization_ids) as target_id) targets;
end;
$$;

create or replace function public.delete_campaign_draft(p_campaign_public_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  delete from public.campaigns campaign
  where campaign.public_id = p_campaign_public_id and campaign.status = 'draft';
  get diagnostics deleted_count = row_count;
  if deleted_count <> 1 then
    raise exception 'Campaign draft was not found or cannot be deleted.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.create_campaign_draft_for_organization(bigint, text, bigint, timestamptz, timestamptz, numeric, numeric, integer, bigint[]) from public;
revoke all on function public.update_campaign_draft(uuid, text, bigint, timestamptz, timestamptz, numeric, numeric, integer, bigint[]) from public;
revoke all on function public.delete_campaign_draft(uuid) from public;
grant execute on function public.create_campaign_draft_for_organization(bigint, text, bigint, timestamptz, timestamptz, numeric, numeric, integer, bigint[]) to authenticated;
grant execute on function public.update_campaign_draft(uuid, text, bigint, timestamptz, timestamptz, numeric, numeric, integer, bigint[]) to authenticated;
grant execute on function public.delete_campaign_draft(uuid) to authenticated;
