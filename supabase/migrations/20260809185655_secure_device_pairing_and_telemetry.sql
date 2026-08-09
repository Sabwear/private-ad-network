-- Secure device pairing and operational telemetry for the Phase 1 pilot.
-- Pairing codes and device credentials are stored as SHA-256 hashes. IP and
-- client metadata are retained only for operations, security, and diagnostics.

create table private.device_activation_codes (
  id uuid primary key default extensions.gen_random_uuid(),
  code_hash bytea not null unique,
  credential_hash bytea not null unique,
  public_key_jwk jsonb not null,
  key_fingerprint text not null,
  device_info jsonb not null default '{}'::jsonb,
  requester_ip inet,
  requester_user_agent text,
  country_code text,
  edge_colo text,
  status text not null default 'pending',
  device_id bigint references public.devices(id) on delete set null,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  constraint device_activation_codes_public_key_object check (jsonb_typeof(public_key_jwk) = 'object'),
  constraint device_activation_codes_info_object check (jsonb_typeof(device_info) = 'object'),
  constraint device_activation_codes_status_valid check (status in ('pending', 'claimed', 'expired')),
  constraint device_activation_codes_expiry_valid check (expires_at > requested_at),
  constraint device_activation_codes_fingerprint_not_blank check (length(btrim(key_fingerprint)) >= 16)
);

create index device_activation_codes_pending_expiry_idx
  on private.device_activation_codes (expires_at)
  where status = 'pending';
create index device_activation_codes_ip_rate_idx
  on private.device_activation_codes (requester_ip, requested_at desc)
  where requester_ip is not null;

create table private.device_credentials (
  device_id bigint primary key references public.devices(id) on delete cascade,
  credential_hash bytea not null unique,
  issued_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create table public.device_observations (
  id bigint generated always as identity primary key,
  device_id bigint not null references public.devices(id) on delete cascade,
  organization_id bigint not null references public.organizations(id) on delete cascade,
  observed_ip inet,
  user_agent text,
  device_type text,
  os_name text,
  browser_name text,
  locale text,
  timezone text,
  screen_width integer,
  screen_height integer,
  device_pixel_ratio numeric(6, 2),
  connection_type text,
  country_code text,
  edge_colo text,
  client_info jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  constraint device_observations_client_info_object check (jsonb_typeof(client_info) = 'object'),
  constraint device_observations_screen_width_valid check (screen_width is null or screen_width between 1 and 32768),
  constraint device_observations_screen_height_valid check (screen_height is null or screen_height between 1 and 32768),
  constraint device_observations_pixel_ratio_valid check (device_pixel_ratio is null or device_pixel_ratio between 0.25 and 16)
);

create index device_observations_device_time_idx
  on public.device_observations (device_id, observed_at desc);
create index device_observations_organization_time_idx
  on public.device_observations (organization_id, observed_at desc);

alter table public.device_observations enable row level security;

create policy device_observations_member_read on public.device_observations
  for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy device_observations_platform_admin_read on public.device_observations
  for select to authenticated
  using ((select private.is_platform_admin()));

create or replace function private.request_device_activation(
  p_code text,
  p_credential_token text,
  p_public_key_jwk jsonb,
  p_key_fingerprint text,
  p_device_info jsonb,
  p_ip text,
  p_user_agent text,
  p_country_code text,
  p_edge_colo text
)
returns table (activation_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_ip inet;
begin
  if p_code !~ '^[A-Z2-9]{6}$' then
    raise check_violation using message = 'The pairing code format is invalid';
  end if;

  if length(p_credential_token) < 32 or length(p_credential_token) > 256 then
    raise check_violation using message = 'The device credential format is invalid';
  end if;

  if jsonb_typeof(coalesce(p_public_key_jwk, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_public_key_jwk, '{}'::jsonb)::text) > 4096 then
    raise check_violation using message = 'The public key is invalid';
  end if;

  if jsonb_typeof(coalesce(p_device_info, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_device_info, '{}'::jsonb)::text) > 8192 then
    raise check_violation using message = 'The device information is invalid';
  end if;

  if length(btrim(coalesce(p_key_fingerprint, ''))) < 16
     or length(p_key_fingerprint) > 160 then
    raise check_violation using message = 'The key fingerprint is invalid';
  end if;

  if nullif(btrim(coalesce(p_ip, '')), '') is not null then
    normalized_ip := btrim(p_ip)::inet;
  end if;

  update private.device_activation_codes as activation_code
  set status = 'expired'
  where activation_code.status = 'pending' and activation_code.expires_at <= now();

  if normalized_ip is not null and (
    select count(*)
    from private.device_activation_codes code
    where code.requester_ip = normalized_ip
      and code.requested_at >= now() - interval '1 hour'
  ) >= 5 then
    raise program_limit_exceeded using message = 'Too many pairing requests. Try again later';
  end if;

  return query
  insert into private.device_activation_codes (
    code_hash,
    credential_hash,
    public_key_jwk,
    key_fingerprint,
    device_info,
    requester_ip,
    requester_user_agent,
    country_code,
    edge_colo,
    expires_at
  ) values (
    extensions.digest(convert_to(p_code, 'UTF8'), 'sha256'),
    extensions.digest(convert_to(p_credential_token, 'UTF8'), 'sha256'),
    p_public_key_jwk,
    btrim(p_key_fingerprint),
    coalesce(p_device_info, '{}'::jsonb),
    normalized_ip,
    left(nullif(btrim(coalesce(p_user_agent, '')), ''), 1000),
    left(upper(nullif(btrim(coalesce(p_country_code, '')), '')), 2),
    left(upper(nullif(btrim(coalesce(p_edge_colo, '')), '')), 8),
    now() + interval '10 minutes'
  )
  returning id, private.device_activation_codes.expires_at;
end;
$$;

create or replace function private.device_activation_status(
  p_activation_id uuid,
  p_credential_token text
)
returns table (status text, device_public_id uuid, heartbeat_interval_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.device_activation_codes as activation_code
  set status = 'expired'
  where activation_code.id = p_activation_id
    and activation_code.status = 'pending'
    and activation_code.expires_at <= now();

  return query
  select
    code.status,
    device.public_id,
    45
  from private.device_activation_codes code
  left join public.devices device on device.id = code.device_id
  where code.id = p_activation_id
    and code.credential_hash = extensions.digest(convert_to(p_credential_token, 'UTF8'), 'sha256');
end;
$$;

create or replace function private.claim_device_activation(
  p_code text,
  p_location_id bigint,
  p_name text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  activation private.device_activation_codes%rowtype;
  target_organization_id bigint;
  created_device_id bigint;
  created_device_public_id uuid;
begin
  if (select auth.uid()) is null then
    raise insufficient_privilege using message = 'Authentication is required';
  end if;

  if length(btrim(coalesce(p_name, ''))) < 2 or length(p_name) > 120 then
    raise check_violation using message = 'A valid screen name is required';
  end if;

  if length(btrim(coalesce(p_reason, ''))) < 5 or length(p_reason) > 300 then
    raise check_violation using message = 'A pairing reason is required';
  end if;

  select code.* into activation
  from private.device_activation_codes code
  where code.code_hash = extensions.digest(convert_to(upper(btrim(p_code)), 'UTF8'), 'sha256')
    and code.status = 'pending'
    and code.expires_at > now()
  for update;

  if not found then
    raise no_data_found using message = 'The pairing code is invalid or expired';
  end if;

  select location.organization_id into target_organization_id
  from public.locations location
  join public.organizations organization on organization.id = location.organization_id
  where location.id = p_location_id
    and location.status = 'active'
    and organization.status = 'active';

  if target_organization_id is null then
    raise check_violation using message = 'The selected location is not active';
  end if;

  if not (
    (select private.is_platform_admin())
    or (select private.has_org_role(target_organization_id, array['owner', 'staff', 'operations']::text[]))
  ) then
    raise insufficient_privilege using message = 'Screen pairing access is required';
  end if;

  insert into public.devices (
    location_id,
    name,
    activation_status,
    key_fingerprint,
    app_version,
    capabilities,
    last_heartbeat_at,
    risk_state
  ) values (
    p_location_id,
    btrim(p_name),
    'active',
    activation.key_fingerprint,
    nullif(activation.device_info ->> 'appVersion', ''),
    activation.device_info,
    null,
    'low'
  )
  returning id, public_id into created_device_id, created_device_public_id;

  insert into private.device_credentials (device_id, credential_hash)
  values (created_device_id, activation.credential_hash);

  update private.device_activation_codes
  set status = 'claimed', device_id = created_device_id, claimed_at = now()
  where id = activation.id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    object_type,
    object_id,
    reason,
    after_summary
  ) values (
    target_organization_id,
    (select auth.uid()),
    'activate',
    'devices',
    created_device_public_id::text,
    btrim(p_reason),
    jsonb_build_object('name', btrim(p_name), 'location_id', p_location_id, 'key_fingerprint', activation.key_fingerprint)
  );

  return created_device_public_id;
end;
$$;

create or replace function private.record_device_heartbeat(
  p_device_public_id uuid,
  p_credential_token text,
  p_client_info jsonb,
  p_ip text,
  p_user_agent text,
  p_country_code text,
  p_edge_colo text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_device record;
  normalized_ip inet;
  observed_at_value timestamptz := now();
begin
  if length(p_credential_token) < 32 or length(p_credential_token) > 256 then
    raise insufficient_privilege using message = 'The device credential is invalid';
  end if;

  if jsonb_typeof(coalesce(p_client_info, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_client_info, '{}'::jsonb)::text) > 8192 then
    raise check_violation using message = 'The device information is invalid';
  end if;

  if nullif(btrim(coalesce(p_ip, '')), '') is not null then
    normalized_ip := btrim(p_ip)::inet;
  end if;

  select
    device.id,
    device.location_id,
    location.organization_id
  into matched_device
  from public.devices device
  join private.device_credentials credential on credential.device_id = device.id
  join public.locations location on location.id = device.location_id
  join public.organizations organization on organization.id = location.organization_id
  where device.public_id = p_device_public_id
    and device.activation_status = 'active'
    and location.status = 'active'
    and organization.status = 'active'
    and credential.revoked_at is null
    and credential.credential_hash = extensions.digest(convert_to(p_credential_token, 'UTF8'), 'sha256');

  if not found then
    raise insufficient_privilege using message = 'The device credential is invalid or inactive';
  end if;

  update private.device_credentials
  set last_used_at = observed_at_value
  where device_id = matched_device.id;

  update public.devices
  set last_heartbeat_at = observed_at_value,
      app_version = coalesce(nullif(p_client_info ->> 'appVersion', ''), app_version),
      capabilities = capabilities || coalesce(p_client_info, '{}'::jsonb)
  where id = matched_device.id;

  insert into public.device_observations (
    device_id,
    organization_id,
    observed_ip,
    user_agent,
    device_type,
    os_name,
    browser_name,
    locale,
    timezone,
    screen_width,
    screen_height,
    device_pixel_ratio,
    connection_type,
    country_code,
    edge_colo,
    client_info,
    observed_at
  ) values (
    matched_device.id,
    matched_device.organization_id,
    normalized_ip,
    left(nullif(btrim(coalesce(p_user_agent, '')), ''), 1000),
    left(nullif(p_client_info ->> 'deviceType', ''), 80),
    left(nullif(p_client_info ->> 'osName', ''), 120),
    left(nullif(p_client_info ->> 'browserName', ''), 120),
    left(nullif(p_client_info ->> 'locale', ''), 40),
    left(nullif(p_client_info ->> 'timezone', ''), 80),
    nullif(p_client_info ->> 'screenWidth', '')::integer,
    nullif(p_client_info ->> 'screenHeight', '')::integer,
    nullif(p_client_info ->> 'devicePixelRatio', '')::numeric,
    left(nullif(p_client_info ->> 'connectionType', ''), 80),
    left(upper(nullif(btrim(coalesce(p_country_code, '')), '')), 2),
    left(upper(nullif(btrim(coalesce(p_edge_colo, '')), '')), 8),
    coalesce(p_client_info, '{}'::jsonb),
    observed_at_value
  );

  return observed_at_value;
end;
$$;

create or replace function private.suspend_device(
  p_device_public_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_device record;
begin
  if length(btrim(coalesce(p_reason, ''))) < 5 or length(p_reason) > 300 then
    raise check_violation using message = 'A suspension reason is required';
  end if;

  select device.id, device.public_id, location.organization_id
  into matched_device
  from public.devices device
  join public.locations location on location.id = device.location_id
  where device.public_id = p_device_public_id;

  if not found then
    raise no_data_found using message = 'Device not found';
  end if;

  if not (
    (select private.is_platform_admin())
    or (select private.has_org_role(matched_device.organization_id, array['owner', 'operations']::text[]))
  ) then
    raise insufficient_privilege using message = 'Device suspension access is required';
  end if;

  update public.devices
  set activation_status = 'suspended', suspension_reason = btrim(p_reason)
  where id = matched_device.id;

  update private.device_credentials
  set revoked_at = now()
  where device_id = matched_device.id and revoked_at is null;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    object_type,
    object_id,
    reason,
    after_summary
  ) values (
    matched_device.organization_id,
    (select auth.uid()),
    'suspend',
    'devices',
    matched_device.public_id::text,
    btrim(p_reason),
    jsonb_build_object('activation_status', 'suspended')
  );
end;
$$;

create or replace function public.request_device_activation(
  p_code text,
  p_credential_token text,
  p_public_key_jwk jsonb,
  p_key_fingerprint text,
  p_device_info jsonb,
  p_ip text,
  p_user_agent text,
  p_country_code text,
  p_edge_colo text
)
returns table (activation_id uuid, expires_at timestamptz)
language sql
security invoker
set search_path = ''
as $$
  select * from private.request_device_activation(
    p_code, p_credential_token, p_public_key_jwk, p_key_fingerprint,
    p_device_info, p_ip, p_user_agent, p_country_code, p_edge_colo
  );
$$;

create or replace function public.device_activation_status(
  p_activation_id uuid,
  p_credential_token text
)
returns table (status text, device_public_id uuid, heartbeat_interval_seconds integer)
language sql
security invoker
set search_path = ''
as $$
  select * from private.device_activation_status(p_activation_id, p_credential_token);
$$;

create or replace function public.claim_device_activation(
  p_code text,
  p_location_id bigint,
  p_name text,
  p_reason text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.claim_device_activation(p_code, p_location_id, p_name, p_reason);
$$;

create or replace function public.record_device_heartbeat(
  p_device_public_id uuid,
  p_credential_token text,
  p_client_info jsonb,
  p_ip text,
  p_user_agent text,
  p_country_code text,
  p_edge_colo text
)
returns timestamptz
language sql
security invoker
set search_path = ''
as $$
  select private.record_device_heartbeat(
    p_device_public_id, p_credential_token, p_client_info,
    p_ip, p_user_agent, p_country_code, p_edge_colo
  );
$$;

create or replace function public.suspend_device(
  p_device_public_id uuid,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.suspend_device(p_device_public_id, p_reason);
$$;

grant usage on schema private to anon;
revoke all on function private.request_device_activation(text, text, jsonb, text, jsonb, text, text, text, text) from public;
revoke all on function private.device_activation_status(uuid, text) from public;
revoke all on function private.record_device_heartbeat(uuid, text, jsonb, text, text, text, text) from public;
revoke all on function private.claim_device_activation(text, bigint, text, text) from public;
revoke all on function private.suspend_device(uuid, text) from public;
grant execute on function private.request_device_activation(text, text, jsonb, text, jsonb, text, text, text, text) to anon, authenticated;
grant execute on function private.device_activation_status(uuid, text) to anon, authenticated;
grant execute on function private.record_device_heartbeat(uuid, text, jsonb, text, text, text, text) to anon, authenticated;
grant execute on function private.claim_device_activation(text, bigint, text, text) to authenticated;
grant execute on function private.suspend_device(uuid, text) to authenticated;

revoke all on function public.request_device_activation(text, text, jsonb, text, jsonb, text, text, text, text) from public;
grant execute on function public.request_device_activation(text, text, jsonb, text, jsonb, text, text, text, text) to anon, authenticated;
revoke all on function public.device_activation_status(uuid, text) from public;
grant execute on function public.device_activation_status(uuid, text) to anon, authenticated;
revoke all on function public.record_device_heartbeat(uuid, text, jsonb, text, text, text, text) from public;
grant execute on function public.record_device_heartbeat(uuid, text, jsonb, text, text, text, text) to anon, authenticated;
revoke all on function public.claim_device_activation(text, bigint, text, text) from public, anon;
grant execute on function public.claim_device_activation(text, bigint, text, text) to authenticated;
revoke all on function public.suspend_device(uuid, text) from public, anon;
grant execute on function public.suspend_device(uuid, text) to authenticated;

revoke all on public.device_observations from anon;
grant select on public.device_observations to authenticated;
grant usage, select on sequence public.device_observations_id_seq to authenticated;
