-- Make browser uploads verifiable, cancellable, and safe to retry.

update storage.buckets
set public = false,
    file_size_limit = 104857600,
    allowed_mime_types = array[
      'video/mp4', 'image/jpeg', 'image/png',
      'application/vnd.apple.mpegurl', 'application/x-mpegURL', 'video/mp2t'
    ]
where id = 'media';

drop policy if exists media_objects_manager_delete on storage.objects;
create policy media_objects_manager_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'media'
    and exists (
      select 1
      from public.media_assets asset
      join public.organizations organization on organization.id = asset.organization_id
      where asset.original_storage_path = storage.objects.name
        and organization.status = 'active'
        and asset.moderation_status = 'draft'
        and (
          (select private.has_org_role(asset.organization_id, array['owner', 'staff']::text[]))
          or (select private.is_platform_admin())
        )
    )
  );

create or replace function private.cancel_media_upload(p_asset_public_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_asset record;
begin
  select asset.id, asset.organization_id, asset.original_storage_path
  into matched_asset
  from public.media_assets asset
  join public.organizations organization on organization.id = asset.organization_id
  where asset.public_id = p_asset_public_id
    and asset.moderation_status = 'draft'
    and organization.status = 'active'
    and (
      (select private.has_org_role(asset.organization_id, array['owner', 'staff']::text[]))
      or (select private.is_platform_admin())
    )
  for update of asset;

  if not found then
    raise insufficient_privilege using message = 'Draft media cancellation access is required';
  end if;

  if exists (
    select 1 from storage.objects object
    where object.bucket_id = 'media' and object.name = matched_asset.original_storage_path
  ) then
    raise check_violation using message = 'Remove the uploaded object before cancelling its draft';
  end if;

  delete from public.media_assets where id = matched_asset.id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, object_type, object_id, reason
  ) values (
    matched_asset.organization_id, (select auth.uid()), 'cancel_upload', 'media_assets',
    p_asset_public_id::text, 'Unfinished media upload cancelled'
  );
end;
$$;

create or replace function public.cancel_media_upload(p_asset_public_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.cancel_media_upload(p_asset_public_id);
$$;

revoke all on function private.cancel_media_upload(uuid) from public;
grant execute on function private.cancel_media_upload(uuid) to authenticated;
revoke all on function public.cancel_media_upload(uuid) from public, anon;
grant execute on function public.cancel_media_upload(uuid) to authenticated;

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
  object_metadata jsonb;
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

  select
    asset.id,
    asset.organization_id,
    asset.original_storage_path,
    asset.file_size_bytes,
    asset.moderation_status,
    asset.duration_ms,
    asset.width,
    asset.height,
    asset.checksum_sha256
  into matched_asset
  from public.media_assets asset
  join public.organizations organization on organization.id = asset.organization_id
  where asset.public_id = p_asset_public_id
    and organization.status = 'active'
    and (
      (select private.has_org_role(asset.organization_id, array['owner', 'staff']::text[]))
      or (select private.is_platform_admin())
    )
  for update of asset;

  if not found then
    raise insufficient_privilege using message = 'Media submission access is required';
  end if;

  select object.metadata
  into object_metadata
  from storage.objects object
  where object.bucket_id = 'media'
    and object.name = matched_asset.original_storage_path;

  if not found then
    raise no_data_found using message = 'The uploaded media object was not found';
  end if;
  if coalesce(object_metadata->>'size', '') !~ '^[0-9]+$'
     or (object_metadata->>'size')::bigint <> matched_asset.file_size_bytes then
    raise check_violation using message = 'The stored file size does not match the prepared upload';
  end if;
  if lower(coalesce(object_metadata->>'mimetype', '')) <> 'video/mp4' then
    raise check_violation using message = 'The stored object is not an MP4 video';
  end if;

  -- A lost HTTP response must not force a second upload or create a duplicate job.
  if matched_asset.moderation_status = 'in_review'
     and matched_asset.duration_ms = p_duration_ms
     and matched_asset.width = p_width
     and matched_asset.height = p_height
     and matched_asset.checksum_sha256 = p_checksum_sha256 then
    return;
  end if;

  if matched_asset.moderation_status <> 'draft' then
    raise check_violation using message = 'Only draft media can be submitted';
  end if;

  update public.media_assets
  set moderation_status = 'in_review', duration_ms = p_duration_ms, width = p_width, height = p_height,
      codec = left(nullif(btrim(coalesce(p_codec, '')), ''), 80),
      checksum_sha256 = lower(p_checksum_sha256),
      technical_metadata = coalesce(p_technical_metadata, '{}'::jsonb), rights_declared_at = now(),
      submitted_at = now(), rejection_reason = null, moderated_at = null, moderated_by = null
  where id = matched_asset.id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, object_type, object_id, reason, after_summary
  ) values (
    matched_asset.organization_id, (select auth.uid()), 'submit_for_review', 'media_assets',
    p_asset_public_id::text, 'Rights declaration accepted and stored media verified',
    jsonb_build_object(
      'moderation_status', 'in_review', 'duration_ms', p_duration_ms,
      'width', p_width, 'height', p_height, 'file_size_bytes', matched_asset.file_size_bytes
    )
  );
end;
$$;
