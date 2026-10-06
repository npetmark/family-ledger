-- Ensure the owner-change guard runs AFTER inject_household_id_accounts
-- (same-event triggers fire in alphabetical order).
DROP TRIGGER IF EXISTS guard_account_owner_change ON public.accounts;
DROP TRIGGER IF EXISTS z_guard_account_owner_change ON public.accounts;
CREATE TRIGGER z_guard_account_owner_change
  BEFORE INSERT OR UPDATE OF owner_user_id ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_account_owner_change();
