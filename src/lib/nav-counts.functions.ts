import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// At-a-glance numbers for the sidebar, so the shell always shows what needs
// attention without opening a page. All counts are owner-scoped by RLS.
export type NavCounts = {
  businesses: number;
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

export const getNavCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NavCounts> => {
    const { supabase } = context;
    const nowIso = new Date().toISOString();
    const [
      businesses,
      updatesUnread,
      discoverFailed,
      leaksOpen,
      tasksOpen,
      tasksOverdue,
      proposalsDraft,
      invoicesOverdue,
    ] = await Promise.all([
      n(supabase.from("businesses").select("id", { count: "exact", head: true })),
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
      updatesUnread,
      discoverFailed,
      leaksOpen,
      tasksOpen,
      tasksOverdue,
      proposalsDraft,
      invoicesOverdue,
    };
  });
