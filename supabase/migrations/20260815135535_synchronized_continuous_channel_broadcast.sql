-- Give every active channel a persistent server-clock broadcast timeline.
-- Viewers join the current point in the loop instead of restarting at item one.

alter table public.streaming_channels
  add column broadcast_enabled boolean not null default true,
  add column broadcast_started_at timestamptz not null default now();

create or replace function private.set_channel_broadcast_clock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.broadcast_enabled
    and (
      not old.broadcast_enabled
      or (old.status is distinct from 'active' and new.status = 'active')
    ) then
    new.broadcast_started_at = statement_timestamp();
  end if;
  return new;
end;
$$;

create trigger streaming_channels_set_broadcast_clock
  before update of broadcast_enabled, status on public.streaming_channels
  for each row execute function private.set_channel_broadcast_clock();

create or replace function private.restart_channel_broadcast_after_playlist_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_channel_id bigint;
begin
  affected_channel_id := case when tg_op = 'DELETE' then old.channel_id else new.channel_id end;

  update public.streaming_channels
  set broadcast_started_at = statement_timestamp()
  where id = affected_channel_id
    and status = 'active'
    and broadcast_enabled;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.set_channel_broadcast_clock() from public;
revoke all on function private.restart_channel_broadcast_after_playlist_change() from public;

create trigger streaming_channel_items_restart_broadcast
  after insert or delete or update of position, status, media_asset_id on public.streaming_channel_items
  for each row execute function private.restart_channel_broadcast_after_playlist_change();
