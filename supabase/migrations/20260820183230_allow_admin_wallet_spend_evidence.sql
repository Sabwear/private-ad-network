-- Wallet reporting runs as the authenticated administrator so it needs an
-- explicit Data API grant and an administrator-only RLS policy for the
-- server-managed playback evidence table.

create policy stream_credit_events_platform_admin_read
  on public.stream_credit_events
  for select
  to authenticated
  using ((select private.is_platform_admin()));

grant select on public.stream_credit_events to authenticated;
