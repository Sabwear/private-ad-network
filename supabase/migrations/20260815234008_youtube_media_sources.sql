-- Support externally hosted YouTube creatives alongside private uploaded files.

alter table public.media_assets
  add column source_type text not null default 'upload',
  add column external_provider text,
  add column external_id text,
  add column external_url text;

alter table public.media_assets
  add constraint media_assets_source_type_valid
    check (source_type in ('upload', 'youtube')),
  add constraint media_assets_external_source_valid
    check (
      (source_type = 'upload' and external_provider is null and external_id is null and external_url is null)
      or
      (
        source_type = 'youtube'
        and external_provider = 'youtube'
        and external_id ~ '^[A-Za-z0-9_-]{11}$'
        and external_url = 'https://www.youtube.com/watch?v=' || external_id
        and duration_ms between 5000 and 3600000
        and original_storage_path is null
        and normalized_storage_path is null
        and hls_master_storage_path is null
      )
    );

create unique index media_assets_active_external_source_unique_idx
  on public.media_assets (organization_id, external_provider, external_id)
  where source_type = 'youtube' and moderation_status <> 'archived';

create or replace function private.create_youtube_media(
  p_organization_id bigint,
  p_name text,
  p_youtube_video_id text,
  p_duration_ms integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_public_id uuid;
begin
  if (select auth.uid()) is null then
    raise insufficient_privilege using message = 'Authentication is required';
  end if;
  if length(btrim(coalesce(p_name, ''))) < 2 or length(p_name) > 120 then
    raise check_violation using message = 'A valid media name is required';
  end if;
  if coalesce(p_youtube_video_id, '') !~ '^[A-Za-z0-9_-]{11}$' then
    raise check_violation using message = 'A valid YouTube video ID is required';
  end if;
  if p_duration_ms < 5000 or p_duration_ms > 3600000 then
    raise check_violation using message = 'YouTube duration must be between 5 seconds and 60 minutes';
  end if;
  if not exists (
    select 1
    from public.organizations organization
    where organization.id = p_organization_id
      and organization.status = 'active'
      and (select private.has_org_role(organization.id, array['owner', 'staff']::text[]))
  ) then
    raise insufficient_privilege using message = 'Active organization media access is required';
  end if;

  insert into public.media_assets (
    organization_id,
    name,
    source_type,
    external_provider,
    external_id,
    external_url,
    duration_ms,
    width,
    height,
    codec,
    technical_metadata,
    moderation_status,
    processing_status,
    processing_completed_at,
    rights_declared_at,
    submitted_at,
    created_by
  ) values (
    p_organization_id,
    btrim(p_name),
    'youtube',
    'youtube',
    p_youtube_video_id,
    'https://www.youtube.com/watch?v=' || p_youtube_video_id,
    p_duration_ms,
    1920,
    1080,
    'YouTube embed',
    jsonb_build_object('source', 'youtube', 'videoId', p_youtube_video_id),
    'in_review',
    'ready',
    statement_timestamp(),
    statement_timestamp(),
    statement_timestamp(),
    (select auth.uid())
  )
  returning public_id into created_public_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, object_type, object_id, reason, after_summary
  ) values (
    p_organization_id,
    (select auth.uid()),
    'submit_external_media_for_review',
    'media_assets',
    created_public_id::text,
    'Rights declaration accepted and YouTube media submitted for review',
    jsonb_build_object('source_type', 'youtube', 'duration_ms', p_duration_ms)
  );

  return created_public_id;
exception
  when unique_violation then
    raise check_violation using message = 'This YouTube video is already in the business media library';
end;
$$;

create or replace function public.create_youtube_media(
  p_organization_id bigint,
  p_name text,
  p_youtube_video_id text,
  p_duration_ms integer
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_youtube_media(p_organization_id, p_name, p_youtube_video_id, p_duration_ms);
$$;

revoke all on function private.create_youtube_media(bigint, text, text, integer) from public;
revoke all on function public.create_youtube_media(bigint, text, text, integer) from public, anon;
grant execute on function private.create_youtube_media(bigint, text, text, integer) to authenticated;
grant execute on function public.create_youtube_media(bigint, text, text, integer) to authenticated;

create or replace function private.enforce_streaming_channel_item_ready()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' and not exists (
    select 1
    from public.media_assets asset
    where asset.id = new.media_asset_id
      and asset.moderation_status = 'approved'
      and asset.processing_status = 'ready'
      and (
        (asset.source_type = 'upload' and asset.normalized_storage_path is not null)
        or (asset.source_type = 'youtube' and asset.external_provider = 'youtube' and asset.external_id is not null)
      )
  ) then
    raise check_violation using message = 'Only approved, playable media can be added to a streaming channel';
  end if;
  return new;
end;
$$;

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
      and (
        (asset.source_type = 'upload' and asset.normalized_storage_path is not null)
        or (asset.source_type = 'youtube' and asset.external_provider = 'youtube' and asset.external_id is not null)
      )
  ) then
    raise check_violation using message = 'Select an approved, playable ad owned by this business';
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
