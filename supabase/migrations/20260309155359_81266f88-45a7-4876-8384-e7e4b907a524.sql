
CREATE TABLE public.pending_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  raw_text TEXT NOT NULL DEFAULT '',
  parsed_amount BIGINT,
  parsed_note TEXT DEFAULT '',
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  subcategory_id UUID REFERENCES public.subcategories(id) ON DELETE SET NULL,
  transaction_type TEXT NOT NULL DEFAULT 'expense',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pending_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own pending_transactions"
  ON public.pending_transactions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
