import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createRecoveryTask, getRecoveryCandidates } from "@/lib/recovery.functions";
import { RECOVERY_DISCLAIMER, type RecoveryCandidate, type RecoveryReason } from "@/lib/recovery";
import { ErrorBanner, EmptyState } from "@/components/ErrorBanner";
import { describeError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/recovery")({
  head: () => ({
    meta: [
      { title: "Lost-deal recovery — GARE" },
      {
        name: "description",
        content: "Re-approach proposals that went quiet or were rejected.",
      },
    ],
  }),
  component: RecoveryPage,
});

const REASON_LABEL: Record<RecoveryReason, string> = {
  no_response: "no response",
  soft_no: "soft no",
  lost: "lost",
};

const PRIORITY_VARIANT: Record<
  RecoveryCandidate["priority"],
  "destructive" | "secondary" | "outline"
> = { high: "destructive", medium: "secondary", low: "outline" };

function RecoveryPage() {
  const qc = useQueryClient();
  const load = useServerFn(getRecoveryCandidates);
  const addTask = useServerFn(createRecoveryTask);

  const [message, setMessage] = useState<string | null>(null);

  const candidates = useQuery({ queryKey: ["recovery"], queryFn: () => load() });

  const taskMutation = useMutation({
    mutationFn: (c: RecoveryCandidate) =>
      addTask({
        data: {
          proposal_id: c.proposalId,
          business_id: c.businessId,
          title: `Re-approach: ${c.title}`,
          reason: c.reason,
          note: c.recommendedApproach,
        },
      }),
    onSuccess: (res) => {
      setMessage(res.created ? "Follow-up task created." : "A follow-up task already exists.");
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e) => {
      const d = describeError(e, "Create follow-up task");
      setMessage(`${d.title}: ${d.message} How to fix: ${d.fix}`);
    },
  });

  const byReason = useMemo(() => {
    const counts: Record<RecoveryReason, number> = { no_response: 0, soft_no: 0, lost: 0 };
    for (const c of candidates.data ?? []) counts[c.reason] += 1;
    return counts;
  }, [candidates.data]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Undo2 className="h-5 w-5" /> Lost-deal recovery
        </h1>
        <p className="text-sm text-muted-foreground">{RECOVERY_DISCLAIMER}</p>
      </header>

      {message && (
        <p className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
          {message}
        </p>
      )}

      {candidates.isError && (
        <ErrorBanner
          error={candidates.error}
          context="Recovery candidates"
          onRetry={() => void candidates.refetch()}
        />
      )}

      <section className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>{byReason.no_response} no response</span>
        <span>· {byReason.soft_no} soft no</span>
        <span>· {byReason.lost} lost</span>
      </section>

      {candidates.isError ? (
        <ErrorBanner
          error={candidates.error}
          context="Recovery"
          onRetry={() => void candidates.refetch()}
        />
      ) : candidates.isLoading ? (
        <p className="text-sm text-muted-foreground">Checking proposals…</p>
      ) : (candidates.data?.length ?? 0) === 0 ? (
        <EmptyState
          title="Nothing to recover"
          why="Candidates appear when a sent proposal goes quiet for two weeks, or a proposal is rejected. Send a few proposals from the Proposals page first — set their status to SENT when you actually reach out."
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/proposals">Open proposals</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {(candidates.data ?? []).map((c) => (
            <article key={c.proposalId} className="space-y-2 rounded-lg border bg-card p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={PRIORITY_VARIANT[c.priority]}>{c.priority}</Badge>
                <Badge variant="outline">{REASON_LABEL[c.reason]}</Badge>
                <span className="font-medium">{c.title}</span>
                {c.businessName && (
                  <span className="text-muted-foreground">· {c.businessName}</span>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {c.ageDays}d ago · {c.value.toFixed(0)} {c.currency}
                </span>
              </div>
              <p className="text-muted-foreground">{c.recommendedApproach}</p>
              <div className="flex flex-wrap gap-2">
                {c.businessId && (
                  <Button size="sm" variant="ghost" asChild>
                    <Link to="/businesses/$id" params={{ id: c.businessId }}>
                      Open lead
                    </Link>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={taskMutation.isPending}
                  onClick={() => taskMutation.mutate(c)}
                >
                  Create follow-up task
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
