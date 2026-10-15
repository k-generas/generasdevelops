// Server functions for Lost-Deal Recovery (Feature G). Reads the owner's proposals
// and surfaces respectful re-approach candidates. Creating a follow-up writes a
// normal task (with a stable dedupe key) — the app never messages the buyer itself.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  recoveryCandidates,
  recoveryTaskKey,
  type ProposalLike,
  type RecoveryCandidate,
} from "./recovery";

export type RecoveryCandidateWithProposal = RecoveryCandidate & { proposalTitle: string };

type ProposalJoinRow = {
  id: string;
  business_id: string | null;
  title: string | null;
  price: number | null;
  currency: string | null;
  status: string;
  outcome: string | null;
  sent_at: string | null;
  updated_at: string | null;
  created_at: string | null;
  businesses: { name: string } | null;
};

export const getRecoveryCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RecoveryCandidate[]> => {
    const { data, error } = await context.supabase
      .from("proposals")
      .select(
        "id, business_id, title, price, currency, status, outcome, sent_at, updated_at, created_at, businesses(name)",
      )
      .eq("owner_id", context.userId)
      .order("updated_at", { ascending: false })
      .limit(3000);
    if (error) throw new Error(error.message);

    const rows: ProposalLike[] = (data ?? []).map((row) => {
      const r = row as unknown as ProposalJoinRow;
      return {
        id: r.id,
        business_id: r.business_id ?? null,
        business_name: r.businesses?.name ?? null,
        title: r.title ?? null,
        price: r.price ?? null,
        currency: r.currency ?? null,
        status: r.status,
        outcome: r.outcome ?? null,
        sent_at: r.sent_at ?? null,
        updated_at: r.updated_at ?? null,
        created_at: r.created_at ?? null,
      };
    });

    return recoveryCandidates(rows, new Date());
  });

const taskInput = z.object({
  proposal_id: z.string().uuid(),
  business_id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(300),
  reason: z.enum(["no_response", "lost", "soft_no"]),
  note: z.string().trim().max(2000).nullable().optional(),
});

export const createRecoveryTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => taskInput.parse(d))
  .handler(async ({ data, context }): Promise<{ created: boolean; taskId: string }> => {
    const key = recoveryTaskKey(data.proposal_id);
    const { data: existing } = await context.supabase
      .from("tasks")
      .select("id")
      .eq("owner_id", context.userId)
      .eq("dedupe_key", key)
      .limit(1)
      .maybeSingle();
    if (existing?.id) return { created: false, taskId: existing.id };

    const due = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const { data: inserted, error } = await context.supabase
      .from("tasks")
      .insert({
        owner_id: context.userId,
        business_id: data.business_id ?? null,
        proposal_id: data.proposal_id,
        title: data.title,
        description: data.note ?? null,
        source: "recovery",
        dedupe_key: key,
        status: "open",
        priority: data.reason === "soft_no" ? "high" : "medium",
        due_at: due,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { created: true, taskId: inserted.id };
  });
