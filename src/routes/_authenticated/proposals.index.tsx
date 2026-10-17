import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { downloadCsv, rowsToCsv } from "@/lib/csv";
import { ErrorBanner, EmptyState } from "@/components/ErrorBanner";

export const STATUSES = [
  "DRAFT",
  "READY_TO_SEND",
  "SENT",
  "REPLIED",
  "NEGOTIATING",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
] as const;

export const Route = createFileRoute("/_authenticated/proposals/")({
  head: () => ({
    meta: [{ title: "Proposals — GARE" }, { name: "description", content: "Proposal history." }],
  }),
  component: Proposals,
});

function Proposals() {
  const [status, setStatus] = useState<string>("ALL");
  const list = useQuery({
    queryKey: ["proposals", status],
    queryFn: async () => {
      let q = supabase
        .from("proposals")
        .select(
          "id,title,mode,status,price,currency,channel,current_version,created_at,updated_at,businesses(name)",
        )
        .order("updated_at", { ascending: false })
        .limit(200);
      if (status !== "ALL") q = q.eq("status", status);
      return (await q).data ?? [];
    },
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Proposals</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const data = list.data ?? [];
              const csv = rowsToCsv(
                data.map((p) => ({
                  id: p.id,
                  title: p.title,
                  mode: p.mode,
                  status: p.status,
                  price: p.price,
                  currency: p.currency,
                  channel: p.channel,
                  current_version: p.current_version,
                  business_name: p.businesses?.name,
                  updated_at: p.updated_at,
                })),
              );
              downloadCsv(csv, `proposals-${new Date().toISOString().slice(0, 10)}.csv`);
            }}
          >
            Export CSV
          </Button>
        </div>
      </div>
      {list.isError && (
        <ErrorBanner error={list.error} context="Proposals" onRetry={() => void list.refetch()} />
      )}
      <div className="flex flex-wrap gap-2">
        {["ALL", ...STATUSES].map((s) => (
          <Button
            key={s}
            size="sm"
            variant={status === s ? "default" : "outline"}
            onClick={() => setStatus(s)}
          >
            {s}
          </Button>
        ))}
      </div>
      <div className="divide-y rounded-lg border bg-card">
        {list.isLoading && <p className="p-4 text-sm text-muted-foreground">Loading proposals…</p>}
        {list.isError && (
          <div className="p-4">
            <ErrorBanner
              error={list.error}
              context="Proposal list"
              onRetry={() => void list.refetch()}
            />
          </div>
        )}
        {list.data?.map((p) => (
          <Link
            key={p.id}
            to="/proposals/$id"
            params={{ id: p.id }}
            className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{p.title ?? p.mode}</p>
              <p className="text-xs text-muted-foreground">
                {p.businesses?.name} · {p.mode} · {p.channel} · v{p.current_version} · edited{" "}
                {new Date(p.updated_at).toLocaleDateString()}
              </p>
            </div>
            {p.price != null && (
              <span className="font-mono text-sm">
                {p.price} {p.currency}
              </span>
            )}
            <span className="rounded border px-2 py-0.5 font-mono text-[10px]">{p.status}</span>
          </Link>
        ))}
        {list.isError ? null : list.isLoading ? null : list.data?.length === 0 ? (
          <EmptyState
            title={
              status === "ALL"
                ? "No proposals yet"
                : `No ${status.toLowerCase().replace("_", " ")} proposals`
            }
            why={
              status === "ALL"
                ? "Generate one from a business page after running an investigation — the AI drafts it from collected evidence only."
                : "Nothing currently has this status. Change the status filter above to see other proposals."
            }
            action={
              status !== "ALL" ? (
                <Button size="sm" variant="outline" onClick={() => setStatus("ALL")}>
                  Show all
                </Button>
              ) : (
                <Button asChild size="sm" variant="outline">
                  <Link to="/businesses">View leads</Link>
                </Button>
              )
            }
          />
        ) : null}
      </div>
    </div>
  );
}
