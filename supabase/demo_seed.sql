-- Repeatable limited-beta demo dataset. Every organization is explicitly marked
-- so the administrator cleanup function cannot touch real client records.

do $$
declare
  active_policy_id bigint;
  advertiser_id bigint;
  fitness_id bigint;
  retail_id bigint;
  advertiser_location_id bigint;
  fitness_location_id bigint;
  retail_location_id bigint;
  fitness_device_id bigint;
  retail_device_id bigint;
  demo_asset_id bigint;
  demo_campaign_id bigint;
  primary_channel_id bigint;
begin
  select id into active_policy_id
  from public.policy_versions
  where effective_at <= now() and (superseded_at is null or superseded_at > now())
  order by effective_at desc
  limit 1;

  insert into public.organizations (public_id, display_name, legal_name, category, status, accepted_policy_version_id, billing_profile)
  values
    ('11111111-1111-4111-8111-111111111111', 'Demo Atlas Café', 'Demo Atlas Café SARL', 'Café', 'active', active_policy_id, '{"demo":true,"demo_batch":"beta-2026-08"}'),
    ('22222222-2222-4222-8222-222222222222', 'Demo Marina Fitness', 'Demo Marina Fitness SARL', 'Fitness', 'active', active_policy_id, '{"demo":true,"demo_batch":"beta-2026-08"}'),
    ('33333333-3333-4333-8333-333333333333', 'Demo Palm Retail', 'Demo Palm Retail SARL', 'Retail', 'active', active_policy_id, '{"demo":true,"demo_batch":"beta-2026-08"}')
  on conflict (public_id) do update set
    display_name = excluded.display_name,
    legal_name = excluded.legal_name,
    category = excluded.category,
    status = excluded.status,
    accepted_policy_version_id = excluded.accepted_policy_version_id,
    billing_profile = excluded.billing_profile;

  select id into advertiser_id from public.organizations where public_id = '11111111-1111-4111-8111-111111111111';
  select id into fitness_id from public.organizations where public_id = '22222222-2222-4222-8222-222222222222';
  select id into retail_id from public.organizations where public_id = '33333333-3333-4333-8333-333333333333';

  insert into public.wallets (organization_id, wallet_type, balance_projection)
  values
    (advertiser_id, 'promotional', 5000),
    (fitness_id, 'promotional', 5000),
    (retail_id, 'promotional', 5000),
    (fitness_id, 'earned', 0),
    (retail_id, 'earned', 0)
  on conflict (organization_id, wallet_type) do update set balance_projection = excluded.balance_projection;

  insert into public.locations (public_id, organization_id, name, address, zone, category, operating_hours, traffic_band, quality_score, status)
  values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', advertiser_id, 'Atlas Café Downtown', 'Demo address · Casablanca', 'Casablanca Centre', 'Café', '{"demo":true,"timezone":"Africa/Casablanca","days":["mon","tue","wed","thu","fri","sat"]}', 'high', 96, 'active'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', fitness_id, 'Marina Fitness Reception', 'Demo address · Casablanca Marina', 'Casablanca Marina', 'Fitness', '{"demo":true,"timezone":"Africa/Casablanca","days":["mon","tue","wed","thu","fri","sat","sun"]}', 'high', 94, 'active'),
    ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', retail_id, 'Palm Retail Entrance', 'Demo address · Maarif', 'Casablanca Maarif', 'Retail', '{"demo":true,"timezone":"Africa/Casablanca","days":["mon","tue","wed","thu","fri","sat","sun"]}', 'medium', 91, 'active')
  on conflict (public_id) do update set
    organization_id = excluded.organization_id,
    name = excluded.name,
    address = excluded.address,
    zone = excluded.zone,
    category = excluded.category,
    operating_hours = excluded.operating_hours,
    traffic_band = excluded.traffic_band,
    quality_score = excluded.quality_score,
    status = excluded.status;

  select id into advertiser_location_id from public.locations where public_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  select id into fitness_location_id from public.locations where public_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  select id into retail_location_id from public.locations where public_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  insert into public.devices (public_id, location_id, name, activation_status, key_fingerprint, app_version, capabilities, last_heartbeat_at, risk_state)
  values
    ('dddddddd-dddd-4ddd-8ddd-dddddddddd01', fitness_location_id, 'Demo Marina Screen', 'active', 'demo-marina-screen-key-2026', '0.1.0-beta', '{"demo":true,"player":"web"}', now() - interval '25 seconds', 'low'),
    ('dddddddd-dddd-4ddd-8ddd-dddddddddd02', retail_location_id, 'Demo Palm Entrance Screen', 'active', 'demo-palm-screen-key-2026', '0.1.0-beta', '{"demo":true,"player":"web"}', now() - interval '45 minutes', 'review')
  on conflict (public_id) do update set
    location_id = excluded.location_id,
    name = excluded.name,
    activation_status = excluded.activation_status,
    key_fingerprint = excluded.key_fingerprint,
    app_version = excluded.app_version,
    capabilities = excluded.capabilities,
    last_heartbeat_at = excluded.last_heartbeat_at,
    risk_state = excluded.risk_state;

  select id into fitness_device_id from public.devices where public_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01';
  select id into retail_device_id from public.devices where public_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd02';

  delete from public.device_observations
  where device_id in (fitness_device_id, retail_device_id)
    and client_info @> '{"demo":true}'::jsonb;
  insert into public.device_observations (device_id, organization_id, observed_ip, user_agent, device_type, os_name, browser_name, locale, timezone, screen_width, screen_height, device_pixel_ratio, connection_type, country_code, edge_colo, client_info, observed_at)
  values
    (fitness_device_id, fitness_id, '192.0.2.10', 'Loopline Demo Player', 'smart_tv', 'Android TV 12', 'Loopline Player', 'fr-MA', 'Africa/Casablanca', 1920, 1080, 1, 'ethernet', 'MA', 'demo-casablanca', '{"demo":true}', now() - interval '25 seconds'),
    (retail_device_id, retail_id, '198.51.100.24', 'Loopline Demo Player', 'display_player', 'Android TV 11', 'Loopline Player', 'ar-MA', 'Africa/Casablanca', 1920, 1080, 1, 'wifi', 'MA', 'demo-casablanca', '{"demo":true}', now() - interval '45 minutes');

  insert into public.media_assets (
    public_id, organization_id, name, original_storage_path, normalized_storage_path,
    duration_ms, width, height, codec, checksum_sha256, moderation_status,
    rights_declared_at, original_filename, mime_type, file_size_bytes,
    technical_metadata, submitted_at, moderated_at, processing_status,
    processing_completed_at, normalized_file_size_bytes
  ) values (
    '44444444-4444-4444-8444-444444444444', advertiser_id, 'Demo Brand Story',
    '11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444/demo-sintel-trailer.mp4',
    '11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444/demo-sintel-trailer.mp4',
    52200, 854, 480, 'h264', 'b670602fa00934ca27c4351bb0efe7ea7a07fae57284e44226025eeed7c51254',
    'approved', now(), 'demo-sintel-trailer.mp4', 'video/mp4', 4372373,
    '{"demo":true,"source":"W3C Sintel trailer","purpose":"controlled beta playback"}',
    now(), now(), 'ready', now(), 4372373
  )
  on conflict (public_id) do update set
    organization_id = excluded.organization_id,
    name = excluded.name,
    original_storage_path = excluded.original_storage_path,
    normalized_storage_path = excluded.normalized_storage_path,
    duration_ms = excluded.duration_ms,
    width = excluded.width,
    height = excluded.height,
    codec = excluded.codec,
    checksum_sha256 = excluded.checksum_sha256,
    moderation_status = excluded.moderation_status,
    rights_declared_at = excluded.rights_declared_at,
    original_filename = excluded.original_filename,
    mime_type = excluded.mime_type,
    file_size_bytes = excluded.file_size_bytes,
    technical_metadata = excluded.technical_metadata,
    processing_status = excluded.processing_status,
    processing_completed_at = excluded.processing_completed_at,
    normalized_file_size_bytes = excluded.normalized_file_size_bytes;

  select id into demo_asset_id from public.media_assets where public_id = '44444444-4444-4444-8444-444444444444';

  insert into public.campaigns (public_id, organization_id, media_asset_id, policy_version_id, name, status, starts_at, ends_at, budget_credits, daily_cap_credits, frequency_cap_per_day, targeting)
  values ('55555555-5555-4555-8555-555555555555', advertiser_id, demo_asset_id, active_policy_id, 'Demo Casablanca Awareness', 'draft', date_trunc('day', now()) + interval '1 day', date_trunc('day', now()) + interval '31 days' - interval '1 millisecond', 1200, 60, 3, '{"demo":true,"mode":"selected_businesses","target_count":2}')
  on conflict (public_id) do update set
    organization_id = excluded.organization_id,
    media_asset_id = excluded.media_asset_id,
    policy_version_id = excluded.policy_version_id,
    name = excluded.name,
    status = 'draft',
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    budget_credits = excluded.budget_credits,
    daily_cap_credits = excluded.daily_cap_credits,
    frequency_cap_per_day = excluded.frequency_cap_per_day,
    targeting = excluded.targeting;

  select id into demo_campaign_id from public.campaigns where public_id = '55555555-5555-4555-8555-555555555555';
  insert into public.campaign_target_organizations (campaign_id, organization_id)
  values (demo_campaign_id, fitness_id), (demo_campaign_id, retail_id)
  on conflict (campaign_id, organization_id) do nothing;

  select id into primary_channel_id from public.streaming_channels where status = 'active' order by created_at limit 1;
  if primary_channel_id is not null then
    insert into public.streaming_channel_organizations (channel_id, organization_id)
    values (primary_channel_id, fitness_id), (primary_channel_id, retail_id)
    on conflict (channel_id, organization_id) do nothing;

    insert into public.streaming_channel_items (channel_id, media_asset_id, position, status)
    values (primary_channel_id, demo_asset_id, coalesce((select max(position) + 1 from public.streaming_channel_items where channel_id = primary_channel_id), 1), 'active')
    on conflict (channel_id, media_asset_id) do update set status = 'active';
  end if;
end;
$$;

select
  (select count(*) from public.organizations where billing_profile @> '{"demo":true}'::jsonb) as demo_businesses,
  (select count(*) from public.locations location join public.organizations organization on organization.id = location.organization_id where organization.billing_profile @> '{"demo":true}'::jsonb) as demo_locations,
  (select count(*) from public.devices device join public.locations location on location.id = device.location_id join public.organizations organization on organization.id = location.organization_id where organization.billing_profile @> '{"demo":true}'::jsonb) as demo_screens,
  (select count(*) from public.media_assets asset join public.organizations organization on organization.id = asset.organization_id where organization.billing_profile @> '{"demo":true}'::jsonb) as demo_media,
  (select count(*) from public.campaigns campaign join public.organizations organization on organization.id = campaign.organization_id where organization.billing_profile @> '{"demo":true}'::jsonb) as demo_campaigns;
