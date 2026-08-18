-- Campaigns are published against physical delivery locations. The advertiser
-- organization targets are retained as a derived compatibility index for the
-- existing delivery and reporting queries.

create table public.campaign_target_locations (
  id bigint generated always as identity primary key,
  campaign_id bigint not null references public.campaigns(id) on delete cascade,
  location_id bigint not null references public.locations(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint campaign_target_locations_unique unique (campaign_id, location_id)
);

create index campaign_target_locations_location_id_idx
  on public.campaign_target_locations (location_id);

alter table public.campaign_target_locations enable row level security;

create policy campaign_target_locations_advertiser_read on public.campaign_target_locations
  for select to authenticated
  using (
    exists (
      select 1 from public.campaigns campaign
      where campaign.id = campaign_id
        and ((select private.is_platform_admin()) or (select private.is_org_member(campaign.organization_id)))
    )
  );

grant select on public.campaign_target_locations to authenticated;

create or replace function private.validate_campaign_publish_input(
  p_organization_id bigint,
  p_name text,
  p_media_asset_id bigint,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_budget_credits numeric,
  p_target_location_ids bigint[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  distinct_location_count integer;
begin
  if not ((select private.is_platform_admin()) or (select private.has_org_role(p_organization_id, array['owner', 'staff']::text[]))) then
    raise insufficient_privilege using message = 'Campaign management access is required.';
  end if;
  if length(btrim(p_name)) < 3 or length(btrim(p_name)) > 120 then
    raise invalid_parameter_value using message = 'Campaign name must contain between 3 and 120 characters.';
  end if;
  if p_starts_at < date_trunc('day', now()) or p_ends_at <= p_starts_at then
    raise invalid_parameter_value using message = 'Choose a valid campaign date range.';
  end if;
  if p_budget_credits is null or p_budget_credits <= 0 or p_budget_credits > 1000000000 then
    raise invalid_parameter_value using message = 'Choose a valid campaign budget.';
  end if;
  if not exists (
    select 1 from public.organizations organization
    where organization.id = p_organization_id and organization.status = 'active'
  ) then
    raise invalid_parameter_value using message = 'The advertiser business must be active.';
  end if;
  if not exists (
    select 1 from public.media_assets asset
    where asset.id = p_media_asset_id
      and asset.organization_id = p_organization_id
      and asset.moderation_status = 'approved'
      and asset.processing_status = 'ready'
  ) then
    raise invalid_parameter_value using message = 'Select approved, ready media owned by the advertiser.';
  end if;

  select count(distinct location_id)::integer into distinct_location_count
  from unnest(p_target_location_ids) location_id;
  if distinct_location_count < 1 or distinct_location_count > 100 then
    raise invalid_parameter_value using message = 'Select between 1 and 100 delivery locations.';
  end if;
  if exists (
    select 1
    from unnest(p_target_location_ids) selected(location_id)
    left join public.locations location on location.id = selected.location_id
    left join public.organizations host on host.id = location.organization_id
    where location.id is null
      or location.status <> 'active'
      or host.status <> 'active'
      or location.organization_id = p_organization_id
  ) then
    raise invalid_parameter_value using message = 'Every target must be an active location owned by another business.';
  end if;
end;
$$;

create or replace function public.create_and_publish_campaign(
  p_organization_id bigint,
  p_name text,
  p_media_asset_id bigint,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_budget_credits numeric,
  p_target_location_ids bigint[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_policy_id bigint;
  created_campaign_id bigint;
  created_campaign_public_id uuid;
  published_status text;
begin
  perform private.validate_campaign_publish_input(
    p_organization_id, p_name, p_media_asset_id, p_starts_at,
    p_ends_at, p_budget_credits, p_target_location_ids
  );

  select policy.id into active_policy_id
  from public.policy_versions policy
  where policy.effective_at <= now()
    and (policy.superseded_at is null or policy.superseded_at > now())
  order by policy.effective_at desc
  limit 1;
  if active_policy_id is null then
    raise exception 'No active campaign policy is available.' using errcode = '55000';
  end if;

  published_status := case when p_starts_at <= now() then 'active' else 'scheduled' end;
  insert into public.campaigns (
    organization_id, media_asset_id, policy_version_id, name, status,
    starts_at, ends_at, budget_credits, daily_cap_credits,
    frequency_cap_per_day, targeting, created_by
  ) values (
    p_organization_id, p_media_asset_id, active_policy_id, btrim(p_name), published_status,
    p_starts_at, p_ends_at, p_budget_credits, null, null,
    jsonb_build_object('mode', 'selected_locations', 'location_count', cardinality(p_target_location_ids)),
    (select auth.uid())
  ) returning id, public_id into created_campaign_id, created_campaign_public_id;

  insert into public.campaign_target_locations (campaign_id, location_id, created_by)
  select created_campaign_id, location_id, (select auth.uid())
  from (select distinct unnest(p_target_location_ids) as location_id) selected;

  insert into public.campaign_target_organizations (campaign_id, organization_id, created_by)
  select created_campaign_id, location.organization_id, (select auth.uid())
  from public.locations location
  where location.id = any(p_target_location_ids)
  group by location.organization_id;

  perform set_config('request.audit_reason', 'Campaign published', true);
  return created_campaign_public_id;
end;
$$;

create or replace function public.update_and_publish_campaign(
  p_campaign_public_id uuid,
  p_name text,
  p_media_asset_id bigint,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_budget_credits numeric,
  p_target_location_ids bigint[]
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_campaign public.campaigns%rowtype;
  published_status text;
begin
  select * into target_campaign
  from public.campaigns campaign
  where campaign.public_id = p_campaign_public_id and campaign.status = 'draft'
  for update;
  if target_campaign.id is null then
    raise no_data_found using message = 'Campaign draft was not found.';
  end if;

  perform private.validate_campaign_publish_input(
    target_campaign.organization_id, p_name, p_media_asset_id, p_starts_at,
    p_ends_at, p_budget_credits, p_target_location_ids
  );
  published_status := case when p_starts_at <= now() then 'active' else 'scheduled' end;

  update public.campaigns
  set name = btrim(p_name), media_asset_id = p_media_asset_id,
      starts_at = p_starts_at, ends_at = p_ends_at,
      budget_credits = p_budget_credits, daily_cap_credits = null,
      frequency_cap_per_day = null, status = published_status,
      targeting = jsonb_build_object('mode', 'selected_locations', 'location_count', cardinality(p_target_location_ids)),
      updated_at = now()
  where id = target_campaign.id;

  delete from public.campaign_target_locations where campaign_id = target_campaign.id;
  delete from public.campaign_target_organizations where campaign_id = target_campaign.id;
  insert into public.campaign_target_locations (campaign_id, location_id, created_by)
  select target_campaign.id, location_id, (select auth.uid())
  from (select distinct unnest(p_target_location_ids) as location_id) selected;
  insert into public.campaign_target_organizations (campaign_id, organization_id, created_by)
  select target_campaign.id, location.organization_id, (select auth.uid())
  from public.locations location
  where location.id = any(p_target_location_ids)
  group by location.organization_id;

  perform set_config('request.audit_reason', 'Campaign draft published', true);
  return published_status;
end;
$$;

revoke all on function private.validate_campaign_publish_input(bigint, text, bigint, timestamptz, timestamptz, numeric, bigint[]) from public, anon, authenticated;
revoke all on function public.create_and_publish_campaign(bigint, text, bigint, timestamptz, timestamptz, numeric, bigint[]) from public, anon;
revoke all on function public.update_and_publish_campaign(uuid, text, bigint, timestamptz, timestamptz, numeric, bigint[]) from public, anon;
grant execute on function public.create_and_publish_campaign(bigint, text, bigint, timestamptz, timestamptz, numeric, bigint[]) to authenticated;
grant execute on function public.update_and_publish_campaign(uuid, text, bigint, timestamptz, timestamptz, numeric, bigint[]) to authenticated;
