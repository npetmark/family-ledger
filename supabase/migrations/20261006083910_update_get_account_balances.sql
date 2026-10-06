CREATE OR REPLACE FUNCTION public.get_account_balances()
 RETURNS TABLE(account_id uuid, name text, currency text, account_type text, icon text, is_visible boolean, sort_order integer, starting_balance bigint, balance bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH agg AS (
    SELECT
      a.id AS account_id,
      COALESCE(SUM(CASE WHEN t.transaction_type = 'income'   AND t.account_id = a.id THEN t.amount ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN t.transaction_type = 'expense'  AND t.account_id = a.id THEN t.amount ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN t.transaction_type = 'transfer' AND t.account_id = a.id THEN t.amount ELSE 0 END), 0)
      + COALESCE(SUM(CASE WHEN t.transaction_type = 'transfer' AND t.transfer_to_account_id = a.id THEN t.amount ELSE 0 END), 0)
      AS delta
    FROM public.accounts a
    LEFT JOIN public.transactions t
      ON (t.account_id = a.id OR t.transfer_to_account_id = a.id)
    GROUP BY a.id
  )
  SELECT
    a.id,
    a.name,
    a.currency,
    a.account_type,
    a.icon,
    a.is_visible,
    a.sort_order,
    a.starting_balance,
    (a.starting_balance + COALESCE(agg.delta, 0))::bigint AS balance
  FROM public.accounts a
  LEFT JOIN agg ON agg.account_id = a.id
  ORDER BY a.sort_order;
$function$;
