alter table public.media_assets
  add column if not exists original_filename text,
  add column if not exists mime_type text,
  add column if not exists file_size_bytes bigint,
  add column if not exists technical_metadata jsonb not null default '{}'::jsonb,
  add column if not exists submitted_at timestamptz,
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references auth.users(id) on delete set null;

alter table public.media_assets
  drop constraint if exists media_assets_filename_valid,
  add constraint media_assets_filename_valid check (original_filename is null or length(original_filename) between 1 and 255),
  drop constraint if exists media_assets_mime_type_valid,
  add constraint media_assets_mime_type_valid check (mime_type is null or mime_type = 'video/mp4'),
  drop constraint if exists media_assets_file_size_valid,
  add constraint media_assets_file_size_valid check (file_size_bytes is null or file_size_bytes between 1 and 104857600),
  drop constraint if exists media_assets_checksum_valid,
  add constraint media_assets_checksum_valid check (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'),
  drop constraint if exists media_assets_technical_metadata_object,
  add constraint media_assets_technical_metadata_object check (jsonb_typeof(technical_metadata) = 'object');

create unique index if not exists media_assets_original_storage_path_unique_idx
  on public.media_assets (original_storage_path)
  where original_storage_path is not null;

drop policy if exists media_assets_manager_insert on public.media_assets;
drop policy if exists media_assets_manager_update on public.media_assets;
revoke insert, update on public.media_assets from authenticated;

drop policy if exists media_objects_member_read on storage.objects;
drop policy if exists media_objects_manager_insert on storage.objects;
drop policy if exists media_objects_manager_update on storage.objects;

create policy media_objects_member_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'media'
    and exists (
      select 1
      from public.media_assets asset
      where asset.original_storage_path = storage.objects.name
        and (
          (select private.is_org_member(asset.organization_id))
          or (select private.is_platform_admin())
        )
    )
  );

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
        and (select private.has_org_role(asset.organization_id, array['owner', 'staff']::text[]))
    )
  );

create policy media_objects_manager_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'media'
    and exists (
      select 1 from public.media_assets asset
      where asset.original_storage_path = storage.objects.name
        and asset.moderation_status in ('draft', 'processing')
        and (select private.has_org_role(asset.organization_id, array['owner', 'staff']::text[]))
    )
  )
  with check (
    bucket_id = 'media'
    and exists (
      select 1 from public.media_assets asset
      where asset.original_storage_path = storage.objects.name
        and asset.moderation_status in ('draft', 'processing')
        and (select private.has_org_role(asset.organization_id, array['owner', 'staff']::text[]))
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
    and (select private.has_org_role(organization.id, array['owner', 'staff']::text[]));

  if not found then
    raise insufficient_privilege using message = 'Active organization media access is required';
  end if;

  generated_storage_path := organization_public_id::text || '/' || generated_asset_public_id::text || '/original.mp4';

  insert into public.media_assets (
    public_id,
    organization_id,
    name,
    original_filename,
    original_storage_path,
    mime_type,
    file_size_bytes,
    moderation_status,
    created_by
  ) values (
    generated_asset_public_id,
    p_organization_id,
    btrim(p_name),
    btrim(p_original_filename),
    generated_storage_path,
    p_mime_type,
    p_file_size_bytes,
    'draft',
    (select auth.uid())
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
    and (select private.has_org_role(asset.organization_id, array['owner', 'staff']::text[]));

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
  set moderation_status = 'in_review',
      duration_ms = p_duration_ms,
      width = p_width,
      height = p_height,
      codec = left(nullif(btrim(coalesce(p_codec, '')), ''), 80),
      checksum_sha256 = nullif(lower(btrim(coalesce(p_checksum_sha256, ''))), ''),
      technical_metadata = coalesce(p_technical_metadata, '{}'::jsonb),
      rights_declared_at = now(),
      submitted_at = now(),
      rejection_reason = null,
      moderated_at = null,
      moderated_by = null
  where id = matched_asset.id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, object_type, object_id, reason, after_summary
  ) values (
    matched_asset.organization_id,
    (select auth.uid()),
    'submit_for_review',
    'media_assets',
    p_asset_public_id::text,
    'Rights declaration accepted and media submitted for review',
    jsonb_build_object('moderation_status', 'in_review', 'duration_ms', p_duration_ms, 'width', p_width, 'height', p_height)
  );
end;
$$;

create or replace function private.moderate_media_asset(
  p_asset_public_id uuid,
  p_decision text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_asset record;
begin
  if not (select private.is_platform_admin()) then
    raise insufficient_privilege using message = 'Platform moderation access is required';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise check_violation using message = 'The moderation decision is invalid';
  end if;

  if length(btrim(coalesce(p_reason, ''))) < 5 or length(p_reason) > 500 then
    raise check_violation using message = 'A clear moderation reason is required';
  end if;

  select asset.id, asset.organization_id, asset.moderation_status
  into matched_asset
  from public.media_assets asset
  where asset.public_id = p_asset_public_id
  for update;

  if not found then
    raise no_data_found using message = 'Media asset not found';
  end if;

  if matched_asset.moderation_status <> 'in_review' then
    raise check_violation using message = 'Only submitted media can be moderated';
  end if;

  update public.media_assets
  set moderation_status = p_decision,
      rejection_reason = case when p_decision = 'rejected' then btrim(p_reason) else null end,
      moderated_at = now(),
      moderated_by = (select auth.uid())
  where id = matched_asset.id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, object_type, object_id, reason, before_summary, after_summary
  ) values (
    matched_asset.organization_id,
    (select auth.uid()),
    'moderate',
    'media_assets',
    p_asset_public_id::text,
    btrim(p_reason),
    jsonb_build_object('moderation_status', matched_asset.moderation_status),
    jsonb_build_object('moderation_status', p_decision)
  );
end;
$$;

create or replace function public.create_media_upload(
  p_organization_id bigint,
  p_name text,
  p_original_filename text,
  p_mime_type text,
  p_file_size_bytes bigint
)
returns table (asset_public_id uuid, storage_path text)
language sql
security invoker
set search_path = ''
as $$
  select * from private.create_media_upload(p_organization_id, p_name, p_original_filename, p_mime_type, p_file_size_bytes);
$$;

create or replace function public.submit_media_upload(
  p_asset_public_id uuid,
  p_duration_ms integer,
  p_width integer,
  p_height integer,
  p_codec text,
  p_checksum_sha256 text,
  p_technical_metadata jsonb
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.submit_media_upload(
    p_asset_public_id, p_duration_ms, p_width, p_height, p_codec, p_checksum_sha256, p_technical_metadata
  );
$$;

create or replace function public.moderate_media_asset(
  p_asset_public_id uuid,
  p_decision text,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.moderate_media_asset(p_asset_public_id, p_decision, p_reason);
$$;

revoke all on function private.create_media_upload(bigint, text, text, text, bigint) from public;
revoke all on function private.submit_media_upload(uuid, integer, integer, integer, text, text, jsonb) from public;
revoke all on function private.moderate_media_asset(uuid, text, text) from public;
grant execute on function private.create_media_upload(bigint, text, text, text, bigint) to authenticated;
grant execute on function private.submit_media_upload(uuid, integer, integer, integer, text, text, jsonb) to authenticated;
grant execute on function private.moderate_media_asset(uuid, text, text) to authenticated;

revoke all on function public.create_media_upload(bigint, text, text, text, bigint) from public, anon;
revoke all on function public.submit_media_upload(uuid, integer, integer, integer, text, text, jsonb) from public, anon;
revoke all on function public.moderate_media_asset(uuid, text, text) from public, anon;
grant execute on function public.create_media_upload(bigint, text, text, text, bigint) to authenticated;
grant execute on function public.submit_media_upload(uuid, integer, integer, integer, text, text, jsonb) to authenticated;
grant execute on function public.moderate_media_asset(uuid, text, text) to authenticated;
