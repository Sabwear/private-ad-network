-- Multi-channel streaming foundation. The initial release seeds one channel,
-- while the schema and administrator controls support additional channels.

alter table public.media_assets
  add column hls_master_storage_path text,
  add column hls_renditions jsonb not null default '[]'::jsonb,
  add constraint media_assets_hls_renditions_array
    check (jsonb_typeof(hls_renditions) = 'array');

create or replace function private.complete_media_processing_job_v2(
  p_job_public_id uuid,
  p_worker_id text,
  p_normalized_storage_path text,
  p_thumbnail_storage_path text,
  p_hls_master_storage_path text,
  p_hls_renditions jsonb,
  p_normalized_file_size_bytes bigint,
  p_duration_ms integer,
  p_width integer,
  p_height integer,
  p_codec text,
  p_processing_metadata jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_asset_id bigint;
begin
  if length(btrim(coalesce(p_hls_master_storage_path, ''))) < 3
     or jsonb_typeof(coalesce(p_hls_renditions, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_hls_renditions, '[]'::jsonb)) < 1 then
    raise check_violation using message = 'Adaptive streaming output is required';
  end if;

  select job.media_asset_id into target_asset_id
  from public.media_processing_jobs job
  where job.public_id = p_job_public_id
    and job.status = 'processing'
    and job.locked_by = btrim(p_worker_id);

  if target_asset_id is null then
    raise insufficient_privilege using message = 'The processing job is not owned by this worker';
  end if;

  perform private.complete_media_processing_job(
    p_job_public_id,
    p_worker_id,
    p_normalized_storage_path,
    p_thumbnail_storage_path,
    p_normalized_file_size_bytes,
    p_duration_ms,
    p_width,
    p_height,
    p_codec,
    p_processing_metadata || jsonb_build_object('adaptiveStreaming', true)
  );

  update public.media_assets
  set hls_master_storage_path = btrim(p_hls_master_storage_path),
      hls_renditions = p_hls_renditions
  where id = target_asset_id;
end;
$$;

create or replace function public.complete_media_processing_job_v2(
  p_job_public_id uuid,
  p_worker_id text,
  p_normalized_storage_path text,
  p_thumbnail_storage_path text,
  p_hls_master_storage_path text,
  p_hls_renditions jsonb,
  p_normalized_file_size_bytes bigint,
  p_duration_ms integer,
  p_width integer,
  p_height integer,
  p_codec text,
  p_processing_metadata jsonb
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.complete_media_processing_job_v2(
    p_job_public_id,
    p_worker_id,
    p_normalized_storage_path,
    p_thumbnail_storage_path,
    p_hls_master_storage_path,
    p_hls_renditions,
    p_normalized_file_size_bytes,
    p_duration_ms,
    p_width,
    p_height,
    p_codec,
    p_processing_metadata
  );
$$;

revoke all on function private.complete_media_processing_job_v2(uuid, text, text, text, text, jsonb, bigint, integer, integer, integer, text, jsonb) from public;
revoke all on function public.complete_media_processing_job_v2(uuid, text, text, text, text, jsonb, bigint, integer, integer, integer, text, jsonb) from public, anon, authenticated;
grant execute on function private.complete_media_processing_job_v2(uuid, text, text, text, text, jsonb, bigint, integer, integer, integer, text, jsonb) to service_role;
grant execute on function public.complete_media_processing_job_v2(uuid, text, text, text, text, jsonb, bigint, integer, integer, integer, text, jsonb) to service_role;

create table public.streaming_channels (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  access_key uuid not null default gen_random_uuid() unique,
  name text not null,
  slug text not null unique,
  description text,
  status text not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint streaming_channels_name_not_blank check (length(btrim(name)) between 2 and 120),
  constraint streaming_channels_slug_valid check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint streaming_channels_status_valid check (status in ('draft', 'active', 'paused'))
);

create table public.streaming_channel_organizations (
  channel_id bigint not null references public.streaming_channels(id) on delete cascade,
  organization_id bigint not null references public.organizations(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (channel_id, organization_id)
);

create table public.streaming_channel_items (
  id bigint generated always as identity primary key,
  channel_id bigint not null references public.streaming_channels(id) on delete cascade,
  media_asset_id bigint not null references public.media_assets(id) on delete cascade,
  position integer not null,
  status text not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint streaming_channel_items_position_positive check (position > 0),
  constraint streaming_channel_items_status_valid check (status in ('active', 'disabled')),
  constraint streaming_channel_items_unique_asset unique (channel_id, media_asset_id),
  constraint streaming_channel_items_unique_position unique (channel_id, position)
);

create index streaming_channel_organizations_organization_idx
  on public.streaming_channel_organizations (organization_id, channel_id);
create index streaming_channel_items_media_asset_idx
  on public.streaming_channel_items (media_asset_id);
create index streaming_channel_items_active_order_idx
  on public.streaming_channel_items (channel_id, position)
  where status = 'active';

create trigger streaming_channels_set_updated_at before update on public.streaming_channels
  for each row execute function private.set_updated_at();
create trigger streaming_channel_items_set_updated_at before update on public.streaming_channel_items
  for each row execute function private.set_updated_at();

-- Only ready, approved media may be activated in a channel.
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
      and asset.normalized_storage_path is not null
  ) then
    raise check_violation using message = 'Only approved, processed media can be added to a streaming channel';
  end if;
  return new;
end;
$$;

create trigger streaming_channel_items_require_ready
  before insert or update of media_asset_id, status on public.streaming_channel_items
  for each row execute function private.enforce_streaming_channel_item_ready();

alter table public.streaming_channels enable row level security;
alter table public.streaming_channel_organizations enable row level security;
alter table public.streaming_channel_items enable row level security;

create policy streaming_channels_admin_all on public.streaming_channels
  for all to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));
create policy streaming_channels_assigned_business_read on public.streaming_channels
  for select to authenticated
  using (
    exists (
      select 1
      from public.streaming_channel_organizations assignment
      where assignment.channel_id = streaming_channels.id
        and (select private.is_org_member(assignment.organization_id))
    )
  );

create policy streaming_channel_organizations_admin_all on public.streaming_channel_organizations
  for all to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));
create policy streaming_channel_organizations_member_read on public.streaming_channel_organizations
  for select to authenticated
  using ((select private.is_org_member(organization_id)));

create policy streaming_channel_items_admin_all on public.streaming_channel_items
  for all to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));
create policy streaming_channel_items_assigned_business_read on public.streaming_channel_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.streaming_channel_organizations assignment
      where assignment.channel_id = streaming_channel_items.channel_id
        and (select private.is_org_member(assignment.organization_id))
    )
  );

revoke all on public.streaming_channels, public.streaming_channel_organizations,
  public.streaming_channel_items from anon;
grant select, insert, update, delete on public.streaming_channels,
  public.streaming_channel_organizations, public.streaming_channel_items to authenticated;
grant usage, select on sequence public.streaming_channels_id_seq,
  public.streaming_channel_items_id_seq to authenticated;

revoke all on function private.enforce_streaming_channel_item_ready() from public;

-- HLS playlists and segments live below the versioned processed asset folder.
update storage.buckets
set allowed_mime_types = array[
  'video/mp4', 'image/jpeg', 'image/png',
  'application/vnd.apple.mpegurl', 'application/x-mpegURL', 'video/mp2t'
]
where id = 'media';

drop policy if exists media_objects_member_read on storage.objects;
create policy media_objects_member_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'media'
    and exists (
      select 1
      from public.media_assets asset
      where (
        storage.objects.name = asset.original_storage_path
        or storage.objects.name = asset.normalized_storage_path
        or storage.objects.name = asset.thumbnail_storage_path
        or (
          asset.hls_master_storage_path is not null
          and storage.objects.name like replace(asset.hls_master_storage_path, 'master.m3u8', '') || '%'
        )
      )
      and (
        (select private.is_org_member(asset.organization_id))
        or (select private.is_platform_admin())
      )
    )
  );

insert into public.streaming_channels (name, slug, description, status)
values (
  'Primary Network Channel',
  'primary-network',
  'The first managed advertising stream for assigned business locations.',
  'active'
)
on conflict (slug) do nothing;
