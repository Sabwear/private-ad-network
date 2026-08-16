-- Let platform administrators add media on behalf of an active business.

drop policy if exists media_objects_manager_insert on storage.objects;
create policy media_objects_manager_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and exists (
      select 1
      from public.media_assets asset
      join public.organizations organization on organization.id = asset.organization_id
      where asset.original_storage_path = storage.objects.name
        and organization.status = 'active'
        and asset.moderation_status in ('draft', 'processing')
        and (
          (select private.has_org_role(asset.organization_id, array['owner', 'staff']::text[]))
          or (select private.is_platform_admin())
        )
    )
  );

drop policy if exists media_objects_manager_update on storage.objects;
create policy media_objects_manager_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'media'
    and exists (
      select 1 from public.media_assets asset
      where asset.original_storage_path = storage.objects.name
        and asset.moderation_status in ('draft', 'processing')
        and (
          (select private.has_org_role(asset.organization_id, array['owner', 'staff']::text[]))
          or (select private.is_platform_admin())
        )
    )
  )
  with check (
    bucket_id = 'media'
    and exists (
      select 1 from public.media_assets asset
      where asset.original_storage_path = storage.objects.name
        and asset.moderation_status in ('draft', 'processing')
        and (
          (select private.has_org_role(asset.organization_id, array['owner', 'staff']::text[]))
          or (select private.is_platform_admin())
        )
    )
  );

create or replace function private.create_media_upload(
  p_organization_id bigint,
  p_name text,
  p_original_filename text,
  p_mime_type text,
  p_file_size_bytes bigint
)
returns table (asset_public_id uuid, storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_public_id uuid;
  generated_asset_public_id uuid := extensions.gen_random_uuid();
  generated_storage_path text;
begin
  if (select auth.uid()) is null then
    raise insufficient_privilege using message = 'Authentication is required';
  end if;
  if length(btrim(coalesce(p_name, ''))) < 2 or length(p_name) > 120 then
    raise check_violation using message = 'A valid media name is required';
  end if;
  if length(btrim(coalesce(p_original_filename, ''))) < 1 or length(p_original_filename) > 255 then
    raise check_violation using message = 'A valid filename is required';
  end if;
  if p_mime_type <> 'video/mp4' then
    raise check_violation using message = 'Only MP4 video is accepted';
  end if;
  if p_file_size_bytes < 1 or p_file_size_bytes > 104857600 then
    raise check_violation using message = 'The file must be no larger than 100 MB';
  end if;

  select organization.public_id
  into organization_public_id
  from public.organizations organization
  where organization.id = p_organization_id
    and organization.status = 'active'
    and (
      (select private.has_org_role(organization.id, array['owner', 'staff']::text[]))
      or (select private.is_platform_admin())
    );
  if not found then
    raise insufficient_privilege using message = 'Active organization media access is required';
  end if;

  generated_storage_path := organization_public_id::text || '/' || generated_asset_public_id::text || '/original.mp4';
  insert into public.media_assets (
    public_id, organization_id, name, original_filename, original_storage_path,
    mime_type, file_size_bytes, moderation_status, created_by
  ) values (
    generated_asset_public_id, p_organization_id, btrim(p_name), btrim(p_original_filename),
    generated_storage_path, p_mime_type, p_file_size_bytes, 'draft', (select auth.uid())
  );
  return query select generated_asset_public_id, generated_storage_path;
end;
$$;

create or replace function private.submit_media_upload(
  p_asset_public_id uuid,
  p_duration_ms integer,
  p_width integer,
  p_height integer,
  p_codec text,
  p_checksum_sha256 text,
  p_technical_metadata jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_asset record;
begin
  if not (
    abs(p_duration_ms - 15000) <= 1000
    or abs(p_duration_ms - 30000) <= 1000
    or abs(p_duration_ms - 60000) <= 1000
  ) then
    raise check_violation using message = 'The video must be 15, 30, or 60 seconds';
  end if;
  if p_width < 1280 or p_height < 720
     or abs((p_width::numeric / p_height::numeric) - (16::numeric / 9::numeric)) > 0.02 then
    raise check_violation using message = 'The video must be landscape 16:9 at 1280 x 720 or higher';
  end if;
  if p_checksum_sha256 !~ '^[a-f0-9]{64}$' then
    raise check_violation using message = 'The media checksum is invalid';
  end if;
  if jsonb_typeof(coalesce(p_technical_metadata, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_technical_metadata, '{}'::jsonb)::text) > 8192 then
    raise check_violation using message = 'The technical metadata is invalid';
  end if;

  select asset.id, asset.organization_id, asset.original_storage_path
  into matched_asset
  from public.media_assets asset
  join public.organizations organization on organization.id = asset.organization_id
  where asset.public_id = p_asset_public_id
    and asset.moderation_status in ('draft', 'processing', 'rejected')
    and organization.status = 'active'
    and (
      (select private.has_org_role(asset.organization_id, array['owner', 'staff']::text[]))
      or (select private.is_platform_admin())
    );
  if not found then
    raise insufficient_privilege using message = 'Media submission access is required';
  end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'media' and object.name = matched_asset.original_storage_path
  ) then
    raise no_data_found using message = 'The uploaded media object was not found';
  end if;

  update public.media_assets
  set moderation_status = 'in_review', duration_ms = p_duration_ms, width = p_width, height = p_height,
      codec = left(nullif(btrim(coalesce(p_codec, '')), ''), 80),
      checksum_sha256 = nullif(lower(btrim(coalesce(p_checksum_sha256, ''))), ''),
      technical_metadata = coalesce(p_technical_metadata, '{}'::jsonb), rights_declared_at = now(),
      submitted_at = now(), rejection_reason = null, moderated_at = null, moderated_by = null
  where id = matched_asset.id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, object_type, object_id, reason, after_summary
  ) values (
    matched_asset.organization_id, (select auth.uid()), 'submit_for_review', 'media_assets',
    p_asset_public_id::text, 'Rights declaration accepted and media submitted for review',
    jsonb_build_object('moderation_status', 'in_review', 'duration_ms', p_duration_ms, 'width', p_width, 'height', p_height)
  );
end;
$$;

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
  if (select auth.uid()) is null then raise insufficient_privilege using message = 'Authentication is required'; end if;
  if length(btrim(coalesce(p_name, ''))) < 2 or length(p_name) > 120 then raise check_violation using message = 'A valid media name is required'; end if;
  if coalesce(p_youtube_video_id, '') !~ '^[A-Za-z0-9_-]{11}$' then raise check_violation using message = 'A valid YouTube video ID is required'; end if;
  if p_duration_ms < 5000 or p_duration_ms > 3600000 then raise check_violation using message = 'YouTube duration must be between 5 seconds and 60 minutes'; end if;
  if not exists (
    select 1 from public.organizations organization
    where organization.id = p_organization_id and organization.status = 'active'
      and (
        (select private.has_org_role(organization.id, array['owner', 'staff']::text[]))
        or (select private.is_platform_admin())
      )
  ) then
    raise insufficient_privilege using message = 'Active organization media access is required';
  end if;

  insert into public.media_assets (
    organization_id, name, source_type, external_provider, external_id, external_url,
    duration_ms, width, height, codec, technical_metadata, moderation_status,
    processing_status, processing_completed_at, rights_declared_at, submitted_at, created_by
  ) values (
    p_organization_id, btrim(p_name), 'youtube', 'youtube', p_youtube_video_id,
    'https://www.youtube.com/watch?v=' || p_youtube_video_id, p_duration_ms, 1920, 1080,
    'YouTube embed', jsonb_build_object('source', 'youtube', 'videoId', p_youtube_video_id),
    'in_review', 'ready', statement_timestamp(), statement_timestamp(), statement_timestamp(), (select auth.uid())
  ) returning public_id into created_public_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, object_type, object_id, reason, after_summary
  ) values (
    p_organization_id, (select auth.uid()), 'submit_external_media_for_review', 'media_assets',
    created_public_id::text, 'Rights declaration accepted and YouTube media submitted for review',
    jsonb_build_object('source_type', 'youtube', 'duration_ms', p_duration_ms)
  );
  return created_public_id;
exception when unique_violation then
  raise check_violation using message = 'This YouTube video is already in the business media library';
end;
$$;
