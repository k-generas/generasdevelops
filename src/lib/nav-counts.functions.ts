import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

// At-a-glance numbers for the sidebar, so the shell always shows what needs
// attention without opening a page. All counts are owner-scoped by RLS.
export type NavCounts = {
  businesses: number;
  phoneNumbers: number;
  newLeads: number;
  updatesUnread: number;
  discoverFailed: number;
  historyRuns: number;
  leaksOpen: number;
  offersActive: number;
  offersMissingPrice: number;
  handoffsPlanned: number;
  subscriptionsProposed: number;
  referralsPending: number;
  recoveryCandidates: number;
  intentSignals: number;
  radarNew: number;
  ordersOpen: number;
  rwandaCompanies: number;
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
    const now = new Date();
    const nowIso = now.toISOString();
    const weekAgoIso = new Date(now.getTime() - 7 * 86_400_000).toISOString();
    const staleIso = new Date(now.getTime() - 14 * 86_400_000).toISOString();

    const head = <T extends keyof Database["public"]["Tables"]>(table: T) =>
      supabase.from(table).select("id", { count: "exact", head: true });

    const [
      businesses,
      phoneNumbers,
      newLeads,
      updatesUnread,
      discoverFailed,
      historyRuns,
      leaksOpen,
      offersActive,
      offersMissingPrice,
      handoffsPlanned,
      subscriptionsProposed,
      referralsPending,
      recoveryCandidates,
      intentSignals,
      radarNew,
      ordersOpen,
      rwandaCompanies,
      tasksOpen,
      tasksOverdue,
      proposalsDraft,
      invoicesOverdue,
    ] = await Promise.all([
      n(head("businesses")),
      supabase
        .from("businesses")
        .select("phone,cell")
        .then(({ data }) => countPhoneNumbers(data ?? [])),
      supabase
        .from("user_preferences")
        .select("previous_visit_at")
        .maybeSingle()
        .then(async ({ data }) => {
          const prev = data?.previous_visit_at;
          if (!prev) return 0;
          return n(head("businesses").gt("created_at", prev));
        }),
      n(head("daily_digests").is("read_at", null)),
      n(head("discovery_runs").eq("status", "failed")),
      n(head("discovery_runs").eq("archived", false)),
      n(head("revenue_leaks").eq("status", "open")),
      n(head("offers").eq("active", true)),
      n(head("offers").eq("active", true).is("default_price", null)),
      n(head("partner_handoffs").eq("status", "planned")),
      n(head("subscriptions").eq("status", "proposed")),
      n(head("referrals").in("status", ["invited", "accepted"])),
      Promise.all([
        n(head("proposals").eq("status", "REJECTED")),
        n(
          head("proposals")
            .in("status", ["SENT", "REPLIED", "NEGOTIATING"])
            .not("sent_at", "is", null)
            .lt("updated_at", staleIso),
        ),
      ]).then(([lost, stale]) => lost + stale),
      n(head("company_events")),
      n(head("businesses").gte("created_at", weekAgoIso)),
      n(head("orders").in("status", ["DRAFT", "PENDING", "IN_PROGRESS", "READY"])),
      n(head("businesses").not("province", "is", null)),
      n(head("tasks").eq("status", "open")),
      n(head("tasks").eq("status", "open").not("due_at", "is", null).lt("due_at", nowIso)),
      n(head("proposals").in("status", ["DRAFT", "READY_TO_SEND"])),
      n(head("invoices").neq("status", "PAID").not("due_at", "is", null).lt("due_at", nowIso)),
    ]);

    return {
      businesses,
      phoneNumbers,
      newLeads,
      updatesUnread,
      discoverFailed,
      historyRuns,
      leaksOpen,
      offersActive,
      offersMissingPrice,
      handoffsPlanned,
      subscriptionsProposed,
      referralsPending,
      recoveryCandidates,
      intentSignals,
      radarNew,
      ordersOpen,
      rwandaCompanies,
      tasksOpen,
      tasksOverdue,
      proposalsDraft,
      invoicesOverdue,
    };
  });
