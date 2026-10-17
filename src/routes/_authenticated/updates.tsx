import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { parseDigestBusinesses } from "@/lib/monitoring";
import { ErrorBanner, EmptyState } from "@/components/ErrorBanner";
import type { Database } from "@/integrations/supabase/types";

type DailyDigestRow = Database["public"]["Tables"]["daily_digests"]["Row"];

export const Route = createFileRoute("/_authenticated/updates")({
  head: () => ({
    meta: [
      { title: "Updates — GARE" },
      {
        name: "description",
        content: "What the automatic daily radar scan found, delivered in-app.",
      },
    ],
  }),
  component: UpdatesPage,
});

function UpdatesPage() {
  const qc = useQueryClient();
  const digests = useQuery({
    queryKey: ["daily-digests"],
    queryFn: async (): Promise<DailyDigestRow[]> => {
      const { data, error } = await supabase
        .from("daily_digests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const hasUnread = (digests.data ?? []).some((d) => !d.read_at);

  useEffect(() => {
    if (!hasUnread) return;
    let cancelled = false;
    supabase
      .from("daily_digests")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null)
      .then(() => {
        if (!cancelled) qc.invalidateQueries({ queryKey: ["updates-unread"] });
      });
    return () => {
      cancelled = true;
    };
  }, [hasUnread, qc]);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Updates</h1>
        <p className="text-sm text-muted-foreground">
          What the automatic daily scan found for your saved radar target. New leads are listed with
          links into your pipeline.
        </p>
      </header>

      {digests.isError && (
        <ErrorBanner
          error={digests.error}
          context="Updates"
          onRetry={() => void digests.refetch()}
        />
      )}

      {digests.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading updates…</p>
      ) : digests.isError ? null : digests.data?.length === 0 ? (
        <EmptyState
          title="No daily scans yet"
          why="Turn on 'Automatic daily scan' on the Radar page, then run it once to see results here. Scheduling the repeating daily job is done from the Lovable Cloud Jobs settings."
          action={
            <Button size="sm" variant="outline" asChild>
              <Link to="/radar">Open Radar</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {digests.data?.map((d) => (
            <DigestCard key={d.id} d={d} unread={!d.read_at} />
          ))}
        </div>
      )}
    </div>
  );
}

function DigestCard({ d, unread }: { d: DailyDigestRow; unread: boolean }) {
  const businesses = parseDigestBusinesses(d.new_businesses);
  const failed = d.status === "failed";
  return (
    <article className="space-y-2 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        {unread && <span className="size-2 rounded-full bg-primary" aria-label="unread" />}
        <h2 className="font-semibold">
          {new Date(`${d.for_date}T00:00:00Z`).toLocaleDateString(undefined, {
            weekday: "short",
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </h2>
        <Badge variant={failed ? "destructive" : "secondary"}>
          {failed ? "failed" : "complete"}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {d.district ?? "All districts"} · {d.category}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {new Date(d.created_at).toLocaleString()}
        </span>
      </div>

      {failed ? (
        <p className="text-sm text-destructive">{d.error ?? "The scan did not complete."}</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {d.queries} {d.queries === 1 ? "query" : "queries"} · {d.found} found ·{" "}
            <span className="font-medium text-foreground">{d.added} new</span> · {d.duplicates}{" "}
            duplicate{d.duplicates === 1 ? "" : "s"}
            {d.failed_queries ? ` · ${d.failed_queries} failed` : ""} · est. ${Number(d.cost_usd)}
          </p>

          {businesses.length > 0 ? (
            <ul className="space-y-1">
              {businesses.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <Link
                    to="/businesses/$id"
                    params={{ id: b.id }}
                    className="font-medium hover:underline"
                  >
                    {b.name}
                  </Link>
                  {b.category && <Badge variant="outline">{b.category}</Badge>}
                  {b.website ? (
                    <a
                      href={b.website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-muted-foreground hover:underline"
                    >
                      site
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">no site</span>
                  )}
                  {b.address && <span className="text-xs text-muted-foreground">{b.address}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              No new businesses added — nothing matched that was not already saved.
            </p>
          )}
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" asChild>
          <Link to="/radar">Open Radar</Link>
        </Button>
        {d.scan_id && (
          <span className="self-center font-mono text-[11px] text-muted-foreground">
            scan {d.scan_id.slice(0, 8)}
          </span>
        )}
      </div>
    </article>
  );
}
