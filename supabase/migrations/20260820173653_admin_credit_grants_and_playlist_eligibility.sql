-- Audited administrator credit grants keep newly funded advertisers eligible
-- for channel delivery without bypassing the balanced ledger.

create or replace function private.admin_grant_business_credits(
  p_organization_id bigint,
  p_amount numeric,
  p_reason text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  business_wallet_id bigint;
  platform_wallet_id bigint;
  transaction_id bigint;
  request_id uuid := extensions.gen_random_uuid();
begin
  if not (select private.is_platform_admin()) then
    raise insufficient_privilege using message = 'Platform administrator access is required';
  end if;
  if p_amount <= 0 or p_amount > 1000000 then
    raise check_violation using message = 'The credit grant must be greater than zero and no more than 1,000,000';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 or length(p_reason) > 300 then
    raise check_violation using message = 'An administrative reason is required';
  end if;
  if not exists (select 1 from public.organizations where id = p_organization_id and status = 'active') then
    raise no_data_found using message = 'Active business not found';
  end if;

  insert into public.wallets (organization_id, wallet_type)
  values (p_organization_id, 'promotional')
  on conflict (organization_id, wallet_type) do nothing;
  insert into public.wallets (organization_id, wallet_type)
  values (null, 'platform')
  on conflict (organization_id, wallet_type) do nothing;

  select id into business_wallet_id from public.wallets
  where organization_id = p_organization_id and wallet_type = 'promotional' for update;
  select id into platform_wallet_id from public.wallets
  where organization_id is null and wallet_type = 'platform' for update;

  insert into public.ledger_transactions (
    transaction_type, reference_type, reference_id, idempotency_key,
    status, created_by, reason
  ) values (
    'bonus', 'admin_credit_grant', request_id::text,
    'admin-credit-grant:' || request_id::text, 'draft',
    (select auth.uid()), btrim(p_reason)
  ) returning id into transaction_id;

  insert into public.ledger_entries (transaction_id, wallet_id, amount, description)
  values
    (transaction_id, business_wallet_id, p_amount, 'Administrator promotional credit grant'),
    (transaction_id, platform_wallet_id, -p_amount, 'Platform promotional credit issuance');

  update public.wallets set balance_projection = balance_projection + p_amount where id = business_wallet_id;
  update public.wallets set balance_projection = balance_projection - p_amount where id = platform_wallet_id;
  update public.ledger_transactions set status = 'posted' where id = transaction_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, object_type, object_id, reason, after_summary
  ) values (
    p_organization_id, (select auth.uid()), 'grant_business_credits', 'ledger_transaction',
    transaction_id::text, btrim(p_reason), jsonb_build_object('amount', p_amount, 'wallet_type', 'promotional')
  );

  return transaction_id;
end;
$$;

create or replace function public.admin_grant_business_credits(
  p_organization_id bigint,
  p_amount numeric,
  p_reason text
)
returns bigint
language sql
security invoker
set search_path = ''
as $$
  select private.admin_grant_business_credits(p_organization_id, p_amount, p_reason);
$$;

revoke all on function private.admin_grant_business_credits(bigint, numeric, text) from public, anon;
revoke all on function public.admin_grant_business_credits(bigint, numeric, text) from public, anon;
grant execute on function private.admin_grant_business_credits(bigint, numeric, text) to authenticated;
grant execute on function public.admin_grant_business_credits(bigint, numeric, text) to authenticated;
