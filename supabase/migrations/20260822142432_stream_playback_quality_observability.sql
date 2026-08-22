create table public.stream_quality_events (
  id bigint generated always as identity primary key,
  event_key uuid not null unique,
  viewer_session_id uuid not null references public.stream_viewer_sessions(id) on delete cascade,
  channel_id bigint not null references public.streaming_channels(id) on delete cascade,
  media_public_id uuid not null,
  playback_type text not null check (playback_type in ('upload', 'youtube')),
  observed_interval_ms integer not null check (observed_interval_ms between 0 and 60000),
  startup_ms integer check (startup_ms between 0 and 120000),
  buffer_count integer not null default 0 check (buffer_count between 0 and 1000),
  buffer_duration_ms integer not null default 0 check (buffer_duration_ms between 0 and 60000),
  heartbeat_rtt_ms integer check (heartbeat_rtt_ms between 0 and 120000),
  connection_rtt_ms integer check (connection_rtt_ms between 0 and 120000),
  downlink_mbps numeric(10,3) check (downlink_mbps between 0 and 100000),
  effective_connection_type text check (effective_connection_type in ('slow-2g', '2g', '3g', '4g')),
  dropped_frames integer check (dropped_frames between 0 and 2147483647),
  total_frames integer check (total_frames between 0 and 2147483647),
  created_at timestamptz not null default now(),
  check (total_frames is null or dropped_frames is null or dropped_frames <= total_frames)
);

create index stream_quality_events_recent_channel_idx
  on public.stream_quality_events (created_at desc, channel_id);
create index stream_quality_events_session_idx
  on public.stream_quality_events (viewer_session_id, created_at desc);

alter table public.stream_quality_events enable row level security;

revoke all on table public.stream_quality_events from public, anon, authenticated;
revoke all on sequence public.stream_quality_events_id_seq from public, anon, authenticated;
grant select, insert on table public.stream_quality_events to service_role;
grant usage, select on sequence public.stream_quality_events_id_seq to service_role;

comment on table public.stream_quality_events is
  'Server-ingested, privacy-limited browser playback quality observations used for administrator operations diagnostics.';

create or replace function public.get_stream_quality_snapshot(p_window_hours integer default 1)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  window_start timestamptz := now() - make_interval(hours => least(168, greatest(1, coalesce(p_window_hours, 1))));
begin
  if not (select private.is_platform_admin()) then
    raise insufficient_privilege using message = 'Platform administrator access is required';
  end if;

  return jsonb_build_object(
    'generatedAt', now(),
    'summary', (
      select jsonb_build_object(
        'samples', count(*),
        'averageStartupMs', coalesce(avg(event.startup_ms) filter (where event.startup_ms is not null), 0),
        'averageHeartbeatRttMs', coalesce(avg(event.heartbeat_rtt_ms) filter (where event.heartbeat_rtt_ms is not null), 0),
        'bufferEvents', coalesce(sum(event.buffer_count), 0),
        'bufferDurationMs', coalesce(sum(event.buffer_duration_ms), 0),
        'observedDurationMs', coalesce(sum(event.observed_interval_ms), 0),
        'affectedSessions', count(distinct event.viewer_session_id) filter (where event.buffer_count > 0 or event.buffer_duration_ms >= 1000),
        'slowStarts', count(*) filter (where event.startup_ms > 5000),
        'droppedFrames', coalesce(sum(event.dropped_frames), 0),
        'totalFrames', coalesce(sum(event.total_frames), 0)
      )
      from public.stream_quality_events event
      where event.created_at >= window_start
    ),
    'channels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'channelId', grouped.channel_id,
        'channel', grouped.channel,
        'samples', grouped.samples,
        'averageStartupMs', grouped.average_startup_ms,
        'averageHeartbeatRttMs', grouped.average_heartbeat_rtt_ms,
        'bufferEvents', grouped.buffer_events,
        'bufferDurationMs', grouped.buffer_duration_ms,
        'observedDurationMs', grouped.observed_duration_ms,
        'affectedSessions', grouped.affected_sessions,
        'droppedFrames', grouped.dropped_frames,
        'totalFrames', grouped.total_frames,
        'lastObservedAt', grouped.last_observed_at
      ) order by grouped.channel)
      from (
        select event.channel_id, channel.name as channel, count(*) as samples,
          coalesce(avg(event.startup_ms) filter (where event.startup_ms is not null), 0) as average_startup_ms,
          coalesce(avg(event.heartbeat_rtt_ms) filter (where event.heartbeat_rtt_ms is not null), 0) as average_heartbeat_rtt_ms,
          coalesce(sum(event.buffer_count), 0) as buffer_events,
          coalesce(sum(event.buffer_duration_ms), 0) as buffer_duration_ms,
          coalesce(sum(event.observed_interval_ms), 0) as observed_duration_ms,
          count(distinct event.viewer_session_id) filter (where event.buffer_count > 0 or event.buffer_duration_ms >= 1000) as affected_sessions,
          coalesce(sum(event.dropped_frames), 0) as dropped_frames,
          coalesce(sum(event.total_frames), 0) as total_frames,
          max(event.created_at) as last_observed_at
        from public.stream_quality_events event
        join public.streaming_channels channel on channel.id = event.channel_id
        where event.created_at >= window_start
        group by event.channel_id, channel.name
      ) grouped
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_stream_quality_snapshot(integer) from public, anon;
grant execute on function public.get_stream_quality_snapshot(integer) to authenticated;
