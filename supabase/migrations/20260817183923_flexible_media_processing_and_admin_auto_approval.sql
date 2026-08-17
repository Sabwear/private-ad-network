-- Flexible uploaded-video durations, per-upload compression, and safe admin auto-approval.

alter table public.media_assets
  add column compress_video boolean not null default true,
  add column auto_approve_after_processing boolean not null default false;

drop function if exists public.submit_media_upload(uuid, integer, integer, integer, text, text, jsonb);
drop function if exists private.submit_media_upload(uuid, integer, integer, integer, text, text, jsonb);

create function private.submit_media_upload(
  p_asset_public_id uuid,
  p_duration_ms integer,
  p_width integer,
  p_height integer,
  p_codec text,
  p_checksum_sha256 text,
  p_compress_video boolean,
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
  admin_submission boolean;
begin
  admin_submission := (select private.is_platform_admin());

  if p_duration_ms < 1000 then
    raise check_violation using message = 'The video must contain at least one second of playable content';
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
    asset.id, asset.organization_id, asset.original_storage_path, asset.file_size_bytes,
    asset.moderation_status, asset.duration_ms, asset.width, asset.height, asset.checksum_sha256
  into matched_asset
  from public.media_assets asset
  join public.organizations organization on organization.id = asset.organization_id
  where asset.public_id = p_asset_public_id
    and organization.status = 'active'
    and (
      (select private.has_org_role(asset.organization_id, array['owner', 'staff']::text[]))
      or admin_submission
    )
  for update of asset;

  if not found then
    raise insufficient_privilege using message = 'Media submission access is required';
  end if;

  select object.metadata
  into object_metadata
  from storage.objects object
  where object.bucket_id = 'media' and object.name = matched_asset.original_storage_path;

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
  set moderation_status = 'in_review',
      duration_ms = p_duration_ms,
      width = p_width,
      height = p_height,
      codec = left(nullif(btrim(coalesce(p_codec, '')), ''), 80),
      checksum_sha256 = lower(p_checksum_sha256),
      compress_video = p_compress_video,
      auto_approve_after_processing = admin_submission,
      technical_metadata = coalesce(p_technical_metadata, '{}'::jsonb)
        || jsonb_build_object('compressionRequested', p_compress_video, 'adminAutoApproval', admin_submission),
      rights_declared_at = now(),
      submitted_at = now(),
      rejection_reason = null,
      moderated_at = null,
      moderated_by = null
  where id = matched_asset.id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, object_type, object_id, reason, after_summary
  ) values (
    matched_asset.organization_id, (select auth.uid()),
    case when admin_submission then 'admin_upload_processing' else 'submit_for_review' end,
    'media_assets',
    p_asset_public_id::text,
    case when admin_submission then 'Administrator upload queued for technical processing and automatic activation' else 'Media submitted for platform review' end,
    jsonb_build_object(
      'moderation_status', 'in_review', 'duration_ms', p_duration_ms,
      'compress_video', p_compress_video, 'auto_approve_after_processing', admin_submission
    )
  );
end;
$$;

create function public.submit_media_upload(
  p_asset_public_id uuid,
  p_duration_ms integer,
  p_width integer,
  p_height integer,
  p_codec text,
  p_checksum_sha256 text,
  p_compress_video boolean,
  p_technical_metadata jsonb
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.submit_media_upload(
    p_asset_public_id, p_duration_ms, p_width, p_height, p_codec,
    p_checksum_sha256, p_compress_video, p_technical_metadata
  );
$$;

revoke all on function private.submit_media_upload(uuid, integer, integer, integer, text, text, boolean, jsonb) from public;
grant execute on function private.submit_media_upload(uuid, integer, integer, integer, text, text, boolean, jsonb) to authenticated;
revoke all on function public.submit_media_upload(uuid, integer, integer, integer, text, text, boolean, jsonb) from public, anon;
grant execute on function public.submit_media_upload(uuid, integer, integer, integer, text, text, boolean, jsonb) to authenticated;

create or replace function private.auto_approve_processed_admin_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.processing_status = 'ready'
     and old.processing_status is distinct from 'ready'
     and new.auto_approve_after_processing
     and new.moderation_status = 'in_review' then
    update public.media_assets
    set moderation_status = 'approved',
        moderated_at = now(),
        moderated_by = new.created_by,
        rejection_reason = null
    where id = new.id;

    insert into public.audit_logs (
      organization_id, actor_user_id, action, object_type, object_id, reason, before_summary, after_summary
    ) values (
      new.organization_id, new.created_by, 'auto_approve', 'media_assets', new.public_id::text,
      'Administrator-uploaded media approved after successful processing',
      jsonb_build_object('moderation_status', 'in_review', 'processing_status', old.processing_status),
      jsonb_build_object('moderation_status', 'approved', 'processing_status', 'ready')
    );
  end if;
  return null;
end;
$$;

drop trigger if exists media_assets_auto_approve_admin_upload on public.media_assets;
create trigger media_assets_auto_approve_admin_upload
  after update of processing_status on public.media_assets
  for each row execute function private.auto_approve_processed_admin_media();

revoke all on function private.auto_approve_processed_admin_media() from public, anon, authenticated;
