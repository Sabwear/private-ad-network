-- Demo records are marked inside organizations.billing_profile. The cleanup
-- function can only remove organizations carrying that marker and requires a
-- platform administrator plus an exact server-side confirmation phrase.

create or replace function public.admin_clear_demo_data(p_confirmation text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed_organizations integer;
begin
  if not (select private.is_platform_admin()) then
    raise exception 'Platform administrator access is required.' using errcode = '42501';
  end if;

  if p_confirmation <> 'DELETE DEMO DATA' then
    raise exception 'The demo data confirmation phrase is invalid.' using errcode = '22023';
  end if;

  delete from public.campaigns campaign
  using public.organizations organization
  where campaign.organization_id = organization.id
    and organization.billing_profile @> '{"demo": true}'::jsonb;

  delete from public.media_assets asset
  using public.organizations organization
  where asset.organization_id = organization.id
    and organization.billing_profile @> '{"demo": true}'::jsonb;

  delete from public.organizations
  where billing_profile @> '{"demo": true}'::jsonb;
  get diagnostics removed_organizations = row_count;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, object_type, object_id, reason, after_summary
  ) values (
    null,
    (select auth.uid()),
    'delete_demo_data',
    'demo_dataset',
    'beta-demo',
    'Administrator confirmed removal of demo-only content',
    jsonb_build_object('removed_organizations', removed_organizations)
  );

  return removed_organizations;
end;
$$;

revoke all on function public.admin_clear_demo_data(text) from public, anon, authenticated;
grant execute on function public.admin_clear_demo_data(text) to authenticated;
