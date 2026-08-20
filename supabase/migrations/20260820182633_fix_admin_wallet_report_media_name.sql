-- The first hosted definition referenced an obsolete media column name. Keep
-- this forward repair so already-migrated environments receive the canonical
-- definition without changing any ledger or wallet data.
do $migration$
declare
  definition text;
begin
  select pg_get_functiondef(procedure.oid) into definition
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'get_admin_wallet_report'
    and pg_get_function_identity_arguments(procedure.oid) = 'p_organization_id bigint, p_history_limit integer';

  if definition is null then
    raise exception 'public.get_admin_wallet_report(bigint, integer) is missing';
  end if;

  execute replace(definition, 'media.title', 'media.name');
end;
$migration$;
