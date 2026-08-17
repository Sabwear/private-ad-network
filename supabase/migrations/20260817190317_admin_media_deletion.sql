-- Administrator-only permanent media deletion with Storage cleanup safeguards.

drop policy if exists media_objects_platform_admin_select on storage.objects;
create policy media_objects_platform_admin_select on storage.objects
  for select to authenticated
  using (bucket_id = 'media' and (select private.is_platform_admin()));

drop policy if exists media_objects_platform_admin_delete on storage.objects;
create policy media_objects_platform_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (select private.is_platform_admin()));

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
  if exists (select 1 from public.campaigns campaign where campaign.media_asset_id = matched_asset.id)
     or exists (select 1 from public.playback_sessions session where session.media_asset_id = matched_asset.id)
     or exists (select 1 from public.stream_credit_events event where event.media_asset_id = matched_asset.id) then
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
  if exists (select 1 from public.campaigns campaign where campaign.media_asset_id = matched_asset.id)
     or exists (select 1 from public.playback_sessions session where session.media_asset_id = matched_asset.id)
     or exists (select 1 from public.stream_credit_events event where event.media_asset_id = matched_asset.id) then
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

create or replace function public.prepare_media_asset_deletion(p_asset_public_id uuid)
returns text[]
language sql
security invoker
set search_path = ''
as $$
  select private.prepare_media_asset_deletion(p_asset_public_id);
$$;

create or replace function public.delete_media_asset(p_asset_public_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.delete_media_asset(p_asset_public_id);
$$;

revoke all on function private.prepare_media_asset_deletion(uuid) from public, anon, authenticated;
revoke all on function private.delete_media_asset(uuid) from public, anon, authenticated;
grant execute on function private.prepare_media_asset_deletion(uuid) to authenticated;
grant execute on function private.delete_media_asset(uuid) to authenticated;
revoke all on function public.prepare_media_asset_deletion(uuid) from public, anon;
revoke all on function public.delete_media_asset(uuid) from public, anon;
grant execute on function public.prepare_media_asset_deletion(uuid) to authenticated;
grant execute on function public.delete_media_asset(uuid) to authenticated;
