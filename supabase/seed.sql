-- Seed data for pre-migration state
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, is_super_admin)
VALUES 
('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'test@family.com', 'hashed_pwd', now(), '{}', '{}', now(), now(), 'authenticated', false);

INSERT INTO public.accounts (id, name, account_type, starting_balance, user_id, is_visible, created_at)
VALUES 
(gen_random_uuid(), 'Checking Account', 'checking', 1000.00, '11111111-1111-1111-1111-111111111111', true, now()),
(gen_random_uuid(), 'Savings Account', 'savings', 5000.00, '11111111-1111-1111-1111-111111111111', true, now());

INSERT INTO public.main_categories (id, user_id, name, color, sort_order, created_at)
VALUES
(gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Housing', '#FF0000', 1, now());
