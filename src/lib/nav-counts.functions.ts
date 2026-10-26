import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// At-a-glance numbers for the sidebar, so the shell always shows what needs
// attention without opening a page. All counts are owner-scoped by RLS.
export type NavCounts = {
  businesses: number;
  phoneNumbers: number;
  updatesUnread: number;
  discoverFailed: number;
  leaksOpen: number;
  tasksOpen: number;
  tasksOverdue: number;
  proposalsDraft: number;
  invoicesOverdue: number;
};

type CountQuery = PromiseLike<{ count: number | null }>;

async function n(q: CountQuery): Promise<number> {
  const { count } = await q;
  return count ?? 0;
}

function normalizePhone(p: string | null | undefined): string {
  if (!p) return "";
  return p.replace(/\s+/g, "").replace(/[^+\d]/g, "");
}

// Mirrors the Numbers page: count unique phone/cell values collected so far.
function countPhoneNumbers(rows: Array<{ phone: string | null; cell: string | null }>): number {
  const unique = new Set<string>();
  for (const row of rows) {
    const phone = normalizePhone(row.phone);
    const cell = normalizePhone(row.cell);
    if (phone) unique.add(phone);
    if (cell) unique.add(cell);
  }
  return unique.size;
}

export const getNavCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NavCounts> => {
    const { supabase } = context;
    const nowIso = new Date().toISOString();
    const [
      businesses,
      phoneNumbers,
      updatesUnread,
      discoverFailed,
      leaksOpen,
      tasksOpen,
      tasksOverdue,
      proposalsDraft,
      invoicesOverdue,
    ] = await Promise.all([
      n(supabase.from("businesses").select("id", { count: "exact", head: true })),
      supabase
        .from("businesses")
        .select("phone,cell")
        .then(({ data }) => countPhoneNumbers(data ?? [])),
      n(
        supabase
          .from("daily_digests")
          .select("id", { count: "exact", head: true })
          .is("read_at", null),
      ),
      n(
        supabase
          .from("discovery_runs")
          .select("id", { count: "exact", head: true })
          .eq("status", "failed"),
      ),
      n(
        supabase
          .from("revenue_leaks")
          .select("id", { count: "exact", head: true })
          .eq("status", "open"),
      ),
      n(supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "open")),
      n(
        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("status", "open")
          .not("due_at", "is", null)
          .lt("due_at", nowIso),
      ),
      n(
        supabase
          .from("proposals")
          .select("id", { count: "exact", head: true })
          .in("status", ["DRAFT", "READY_TO_SEND"]),
      ),
      n(
        supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .neq("status", "PAID")
          .not("due_at", "is", null)
          .lt("due_at", nowIso),
      ),
    ]);
    return {
      businesses,
      phoneNumbers,
      updatesUnread,
      discoverFailed,
      leaksOpen,
      tasksOpen,
      tasksOverdue,
      proposalsDraft,
      invoicesOverdue,
    };
  });
