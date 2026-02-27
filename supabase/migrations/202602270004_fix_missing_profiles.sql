-- Migration to auto-create user profiles and add missing RLS

SET search_path = public, extensions;

-- 1. Replace the auth user created trigger to ensure profiles are always created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, role, trust_score, created_at)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'display_name', new.email), 'user', 0, now())
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 2. Add RLS policy to allow authenticated users to insert their own profile
-- (Select and Update already exist in 202602270001_init.sql)
DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
CREATE POLICY "profiles_insert_self"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  id = auth.uid()
  OR public.current_user_role() IN ('admin', 'mod')
);
