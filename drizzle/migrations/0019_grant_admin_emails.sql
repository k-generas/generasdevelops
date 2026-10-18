-- Promote the configured administrator accounts to admin + approved.
-- Case-insensitive and safe to run repeatedly; creates the profile row if the
-- account exists in auth.users but has no profile yet.

DO $$
BEGIN
  IF to_regclass('public.user_profiles') IS NULL THEN
    RAISE NOTICE 'public.user_profiles does not exist yet - apply 0017/0018 first';
    RETURN;
  END IF;

  INSERT INTO public.user_profiles (id, email, access_status, is_admin)
  SELECT u.id, u.email, 'approved', true
  FROM auth.users u
  WHERE lower(u.email) IN ('generaskagiraneza9@gmail.com', 'generaskagiraneza@gmail.com')
  ON CONFLICT (id) DO UPDATE
    SET is_admin = true,
        access_status = 'approved',
        updated_at = now();

  UPDATE public.user_profiles
  SET is_admin = true,
      access_status = 'approved',
      updated_at = now()
  WHERE lower(email) IN ('generaskagiraneza9@gmail.com', 'generaskagiraneza@gmail.com');
END $$;
