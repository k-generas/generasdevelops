import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { updateMaintenanceDetailsFn, updateMaintenanceStatusFn } from "@/lib/solution.functions";
import {
  MAINTENANCE_STATUSES,
  MAINTENANCE_STATUS_LABELS,
  allowedMaintenanceTransitions,
  maintenanceCompletionError,
  type MaintenanceStatus,
} from "@/lib/solution-builder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorBanner } from "@/components/ErrorBanner";

export const Route = createFileRoute("/_authenticated/maintenance")({
  head: () => ({
    meta: [
      { title: "Maintenance — GARE" },
      {
        name: "description",
        content: "Real maintenance records created from evidence-backed solution recommendations.",
      },
    ],
  }),
  component: MaintenancePage,
});

type MaintenanceRecord = {
  id: string;
  business_id: string;
  recommendation_id: string | null;
  title: string;
  description: string | null;
  status: MaintenanceStatus;
  cadence: string | null;
  next_due_at: string | null;
  completed_at: string | null;
  completion_note: string | null;
  source: string;
  created_at: string;
  updated_at: string;
  businesses: { name: string } | null;
};

const FILTERS = ["active", "completed", "all"] as const;
type Filter = (typeof FILTERS)[number];

const ACTIVE_STATUSES = new Set<MaintenanceStatus>([
  "recommended",
  "accepted",
  "scheduled",
  "in_progress",
]);

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTime() - date.getTimezoneOffset() * 60_000;
  return new Date(offset).toISOString().slice(0, 16);
}

function RecordCard({
  record,
  busy,
  onMove,
  onSave,
}: {
  record: MaintenanceRecord;
  busy: boolean;
  onMove: (record: MaintenanceRecord, status: MaintenanceStatus, note?: string) => void;
  onSave: (record: MaintenanceRecord, cadence: string | null, nextDueAt: string | null) => void;
}) {
  const [note, setNote] = useState(record.completion_note ?? "");
  const [cadence, setCadence] = useState(record.cadence ?? "");
  const [nextDue, setNextDue] = useState(toLocalInput(record.next_due_at));
  const next = allowedMaintenanceTransitions(record.status);
  const completionError = next.includes("completed")
    ? maintenanceCompletionError("completed", note)
    : null;

  function saveSchedule() {
    const parsed = nextDue ? new Date(nextDue) : null;
    if (parsed && Number.isNaN(parsed.getTime())) {
      toast.error("Enter a valid next due date.");
      return;
    }
    onSave(record, cadence.trim() || null, parsed ? parsed.toISOString() : null);
  }

  return (
    <article className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{record.title}</h2>
            <Badge variant="outline">{MAINTENANCE_STATUS_LABELS[record.status]}</Badge>
            <Badge variant="secondary">{record.source.replace(/_/g, " ")}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {record.description ?? "No description recorded."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {record.businesses?.name ? (
              <Link
                to="/businesses/$id"
                params={{ id: record.business_id }}
                className="text-primary underline"
              >
                {record.businesses.name}
              </Link>
            ) : (
              "Business record unavailable"
            )}
            {" · created "}
            {new Date(record.created_at).toLocaleDateString()}
            {record.completed_at
              ? ` · completed ${new Date(record.completed_at).toLocaleDateString()}`
              : ""}
            {record.cadence ? ` · ${record.cadence}` : ""}
            {record.next_due_at
              ? ` · next due ${new Date(record.next_due_at).toLocaleDateString()}`
              : ""}
          </p>
          {record.completion_note && (
            <p className="mt-2 rounded border bg-muted/40 p-2 text-xs">
              Completion evidence: {record.completion_note}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {next.length === 0 ? (
            <span className="text-xs text-muted-foreground">No further transitions</span>
          ) : (
            next.map((status) => (
              <Button
                key={status}
                size="sm"
                variant={status === "cancelled" ? "ghost" : "outline"}
                disabled={busy || (status === "completed" && completionError !== null)}
                onClick={() =>
                  onMove(record, status, status === "completed" ? note.trim() : undefined)
                }
              >
                {MAINTENANCE_STATUS_LABELS[status]}
              </Button>
            ))
          )}
        </div>
      </div>

      <details className="mt-3 rounded border p-3 text-sm">
        <summary className="cursor-pointer font-medium">Schedule and completion evidence</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs">
            <span className="font-medium">Cadence</span>
            <Input
              value={cadence}
              onChange={(event) => setCadence(event.target.value)}
              placeholder="e.g. Monthly"
              maxLength={120}
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="font-medium">Next due</span>
            <Input
              type="datetime-local"
              value={nextDue}
              onChange={(event) => setNextDue(event.target.value)}
            />
          </label>
        </div>
        <Button size="sm" variant="outline" className="mt-3" disabled={busy} onClick={saveSchedule}>
          Save schedule
        </Button>

        {next.includes("completed") && (
          <label className="mt-3 block space-y-1 text-xs">
            <span className="font-medium">Completion evidence (required to complete)</span>
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Dated note or verification result"
              maxLength={2000}
            />
            {completionError && <span className="text-destructive">{completionError}</span>}
          </label>
        )}
      </details>
    </article>
  );
}

function MaintenancePage() {
  const qc = useQueryClient();
  const updateStatus = useServerFn(updateMaintenanceStatusFn);
  const updateDetails = useServerFn(updateMaintenanceDetailsFn);
  const [filter, setFilter] = useState<Filter>("active");
  const [busy, setBusy] = useState<string | null>(null);

  const records = useQuery({
    queryKey: ["maintenance-records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("maintenance_records")
        .select("*, businesses(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as MaintenanceRecord[];
    },
  });

  const rows = (records.data ?? []).filter((record) => {
    if (filter === "all") return true;
    if (filter === "completed") return record.status === "completed";
    return ACTIVE_STATUSES.has(record.status);
  });

  async function move(record: MaintenanceRecord, status: MaintenanceStatus, note?: string) {
    setBusy(record.id);
    try {
      await updateStatus({
        data: { recordId: record.id, status, completionNote: note },
      });
      await qc.invalidateQueries({ queryKey: ["maintenance-records"] });
      toast.success(`Maintenance moved to ${MAINTENANCE_STATUS_LABELS[status].toLowerCase()}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update maintenance.");
    }
    setBusy(null);
  }

  async function saveSchedule(
    record: MaintenanceRecord,
    cadence: string | null,
    nextDueAt: string | null,
  ) {
    setBusy(record.id);
    try {
      await updateDetails({ data: { recordId: record.id, cadence, nextDueAt } });
      await qc.invalidateQueries({ queryKey: ["maintenance-records"] });
      toast.success("Maintenance schedule saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the schedule.");
    }
    setBusy(null);
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Maintenance</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Real maintenance records</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Created from a maintenance solution recommendation. Nothing here is a placeholder — every
          record is linked to a business, and completion requires dated evidence.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <Button
            key={option}
            size="sm"
            variant={filter === option ? "default" : "outline"}
            onClick={() => setFilter(option)}
          >
            {option === "active" ? "Active" : option === "completed" ? "Completed" : "All"}
          </Button>
        ))}
      </div>

      {records.isError && (
        <ErrorBanner
          error={records.error}
          context="Maintenance records"
          onRetry={() => void records.refetch()}
        />
      )}

      {records.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading maintenance records…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title={filter === "active" ? "No active maintenance" : "No maintenance records"}
          why="Open a business report, build a maintenance recommendation, then create a real maintenance record from the Solution Builder."
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/businesses">Open businesses</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {rows.map((record) => (
            <RecordCard
              key={record.id}
              record={record}
              busy={busy === record.id}
              onMove={(row, status, note) => void move(row, status, note)}
              onSave={(row, cadence, nextDueAt) => void saveSchedule(row, cadence, nextDueAt)}
            />
          ))}
        </div>
      )}

      {records.data && records.data.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Lifecycle: {MAINTENANCE_STATUSES.filter((status) => status !== "cancelled").join(" → ")}.
          Cancelled records can be reopened as recommended.
        </p>
      )}
    </div>
  );
}
