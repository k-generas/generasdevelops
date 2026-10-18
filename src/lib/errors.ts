// Central error translator: raw error → { title, message, fix }.
// Every page uses this so the user always sees WHY something failed,
// WHAT is missing, and WHAT to do about it.

export type AppError = {
  title: string;
  message: string;
  fix: string;
};

export function describeError(error: unknown, context?: string): AppError {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error ?? "unknown error");

  const lower = raw.toLowerCase();

  // --- Network / offline ---
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("load failed")
  ) {
    return {
      title: "Network problem",
      message: `${context ? context + ": " : ""}the browser could not reach the server. You may be offline or the connection dropped.`,
      fix: "Check your internet connection, then press Try again.",
    };
  }

  // --- Auth ---
  if (lower.includes("jwt") || lower.includes("token") || lower.includes("not authorized")) {
    return {
      title: "Session expired",
      message: `${context ? context + ": " : ""}your sign-in session is no longer valid.`,
      fix: "Sign out from the account menu and sign in again.",
    };
  }
  if (lower.includes("row-level security") || lower.includes("rls")) {
    return {
      title: "Permission denied (RLS)",
      message: `${context ? context + ": " : ""}the database blocked this request because of Row Level Security policy.`,
      fix: "Make sure you are signed in as the owner account. If the problem persists, review the RLS policies for this table in the Supabase dashboard.",
    };
  }
  if (lower.includes("invalid login") || lower.includes("auth credentials")) {
    return {
      title: "Sign-in failed",
      message: "The email or password you entered does not match an account.",
      fix: "Double-check your credentials, or create the owner account from the sign-in page.",
    };
  }

  // --- Access approval gate ---
  if (
    lower.includes("access pending") ||
    lower.includes("access rejected") ||
    lower.includes("access suspended") ||
    lower.includes("not been approved")
  ) {
    const state = lower.includes("suspended")
      ? "suspended"
      : lower.includes("rejected")
        ? "not approved"
        : "awaiting administrator approval";
    return {
      title: "Access restricted",
      message: `${context ? context + ": " : ""}your GARE access is ${state}.`,
      fix: "Contact the administrator at generaskagiraneza@gmail.com to request approval, then try again.",
    };
  }

  // --- Missing table / column (missing migration) ---
  if (
    lower.includes("does not exist") ||
    lower.includes("schema cache") ||
    lower.includes("could not find the table") ||
    (lower.includes("relation") && lower.includes("does not exist"))
  ) {
    return {
      title: "Database table missing",
      message: `${context ? context + ": " : ""}the required database table or column does not exist yet — a migration has not been applied.`,
      fix: "Apply the pending SQL migration (see docs/GARE_DB_RUNBOOK.md in the repo) from the Supabase SQL editor, then reload this page.",
    };
  }

  // --- API keys / provider config ---
  if (
    lower.includes("api key") ||
    lower.includes("apikey") ||
    lower.includes("missing key") ||
    lower.includes("not configured") ||
    lower.includes("no provider") ||
    (lower.includes("unauthorized") && lower.includes("api"))
  ) {
    return {
      title: "Missing API key",
      message: `${context ? context + ": " : ""}a required API key is not configured on the server, so this feature cannot run.`,
      fix: "Open Settings → Integrations to see which key is missing, then add it (e.g. OPENAI_API_KEY, GEMINI_API_KEY, GOOGLE_MAPS_API_KEY, GEOAPIFY_API_KEY) in your environment / Lovable connector settings.",
    };
  }

  // --- AI provider ---
  if (lower.includes("openai") || lower.includes("gemini") || lower.includes("model")) {
    return {
      title: "AI provider error",
      message: `${context ? context + ": " : ""}${raw}`,
      fix: "Check Settings → Integrations to confirm an AI key is configured. Try switching the AI provider dropdown to Auto, or pick a different provider.",
    };
  }

  // --- Google Maps / Places ---
  if (
    lower.includes("maps") ||
    lower.includes("places") ||
    lower.includes("geoapify") ||
    lower.includes("quota") ||
    lower.includes("billing")
  ) {
    return {
      title: "Places / Maps error",
      message: `${context ? context + ": " : ""}${raw}`,
      fix: "Check that a Places provider key is configured (Settings → Integrations). If it mentions quota or billing, the Maps project may be out of budget or the API is not enabled.",
    };
  }

  // --- Timeout ---
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return {
      title: "Timed out",
      message: `${context ? context + ": " : ""}the request took too long and was aborted.`,
      fix: "Try again. If it keeps timing out, the upstream service may be down — check Settings → Integrations.",
    };
  }

  // --- Permission / policy ---
  if (lower.includes("permission") || lower.includes("forbidden") || lower.includes("403")) {
    return {
      title: "Permission denied",
      message: `${context ? context + ": " : ""}${raw}`,
      fix: "You may be signed in as the wrong account, or a database policy is blocking this operation. Sign in as the owner, or review the table's RLS policies.",
    };
  }

  // --- Not found ---
  if (lower.includes("not found") || lower.includes("0 rows") || lower.includes("pgrst116")) {
    return {
      title: "Not found",
      message: `${context ? context + ": " : ""}the record you are looking for does not exist (it may have been deleted).`,
      fix: "Go back to the list and pick another item, or re-run a discovery to create new data.",
    };
  }

  // --- Unique violation ---
  if (
    lower.includes("duplicate") ||
    lower.includes("unique constraint") ||
    lower.includes("already exists")
  ) {
    return {
      title: "Duplicate record",
      message: `${context ? context + ": " : ""}${raw}`,
      fix: "A record with the same value already exists. Edit the existing entry instead of creating a new one.",
    };
  }

  // --- FK violation ---
  if (lower.includes("foreign key") || lower.includes("violates")) {
    return {
      title: "Related record missing",
      message: `${context ? context + ": " : ""}${raw}`,
      fix: "This action references a record that no longer exists. Refresh the page — the linked item may have been deleted.",
    };
  }

  // --- Generic ---
  return {
    title: context ? `${context} failed` : "Something went wrong",
    message: raw,
    fix: "Try again. If the problem persists, check Settings → Integrations for missing keys, and confirm the latest database migration has been applied.",
  };
}

/** One-line summary for inline toasts / small messages. */
export function errorLine(error: unknown, context?: string): string {
  const d = describeError(error, context);
  return `${d.title}: ${d.message} — ${d.fix}`;
}
