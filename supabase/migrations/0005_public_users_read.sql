-- Allow unauthenticated (anon) users to read the users table
-- for the demo login picker dropdown.

DROP POLICY IF EXISTS "users_public_read" ON public.users;
CREATE POLICY "users_public_read"
  ON public.users FOR SELECT
  USING (is_active = true);
