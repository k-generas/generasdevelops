// Applies the pgcrypto search_path fix for the access-code RPCs, then verifies
// that gen_random_bytes()/digest() resolve in the functions' execution context.
//
// Why: Supabase hosts pgcrypto in the `extensions` schema. The SECURITY DEFINER
// functions were pinned to `SET search_path = public`, so issuing and redeeming
// access codes failed at runtime with:
//   function gen_random_bytes(integer) does not exist
//
// Usage:
//   LOVABLE_DB_MIGRATION_URL="postgres://..." node scripts/fix-pgcrypto-search-path.mjs
//   (DATABASE_URL is accepted as a fallback.)
//
// Idempotent: CREATE OR REPLACE only, no data is touched. The connection string
// is never printed.

import postgres from "postgres";

const url = process.env.LOVABLE_DB_MIGRATION_URL ?? process.env.DATABASE_URL ?? "";
if (!url) {
  console.error(
    "Missing database URL. Set LOVABLE_DB_MIGRATION_URL (preferred, same var as drizzle.config.ts) or DATABASE_URL.",
  );
  process.exit(1);
}

const ISSUE_ACCESS_CODE = `
CREATE OR REPLACE FUNCTION public.admin_issue_access_code(
  p_target_email text DEFAULT NULL,
  p_max_uses int DEFAULT 1,
  p_expires_in_hours int DEFAULT 168
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text;
  v_raw text;
  v_id uuid;
  v_email text;
  v_expires timestamp with time zone;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
  END IF;

  v_raw := upper(encode(gen_random_bytes(8), 'hex'));
  v_code := 'GARE-' || substr(v_raw, 1, 4) || '-' || substr(v_raw, 5, 4) || '-' || substr(v_raw, 9, 4) || '-' || substr(v_raw, 13, 4);
  v_email := NULLIF(trim(lower(p_target_email)), '');
  v_expires := now() + make_interval(hours => GREATEST(COALESCE(p_expires_in_hours, 168), 1));

  INSERT INTO public.access_codes (code_hash, code_prefix, target_email, issued_by, expires_at, max_uses)
  VALUES (encode(digest(v_code, 'sha256'), 'hex'), substr(v_code, 1, 9), v_email, v_uid, v_expires, GREATEST(COALESCE(p_max_uses, 1), 1))
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (actor_id, actor_email, action, target_user_email, details)
  VALUES (v_uid, (SELECT up.email FROM public.user_profiles up WHERE up.id = v_uid), 'code_issued', v_email, jsonb_build_object('code_id', v_id, 'max_uses', GREATEST(COALESCE(p_max_uses, 1), 1), 'expires_at', v_expires));

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'code', v_code, 'expires_at', v_expires);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_issue_access_code(text, int, int) TO authenticated;
`;

const REDEEM_ACCESS_CODE = `
CREATE OR REPLACE FUNCTION public.redeem_access_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_hash text;
  v_code public.access_codes%ROWTYPE;
  v_recent int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty_code');
  END IF;

  SELECT count(*) INTO v_recent
  FROM public.access_code_attempts a
  WHERE a.user_id = v_uid AND a.success = false AND a.created_at > now() - interval '10 minutes';
  IF v_recent >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
  END IF;

  v_hash := encode(digest(trim(p_code), 'sha256'), 'hex');
  SELECT * INTO v_code FROM public.access_codes c WHERE c.code_hash = v_hash FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.access_code_attempts (user_id, success) VALUES (v_uid, false);
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = v_uid;

  IF v_code.status <> 'active' THEN
    INSERT INTO public.access_code_attempts (user_id, success) VALUES (v_uid, false);
    RETURN jsonb_build_object('ok', false, 'error', 'code_' || v_code.status);
  END IF;
  IF v_code.expires_at IS NOT NULL AND v_code.expires_at < now() THEN
    UPDATE public.access_codes SET status = 'expired', updated_at = now() WHERE id = v_code.id;
    INSERT INTO public.access_code_attempts (user_id, success) VALUES (v_uid, false);
    RETURN jsonb_build_object('ok', false, 'error', 'code_expired');
  END IF;
  IF v_code.used_count >= v_code.max_uses THEN
    UPDATE public.access_codes SET status = 'used', updated_at = now() WHERE id = v_code.id;
    INSERT INTO public.access_code_attempts (user_id, success) VALUES (v_uid, false);
    RETURN jsonb_build_object('ok', false, 'error', 'code_exhausted');
  END IF;
  IF v_code.target_email IS NOT NULL AND lower(v_code.target_email) <> lower(COALESCE(v_email, '')) THEN
    INSERT INTO public.access_code_attempts (user_id, success) VALUES (v_uid, false);
    RETURN jsonb_build_object('ok', false, 'error', 'code_not_assigned');
  END IF;

  UPDATE public.access_codes
  SET used_count = used_count + 1,
      status = CASE WHEN used_count + 1 >= max_uses THEN 'used'::public.access_code_status ELSE status END,
      redeemed_at = now(),
      redeemed_by = v_uid,
      updated_at = now()
  WHERE id = v_code.id;

  UPDATE public.user_profiles
  SET access_status = 'approved',
      approved_at = now(),
      approved_by = v_code.issued_by,
      notes = NULL,
      updated_at = now()
  WHERE id = v_uid;

  INSERT INTO public.access_code_attempts (user_id, success) VALUES (v_uid, true);
  INSERT INTO public.audit_logs (actor_id, actor_email, action, target_user_id, target_user_email, details)
  VALUES (v_uid, v_email, 'code_redeemed', v_uid, v_email, jsonb_build_object('code_id', v_code.id));

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.redeem_access_code(text) TO authenticated;
`;

const TARGETS = [
  { name: "admin_issue_access_code", sql: ISSUE_ACCESS_CODE },
  { name: "redeem_access_code", sql: REDEEM_ACCESS_CODE },
];

const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  await sql.unsafe("CREATE EXTENSION IF NOT EXISTS pgcrypto");

  for (const target of TARGETS) {
    await sql.unsafe(target.sql);
    console.log(`applied  ${target.name}`);
  }

  const configured = await sql`
    SELECT p.proname AS name, COALESCE(p.proconfig, ARRAY[]::text[]) AS proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ${sql(TARGETS.map((t) => t.name))}
  `;

  let ok = true;
  for (const target of TARGETS) {
    const row = configured.find((r) => r.name === target.name);
    const entry = row?.proconfig?.find((c) => c.startsWith("search_path="));
    const paths = entry ? entry.replace("search_path=", "").split(",") : [];
    if (!paths.includes("extensions")) {
      ok = false;
      console.error(`FAIL     ${target.name}: search_path = ${entry ?? "(not set)"}`);
    } else {
      console.log(`proconfig ${target.name}: ${entry}`);
    }
  }

  await sql.unsafe("SET search_path TO public, extensions");
  const probe = await sql`
    SELECT
      encode(gen_random_bytes(8), 'hex') AS random_bytes,
      encode(digest('GARE', 'sha256'), 'hex') AS digest
  `;
  const randomOk = /^[0-9a-f]{16}$/.test(probe[0].random_bytes);
  const digestOk = /^[0-9a-f]{64}$/.test(probe[0].digest);
  if (!randomOk || !digestOk) {
    ok = false;
    console.error("FAIL     gen_random_bytes/digest probe returned unexpected output");
  } else {
    console.log("probe    gen_random_bytes(8) + digest() resolve in `public, extensions`");
  }

  if (!ok) {
    console.error("\nVerification failed — the RPCs may still break at runtime.");
    process.exitCode = 1;
  } else {
    console.log("\nOK — access-code RPCs now resolve pgcrypto. Try Generate code in the admin UI.");
  }
} catch (err) {
  console.error(`ERROR    ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
