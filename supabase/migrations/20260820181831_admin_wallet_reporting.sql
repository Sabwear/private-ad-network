-- Read-only, administrator-scoped wallet intelligence. Lifetime totals are
-- calculated in PostgreSQL so the dashboard does not need to download an
-- unbounded ledger; only the latest detail rows are returned for inspection.

create or replace function public.get_admin_wallet_report(
  p_organization_id bigint default null,
  p_history_limit integer default 100
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  report jsonb;
  history_limit integer := least(greatest(coalesce(p_history_limit, 100), 1), 250);
begin
  if not (select private.is_platform_admin()) then
    raise insufficient_privilege using message = 'Platform administrator access is required';
  end if;

  with business_stats as (
    select
      organization.id,
      organization.display_name,
      organization.status,
      coalesce(wallets.balance, 0) as balance,
      coalesce(wallets.promotional_balance, 0) as promotional_balance,
      coalesce(wallets.purchased_balance, 0) as purchased_balance,
      coalesce(wallets.earned_balance, 0) as earned_balance,
      coalesce(wallets.held_balance, 0) as held_balance,
      coalesce(activity.funded_credits, 0) as funded_credits,
      coalesce(activity.spent_credits, 0) as spent_credits,
      coalesce(activity.earned_credits, 0) as earned_credits,
      activity.last_activity_at,
      coalesce(latest_funder.actor_name, 'No funding recorded') as last_funded_by,
      campaigns.active_campaigns,
      campaigns.campaign_budget,
      campaigns.campaign_spent
    from public.organizations organization
    left join lateral (
      select
        sum(wallet.balance_projection) as balance,
        sum(wallet.balance_projection) filter (where wallet.wallet_type = 'promotional') as promotional_balance,
        sum(wallet.balance_projection) filter (where wallet.wallet_type = 'purchased') as purchased_balance,
        sum(wallet.balance_projection) filter (where wallet.wallet_type = 'earned') as earned_balance,
        sum(wallet.balance_projection) filter (where wallet.wallet_type = 'held') as held_balance
      from public.wallets wallet
      where wallet.organization_id = organization.id
    ) wallets on true
    left join lateral (
      select
        sum(entry.amount) filter (
          where entry.amount > 0
            and transaction.transaction_type in ('purchase', 'bonus', 'adjustment')
            and wallet.wallet_type <> 'earned'
        ) as funded_credits,
        sum(-entry.amount) filter (
          where entry.amount < 0
            and wallet.wallet_type in ('promotional', 'purchased', 'earned')
        ) as spent_credits,
        sum(entry.amount) filter (where entry.amount > 0 and wallet.wallet_type = 'earned') as earned_credits,
        max(entry.created_at) as last_activity_at
      from public.wallets wallet
      join public.ledger_entries entry on entry.wallet_id = wallet.id
      join public.ledger_transactions transaction on transaction.id = entry.transaction_id and transaction.status = 'posted'
      where wallet.organization_id = organization.id
    ) activity on true
    left join lateral (
      select coalesce(profile.full_name, profile.email, 'Platform administrator') as actor_name
      from public.wallets wallet
      join public.ledger_entries entry on entry.wallet_id = wallet.id and entry.amount > 0
      join public.ledger_transactions transaction on transaction.id = entry.transaction_id
        and transaction.status = 'posted'
        and transaction.transaction_type in ('purchase', 'bonus', 'adjustment')
      left join public.profiles profile on profile.id = transaction.created_by
      where wallet.organization_id = organization.id and wallet.wallet_type <> 'earned'
      order by entry.created_at desc, entry.id desc
      limit 1
    ) latest_funder on true
    left join lateral (
      select
        count(*) filter (where campaign.status in ('active', 'scheduled')) as active_campaigns,
        coalesce(sum(campaign.budget_credits), 0) as campaign_budget,
        coalesce(sum(campaign.spent_credits), 0) as campaign_spent
      from public.campaigns campaign
      where campaign.organization_id = organization.id
    ) campaigns on true
  ),
  business_list as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', stats.id,
      'name', stats.display_name,
      'status', stats.status,
      'balance', stats.balance,
      'promotionalBalance', stats.promotional_balance,
      'purchasedBalance', stats.purchased_balance,
      'earnedBalance', stats.earned_balance,
      'heldBalance', stats.held_balance,
      'fundedCredits', stats.funded_credits,
      'spentCredits', stats.spent_credits,
      'earnedCredits', stats.earned_credits,
      'lastActivityAt', stats.last_activity_at,
      'lastFundedBy', stats.last_funded_by
    ) order by stats.display_name), '[]'::jsonb) as value
    from business_stats stats
  ),
  selected as (
    select jsonb_build_object(
      'id', stats.id,
      'name', stats.display_name,
      'status', stats.status,
      'balance', stats.balance,
      'fundedCredits', stats.funded_credits,
      'spentCredits', stats.spent_credits,
      'earnedCredits', stats.earned_credits,
      'activeCampaigns', stats.active_campaigns,
      'campaignBudget', stats.campaign_budget,
      'campaignSpent', stats.campaign_spent,
      'lastActivityAt', stats.last_activity_at,
      'wallets', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', wallet.id,
          'type', wallet.wallet_type,
          'balance', wallet.balance_projection,
          'updatedAt', wallet.updated_at
        ) order by case wallet.wallet_type when 'promotional' then 1 when 'earned' then 2 when 'purchased' then 3 else 4 end)
        from public.wallets wallet where wallet.organization_id = stats.id
      ), '[]'::jsonb),
      'fundingHistory', coalesce((
        select jsonb_agg(funding.row_data order by funding.created_at desc, funding.entry_id desc)
        from (
          select entry.id as entry_id, entry.created_at, jsonb_build_object(
            'id', entry.id,
            'transactionId', transaction.id,
            'publicId', transaction.public_id,
            'amount', entry.amount,
            'walletType', wallet.wallet_type,
            'type', transaction.transaction_type,
            'referenceType', transaction.reference_type,
            'referenceId', transaction.reference_id,
            'description', entry.description,
            'reason', transaction.reason,
            'fundedBy', coalesce(profile.full_name, profile.email, 'Platform administrator'),
            'funderEmail', profile.email,
            'createdAt', entry.created_at
          ) as row_data
          from public.wallets wallet
          join public.ledger_entries entry on entry.wallet_id = wallet.id and entry.amount > 0
          join public.ledger_transactions transaction on transaction.id = entry.transaction_id
            and transaction.status = 'posted'
            and transaction.transaction_type in ('purchase', 'bonus', 'adjustment')
          left join public.profiles profile on profile.id = transaction.created_by
          where wallet.organization_id = stats.id and wallet.wallet_type <> 'earned'
          order by entry.created_at desc, entry.id desc
          limit history_limit
        ) funding
      ), '[]'::jsonb),
      'spendHistory', coalesce((
        select jsonb_agg(spending.row_data order by spending.created_at desc, spending.entry_id desc)
        from (
          select entry.id as entry_id, entry.created_at, jsonb_build_object(
            'id', entry.id,
            'transactionId', transaction.id,
            'publicId', transaction.public_id,
            'amount', -entry.amount,
            'walletType', wallet.wallet_type,
            'type', transaction.transaction_type,
            'referenceType', transaction.reference_type,
            'referenceId', transaction.reference_id,
            'description', entry.description,
            'reason', transaction.reason,
            'createdAt', entry.created_at,
            'asset', media.name,
            'hostBusiness', host.display_name,
            'verifiedSeconds', credit.verified_seconds,
            'busyMultiplier', credit.evidence ->> 'busyMultiplier',
            'validationResult', credit.validation_result
          ) as row_data
          from public.wallets wallet
          join public.ledger_entries entry on entry.wallet_id = wallet.id and entry.amount < 0
          join public.ledger_transactions transaction on transaction.id = entry.transaction_id and transaction.status = 'posted'
          left join public.stream_credit_events credit on credit.ledger_transaction_id = transaction.id
          left join public.media_assets media on media.id = credit.media_asset_id
          left join public.organizations host on host.id = credit.host_organization_id
          where wallet.organization_id = stats.id
            and wallet.wallet_type in ('promotional', 'purchased', 'earned')
          order by entry.created_at desc, entry.id desc
          limit history_limit
        ) spending
      ), '[]'::jsonb)
    ) as value
    from business_stats stats
    where stats.id = p_organization_id
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'businesses', business_list.value,
    'selectedBusiness', (select selected.value from selected)
  ) into report
  from business_list;

  return report;
end;
$$;

revoke all on function public.get_admin_wallet_report(bigint, integer) from public, anon;
grant execute on function public.get_admin_wallet_report(bigint, integer) to authenticated;
