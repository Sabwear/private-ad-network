-- Keep the removable beta dataset useful after per-advertiser credit isolation:
-- the two demo businesses with newly uploaded channel ads need advertiser funds.

do $$
declare
  target record;
  business_wallet_id bigint;
  platform_wallet_id bigint;
  transaction_id bigint;
  grant_amount numeric := 5000;
  grant_key text;
begin
  insert into public.wallets (organization_id, wallet_type)
  values (null, 'platform')
  on conflict (organization_id, wallet_type) do nothing;
  select id into platform_wallet_id from public.wallets
  where organization_id is null and wallet_type = 'platform' for update;

  for target in
    select id, public_id, display_name
    from public.organizations
    where public_id in (
      '22222222-2222-4222-8222-222222222222'::uuid,
      '33333333-3333-4333-8333-333333333333'::uuid
    )
      and billing_profile @> '{"demo": true}'::jsonb
  loop
    grant_key := 'demo-channel-credit-grant:' || target.public_id::text || ':20260820';
    if exists (select 1 from public.ledger_transactions where idempotency_key = grant_key) then
      continue;
    end if;

    insert into public.wallets (organization_id, wallet_type)
    values (target.id, 'promotional')
    on conflict (organization_id, wallet_type) do nothing;
    select id into business_wallet_id from public.wallets
    where organization_id = target.id and wallet_type = 'promotional' for update;

    insert into public.ledger_transactions (
      transaction_type, reference_type, reference_id, idempotency_key, status, reason
    ) values (
      'bonus', 'demo_channel_funding', target.public_id::text, grant_key, 'draft',
      'Fund assigned demo advertiser media for live channel verification'
    ) returning id into transaction_id;

    insert into public.ledger_entries (transaction_id, wallet_id, amount, description)
    values
      (transaction_id, business_wallet_id, grant_amount, 'Demo advertiser promotional credits'),
      (transaction_id, platform_wallet_id, -grant_amount, 'Demo promotional credit issuance');

    update public.wallets set balance_projection = balance_projection + grant_amount where id = business_wallet_id;
    update public.wallets set balance_projection = balance_projection - grant_amount where id = platform_wallet_id;
    update public.ledger_transactions set status = 'posted' where id = transaction_id;

    insert into public.audit_logs (
      organization_id, action, object_type, object_id, reason, after_summary
    ) values (
      target.id, 'grant_demo_channel_credits', 'ledger_transaction', transaction_id::text,
      'Fund assigned demo advertiser media for live channel verification',
      jsonb_build_object('amount', grant_amount, 'wallet_type', 'promotional', 'business', target.display_name)
    );
  end loop;
end;
$$;
