-- Administrator uploads are already browser-validated MP4 files. Make the
-- original object immediately playable instead of requiring a separate worker.
-- Viewer identity remains optional: an access-key holder can watch anonymously,
-- while entering a business code attributes earning and registered identity.

alter table public.stream_viewer_sessions
  alter column host_organization_id drop not null;

alter table public.stream_credit_events
  alter column host_organization_id drop not null;

create or replace function private.submit_media_upload(
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

  if matched_asset.moderation_status in ('in_review', 'approved')
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
  set moderation_status = case when admin_submission then 'approved' else 'in_review' end,
      processing_status = case when admin_submission then 'ready' else processing_status end,
      normalized_storage_path = case when admin_submission then original_storage_path else normalized_storage_path end,
      normalized_file_size_bytes = case when admin_submission then file_size_bytes else normalized_file_size_bytes end,
      processing_error = null,
      processing_completed_at = case when admin_submission then now() else processing_completed_at end,
      duration_ms = p_duration_ms,
      width = p_width,
      height = p_height,
      codec = left(nullif(btrim(coalesce(p_codec, '')), ''), 80),
      checksum_sha256 = lower(p_checksum_sha256),
      compress_video = p_compress_video,
      auto_approve_after_processing = false,
      technical_metadata = coalesce(p_technical_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'compressionRequested', p_compress_video,
          'directOriginalPlayback', admin_submission,
          'adminAutoApproval', admin_submission
        ),
      rights_declared_at = now(),
      submitted_at = now(),
      rejection_reason = null,
      moderated_at = case when admin_submission then now() else null end,
      moderated_by = case when admin_submission then (select auth.uid()) else null end
  where id = matched_asset.id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, object_type, object_id, reason, after_summary
  ) values (
    matched_asset.organization_id, (select auth.uid()),
    case when admin_submission then 'admin_upload_approved' else 'submit_for_review' end,
    'media_assets',
    p_asset_public_id::text,
    case when admin_submission then 'Administrator upload approved for immediate original MP4 playback' else 'Media submitted for platform review' end,
    jsonb_build_object(
      'moderation_status', case when admin_submission then 'approved' else 'in_review' end,
      'processing_status', case when admin_submission then 'ready' else 'queued' end,
      'duration_ms', p_duration_ms,
      'compress_video', p_compress_video
    )
  );
end;
$$;

-- Promote administrator uploads that were already left waiting for the absent
-- worker. Their validated original MP4 becomes the normalized playback source.
update public.media_processing_jobs job
set status = 'succeeded',
    completed_at = now(),
    locked_at = null,
    locked_by = null,
    last_error = null
from public.media_assets asset
where job.media_asset_id = asset.id
  and asset.auto_approve_after_processing
  and asset.moderation_status = 'in_review'
  and asset.processing_status in ('queued', 'failed');

update public.media_assets
set moderation_status = 'approved',
    processing_status = 'ready',
    normalized_storage_path = original_storage_path,
    normalized_file_size_bytes = file_size_bytes,
    processing_error = null,
    processing_completed_at = now(),
    moderated_at = now(),
    moderated_by = created_by,
    auto_approve_after_processing = false,
    technical_metadata = technical_metadata || jsonb_build_object('directOriginalPlayback', true)
where auto_approve_after_processing
  and moderation_status = 'in_review'
  and processing_status in ('queued', 'failed')
  and original_storage_path is not null;
