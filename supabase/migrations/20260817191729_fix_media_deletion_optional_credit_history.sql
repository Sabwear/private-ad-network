-- Keep media deletion compatible while credit-event migrations roll out.

create or replace function private.media_asset_has_protected_history(p_media_asset_id bigint)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  has_credit_history boolean := false;
begin
  if exists (select 1 from public.campaigns campaign where campaign.media_asset_id = p_media_asset_id)
     or exists (select 1 from public.playback_sessions session where session.media_asset_id = p_media_asset_id) then
    return true;
  end if;

  if to_regclass('public.stream_credit_events') is not null then
    execute 'select exists (select 1 from public.stream_credit_events where media_asset_id = $1)'
      into has_credit_history using p_media_asset_id;
  end if;
  return has_credit_history;
end;
$$;

create or replace function private.prepare_media_asset_deletion(p_asset_public_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_asset public.media_assets%rowtype;
  object_paths text[];
begin
  if not (select private.is_platform_admin()) then
    raise insufficient_privilege using message = 'Platform administrator access is required';
  end if;

  select asset.* into matched_asset
  from public.media_assets asset
  where asset.public_id = p_asset_public_id;

  if not found then
    raise no_data_found using message = 'Media asset not found';
  end if;
  if matched_asset.processing_status = 'processing' then
    raise check_violation using message = 'Wait for active media processing to finish before deleting this asset';
  end if;
  if private.media_asset_has_protected_history(matched_asset.id) then
    raise check_violation using message = 'This media has campaign or delivery history and cannot be permanently deleted';
  end if;

  select coalesce(array_agg(object.name order by object.name), array[]::text[])
  into object_paths
  from storage.objects object
  where object.bucket_id = 'media'
    and (
      object.name = matched_asset.original_storage_path
      or object.name = matched_asset.normalized_storage_path
      or object.name = matched_asset.thumbnail_storage_path
      or (
        matched_asset.hls_master_storage_path is not null
        and object.name like regexp_replace(matched_asset.hls_master_storage_path, '/[^/]+$', '') || '/%'
      )
    );

  return object_paths;
end;
$$;

create or replace function private.delete_media_asset(p_asset_public_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_asset public.media_assets%rowtype;
begin
  if not (select private.is_platform_admin()) then
    raise insufficient_privilege using message = 'Platform administrator access is required';
  end if;

  select asset.* into matched_asset
  from public.media_assets asset
  where asset.public_id = p_asset_public_id
  for update;

  if not found then
    raise no_data_found using message = 'Media asset not found';
  end if;
  if matched_asset.processing_status = 'processing' then
    raise check_violation using message = 'Wait for active media processing to finish before deleting this asset';
  end if;
  if private.media_asset_has_protected_history(matched_asset.id) then
    raise check_violation using message = 'This media has campaign or delivery history and cannot be permanently deleted';
  end if;
  if exists (
    select 1 from storage.objects object
    where object.bucket_id = 'media'
      and (
        object.name = matched_asset.original_storage_path
        or object.name = matched_asset.normalized_storage_path
        or object.name = matched_asset.thumbnail_storage_path
        or (
          matched_asset.hls_master_storage_path is not null
          and object.name like regexp_replace(matched_asset.hls_master_storage_path, '/[^/]+$', '') || '/%'
        )
      )
  ) then
    raise check_violation using message = 'Stored media files must be removed before deleting the media record';
  end if;

  delete from public.media_assets where id = matched_asset.id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, object_type, object_id, reason, before_summary
  ) values (
    matched_asset.organization_id, (select auth.uid()), 'delete_media', 'media_assets',
    matched_asset.public_id::text, 'Permanently deleted by a platform administrator',
    jsonb_build_object(
      'name', matched_asset.name,
      'source_type', matched_asset.source_type,
      'moderation_status', matched_asset.moderation_status,
      'processing_status', matched_asset.processing_status
    )
  );
end;
$$;

revoke all on function private.media_asset_has_protected_history(bigint) from public, anon, authenticated;
