-- Business branding, advertiser-to-channel media assignment, and configurable
-- public stream overlays. Brand images are public presentation assets, while
-- every mutation remains restricted to authenticated platform administrators.

alter table public.organizations
  add column website_url text,
  add column contact_email text,
  add column contact_phone text,
  add column logo_storage_path text,
  add column logo_position text not null default 'bottom-left',
  add column logo_size_percent integer not null default 14,
  add constraint organizations_website_url_valid check (
    website_url is null or (length(website_url) <= 500 and website_url ~ '^https?://')
  ),
  add constraint organizations_contact_email_valid check (
    contact_email is null or (length(contact_email) <= 254 and position('@' in contact_email) > 1)
  ),
  add constraint organizations_contact_phone_valid check (
    contact_phone is null or length(contact_phone) <= 40
  ),
  add constraint organizations_logo_storage_path_valid check (
    logo_storage_path is null or length(logo_storage_path) between 10 and 500
  ),
  add constraint organizations_logo_position_valid check (
    logo_position in ('top-left', 'top-right', 'bottom-left', 'bottom-right')
  ),
  add constraint organizations_logo_size_percent_valid check (
    logo_size_percent between 6 and 32
  );

alter table public.streaming_channels
  add column show_live_badge boolean not null default true,
  add column show_channel_name boolean not null default true,
  add column show_now_playing boolean not null default true,
  add column show_audio_control boolean not null default true,
  add column show_advertiser_logo boolean not null default true,
  add column show_stripe_banner boolean not null default false,
  add column show_video_time boolean not null default true,
  add column stripe_banner_text text,
  add column stripe_banner_position text not null default 'top',
  add column video_fit text not null default 'contain',
  add constraint streaming_channels_stripe_text_valid check (
    stripe_banner_text is null or length(stripe_banner_text) <= 240
  ),
  add constraint streaming_channels_stripe_position_valid check (
    stripe_banner_position in ('top', 'bottom')
  ),
  add constraint streaming_channels_video_fit_valid check (
    video_fit in ('contain', 'cover')
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-assets',
  'brand-assets',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists brand_assets_admin_insert on storage.objects;
create policy brand_assets_admin_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'brand-assets'
    and (select private.is_platform_admin())
  );

drop policy if exists brand_assets_admin_update on storage.objects;
create policy brand_assets_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'brand-assets' and (select private.is_platform_admin()))
  with check (bucket_id = 'brand-assets' and (select private.is_platform_admin()));

drop policy if exists brand_assets_admin_delete on storage.objects;
create policy brand_assets_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'brand-assets' and (select private.is_platform_admin()));

create or replace function public.admin_update_organization_profile(
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
  if p_logo_position not in ('top-left', 'top-right', 'bottom-left', 'bottom-right')
     or p_logo_size_percent not between 6 and 32 then
    raise check_violation using message = 'The logo display settings are invalid';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
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
      logo_size_percent = p_logo_size_percent
  where id = p_organization_id;

  if not found then
    raise no_data_found using message = 'Organization not found';
  end if;
end;
$$;

create or replace function public.admin_set_organization_logo(
  p_organization_id bigint,
  p_logo_storage_path text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  organization_public_id uuid;
  previous_storage_path text;
begin
  if not (select private.is_platform_admin()) then
    raise insufficient_privilege using message = 'Platform administrator access is required';
  end if;

  select organization.public_id, organization.logo_storage_path
  into organization_public_id, previous_storage_path
  from public.organizations organization
  where organization.id = p_organization_id;

  if organization_public_id is null then
    raise no_data_found using message = 'Organization not found';
  end if;
  if p_logo_storage_path is not null
     and p_logo_storage_path not like organization_public_id::text || '/%' then
    raise check_violation using message = 'The logo storage path is invalid';
  end if;

  perform set_config(
    'request.audit_reason',
    case when p_logo_storage_path is null then 'Business logo removed' else 'Business logo updated' end,
    true
  );
  update public.organizations
  set logo_storage_path = p_logo_storage_path
  where id = p_organization_id;

  return previous_storage_path;
end;
$$;

revoke all on function public.admin_update_organization_profile(bigint, text, text, text, text, text, text, text, text, integer, text) from public, anon;
revoke all on function public.admin_set_organization_logo(bigint, text) from public, anon;
grant execute on function public.admin_update_organization_profile(bigint, text, text, text, text, text, text, text, text, integer, text) to authenticated;
grant execute on function public.admin_set_organization_logo(bigint, text) to authenticated;

create or replace function public.admin_assign_business_ad_to_channel(
  p_organization_id bigint,
  p_channel_id bigint,
  p_media_asset_id bigint
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  next_position integer;
  assigned_item_id bigint;
begin
  if not (select private.is_platform_admin()) then
    raise insufficient_privilege using message = 'Platform administrator access is required';
  end if;
  if not exists (
    select 1 from public.media_assets asset
    where asset.id = p_media_asset_id
      and asset.organization_id = p_organization_id
      and asset.moderation_status = 'approved'
      and asset.processing_status = 'ready'
      and asset.normalized_storage_path is not null
  ) then
    raise check_violation using message = 'Select an approved, processed ad owned by this business';
  end if;

  perform 1 from public.streaming_channels channel
  where channel.id = p_channel_id
  for update;
  if not found then
    raise no_data_found using message = 'Channel not found';
  end if;

  select coalesce(max(item.position), 0) + 1
  into next_position
  from public.streaming_channel_items item
  where item.channel_id = p_channel_id;

  insert into public.streaming_channel_items (
    channel_id, media_asset_id, position, status, created_by
  ) values (
    p_channel_id, p_media_asset_id, next_position, 'active', (select auth.uid())
  )
  on conflict (channel_id, media_asset_id) do update
    set status = 'active'
  returning id into assigned_item_id;

  return assigned_item_id;
end;
$$;

create or replace function public.admin_remove_business_ad_from_channel(
  p_organization_id bigint,
  p_channel_item_id bigint
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  removed_count integer;
begin
  if not (select private.is_platform_admin()) then
    raise insufficient_privilege using message = 'Platform administrator access is required';
  end if;

  delete from public.streaming_channel_items item
  using public.media_assets asset
  where item.id = p_channel_item_id
    and asset.id = item.media_asset_id
    and asset.organization_id = p_organization_id;
  get diagnostics removed_count = row_count;
  if removed_count <> 1 then
    raise no_data_found using message = 'Business channel ad assignment not found';
  end if;
end;
$$;

revoke all on function public.admin_assign_business_ad_to_channel(bigint, bigint, bigint) from public, anon;
revoke all on function public.admin_remove_business_ad_from_channel(bigint, bigint) from public, anon;
grant execute on function public.admin_assign_business_ad_to_channel(bigint, bigint, bigint) to authenticated;
grant execute on function public.admin_remove_business_ad_from_channel(bigint, bigint) to authenticated;
