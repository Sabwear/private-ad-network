-- Administrator-only operational monitoring for private web streams.
-- Viewer geography is deliberately coarse edge metadata; raw IP addresses are
-- never stored in stream session records.

alter table public.stream_viewer_sessions
  add column country_code text,
  add column region_code text,
  add column city text,
  add column edge_colo text,
  add constraint stream_viewer_sessions_country_valid check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  add constraint stream_viewer_sessions_region_valid check (region_code is null or length(region_code) between 1 and 12),
  add constraint stream_viewer_sessions_city_valid check (city is null or length(city) between 1 and 120),
  add constraint stream_viewer_sessions_edge_valid check (edge_colo is null or edge_colo ~ '^[A-Z0-9]{3,12}$');

create index stream_viewer_sessions_monitor_active_idx
  on public.stream_viewer_sessions (last_activity_at desc, channel_id)
  where ended_at is null;
create index stream_credit_events_created_idx
  on public.stream_credit_events (created_at desc);
create index stream_access_attempts_attempted_idx
  on public.stream_access_attempts (attempted_at desc);

create or replace function public.purge_expired_stream_viewer_data()
returns table (sessions_anonymized bigint, attempts_deleted bigint)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  anonymized_count bigint;
  deleted_count bigint;
begin
  update public.stream_viewer_sessions
  set viewer_user_id = null,
      viewer_name = null,
      viewer_email = null,
      ip_hash = null,
      user_agent = null,
      country_code = null,
      region_code = null,
      city = null,
      edge_colo = null,
      personal_data_purged_at = now(),
      ended_at = coalesce(ended_at, now())
  where retention_expires_at <= now() and personal_data_purged_at is null;
  get diagnostics anonymized_count = row_count;
  delete from public.stream_access_attempts where attempted_at < now() - interval '24 hours';
  get diagnostics deleted_count = row_count;
  return query select anonymized_count, deleted_count;
end;
$$;
revoke all on function public.purge_expired_stream_viewer_data() from public, anon, authenticated;
grant execute on function public.purge_expired_stream_viewer_data() to service_role;

create or replace function private.get_stream_monitor_snapshot(p_window_hours integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  window_hours integer := p_window_hours;
  window_start timestamptz;
  active_cutoff timestamptz := now() - interval '60 seconds';
  bucket_seconds integer;
  bucket_count integer;
  snapshot jsonb;
begin
  if not (select private.is_platform_admin()) then
    raise insufficient_privilege using message = 'Platform administrator access is required';
  end if;
  if window_hours not in (1, 6, 24, 168) then
    raise check_violation using message = 'Unsupported monitoring window';
  end if;

  window_start := now() - make_interval(hours => window_hours);
  bucket_seconds := greatest(300, ceil(window_hours * 3600.0 / 24)::integer);
  bucket_count := least(24, ceil(window_hours * 3600.0 / bucket_seconds)::integer);

  select jsonb_build_object(
    'generatedAt', now(),
    'windowHours', window_hours,
    'database', jsonb_build_object(
      'status', 'ready',
      'serverVersion', current_setting('server_version'),
      'startedAt', pg_postmaster_start_time(),
      'databaseBytes', pg_database_size(current_database()),
      'connections', (select count(*) from pg_catalog.pg_stat_activity where datname = current_database())
    ),
    'summary', jsonb_build_object(
      'activeViewers', (select count(*) from public.stream_viewer_sessions s where s.ended_at is null and s.expires_at > now() and s.last_activity_at >= active_cutoff),
      'registeredViewers', (select count(distinct s.viewer_user_id) from public.stream_viewer_sessions s where s.viewer_user_id is not null and s.created_at >= window_start),
      'sessions', (select count(*) from public.stream_viewer_sessions s where s.created_at >= window_start),
      'liveChannels', (select count(*) from public.streaming_channels c where c.status = 'active' and c.broadcast_enabled),
      'totalChannels', (select count(*) from public.streaming_channels),
      'verifiedSeconds', (select coalesce(sum(e.verified_seconds), 0) from public.stream_credit_events e where e.created_at >= window_start and e.validation_result = 'accepted'),
      'creditsSpent', (select coalesce(sum(e.consumed_credits), 0) from public.stream_credit_events e where e.created_at >= window_start),
      'creditsEarned', (select coalesce(sum(e.earned_credits), 0) from public.stream_credit_events e where e.created_at >= window_start),
      'heartbeatEvents', (select count(*) from public.stream_credit_events e where e.created_at >= window_start),
      'rejectedEvents', (select count(*) from public.stream_credit_events e where e.created_at >= window_start and e.validation_result <> 'accepted'),
      'accessFailures', (select count(*) from public.stream_access_attempts a where a.attempted_at >= window_start and not a.succeeded),
      'accessSuccesses', (select count(*) from public.stream_access_attempts a where a.attempted_at >= window_start and a.succeeded),
      'countries', (select count(distinct s.country_code) from public.stream_viewer_sessions s where s.created_at >= window_start and s.country_code is not null),
      'averageSessionSeconds', (
        select coalesce(avg(greatest(0, extract(epoch from (least(coalesce(s.ended_at, now()), s.expires_at) - s.created_at)))), 0)
        from public.stream_viewer_sessions s where s.created_at >= window_start
      )
    ),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'at', bucket.bucket_start,
        'viewerStarts', (select count(*) from public.stream_viewer_sessions s where s.created_at >= bucket.bucket_start and s.created_at < bucket.bucket_end),
        'concurrentViewers', (select count(*) from public.stream_viewer_sessions s where s.created_at < bucket.bucket_end and coalesce(s.ended_at, s.expires_at) > bucket.bucket_start),
        'verifiedSeconds', (select coalesce(sum(e.verified_seconds), 0) from public.stream_credit_events e where e.created_at >= bucket.bucket_start and e.created_at < bucket.bucket_end and e.validation_result = 'accepted'),
        'creditsSpent', (select coalesce(sum(e.consumed_credits), 0) from public.stream_credit_events e where e.created_at >= bucket.bucket_start and e.created_at < bucket.bucket_end),
        'creditsEarned', (select coalesce(sum(e.earned_credits), 0) from public.stream_credit_events e where e.created_at >= bucket.bucket_start and e.created_at < bucket.bucket_end),
        'rejectedEvents', (select count(*) from public.stream_credit_events e where e.created_at >= bucket.bucket_start and e.created_at < bucket.bucket_end and e.validation_result <> 'accepted')
      ) order by bucket.bucket_start), '[]'::jsonb)
      from (
        select window_start + make_interval(secs => series_index * bucket_seconds) as bucket_start,
          least(now(), window_start + make_interval(secs => (series_index + 1) * bucket_seconds)) as bucket_end
        from generate_series(0, bucket_count - 1) as series(series_index)
      ) bucket
    ),
    'channels', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'publicId', c.public_id,
        'accessKey', c.access_key,
        'name', c.name,
        'status', c.status,
        'broadcastEnabled', c.broadcast_enabled,
        'broadcastStartedAt', c.broadcast_started_at,
        'uptimeSeconds', case when c.status = 'active' and c.broadcast_enabled then greatest(0, extract(epoch from (now() - c.broadcast_started_at))) else 0 end,
        'activeItems', (select count(*) from public.streaming_channel_items i where i.channel_id = c.id and i.status = 'active'),
        'businesses', (select coalesce(jsonb_agg(o.display_name order by o.display_name), '[]'::jsonb) from public.streaming_channel_organizations assignment join public.organizations o on o.id = assignment.organization_id where assignment.channel_id = c.id),
        'activeViewers', (select count(*) from public.stream_viewer_sessions s where s.channel_id = c.id and s.ended_at is null and s.expires_at > now() and s.last_activity_at >= active_cutoff),
        'sessions', (select count(*) from public.stream_viewer_sessions s where s.channel_id = c.id and s.created_at >= window_start),
        'verifiedSeconds', (select coalesce(sum(e.verified_seconds), 0) from public.stream_credit_events e join public.stream_viewer_sessions s on s.id = e.viewer_session_id where s.channel_id = c.id and e.created_at >= window_start and e.validation_result = 'accepted'),
        'creditsSpent', (select coalesce(sum(e.consumed_credits), 0) from public.stream_credit_events e join public.stream_viewer_sessions s on s.id = e.viewer_session_id where s.channel_id = c.id and e.created_at >= window_start),
        'creditsEarned', (select coalesce(sum(e.earned_credits), 0) from public.stream_credit_events e join public.stream_viewer_sessions s on s.id = e.viewer_session_id where s.channel_id = c.id and e.created_at >= window_start),
        'rejectedEvents', (select count(*) from public.stream_credit_events e join public.stream_viewer_sessions s on s.id = e.viewer_session_id where s.channel_id = c.id and e.created_at >= window_start and e.validation_result <> 'accepted')
      ) order by c.name), '[]'::jsonb)
      from public.streaming_channels c
    ),
    'locations', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'countryCode', location.country_code,
        'regionCode', location.region_code,
        'city', location.city,
        'sessions', location.sessions,
        'activeViewers', location.active_viewers
      ) order by location.sessions desc, location.country_code), '[]'::jsonb)
      from (
        select coalesce(s.country_code, 'Unknown') as country_code,
          coalesce(s.region_code, '') as region_code,
          coalesce(s.city, '') as city,
          count(*) as sessions,
          count(*) filter (where s.ended_at is null and s.expires_at > now() and s.last_activity_at >= active_cutoff) as active_viewers
        from public.stream_viewer_sessions s
        where s.created_at >= window_start or (s.ended_at is null and s.expires_at > now())
        group by coalesce(s.country_code, 'Unknown'), coalesce(s.region_code, ''), coalesce(s.city, '')
        order by count(*) desc
        limit 100
      ) location
    ),
    'viewers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', recent.id,
        'channelId', recent.channel_id,
        'channel', channel.name,
        'mode', recent.viewer_mode,
        'name', case when recent.personal_data_purged_at is not null then 'Identity purged' when recent.viewer_mode = 'registered' then coalesce(recent.viewer_name, 'Registered viewer') else 'Anonymous viewer' end,
        'email', case when recent.personal_data_purged_at is not null then null else recent.viewer_email end,
        'countryCode', recent.country_code,
        'regionCode', recent.region_code,
        'city', recent.city,
        'edgeColo', recent.edge_colo,
        'userAgent', recent.user_agent,
        'startedAt', recent.created_at,
        'lastActivityAt', recent.last_activity_at,
        'endedAt', recent.ended_at,
        'expiresAt', recent.expires_at,
        'active', recent.ended_at is null and recent.expires_at > now() and recent.last_activity_at >= active_cutoff,
        'uptimeSeconds', greatest(0, extract(epoch from (least(coalesce(recent.ended_at, now()), recent.expires_at) - recent.created_at))),
        'verifiedSeconds', coalesce(credit.verified_seconds, 0),
        'creditsSpent', coalesce(credit.credits_spent, 0),
        'creditsEarned', coalesce(credit.credits_earned, 0),
        'rejectedEvents', coalesce(credit.rejected_events, 0)
      ) order by recent.last_activity_at desc), '[]'::jsonb)
      from (
        select s.* from public.stream_viewer_sessions s
        where s.created_at >= window_start or (s.ended_at is null and s.expires_at > now())
        order by s.last_activity_at desc limit 100
      ) recent
      join public.streaming_channels channel on channel.id = recent.channel_id
      left join lateral (
        select sum(e.verified_seconds) filter (where e.validation_result = 'accepted') as verified_seconds,
          sum(e.consumed_credits) as credits_spent,
          sum(e.earned_credits) as credits_earned,
          count(*) filter (where e.validation_result <> 'accepted') as rejected_events
        from public.stream_credit_events e where e.viewer_session_id = recent.id
      ) credit on true
    ),
    'failures', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', failure.id,
        'createdAt', failure.created_at,
        'result', failure.validation_result,
        'reasons', failure.reason_codes,
        'channel', channel.name,
        'asset', asset.name,
        'viewerSessionId', failure.viewer_session_id,
        'countryCode', session.country_code,
        'city', session.city
      ) order by failure.created_at desc), '[]'::jsonb)
      from (
        select e.* from public.stream_credit_events e
        where e.created_at >= window_start and e.validation_result <> 'accepted'
        order by e.created_at desc limit 30
      ) failure
      join public.stream_viewer_sessions session on session.id = failure.viewer_session_id
      join public.streaming_channels channel on channel.id = session.channel_id
      join public.media_assets asset on asset.id = failure.media_asset_id
    )
  ) into snapshot;

  return snapshot;
end;
$$;

create or replace function public.get_stream_monitor_snapshot(p_window_hours integer)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_stream_monitor_snapshot(p_window_hours); $$;

create or replace function private.admin_handle_stream_channel(
  p_channel_id bigint,
  p_action text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_record jsonb;
  after_record jsonb;
  target_organization_id bigint;
begin
  if not (select private.is_platform_admin()) then
    raise insufficient_privilege using message = 'Platform administrator access is required';
  end if;
  if p_action is null or p_action not in ('pause', 'resume', 'restart') then
    raise check_violation using message = 'Unsupported channel action';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 or length(p_reason) > 300 then
    raise check_violation using message = 'An operational reason is required';
  end if;

  select to_jsonb(channel) into before_record
  from public.streaming_channels channel where channel.id = p_channel_id for update;
  if before_record is null then raise no_data_found using message = 'Channel not found'; end if;

  if p_action = 'pause' then
    update public.streaming_channels set status = 'paused', broadcast_enabled = false where id = p_channel_id;
    update public.stream_viewer_sessions set ended_at = coalesce(ended_at, now()) where channel_id = p_channel_id and ended_at is null;
  elsif p_action = 'resume' then
    update public.streaming_channels set status = 'active', broadcast_enabled = true where id = p_channel_id;
  else
    update public.streaming_channels set broadcast_started_at = statement_timestamp() where id = p_channel_id;
  end if;

  select to_jsonb(channel) into after_record from public.streaming_channels channel where channel.id = p_channel_id;
  select assignment.organization_id into target_organization_id
  from public.streaming_channel_organizations assignment where assignment.channel_id = p_channel_id order by assignment.organization_id limit 1;
  insert into public.audit_logs (organization_id, actor_user_id, action, object_type, object_id, reason, before_summary, after_summary)
  values (target_organization_id, (select auth.uid()), 'stream_' || p_action, 'streaming_channels', p_channel_id::text, btrim(p_reason), before_record, after_record);
end;
$$;

create or replace function public.admin_handle_stream_channel(p_channel_id bigint, p_action text, p_reason text)
returns void language sql security invoker set search_path = ''
as $$ select private.admin_handle_stream_channel(p_channel_id, p_action, p_reason); $$;

create or replace function private.admin_end_stream_viewer_session(p_session_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_session public.stream_viewer_sessions%rowtype;
  actual_ended_at timestamptz;
begin
  if not (select private.is_platform_admin()) then
    raise insufficient_privilege using message = 'Platform administrator access is required';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 or length(p_reason) > 300 then
    raise check_violation using message = 'An operational reason is required';
  end if;
  select * into target_session from public.stream_viewer_sessions where id = p_session_id for update;
  if target_session.id is null then raise no_data_found using message = 'Viewer session not found'; end if;
  update public.stream_viewer_sessions set ended_at = coalesce(ended_at, now()) where id = p_session_id returning ended_at into actual_ended_at;
  insert into public.audit_logs (organization_id, actor_user_id, action, object_type, object_id, reason, before_summary, after_summary)
  values (target_session.host_organization_id, (select auth.uid()), 'stream_session_ended', 'stream_viewer_sessions', p_session_id::text, btrim(p_reason),
    jsonb_build_object('endedAt', target_session.ended_at, 'lastActivityAt', target_session.last_activity_at),
    jsonb_build_object('endedAt', actual_ended_at));
end;
$$;

create or replace function public.admin_end_stream_viewer_session(p_session_id uuid, p_reason text)
returns void language sql security invoker set search_path = ''
as $$ select private.admin_end_stream_viewer_session(p_session_id, p_reason); $$;

revoke all on function private.get_stream_monitor_snapshot(integer) from public, anon;
revoke all on function public.get_stream_monitor_snapshot(integer) from public, anon;
revoke all on function private.admin_handle_stream_channel(bigint, text, text) from public, anon;
revoke all on function public.admin_handle_stream_channel(bigint, text, text) from public, anon;
revoke all on function private.admin_end_stream_viewer_session(uuid, text) from public, anon;
revoke all on function public.admin_end_stream_viewer_session(uuid, text) from public, anon;
grant execute on function private.get_stream_monitor_snapshot(integer) to authenticated;
grant execute on function public.get_stream_monitor_snapshot(integer) to authenticated;
grant execute on function private.admin_handle_stream_channel(bigint, text, text) to authenticated;
grant execute on function public.admin_handle_stream_channel(bigint, text, text) to authenticated;
grant execute on function private.admin_end_stream_viewer_session(uuid, text) to authenticated;
grant execute on function public.admin_end_stream_viewer_session(uuid, text) to authenticated;
