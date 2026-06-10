REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_default_accounts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_default_categories() FROM PUBLIC, anon, authenticated;