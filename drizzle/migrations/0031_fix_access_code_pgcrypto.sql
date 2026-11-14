-- Fix access-code RPCs on Supabase, where pgcrypto lives in `extensions`.
--
-- 0018_admin_console.sql originally pinned the SECURITY DEFINER functions to
-- `SET search_path = public`, so issuing/redeeming codes failed with:
--   function gen_random_bytes(integer) does not exist
-- Forward-only and idempotent: only the function search_path is changed.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER FUNCTION public.admin_issue_access_code(text, integer, integer)
  SET search_path = public, extensions;

ALTER FUNCTION public.redeem_access_code(text)
  SET search_path = public, extensions;

NOTIFY pgrst, 'reload schema';
