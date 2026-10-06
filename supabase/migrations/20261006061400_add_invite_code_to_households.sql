-- Add invite_code to households
ALTER TABLE public.households ADD COLUMN invite_code text UNIQUE;

-- Create an extension if not exists for random string (or use simple SQL)
CREATE OR REPLACE FUNCTION generate_invite_code(length integer DEFAULT 8)
RETURNS text AS $$
DECLARE
  chars text[] := '{0,1,2,3,4,5,6,7,8,9,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z}';
  result text := '';
  i integer := 0;
BEGIN
  IF length < 0 THEN
    raise exception 'Given length cannot be less than 0';
  END IF;
  FOR i IN 1..length LOOP
    result := result || chars[1+random()*(array_length(chars, 1)-1)];
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Generate invite codes for existing households
UPDATE public.households SET invite_code = generate_invite_code(8) WHERE invite_code IS NULL;

-- Make it not null going forward
ALTER TABLE public.households ALTER COLUMN invite_code SET NOT NULL;

-- Function to handle joining via invite code
CREATE OR REPLACE FUNCTION join_household(p_invite_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_household_id uuid;
BEGIN
  -- Find household by invite code
  SELECT id INTO v_household_id FROM public.households WHERE invite_code = p_invite_code;
  
  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  -- Add user as member
  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (v_household_id, auth.uid(), 'member')
  ON CONFLICT (household_id, user_id) DO NOTHING;
END;
$$;

-- Trigger to auto-generate invite_code for new households
CREATE OR REPLACE FUNCTION set_household_invite_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invite_code IS NULL THEN
    NEW.invite_code := generate_invite_code(8);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_household_invite_code
BEFORE INSERT ON public.households
FOR EACH ROW
EXECUTE FUNCTION set_household_invite_code();
