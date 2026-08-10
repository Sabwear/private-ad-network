-- Secure campaign planning. Activation remains intentionally separate because it
-- must reserve credits atomically before a campaign can enter delivery.

create table public.campaign_target_organizations (
  id bigint generated always as identity primary key,
  campaign_id bigint not null references public.campaigns(id) on delete cascade,
  organization_id bigint not null references public.organizations(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint campaign_target_organizations_unique unique (campaign_id, organization_id)
);

create index campaign_target_organizations_organization_id_idx
  on public.campaign_target_organizations (organization_id);

alter table public.campaign_target_organizations enable row level security;

drop policy if exists campaigns_manager_insert on public.campaigns;
drop policy if exists campaigns_manager_update on public.campaigns;

create policy campaigns_manager_insert_draft on public.campaigns
  for insert to authenticated
  with check (
    status = 'draft'
    and spent_credits = 0
    and created_by = (select auth.uid())
    and (select private.has_org_role(organization_id, array['owner', 'staff']::text[]))
    and exists (
      select 1
      from public.media_assets asset
      where asset.id = media_asset_id
        and asset.organization_id = campaigns.organization_id
        and asset.moderation_status = 'approved'
        and asset.processing_status = 'ready'
    )
  );

create policy campaigns_manager_update_draft on public.campaigns
  for update to authenticated
  using (
    status = 'draft'
    and (select private.has_org_role(organization_id, array['owner', 'staff']::text[]))
  )
  with check (
    status = 'draft'
    and spent_credits = 0
    and (select private.has_org_role(organization_id, array['owner', 'staff']::text[]))
    and exists (
      select 1
      from public.media_assets asset
      where asset.id = media_asset_id
        and asset.organization_id = campaigns.organization_id
        and asset.moderation_status = 'approved'
        and asset.processing_status = 'ready'
    )
  );

create policy campaigns_manager_delete_draft on public.campaigns
  for delete to authenticated
  using (
    status = 'draft'
    and (select private.has_org_role(organization_id, array['owner', 'staff']::text[]))
  );

create policy campaign_targets_advertiser_read on public.campaign_target_organizations
  for select to authenticated
  using (
    exists (
      select 1 from public.campaigns campaign
      where campaign.id = campaign_id
        and (select private.is_org_member(campaign.organization_id))
    )
    or (select private.is_platform_admin())
  );

create policy campaign_targets_manager_insert on public.campaign_target_organizations
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1
      from public.campaigns campaign
      join public.organizations target on target.id = organization_id
      where campaign.id = campaign_id
        and campaign.status = 'draft'
        and campaign.organization_id <> organization_id
        and target.status = 'active'
        and (select private.has_org_role(campaign.organization_id, array['owner', 'staff']::text[]))
    )
  );

create policy campaign_targets_manager_delete on public.campaign_target_organizations
  for delete to authenticated
  using (
    exists (
      select 1 from public.campaigns campaign
      where campaign.id = campaign_id
        and campaign.status = 'draft'
        and (select private.has_org_role(campaign.organization_id, array['owner', 'staff']::text[]))
    )
  );

grant select, insert, delete on public.campaign_target_organizations to authenticated;
grant usage, select on sequence public.campaign_target_organizations_id_seq to authenticated;
grant delete on public.campaigns to authenticated;
revoke update on public.campaigns from authenticated;

create or replace function public.create_campaign_draft(
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
  actor_organization_id bigint;
  active_policy_id bigint;
  created_campaign_id bigint;
  created_campaign_public_id uuid;
begin
  if cardinality(p_target_organization_ids) is null
     or cardinality(p_target_organization_ids) < 1
     or cardinality(p_target_organization_ids) > 50 then
    raise exception 'Select between 1 and 50 target businesses.' using errcode = '22023';
  end if;

  select membership.organization_id
  into actor_organization_id
  from public.organization_memberships membership
  join public.organizations organization on organization.id = membership.organization_id
  where membership.user_id = (select auth.uid())
    and membership.status = 'active'
    and membership.role in ('owner', 'staff')
    and organization.status = 'active'
  order by membership.created_at
  limit 1;

  if actor_organization_id is null then
    raise exception 'An active business owner or staff membership is required.' using errcode = '42501';
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
    actor_organization_id, p_media_asset_id, active_policy_id, btrim(p_name), 'draft',
    p_starts_at, p_ends_at, p_budget_credits, p_daily_cap_credits,
    p_frequency_cap_per_day,
    jsonb_build_object('mode', 'selected_businesses', 'target_count', cardinality(p_target_organization_ids)),
    (select auth.uid())
  )
  returning id, public_id into created_campaign_id, created_campaign_public_id;

  insert into public.campaign_target_organizations (campaign_id, organization_id, created_by)
  select created_campaign_id, target_id, (select auth.uid())
  from unnest(p_target_organization_ids) as target_id;

  return created_campaign_public_id;
end;
$$;

revoke all on function public.create_campaign_draft(text, bigint, timestamptz, timestamptz, numeric, numeric, integer, bigint[]) from public;
grant execute on function public.create_campaign_draft(text, bigint, timestamptz, timestamptz, numeric, numeric, integer, bigint[]) to authenticated;

create trigger campaigns_audit_change
  after insert or update or delete on public.campaigns
  for each row execute function private.audit_managed_row_change();
