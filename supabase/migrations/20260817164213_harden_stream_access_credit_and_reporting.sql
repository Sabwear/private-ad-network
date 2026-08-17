-- Production hardening for private web streams. This migration follows the
-- initial viewer access migration and keeps sensitive viewer data server-only.

alter table public.organizations
  add column stream_access_code_expires_at timestamptz not null default (now() + interval '180 days');

alter table public.stream_viewer_sessions
  add column viewer_user_id uuid references public.profiles(id) on delete set null,
  add column consented_at timestamptz not null default now(),
  add column retention_expires_at timestamptz not null default (now() + interval '90 days'),
  add column personal_data_purged_at timestamptz,
  add column last_media_asset_id bigint references public.media_assets(id) on delete set null,
  add column last_position_seconds numeric(12,3),
  add column last_client_event_at timestamptz,
  drop constraint stream_viewer_sessions_identity_valid;

-- Preserve identified sessions only when their email already belongs to an
-- active, verified, administrator-approved profile. Older free-form identities
-- are anonymized during the upgrade.
update public.stream_viewer_sessions session
set viewer_user_id = profile.id
from public.profiles profile
where session.viewer_mode = 'registered'
  and lower(session.viewer_email) = lower(profile.email)
  and profile.account_status = 'active'
  and profile.email_verified_at is not null;

update public.stream_viewer_sessions
set viewer_name = null,
    viewer_email = null,
    personal_data_purged_at = now(),
    ended_at = coalesce(ended_at, now())
where viewer_mode = 'registered' and viewer_user_id is null;

alter table public.stream_viewer_sessions
  add constraint stream_viewer_sessions_identity_valid check (
    (viewer_mode = 'anonymous' and viewer_user_id is null and viewer_name is null and viewer_email is null)
    or
    (
      viewer_mode = 'registered'
      and (
        (viewer_user_id is not null and length(btrim(viewer_name)) between 2 and 120 and length(btrim(viewer_email)) between 3 and 254)
        or (personal_data_purged_at is not null and viewer_user_id is null and viewer_name is null and viewer_email is null)
      )
    )
  ),
  add constraint stream_viewer_sessions_retention_valid check (retention_expires_at >= created_at),
  add constraint stream_viewer_sessions_position_valid check (last_position_seconds is null or last_position_seconds >= 0);

create index stream_viewer_sessions_registered_active_idx
  on public.stream_viewer_sessions (viewer_user_id, last_activity_at desc)
  where viewer_user_id is not null and ended_at is null;
create index stream_viewer_sessions_retention_idx
  on public.stream_viewer_sessions (retention_expires_at)
  where personal_data_purged_at is null;
create index stream_viewer_sessions_last_media_idx
  on public.stream_viewer_sessions (last_media_asset_id)
  where last_media_asset_id is not null;
create index stream_access_attempts_channel_failures_idx
  on public.stream_access_attempts (channel_public_id, attempted_at desc)
  where succeeded = false and channel_public_id is not null;

create table public.stream_access_code_rotations (
  id bigint generated always as identity primary key,
  organization_id bigint not null references public.organizations(id) on delete cascade,
  previous_code_hash text not null,
  rotated_by uuid references auth.users(id) on delete set null,
  rotated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint stream_access_code_rotations_hash_valid check (previous_code_hash ~ '^[a-f0-9]{64}$')
);

create index stream_access_code_rotations_organization_idx
  on public.stream_access_code_rotations (organization_id, rotated_at desc);
alter table public.stream_access_code_rotations enable row level security;
create policy stream_access_code_rotations_admin_owner_read on public.stream_access_code_rotations
  for select to authenticated
  using (
    (select private.is_platform_admin())
    or (select private.has_org_role(organization_id, array['owner']::text[]))
  );
revoke all on public.stream_access_code_rotations from public, anon;
grant select on public.stream_access_code_rotations to authenticated;

alter table public.stream_credit_events
  add column host_organization_id bigint references public.organizations(id) on delete restrict,
  add column advertiser_organization_id bigint references public.organizations(id) on delete restrict,
  add column validation_result text not null default 'accepted',
  add column reason_codes text[] not null default '{}',
  add column playback_position_seconds numeric(12,3),
  add column client_event_at timestamptz,
  add column evidence jsonb not null default '{}'::jsonb,
  add constraint stream_credit_events_validation_valid check (validation_result in ('accepted', 'rejected', 'insufficient_credit')),
  add constraint stream_credit_events_position_valid check (playback_position_seconds is null or playback_position_seconds >= 0),
  add constraint stream_credit_events_evidence_object check (jsonb_typeof(evidence) = 'object');

update public.stream_credit_events event
set host_organization_id = session.host_organization_id,
    advertiser_organization_id = asset.organization_id
from public.stream_viewer_sessions session, public.media_assets asset
where session.id = event.viewer_session_id and asset.id = event.media_asset_id;
alter table public.stream_credit_events
  alter column host_organization_id set not null,
  alter column advertiser_organization_id set not null;

create index stream_credit_events_validation_created_idx
  on public.stream_credit_events (validation_result, created_at desc);
create index stream_credit_events_media_created_idx
  on public.stream_credit_events (media_asset_id, created_at desc);
create index stream_credit_events_host_created_idx
  on public.stream_credit_events (host_organization_id, created_at desc);
create index stream_credit_events_advertiser_created_idx
  on public.stream_credit_events (advertiser_organization_id, created_at desc);

-- Replace the initial pseudo-random generator with a cryptographically secure
-- six-digit generator. Database uniqueness remains the final collision guard.
create or replace function private.generate_stream_access_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  random_bytes bytea;
  random_value bigint;
  candidate text;
begin
  loop
    random_bytes := extensions.gen_random_bytes(4);
    random_value := get_byte(random_bytes, 0)::bigint * 16777216
      + get_byte(random_bytes, 1)::bigint * 65536
      + get_byte(random_bytes, 2)::bigint * 256
      + get_byte(random_bytes, 3)::bigint;
    candidate := lpad((random_value % 1000000)::text, 6, '0');
    exit when not exists (
      select 1 from public.organizations organization
      where organization.stream_access_code = candidate
    );
  end loop;
  return candidate;
end;
$$;
revoke all on function private.generate_stream_access_code() from public, anon, authenticated;

create or replace function private.update_stream_credit_settings(
  p_organization_id bigint,
  p_earning_enabled boolean,
  p_earning_rate numeric,
  p_consumption_rate numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (
    (select private.is_platform_admin())
    or (select private.has_org_role(p_organization_id, array['owner', 'finance']::text[]))
  ) then
    raise insufficient_privilege using message = 'Business credit settings access is required';
  end if;
  if p_earning_enabled is null
     or p_earning_rate is null or p_earning_rate < 0 or p_earning_rate > 100000
     or p_consumption_rate is null or p_consumption_rate < 0 or p_consumption_rate > 100000 then
    raise check_violation using message = 'Credit rates are outside the supported range';
  end if;

  perform set_config('request.audit_reason', 'Stream credit settings updated', true);
  update public.organizations
  set stream_earning_enabled = p_earning_enabled,
      stream_earning_rate = p_earning_rate,
      ad_consumption_rate = p_consumption_rate
  where id = p_organization_id;
  if not found then
    raise no_data_found using message = 'Organization not found';
  end if;
end;
$$;

create or replace function public.update_stream_credit_settings(
  p_organization_id bigint,
  p_earning_enabled boolean,
  p_earning_rate numeric,
  p_consumption_rate numeric
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.update_stream_credit_settings(
    p_organization_id, p_earning_enabled, p_earning_rate, p_consumption_rate
  );
$$;
revoke all on function private.update_stream_credit_settings(bigint, boolean, numeric, numeric) from public, anon;
revoke all on function public.update_stream_credit_settings(bigint, boolean, numeric, numeric) from public, anon;
grant execute on function private.update_stream_credit_settings(bigint, boolean, numeric, numeric) to authenticated;
grant execute on function public.update_stream_credit_settings(bigint, boolean, numeric, numeric) to authenticated;

create or replace function private.regenerate_stream_access_code(p_organization_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_code text;
  previous_code text;
  previous_expiry timestamptz;
  next_expiry timestamptz := now() + interval '180 days';
begin
  if not (
    (select private.is_platform_admin())
    or (select private.has_org_role(p_organization_id, array['owner']::text[]))
  ) then
    raise insufficient_privilege using message = 'Business owner access is required';
  end if;
  select organization.stream_access_code, organization.stream_access_code_expires_at
  into previous_code, previous_expiry
  from public.organizations organization where organization.id = p_organization_id
  for update;
  if previous_code is null then
    raise no_data_found using message = 'Organization not found';
  end if;

  next_code := private.generate_stream_access_code();
  perform set_config('request.audit_reason', 'Stream access code regenerated', true);
  insert into public.stream_access_code_rotations (
    organization_id, previous_code_hash, rotated_by, expires_at
  ) values (
    p_organization_id,
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(previous_code, 'UTF8'), 'sha256'), 'hex'),
    (select auth.uid()),
    previous_expiry
  );
  update public.organizations
  set stream_access_code = next_code,
      stream_access_code_expires_at = next_expiry
  where id = p_organization_id;
  update public.stream_viewer_sessions
  set ended_at = coalesce(ended_at, now())
  where host_organization_id = p_organization_id and ended_at is null;
  return next_code;
end;
$$;

create or replace function public.regenerate_stream_access_code(p_organization_id bigint)
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.regenerate_stream_access_code(p_organization_id);
$$;
revoke all on function private.regenerate_stream_access_code(bigint) from public, anon;
revoke all on function public.regenerate_stream_access_code(bigint) from public, anon;
grant execute on function private.regenerate_stream_access_code(bigint) to authenticated;
grant execute on function public.regenerate_stream_access_code(bigint) to authenticated;

create or replace function private.end_suspended_user_stream_sessions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.account_status <> 'active' and old.account_status is distinct from new.account_status then
    update public.stream_viewer_sessions
    set ended_at = coalesce(ended_at, now())
    where viewer_user_id = new.id and ended_at is null;
  end if;
  return new;
end;
$$;

create trigger profiles_end_suspended_stream_sessions
  after update of account_status on public.profiles
  for each row execute function private.end_suspended_user_stream_sessions();
revoke all on function private.end_suspended_user_stream_sessions() from public, anon, authenticated;

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
grant delete on public.stream_access_attempts to service_role;

do $$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'purge-expired-stream-viewer-data',
      '17 3 * * *',
      'select public.purge_expired_stream_viewer_data()'
    );
  end if;
end;
$$;

create or replace function public.record_stream_viewer_heartbeat_v2(
  p_session_id uuid,
  p_media_public_id uuid,
  p_event_key uuid,
  p_playback_position_seconds numeric,
  p_client_event_at timestamptz,
  p_page_visible boolean,
  p_is_playing boolean
)
returns table (
  validation_result text,
  verified_seconds numeric,
  earned_credits numeric,
  consumed_credits numeric,
  reason_codes text[]
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_session public.stream_viewer_sessions%rowtype;
  target_asset public.media_assets%rowtype;
  host_earning_enabled boolean;
  host_earning_rate numeric(12,6);
  advertiser_consumption_rate numeric(12,6);
  elapsed_seconds numeric(12,3);
  verified_amount numeric(12,3) := 0;
  earned_amount numeric(20,6) := 0;
  consumed_amount numeric(20,6) := 0;
  required_consumption numeric(20,6) := 0;
  available_consumption numeric(20,6) := 0;
  remaining_consumption numeric(20,6) := 0;
  debit_amount numeric(20,6);
  target_transaction_id bigint;
  host_wallet_id bigint;
  platform_wallet_id bigint;
  wallet_record record;
  result_status text := 'accepted';
  result_reasons text[] := '{}';
begin
  if exists (select 1 from public.stream_credit_events event where event.event_key = p_event_key) then
    return query
      select event.validation_result, event.verified_seconds, event.earned_credits,
        event.consumed_credits, event.reason_codes
      from public.stream_credit_events event where event.event_key = p_event_key;
    return;
  end if;

  select * into target_session
  from public.stream_viewer_sessions session
  where session.id = p_session_id
    and session.ended_at is null
    and session.expires_at > now()
  for update;
  if target_session.id is null then
    raise insufficient_privilege using message = 'Viewer session is unavailable';
  end if;

  -- A concurrent request with the same idempotency key may have committed while
  -- this transaction waited for the session lock. Return that result instead of
  -- attempting a duplicate settlement.
  if exists (select 1 from public.stream_credit_events event where event.event_key = p_event_key) then
    return query
      select event.validation_result, event.verified_seconds, event.earned_credits,
        event.consumed_credits, event.reason_codes
      from public.stream_credit_events event where event.event_key = p_event_key;
    return;
  end if;

  select asset.* into target_asset
  from public.media_assets asset
  join public.streaming_channel_items item on item.media_asset_id = asset.id
  where asset.public_id = p_media_public_id
    and item.channel_id = target_session.channel_id
    and item.status = 'active'
    and asset.moderation_status = 'approved'
    and asset.processing_status = 'ready';
  if target_asset.id is null then
    raise check_violation using message = 'Media is not active in this channel';
  end if;

  elapsed_seconds := greatest(0::numeric, extract(epoch from (now() - coalesce(target_session.last_credit_at, target_session.created_at)))::numeric);
  if elapsed_seconds < 10 then
    result_status := 'rejected';
    result_reasons := array['heartbeat_too_soon'];
  elsif elapsed_seconds > 45 then
    result_status := 'rejected';
    result_reasons := array['heartbeat_gap'];
  elsif not p_page_visible or not p_is_playing then
    result_status := 'rejected';
    result_reasons := array['playback_not_visible'];
  elsif p_client_event_at is null or abs(extract(epoch from (now() - p_client_event_at))) > 120 then
    result_status := 'rejected';
    result_reasons := array['client_clock_invalid'];
  elsif p_playback_position_seconds is null or p_playback_position_seconds < 0
    or (target_asset.duration_ms is not null and p_playback_position_seconds > target_asset.duration_ms::numeric / 1000 + 2) then
    result_status := 'rejected';
    result_reasons := array['playback_position_invalid'];
  elsif target_session.last_client_event_at is not null and p_client_event_at <= target_session.last_client_event_at then
    result_status := 'rejected';
    result_reasons := array['client_event_replay'];
  elsif target_session.last_media_asset_id = target_asset.id
    and target_session.last_position_seconds is not null
    and not (
      target_asset.duration_ms is not null
      and target_session.last_position_seconds >= target_asset.duration_ms::numeric / 1000 - 25
      and p_playback_position_seconds <= 25
    )
    and p_playback_position_seconds - target_session.last_position_seconds < greatest(2::numeric, least(elapsed_seconds * 0.5, 8::numeric)) then
    result_status := 'rejected';
    result_reasons := array['playback_not_advancing'];
  else
    verified_amount := least(elapsed_seconds, 20::numeric);
  end if;

  if result_status = 'accepted' then
    select organization.stream_earning_enabled, organization.stream_earning_rate
    into host_earning_enabled, host_earning_rate
    from public.organizations organization where organization.id = target_session.host_organization_id;
    select organization.ad_consumption_rate into advertiser_consumption_rate
    from public.organizations organization where organization.id = target_asset.organization_id;

    required_consumption := round((advertiser_consumption_rate * verified_amount / 60)::numeric, 6);
    perform wallet.id from public.wallets wallet
    where (wallet.organization_id = target_asset.organization_id and wallet.wallet_type in ('promotional', 'earned', 'purchased'))
       or (wallet.organization_id = target_session.host_organization_id and wallet.wallet_type = 'earned')
       or (wallet.organization_id is null and wallet.wallet_type = 'platform')
    order by wallet.id
    for update;

    select coalesce(sum(greatest(wallet.balance_projection, 0)), 0)
    into available_consumption
    from public.wallets wallet
    where wallet.organization_id = target_asset.organization_id
      and wallet.wallet_type in ('promotional', 'earned', 'purchased');

    if available_consumption < required_consumption then
      result_status := 'insufficient_credit';
      result_reasons := array['advertiser_balance_insufficient'];
      verified_amount := 0;
    else
      consumed_amount := required_consumption;
      earned_amount := case when host_earning_enabled
        then round((host_earning_rate * verified_amount / 60)::numeric, 6)
        else 0 end;
    end if;
  end if;

  if result_status = 'accepted' and (earned_amount > 0 or consumed_amount > 0) then
    select wallet.id into host_wallet_id from public.wallets wallet
      where wallet.organization_id = target_session.host_organization_id and wallet.wallet_type = 'earned';
    select wallet.id into platform_wallet_id from public.wallets wallet
      where wallet.organization_id is null and wallet.wallet_type = 'platform';

    insert into public.ledger_transactions (
      transaction_type, reference_type, reference_id, idempotency_key, status, reason
    ) values (
      'settlement', 'stream_credit_event', p_event_key::text,
      'stream-heartbeat-v2:' || p_event_key::text, 'draft', 'Verified web stream viewing'
    ) returning id into target_transaction_id;

    remaining_consumption := consumed_amount;
    for wallet_record in
      select wallet.id, wallet.balance_projection
      from public.wallets wallet
      where wallet.organization_id = target_asset.organization_id
        and wallet.wallet_type in ('promotional', 'earned', 'purchased')
        and wallet.balance_projection > 0
      order by case wallet.wallet_type when 'promotional' then 1 when 'earned' then 2 else 3 end, wallet.id
    loop
      exit when remaining_consumption <= 0;
      debit_amount := least(wallet_record.balance_projection, remaining_consumption);
      insert into public.ledger_entries (transaction_id, wallet_id, amount, description)
      values (target_transaction_id, wallet_record.id, -debit_amount, 'Advertiser web stream consumption');
      update public.wallets set balance_projection = balance_projection - debit_amount where id = wallet_record.id;
      remaining_consumption := remaining_consumption - debit_amount;
    end loop;
    if consumed_amount > 0 then
      insert into public.ledger_entries (transaction_id, wallet_id, amount, description)
      values (target_transaction_id, platform_wallet_id, consumed_amount, 'Web stream consumption clearing');
      update public.wallets set balance_projection = balance_projection + consumed_amount where id = platform_wallet_id;
    end if;
    if earned_amount > 0 then
      insert into public.ledger_entries (transaction_id, wallet_id, amount, description) values
        (target_transaction_id, host_wallet_id, earned_amount, 'Host web stream earning'),
        (target_transaction_id, platform_wallet_id, -earned_amount, 'Web stream earning clearing');
      update public.wallets set balance_projection = balance_projection + earned_amount where id = host_wallet_id;
      update public.wallets set balance_projection = balance_projection - earned_amount where id = platform_wallet_id;
    end if;
    update public.ledger_transactions set status = 'posted' where id = target_transaction_id;
  end if;

  insert into public.stream_credit_events (
    event_key, viewer_session_id, media_asset_id, host_organization_id,
    advertiser_organization_id, verified_seconds,
    earned_credits, consumed_credits, ledger_transaction_id, validation_result,
    reason_codes, playback_position_seconds, client_event_at, evidence
  ) values (
    p_event_key, target_session.id, target_asset.id, target_session.host_organization_id,
    target_asset.organization_id, verified_amount,
    earned_amount, consumed_amount, target_transaction_id, result_status,
    result_reasons, p_playback_position_seconds, p_client_event_at,
    jsonb_build_object('pageVisible', p_page_visible, 'isPlaying', p_is_playing, 'serverElapsedSeconds', elapsed_seconds)
  );

  update public.stream_viewer_sessions
  set last_activity_at = now(),
      last_credit_at = now(),
      last_media_asset_id = target_asset.id,
      last_position_seconds = p_playback_position_seconds,
      last_client_event_at = p_client_event_at
  where id = target_session.id;

  return query select result_status, verified_amount, earned_amount, consumed_amount, result_reasons;
end;
$$;

revoke all on function public.record_stream_viewer_heartbeat_v2(uuid, uuid, uuid, numeric, timestamptz, boolean, boolean) from public, anon, authenticated;
grant execute on function public.record_stream_viewer_heartbeat_v2(uuid, uuid, uuid, numeric, timestamptz, boolean, boolean) to service_role;

-- Direct access remains server-only. Explicit grants account for projects where
-- new public-schema objects are not auto-exposed to the Data API.
grant select, insert, update on public.stream_viewer_sessions,
  public.stream_credit_events to service_role;

create or replace function private.get_stream_report_summary(p_organization_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when
    (select private.is_platform_admin())
    or (select private.has_org_role(p_organization_id, array['owner', 'finance']::text[]))
  then jsonb_build_object(
    'totalSessions', (select count(*) from public.stream_viewer_sessions session where session.host_organization_id = p_organization_id),
    'activeSessions', (select count(*) from public.stream_viewer_sessions session where session.host_organization_id = p_organization_id and session.ended_at is null and session.expires_at > now() and session.last_activity_at >= now() - interval '60 seconds'),
    'registeredSessions', (select count(*) from public.stream_viewer_sessions session where session.host_organization_id = p_organization_id and session.viewer_mode = 'registered'),
    'uniqueRegisteredViewers', (select count(distinct session.viewer_user_id) from public.stream_viewer_sessions session where session.host_organization_id = p_organization_id and session.viewer_user_id is not null),
    'anonymousSessions', (select count(*) from public.stream_viewer_sessions session where session.host_organization_id = p_organization_id and session.viewer_mode = 'anonymous'),
    'verifiedSeconds', (select coalesce(sum(event.verified_seconds), 0) from public.stream_credit_events event where event.host_organization_id = p_organization_id and event.validation_result = 'accepted'),
    'earnedCredits', (select coalesce(sum(event.earned_credits), 0) from public.stream_credit_events event where event.host_organization_id = p_organization_id),
    'consumedCredits', (select coalesce(sum(event.consumed_credits), 0) from public.stream_credit_events event where event.advertiser_organization_id = p_organization_id),
    'rejectedEvents', (select count(*) from public.stream_credit_events event where event.host_organization_id = p_organization_id and event.validation_result = 'rejected'),
    'insufficientCreditEvents', (select count(*) from public.stream_credit_events event where event.advertiser_organization_id = p_organization_id and event.validation_result = 'insufficient_credit')
  ) else null end;
$$;

create or replace function public.get_stream_report_summary(p_organization_id bigint)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_stream_report_summary(p_organization_id);
$$;

revoke all on function public.get_stream_report_summary(bigint) from public, anon;
revoke all on function private.get_stream_report_summary(bigint) from public, anon;
grant execute on function private.get_stream_report_summary(bigint) to authenticated;
grant execute on function public.get_stream_report_summary(bigint) to authenticated;
