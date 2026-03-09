CREATE OR REPLACE FUNCTION public.seed_default_accounts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.accounts (user_id, name, icon, account_type, sort_order, starting_balance, currency)
  VALUES
    (NEW.id, 'Cash', 'banknote', 'cash', 0, 0, 'EUR'),
    (NEW.id, 'Card', 'credit-card', 'bank', 1, 0, 'EUR'),
    (NEW.id, 'Bank Account', 'landmark', 'bank', 2, 0, 'EUR');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_seed_accounts
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_default_accounts();