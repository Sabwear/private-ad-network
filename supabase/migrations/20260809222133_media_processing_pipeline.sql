alter table public.media_assets
  add column if not exists processing_status text not null default 'pending',
  add column if not exists processing_error text,
  add column if not exists processing_completed_at timestamptz,
  add column if not exists normalized_file_size_bytes bigint;

alter table public.media_assets
  drop constraint if exists media_assets_processing_status_valid,
  add constraint media_assets_processing_status_valid
    check (processing_status in ('pending', 'queued', 'processing', 'ready', 'failed')),
  drop constraint if exists media_assets_processing_error_valid,
  add constraint media_assets_processing_error_valid
    check (processing_error is null or length(processing_error) between 1 and 1000),
  drop constraint if exists media_assets_normalized_file_size_valid,
  add constraint media_assets_normalized_file_size_valid
    check (normalized_file_size_bytes is null or normalized_file_size_bytes > 0);

update public.media_assets
set processing_status = case
  when normalized_storage_path is not null then 'ready'
  when moderation_status = 'in_review' and checksum_sha256 is not null then 'queued'
  else 'pending'
end;

create index if not exists media_assets_processing_queue_idx
  on public.media_assets (updated_at)
  where processing_status in ('queued', 'processing', 'failed');

create table if not exists public.media_processing_jobs (
  id bigint generated always as identity primary key,
  public_id uuid not null default extensions.gen_random_uuid() unique,
  media_asset_id bigint not null references public.media_assets(id) on delete cascade,
  source_checksum_sha256 text not null,
  status text not null default 'queued',
  attempts smallint not null default 0,
  max_attempts smallint not null default 3,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_processing_jobs_asset_checksum_unique unique (media_asset_id, source_checksum_sha256),
  constraint media_processing_jobs_checksum_valid check (source_checksum_sha256 ~ '^[a-f0-9]{64}$'),
  constraint media_processing_jobs_status_valid check (status in ('queued', 'processing', 'succeeded', 'failed')),
  constraint media_processing_jobs_attempts_valid check (attempts between 0 and max_attempts and max_attempts between 1 and 10),
  constraint media_processing_jobs_locked_by_valid check (locked_by is null or length(locked_by) between 1 and 160),
  constraint media_processing_jobs_error_valid check (last_error is null or length(last_error) between 1 and 1000)
);

create index if not exists media_processing_jobs_claim_idx
  on public.media_processing_jobs (available_at, created_at)
  where status = 'queued';

create index if not exists media_processing_jobs_stale_idx
  on public.media_processing_jobs (locked_at)
  where status = 'processing';

drop trigger if exists media_processing_jobs_set_updated_at on public.media_processing_jobs;
create trigger media_processing_jobs_set_updated_at
  before update on public.media_processing_jobs
  for each row execute function private.set_updated_at();

alter table public.media_processing_jobs enable row level security;
revoke all on public.media_processing_jobs from public, anon, authenticated;
grant select, insert, update on public.media_processing_jobs to service_role;
grant usage, select on sequence public.media_processing_jobs_id_seq to service_role;

create or replace function private.enqueue_media_processing_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.moderation_status = 'in_review'
     and new.checksum_sha256 is not null
     and (
       old.moderation_status is distinct from new.moderation_status
       or old.checksum_sha256 is distinct from new.checksum_sha256
     ) then
    new.processing_status := 'queued';
    new.processing_error := null;
    new.processing_completed_at := null;

    insert into public.media_processing_jobs (
      media_asset_id,
      source_checksum_sha256,
      status,
      attempts,
      available_at,
      locked_at,
      locked_by,
      last_error,
      started_at,
      completed_at
    ) values (
      new.id,
      new.checksum_sha256,
      'queued',
      0,
      now(),
      null,
      null,
      null,
      null,
      null
    )
    on conflict (media_asset_id, source_checksum_sha256)
    do update set
      status = 'queued',
      attempts = 0,
      available_at = now(),
      locked_at = null,
      locked_by = null,
      last_error = null,
      started_at = null,
      completed_at = null;
  end if;

  return new;
end;
$$;

drop trigger if exists media_assets_enqueue_processing on public.media_assets;
create trigger media_assets_enqueue_processing
  before update of moderation_status, checksum_sha256 on public.media_assets
  for each row execute function private.enqueue_media_processing_job();

create or replace function private.enforce_media_approval_ready()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.moderation_status = 'approved' and new.processing_status <> 'ready' then
    raise check_violation using message = 'Media processing must complete before approval';
  end if;
  return new;
end;
$$;

drop trigger if exists media_assets_enforce_approval_ready on public.media_assets;
create trigger media_assets_enforce_approval_ready
  before update of moderation_status on public.media_assets
  for each row execute function private.enforce_media_approval_ready();

insert into public.media_processing_jobs (media_asset_id, source_checksum_sha256)
select asset.id, asset.checksum_sha256
from public.media_assets asset
where asset.moderation_status = 'in_review'
  and asset.checksum_sha256 is not null
  and asset.normalized_storage_path is null
on conflict (media_asset_id, source_checksum_sha256) do nothing;

create or replace function private.claim_media_processing_job(p_worker_id text)
returns table (
  job_public_id uuid,
  asset_public_id uuid,
  organization_public_id uuid,
  original_storage_path text,
  source_checksum_sha256 text,
  expected_duration_ms integer,
  expected_width integer,
  expected_height integer,
  attempt smallint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_job_id bigint;
begin
  if length(btrim(coalesce(p_worker_id, ''))) < 3 or length(p_worker_id) > 160 then
    raise check_violation using message = 'A valid worker identifier is required';
  end if;

  with exhausted as (
    update public.media_processing_jobs job
    set status = 'failed',
        completed_at = now(),
        locked_at = null,
        locked_by = null,
        last_error = coalesce(job.last_error, 'Worker lease expired after the final processing attempt')
    where job.status = 'processing'
      and job.locked_at < now() - interval '30 minutes'
      and job.attempts >= job.max_attempts
    returning job.media_asset_id, job.last_error
  )
  update public.media_assets asset
  set processing_status = 'failed',
      processing_error = coalesce(exhausted.last_error, 'Worker lease expired after the final processing attempt'),
      processing_completed_at = now()
  from exhausted
  where asset.id = exhausted.media_asset_id;

  select job.id
  into selected_job_id
  from public.media_processing_jobs job
  where job.attempts < job.max_attempts
    and (
      (job.status = 'queued' and job.available_at <= now())
      or (job.status = 'processing' and job.locked_at < now() - interval '30 minutes')
    )
  order by job.available_at, job.created_at
  limit 1
  for update skip locked;

  if selected_job_id is null then
    return;
  end if;

  update public.media_processing_jobs job
  set status = 'processing',
      attempts = job.attempts + 1,
      locked_at = now(),
      locked_by = btrim(p_worker_id),
      last_error = null,
      started_at = coalesce(job.started_at, now())
  where job.id = selected_job_id;

  update public.media_assets asset
  set processing_status = 'processing', processing_error = null
  from public.media_processing_jobs job
  where job.id = selected_job_id and asset.id = job.media_asset_id;

  return query
  select
    job.public_id,
    asset.public_id,
    organization.public_id,
    asset.original_storage_path,
    job.source_checksum_sha256,
    asset.duration_ms,
    asset.width,
    asset.height,
    job.attempts
  from public.media_processing_jobs job
  join public.media_assets asset on asset.id = job.media_asset_id
  join public.organizations organization on organization.id = asset.organization_id
  where job.id = selected_job_id;
end;
$$;

create or replace function private.complete_media_processing_job(
  p_job_public_id uuid,
  p_worker_id text,
  p_normalized_storage_path text,
  p_thumbnail_storage_path text,
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
  matched_job record;
begin
  if length(btrim(coalesce(p_normalized_storage_path, ''))) < 3
     or length(btrim(coalesce(p_thumbnail_storage_path, ''))) < 3 then
    raise check_violation using message = 'Processed media paths are required';
  end if;

  if p_normalized_file_size_bytes < 1 or p_duration_ms < 1000
     or p_width < 1 or p_height < 1 then
    raise check_violation using message = 'Processed media metadata is invalid';
  end if;

  if jsonb_typeof(coalesce(p_processing_metadata, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_processing_metadata, '{}'::jsonb)::text) > 65536 then
    raise check_violation using message = 'Processing metadata is invalid';
  end if;

  select job.id, job.media_asset_id, asset.organization_id, asset.public_id as asset_public_id
  into matched_job
  from public.media_processing_jobs job
  join public.media_assets asset on asset.id = job.media_asset_id
  where job.public_id = p_job_public_id
    and job.status = 'processing'
    and job.locked_by = btrim(p_worker_id)
  for update of job;

  if not found then
    raise insufficient_privilege using message = 'The processing job is not owned by this worker';
  end if;

  update public.media_assets
  set normalized_storage_path = btrim(p_normalized_storage_path),
      thumbnail_storage_path = btrim(p_thumbnail_storage_path),
      normalized_file_size_bytes = p_normalized_file_size_bytes,
      duration_ms = p_duration_ms,
      width = p_width,
      height = p_height,
      codec = left(btrim(coalesce(p_codec, 'H.264 / AAC')), 80),
      processing_status = 'ready',
      processing_error = null,
      processing_completed_at = now(),
      technical_metadata = technical_metadata || jsonb_build_object('processor', coalesce(p_processing_metadata, '{}'::jsonb))
  where id = matched_job.media_asset_id;

  update public.media_processing_jobs
  set status = 'succeeded',
      completed_at = now(),
      locked_at = null,
      locked_by = null,
      last_error = null
  where id = matched_job.id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, object_type, object_id, reason, after_summary
  ) values (
    matched_job.organization_id,
    null,
    'process_media',
    'media_assets',
    matched_job.asset_public_id::text,
    'Media validation and normalization completed',
    jsonb_build_object('processing_status', 'ready', 'normalized_storage_path', p_normalized_storage_path)
  );
end;
$$;

create or replace function private.fail_media_processing_job(
  p_job_public_id uuid,
  p_worker_id text,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_job record;
  should_retry boolean;
  safe_error text := left(btrim(coalesce(p_error, 'Media processing failed')), 1000);
begin
  select job.id, job.media_asset_id, job.attempts, job.max_attempts
  into matched_job
  from public.media_processing_jobs job
  where job.public_id = p_job_public_id
    and job.status = 'processing'
    and job.locked_by = btrim(p_worker_id)
  for update;

  if not found then
    raise insufficient_privilege using message = 'The processing job is not owned by this worker';
  end if;

  should_retry := matched_job.attempts < matched_job.max_attempts;

  update public.media_processing_jobs
  set status = case when should_retry then 'queued' else 'failed' end,
      available_at = case
        when should_retry then now() + make_interval(secs => least(900, (30 * power(2, greatest(matched_job.attempts - 1, 0)))::integer))
        else available_at
      end,
      locked_at = null,
      locked_by = null,
      last_error = safe_error,
      completed_at = case when should_retry then null else now() end
  where id = matched_job.id;

  update public.media_assets
  set processing_status = case when should_retry then 'queued' else 'failed' end,
      processing_error = safe_error,
      processing_completed_at = case when should_retry then null else now() end
  where id = matched_job.media_asset_id;

  return should_retry;
end;
$$;

create or replace function public.claim_media_processing_job(p_worker_id text)
returns table (
  job_public_id uuid,
  asset_public_id uuid,
  organization_public_id uuid,
  original_storage_path text,
  source_checksum_sha256 text,
  expected_duration_ms integer,
  expected_width integer,
  expected_height integer,
  attempt smallint
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.claim_media_processing_job(p_worker_id);
$$;

create or replace function public.complete_media_processing_job(
  p_job_public_id uuid,
  p_worker_id text,
  p_normalized_storage_path text,
  p_thumbnail_storage_path text,
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
  select private.complete_media_processing_job(
    p_job_public_id,
    p_worker_id,
    p_normalized_storage_path,
    p_thumbnail_storage_path,
    p_normalized_file_size_bytes,
    p_duration_ms,
    p_width,
    p_height,
    p_codec,
    p_processing_metadata
  );
$$;

create or replace function public.fail_media_processing_job(
  p_job_public_id uuid,
  p_worker_id text,
  p_error text
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.fail_media_processing_job(p_job_public_id, p_worker_id, p_error);
$$;

revoke all on function private.enqueue_media_processing_job() from public;
revoke all on function private.enforce_media_approval_ready() from public;
revoke all on function private.claim_media_processing_job(text) from public;
revoke all on function private.complete_media_processing_job(uuid, text, text, text, bigint, integer, integer, integer, text, jsonb) from public;
revoke all on function private.fail_media_processing_job(uuid, text, text) from public;

revoke all on function public.claim_media_processing_job(text) from public, anon, authenticated;
revoke all on function public.complete_media_processing_job(uuid, text, text, text, bigint, integer, integer, integer, text, jsonb) from public, anon, authenticated;
revoke all on function public.fail_media_processing_job(uuid, text, text) from public, anon, authenticated;

grant execute on function public.claim_media_processing_job(text) to service_role;
grant execute on function public.complete_media_processing_job(uuid, text, text, text, bigint, integer, integer, integer, text, jsonb) to service_role;
grant execute on function public.fail_media_processing_job(uuid, text, text) to service_role;
grant usage on schema private to service_role;
grant execute on function private.claim_media_processing_job(text) to service_role;
grant execute on function private.complete_media_processing_job(uuid, text, text, text, bigint, integer, integer, integer, text, jsonb) to service_role;
grant execute on function private.fail_media_processing_job(uuid, text, text) to service_role;

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
      )
      and (
        (select private.is_org_member(asset.organization_id))
        or (select private.is_platform_admin())
      )
    )
  );
