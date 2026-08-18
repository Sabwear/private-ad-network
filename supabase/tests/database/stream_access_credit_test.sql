begin;

create extension if not exists pgtap with schema extensions;

select plan(36);

select has_table('public', 'stream_viewer_sessions', 'viewer sessions table exists');
select has_table('public', 'stream_credit_events', 'credit evidence table exists');
select has_table('public', 'stream_access_code_rotations', 'code rotation audit table exists');
select has_table('public', 'organization_busy_periods', 'business busy periods table exists');

select has_column('public', 'organizations', 'stream_access_code', 'business access code exists');
select has_column('public', 'organizations', 'stream_access_code_expires_at', 'access code expiry exists');
select has_column('public', 'organizations', 'stream_earning_enabled', 'earning toggle exists');
select has_column('public', 'organizations', 'stream_earning_rate', 'per-business earning rate exists');
select has_column('public', 'organizations', 'ad_consumption_rate', 'per-business consumption rate exists');
select has_column('public', 'stream_viewer_sessions', 'viewer_user_id', 'approved viewer identity exists');
select has_column('public', 'stream_viewer_sessions', 'retention_expires_at', 'PII retention deadline exists');
select has_column('public', 'stream_credit_events', 'validation_result', 'heartbeat validation result exists');
select has_column('public', 'stream_credit_events', 'evidence', 'heartbeat evidence exists');
select has_column('public', 'stream_viewer_sessions', 'country_code', 'coarse viewer country exists');
select has_column('public', 'stream_viewer_sessions', 'region_code', 'coarse viewer region exists');
select has_column('public', 'stream_viewer_sessions', 'city', 'coarse viewer city exists');
select has_column('public', 'stream_viewer_sessions', 'edge_colo', 'viewer edge location exists');

select ok(
  to_regprocedure('public.record_stream_viewer_heartbeat_v2(uuid,uuid,uuid,numeric,timestamp with time zone,boolean,boolean)') is not null,
  'hardened heartbeat function exists'
);
select ok(
  to_regprocedure('public.regenerate_stream_access_code(bigint)') is not null,
  'access code rotation function exists'
);
select ok(
  to_regprocedure('public.purge_expired_stream_viewer_data()') is not null,
  'viewer privacy purge function exists'
);
select ok(
  to_regprocedure('public.get_stream_monitor_snapshot(integer)') is not null,
  'administrator stream monitor snapshot exists'
);
select ok(
  to_regprocedure('public.admin_handle_stream_channel(bigint,text,text)') is not null,
  'audited channel handling function exists'
);
select ok(
  to_regprocedure('public.admin_end_stream_viewer_session(uuid,text)') is not null,
  'audited viewer termination function exists'
);
select ok(
  to_regprocedure('public.admin_replace_business_busy_periods(bigint,jsonb,text)') is not null,
  'audited busy-period replacement function exists'
);

select is(
  has_function_privilege('anon', 'public.record_stream_viewer_heartbeat_v2(uuid,uuid,uuid,numeric,timestamp with time zone,boolean,boolean)', 'EXECUTE'),
  false,
  'anonymous users cannot settle stream credits'
);
select is(
  has_function_privilege('authenticated', 'public.record_stream_viewer_heartbeat_v2(uuid,uuid,uuid,numeric,timestamp with time zone,boolean,boolean)', 'EXECUTE'),
  false,
  'authenticated clients cannot settle stream credits directly'
);
select is(
  has_function_privilege('service_role', 'public.record_stream_viewer_heartbeat_v2(uuid,uuid,uuid,numeric,timestamp with time zone,boolean,boolean)', 'EXECUTE'),
  true,
  'service role can settle verified stream credits'
);
select is(
  has_function_privilege('anon', 'public.purge_expired_stream_viewer_data()', 'EXECUTE'),
  false,
  'anonymous users cannot purge viewer data'
);
select is(
  has_function_privilege('anon', 'public.update_stream_credit_settings(bigint,boolean,numeric,numeric)', 'EXECUTE'),
  false,
  'anonymous users cannot change business credit rates'
);
select is(
  has_function_privilege('authenticated', 'public.update_stream_credit_settings(bigint,boolean,numeric,numeric)', 'EXECUTE'),
  true,
  'authenticated administrators and authorized business roles can request rate changes'
);
select is(
  has_function_privilege('anon', 'public.get_stream_monitor_snapshot(integer)', 'EXECUTE'),
  false,
  'anonymous users cannot read stream operations telemetry'
);
select is(
  has_function_privilege('anon', 'public.admin_handle_stream_channel(bigint,text,text)', 'EXECUTE'),
  false,
  'anonymous users cannot handle stream channels'
);
select is(
  has_function_privilege('anon', 'public.admin_end_stream_viewer_session(uuid,text)', 'EXECUTE'),
  false,
  'anonymous users cannot terminate viewer sessions'
);
select is(
  has_function_privilege('authenticated', 'public.get_stream_monitor_snapshot(integer)', 'EXECUTE'),
  true,
  'authenticated administrators can request the guarded monitor snapshot'
);
select is(
  has_function_privilege('anon', 'public.admin_replace_business_busy_periods(bigint,jsonb,text)', 'EXECUTE'),
  false,
  'anonymous users cannot change business busy periods'
);
select is(
  has_function_privilege('authenticated', 'public.admin_replace_business_busy_periods(bigint,jsonb,text)', 'EXECUTE'),
  true,
  'authenticated administrators can request busy-period changes'
);

select * from finish();
rollback;
