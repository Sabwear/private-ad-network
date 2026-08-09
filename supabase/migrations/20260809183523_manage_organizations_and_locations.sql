-- Complete Phase 1 organization and location administration.
-- Mutations remain tenant-scoped at the database boundary and every change
-- carries an operator-provided audit reason.

alter table public.locations
  add column category_exclusions jsonb not null default '[]'::jsonb,
  add constraint locations_category_exclusions_array
    check (jsonb_typeof(category_exclusions) = 'array'),
  add constraint locations_category_exclusions_limit
    check (jsonb_array_length(category_exclusions) <= 20);

create or replace function public.admin_update_organization(
  p_organization_id bigint,
  p_display_name text,
  p_legal_name text,
  p_category text,
  p_status text,
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

  if length(btrim(coalesce(p_display_name, ''))) < 2 then
    raise check_violation using message = 'A valid display name is required';
  end if;

  if length(btrim(coalesce(p_category, ''))) < 2 then
    raise check_violation using message = 'A valid business category is required';
  end if;

  if p_status not in ('active', 'suspended') then
    raise check_violation using message = 'The organization status is invalid';
  end if;

  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise check_violation using message = 'An administrative reason is required';
  end if;

  perform set_config('request.audit_reason', btrim(p_reason), true);

  update public.organizations
  set display_name = btrim(p_display_name),
      legal_name = nullif(btrim(coalesce(p_legal_name, '')), ''),
      category = btrim(p_category),
      status = p_status
  where id = p_organization_id;

  if not found then
    raise no_data_found using message = 'Organization not found';
  end if;
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
  caller_is_admin boolean := (select private.is_platform_admin());
begin
  if not (
    caller_is_admin
    or (
      (select private.has_org_role(p_organization_id, array['owner', 'staff']::text[]))
      and exists (
        select 1 from public.organizations organization
        where organization.id = p_organization_id
          and organization.status = 'active'
      )
    )
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
    category_exclusions,
    status
  ) values (
    p_organization_id,
    btrim(p_name),
    nullif(btrim(coalesce(p_address, '')), ''),
    btrim(p_zone),
    btrim(p_category),
    nullif(btrim(coalesce(p_traffic_band, '')), ''),
    coalesce(p_operating_hours, '{}'::jsonb),
    '[]'::jsonb,
    'active'
  )
  returning id into created_location_id;

  return created_location_id;
end;
$$;

create or replace function public.update_location(
  p_location_id bigint,
  p_organization_id bigint,
  p_name text,
  p_address text,
  p_zone text,
  p_category text,
  p_traffic_band text,
  p_operating_hours jsonb,
  p_category_exclusions jsonb,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_is_admin boolean := (select private.is_platform_admin());
  normalized_exclusions jsonb := coalesce(p_category_exclusions, '[]'::jsonb);
begin
  if not (
    caller_is_admin
    or (
      (select private.has_org_role(p_organization_id, array['owner', 'staff']::text[]))
      and exists (
        select 1 from public.organizations organization
        where organization.id = p_organization_id
          and organization.status = 'active'
      )
    )
  ) then
    raise insufficient_privilege using message = 'Location management access is required';
  end if;

  if length(btrim(coalesce(p_name, ''))) < 2
     or length(btrim(coalesce(p_zone, ''))) < 2
     or length(btrim(coalesce(p_category, ''))) < 2 then
    raise check_violation using message = 'Valid location details are required';
  end if;

  if p_traffic_band not in ('low', 'medium', 'high') then
    raise check_violation using message = 'The traffic band is invalid';
  end if;

  if p_status not in ('active', 'suspended') then
    raise check_violation using message = 'The location status is invalid';
  end if;

  if jsonb_typeof(coalesce(p_operating_hours, '{}'::jsonb)) <> 'object' then
    raise check_violation using message = 'Operating hours must be an object';
  end if;

  if jsonb_typeof(normalized_exclusions) <> 'array'
     or jsonb_array_length(normalized_exclusions) > 20 then
    raise check_violation using message = 'Category exclusions must be a list of at most 20 values';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(normalized_exclusions) exclusion(value)
    where length(btrim(exclusion.value)) < 2
  ) then
    raise check_violation using message = 'Category exclusions cannot contain blank values';
  end if;

  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise check_violation using message = 'A change reason is required';
  end if;

  perform set_config('request.audit_reason', btrim(p_reason), true);

  update public.locations
  set name = btrim(p_name),
      address = nullif(btrim(coalesce(p_address, '')), ''),
      zone = btrim(p_zone),
      category = btrim(p_category),
      traffic_band = p_traffic_band,
      operating_hours = coalesce(p_operating_hours, '{}'::jsonb),
      category_exclusions = normalized_exclusions,
      status = p_status
  where id = p_location_id
    and organization_id = p_organization_id;

  if not found then
    raise no_data_found using message = 'Location not found';
  end if;
end;
$$;

revoke all on function public.admin_update_organization(bigint, text, text, text, text, text) from public, anon;
grant execute on function public.admin_update_organization(bigint, text, text, text, text, text) to authenticated;

revoke all on function public.update_location(bigint, bigint, text, text, text, text, text, jsonb, jsonb, text, text) from public, anon;
grant execute on function public.update_location(bigint, bigint, text, text, text, text, text, jsonb, jsonb, text, text) to authenticated;
