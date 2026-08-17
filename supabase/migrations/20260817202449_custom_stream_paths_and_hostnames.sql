alter table public.streaming_channels
  add column custom_hostname text;

alter table public.streaming_channels
  add constraint streaming_channels_custom_hostname_valid check (
    custom_hostname is null
    or (
      length(custom_hostname) between 4 and 253
      and custom_hostname ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
    )
  );

create unique index streaming_channels_custom_hostname_unique
  on public.streaming_channels (lower(custom_hostname))
  where custom_hostname is not null;

create or replace function private.resolve_stream_hostname(p_hostname text)
returns table (channel_public_id uuid, channel_access_key uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select channel.public_id, channel.access_key
  from public.streaming_channels channel
  where channel.status = 'active'
    and channel.custom_hostname = lower(trim(trailing '.' from split_part(btrim(p_hostname), ':', 1)))
  limit 1;
$$;

create or replace function public.resolve_stream_hostname(p_hostname text)
returns table (channel_public_id uuid, channel_access_key uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.resolve_stream_hostname(p_hostname);
$$;

revoke all on function private.resolve_stream_hostname(text) from public, anon, authenticated;
revoke all on function public.resolve_stream_hostname(text) from public, anon, authenticated;
grant usage on schema private to anon, authenticated;
grant execute on function private.resolve_stream_hostname(text) to anon, authenticated;
grant execute on function public.resolve_stream_hostname(text) to anon, authenticated;
