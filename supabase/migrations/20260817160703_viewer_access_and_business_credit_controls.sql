-- Business-specific viewer access and web-stream credit accounting.
-- Access codes are intentionally readable only through tenant/admin organization
-- policies because business owners must be able to share them from their profile.

create or replace function private.generate_stream_access_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  candidate text;
begin
  loop
    candidate := lpad(floor(random() * 1000000)::integer::text, 6, '0');
    exit when not exists (
      select 1 from public.organizations organization
      where organization.stream_access_code = candidate
    );
  end loop;
  return candidate;
end;
$$;

alter table public.organizations
  add column stream_access_code text,
  add column stream_earning_enabled boolean not null default false,
  add column stream_earning_rate numeric(12,6) not null default 1,
  add column ad_consumption_rate numeric(12,6) not null default 1,
  add constraint organizations_stream_access_code_valid check (stream_access_code ~ '^[0-9]{6}$'),
  add constraint organizations_stream_earning_rate_valid check (stream_earning_rate >= 0 and stream_earning_rate <= 100000),
  add constraint organizations_ad_consumption_rate_valid check (ad_consumption_rate >= 0 and ad_consumption_rate <= 100000);

do $$
declare
  target_id bigint;
begin
  for target_id in select id from public.organizations where stream_access_code is null loop
    update public.organizations
    set stream_access_code = private.generate_stream_access_code()
    where id = target_id;
  end loop;
end;
$$;

alter table public.organizations
  alter column stream_access_code set default private.generate_stream_access_code(),
  alter column stream_access_code set not null,
  add constraint organizations_stream_access_code_unique unique (stream_access_code);

create table public.stream_viewer_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  channel_id bigint not null references public.streaming_channels(id) on delete cascade,
  host_organization_id bigint not null references public.organizations(id) on delete cascade,
  token_hash text not null unique,
  viewer_mode text not null,
  viewer_name text,
  viewer_email text,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  last_credit_at timestamptz,
  expires_at timestamptz not null default (now() + interval '12 hours'),
  ended_at timestamptz,
  constraint stream_viewer_sessions_token_hash_valid check (token_hash ~ '^[a-f0-9]{64}$'),
  constraint stream_viewer_sessions_mode_valid check (viewer_mode in ('anonymous', 'registered')),
  constraint stream_viewer_sessions_identity_valid check (
    (viewer_mode = 'anonymous' and viewer_name is null and viewer_email is null)
    or
    (viewer_mode = 'registered' and length(btrim(viewer_name)) between 2 and 120 and length(btrim(viewer_email)) between 3 and 254)
  )
);

create index stream_viewer_sessions_host_activity_idx
  on public.stream_viewer_sessions (host_organization_id, last_activity_at desc);
create index stream_viewer_sessions_channel_activity_idx
  on public.stream_viewer_sessions (channel_id, last_activity_at desc);
create index stream_viewer_sessions_active_token_idx
  on public.stream_viewer_sessions (token_hash, expires_at)
  where ended_at is null;

create table public.stream_access_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  channel_public_id uuid,
  succeeded boolean not null default false,
  attempted_at timestamptz not null default now(),
  constraint stream_access_attempts_ip_hash_valid check (ip_hash ~ '^[a-f0-9]{64}$')
);

create index stream_access_attempts_rate_limit_idx
  on public.stream_access_attempts (ip_hash, attempted_at desc);

create table public.stream_credit_events (
  id bigint generated always as identity primary key,
  event_key uuid not null unique,
  viewer_session_id uuid not null references public.stream_viewer_sessions(id) on delete restrict,
  media_asset_id bigint not null references public.media_assets(id) on delete restrict,
  verified_seconds numeric(12,3) not null,
  earned_credits numeric(20,6) not null default 0,
  consumed_credits numeric(20,6) not null default 0,
  ledger_transaction_id bigint references public.ledger_transactions(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint stream_credit_events_seconds_valid check (verified_seconds between 0 and 60),
  constraint stream_credit_events_credits_valid check (earned_credits >= 0 and consumed_credits >= 0)
);

create index stream_credit_events_session_created_idx
  on public.stream_credit_events (viewer_session_id, created_at desc);

alter table public.stream_viewer_sessions enable row level security;
alter table public.stream_access_attempts enable row level security;
alter table public.stream_credit_events enable row level security;

-- These security-sensitive tables are server-only. Tenant reporting is provided
-- through the constrained function below rather than direct Data API access.
revoke all on public.stream_viewer_sessions, public.stream_access_attempts,
  public.stream_credit_events from public, anon, authenticated;
revoke all on sequence public.stream_access_attempts_id_seq,
  public.stream_credit_events_id_seq from public, anon, authenticated;
grant select, insert, update on public.stream_viewer_sessions to service_role;
grant select, insert on public.stream_access_attempts, public.stream_credit_events to service_role;
grant usage, select on sequence public.stream_access_attempts_id_seq,
  public.stream_credit_events_id_seq to service_role;
grant select, insert, update on public.wallets, public.ledger_transactions,
  public.ledger_entries to service_role;
grant usage, select on sequence public.ledger_transactions_id_seq,
  public.ledger_entries_id_seq to service_role;

insert into public.wallets (organization_id, wallet_type)
values (null, 'platform')
on conflict (organization_id, wallet_type) do nothing;

create or replace function public.update_stream_credit_settings(
  p_organization_id bigint,
  p_earning_enabled boolean,
  p_earning_rate numeric,
  p_consumption_rate numeric
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (
    (select private.is_platform_admin())
    or (select private.has_org_role(p_organization_id, array['owner', 'finance']::text[]))
  ) then
    raise insufficient_privilege using message = 'Business credit settings access is required';
  end if;
  if p_earning_rate < 0 or p_earning_rate > 100000
     or p_consumption_rate < 0 or p_consumption_rate > 100000 then
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

create or replace function public.regenerate_stream_access_code(p_organization_id bigint)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  next_code text;
begin
  if not (
    (select private.is_platform_admin())
    or (select private.has_org_role(p_organization_id, array['owner']::text[]))
  ) then
    raise insufficient_privilege using message = 'Business owner access is required';
  end if;
  next_code := private.generate_stream_access_code();
  perform set_config('request.audit_reason', 'Stream access code regenerated', true);
  update public.organizations set stream_access_code = next_code where id = p_organization_id;
  if not found then
    raise no_data_found using message = 'Organization not found';
  end if;
  return next_code;
end;
$$;

create or replace function public.record_stream_viewer_heartbeat(
  p_session_id uuid,
  p_media_public_id uuid,
  p_event_key uuid
)
returns table (verified_seconds numeric, earned_credits numeric, consumed_credits numeric)
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
  earned_amount numeric(20,6);
  consumed_amount numeric(20,6);
  target_transaction_id bigint;
  host_wallet_id bigint;
  advertiser_wallet_id bigint;
  platform_wallet_id bigint;
begin
  if exists (select 1 from public.stream_credit_events event where event.event_key = p_event_key) then
    return query
      select event.verified_seconds, event.earned_credits, event.consumed_credits
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

  elapsed_seconds := least(
    60::numeric,
    greatest(0::numeric, extract(epoch from (now() - coalesce(target_session.last_credit_at, target_session.created_at)))::numeric)
  );
  if elapsed_seconds < 10 then
    update public.stream_viewer_sessions set last_activity_at = now() where id = target_session.id;
    insert into public.stream_credit_events (
      event_key, viewer_session_id, media_asset_id, verified_seconds,
      earned_credits, consumed_credits
    ) values (p_event_key, target_session.id, target_asset.id, 0, 0, 0);
    return query select 0::numeric, 0::numeric, 0::numeric;
    return;
  end if;

  select organization.stream_earning_enabled, organization.stream_earning_rate
  into host_earning_enabled, host_earning_rate
  from public.organizations organization where organization.id = target_session.host_organization_id;
  select organization.ad_consumption_rate into advertiser_consumption_rate
  from public.organizations organization where organization.id = target_asset.organization_id;

  earned_amount := case when host_earning_enabled then round((host_earning_rate * elapsed_seconds / 60)::numeric, 6) else 0 end;
  consumed_amount := round((advertiser_consumption_rate * elapsed_seconds / 60)::numeric, 6);

  if earned_amount > 0 or consumed_amount > 0 then
    select wallet.id into host_wallet_id from public.wallets wallet
      where wallet.organization_id = target_session.host_organization_id and wallet.wallet_type = 'earned';
    select wallet.id into advertiser_wallet_id from public.wallets wallet
      where wallet.organization_id = target_asset.organization_id and wallet.wallet_type = 'earned';
    select wallet.id into platform_wallet_id from public.wallets wallet
      where wallet.organization_id is null and wallet.wallet_type = 'platform';

    insert into public.ledger_transactions (
      transaction_type, reference_type, reference_id, idempotency_key, status, reason
    ) values (
      'settlement', 'stream_credit_event', p_event_key::text,
      'stream-heartbeat:' || p_event_key::text, 'draft', 'Verified web stream viewing'
    ) returning id into target_transaction_id;

    if consumed_amount > 0 then
      insert into public.ledger_entries (transaction_id, wallet_id, amount, description) values
        (target_transaction_id, advertiser_wallet_id, -consumed_amount, 'Advertiser web stream consumption'),
        (target_transaction_id, platform_wallet_id, consumed_amount, 'Web stream consumption clearing');
      update public.wallets set balance_projection = balance_projection - consumed_amount where id = advertiser_wallet_id;
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
    event_key, viewer_session_id, media_asset_id, verified_seconds,
    earned_credits, consumed_credits, ledger_transaction_id
  ) values (
    p_event_key, target_session.id, target_asset.id, elapsed_seconds,
    earned_amount, consumed_amount, target_transaction_id
  );
  update public.stream_viewer_sessions
  set last_activity_at = now(), last_credit_at = now()
  where id = target_session.id;

  return query select elapsed_seconds, earned_amount, consumed_amount;
end;
$$;

revoke all on function private.generate_stream_access_code() from public, anon, authenticated;
revoke all on function public.update_stream_credit_settings(bigint, boolean, numeric, numeric) from public, anon;
revoke all on function public.regenerate_stream_access_code(bigint) from public, anon;
revoke all on function public.record_stream_viewer_heartbeat(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.update_stream_credit_settings(bigint, boolean, numeric, numeric) to authenticated;
grant execute on function public.regenerate_stream_access_code(bigint) to authenticated;
grant execute on function public.record_stream_viewer_heartbeat(uuid, uuid, uuid) to service_role;
