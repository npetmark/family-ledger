
CREATE INDEX IF NOT EXISTS idx_transactions_user_account ON public.transactions(user_id, account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_transfer_to ON public.transactions(user_id, transfer_to_account_id) WHERE transfer_to_account_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_account_balances()
RETURNS TABLE (
  account_id uuid,
  name text,
  currency text,
  account_type text,
  icon text,
  is_visible boolean,
  sort_order integer,
  starting_balance bigint,
  balance bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH uid AS (SELECT auth.uid() AS id),
  agg AS (
    SELECT
      a.id AS account_id,
      COALESCE(SUM(CASE WHEN t.transaction_type = 'income'   AND t.account_id = a.id THEN t.amount ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN t.transaction_type = 'expense'  AND t.account_id = a.id THEN t.amount ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN t.transaction_type = 'transfer' AND t.account_id = a.id THEN t.amount ELSE 0 END), 0)
      + COALESCE(SUM(CASE WHEN t.transaction_type = 'transfer' AND t.transfer_to_account_id = a.id THEN t.amount ELSE 0 END), 0)
      AS delta
    FROM public.accounts a
    LEFT JOIN public.transactions t
      ON t.user_id = a.user_id
     AND (t.account_id = a.id OR t.transfer_to_account_id = a.id)
    WHERE a.user_id = (SELECT id FROM uid)
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
  WHERE a.user_id = (SELECT id FROM uid)
  ORDER BY a.sort_order;
$$;

GRANT EXECUTE ON FUNCTION public.get_account_balances() TO authenticated;
