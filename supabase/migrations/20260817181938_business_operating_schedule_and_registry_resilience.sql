-- Business-level working dates and weekly operating hours.

alter table public.organizations
  add column operating_start_date date,
  add column operating_end_date date,
  add column operating_days text[] not null default array['mon', 'tue', 'wed', 'thu', 'fri'],
  add column operating_opens_at time without time zone not null default '09:00',
  add column operating_closes_at time without time zone not null default '18:00',
  add column operating_time_zone text not null default 'Africa/Casablanca',
  add constraint organizations_operating_date_range_valid check (
    operating_start_date is null or operating_end_date is null or operating_end_date >= operating_start_date
  ),
  add constraint organizations_operating_days_valid check (
    cardinality(operating_days) between 1 and 7
    and operating_days <@ array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']::text[]
  ),
  add constraint organizations_operating_hours_valid check (operating_closes_at > operating_opens_at),
  add constraint organizations_operating_time_zone_valid check (length(operating_time_zone) between 1 and 80);

create or replace function public.admin_update_business_profile(
  p_organization_id bigint,
  p_display_name text,
  p_legal_name text,
  p_category text,
  p_status text,
  p_website_url text,
  p_contact_email text,
  p_contact_phone text,
  p_logo_position text,
  p_logo_size_percent integer,
  p_operating_start_date date,
  p_operating_end_date date,
  p_operating_days text[],
  p_operating_opens_at time without time zone,
  p_operating_closes_at time without time zone,
  p_operating_time_zone text,
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
  if length(btrim(coalesce(p_display_name, ''))) < 2 or length(p_display_name) > 120 then
    raise check_violation using message = 'A valid business display name is required';
  end if;
  if length(coalesce(p_legal_name, '')) > 160 or length(coalesce(p_category, '')) < 2 then
    raise check_violation using message = 'The business identity is invalid';
  end if;
  if p_status not in ('active', 'suspended') then
    raise check_violation using message = 'The business status is invalid';
  end if;
  if p_logo_position not in ('top-left', 'top-right', 'bottom-left', 'bottom-right')
     or p_logo_size_percent not between 6 and 32 then
    raise check_violation using message = 'The logo display settings are invalid';
  end if;
  if p_operating_start_date is not null and p_operating_end_date is not null
     and p_operating_end_date < p_operating_start_date then
    raise check_violation using message = 'The operating end date must not be before the start date';
  end if;
  if cardinality(p_operating_days) not between 1 and 7
     or not (p_operating_days <@ array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']::text[]) then
    raise check_violation using message = 'Select valid business working days';
  end if;
  if p_operating_closes_at <= p_operating_opens_at then
    raise check_violation using message = 'The closing time must be after the opening time';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_timezone_names zone where zone.name = p_operating_time_zone
  ) then
    raise check_violation using message = 'The business time zone is invalid';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 or length(p_reason) > 300 then
    raise check_violation using message = 'An administrative reason is required';
  end if;

  perform set_config('request.audit_reason', btrim(p_reason), true);
  update public.organizations
  set display_name = btrim(p_display_name),
      legal_name = nullif(btrim(coalesce(p_legal_name, '')), ''),
      category = btrim(p_category),
      status = p_status,
      website_url = nullif(btrim(coalesce(p_website_url, '')), ''),
      contact_email = nullif(lower(btrim(coalesce(p_contact_email, ''))), ''),
      contact_phone = nullif(btrim(coalesce(p_contact_phone, '')), ''),
      logo_position = p_logo_position,
      logo_size_percent = p_logo_size_percent,
      operating_start_date = p_operating_start_date,
      operating_end_date = p_operating_end_date,
      operating_days = p_operating_days,
      operating_opens_at = p_operating_opens_at,
      operating_closes_at = p_operating_closes_at,
      operating_time_zone = p_operating_time_zone
  where id = p_organization_id;

  if not found then
    raise no_data_found using message = 'Business not found';
  end if;
end;
$$;

revoke all on function public.admin_update_business_profile(
  bigint, text, text, text, text, text, text, text, text, integer,
  date, date, text[], time without time zone, time without time zone, text, text
) from public, anon;
grant execute on function public.admin_update_business_profile(
  bigint, text, text, text, text, text, text, text, text, integer,
  date, date, text[], time without time zone, time without time zone, text, text
) to authenticated;
