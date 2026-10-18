import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBanner, EmptyState } from "@/components/ErrorBanner";
import { describeError } from "@/lib/errors";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks — GARE" },
      { name: "description", content: "Open tasks, follow-ups and reminders." },
    ],
  }),
  component: Tasks,
});

type Task = {
  id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  priority: string;
  source: string;
  proposal_id: string | null;
  business_id: string | null;
  created_at: string;
  businesses: { name: string } | null;
};

const PRIORITIES = ["low", "normal", "high"] as const;

function isOverdue(t: Task) {
  return t.due_at != null && new Date(t.due_at).getTime() < Date.now();
}

function Tasks() {
  const qc = useQueryClient();
  const [showDone, setShowDone] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [priority, setPriority] = useState<string>("normal");
  const [businessId, setBusinessId] = useState("");
  const [busy, setBusy] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const tasks = useQuery({
    queryKey: ["tasks", showDone],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id,title,description,due_at,priority,source,proposal_id,business_id,created_at,completed_at,businesses(name)",
        )
        .eq("status", showDone ? "done" : "open")
        .order("due_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Task[];
    },
  });
  const businesses = useQuery({
    queryKey: ["tasks-businesses"],
    queryFn: async () =>
      (await supabase.from("businesses").select("id,name").order("name").limit(500)).data ?? [],
  });

  async function complete(id: string, status: "done" | "open") {
    const { error } = await supabase
      .from("tasks")
      .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
      .eq("id", id);
    if (error) {
      const d = describeError(error, "Update task");
      toast.error(d.title, { description: `${d.message} ${d.fix}` });
    }
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["dash-tasks"] });
  }

  async function remove(id: string) {
    if (!confirm("Delete this task?")) return;
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) {
      const d = describeError(error, "Delete task");
      toast.error(d.title, { description: `${d.message} ${d.fix}` });
    }
    qc.invalidateQueries({ queryKey: ["tasks"] });
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setCreateErr(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        setCreateErr(
          "You are not signed in — session may have expired. Sign out and sign in again, then retry.",
        );
        setBusy(false);
        return;
      }
      const { error } = await supabase.from("tasks").insert({
        owner_id: u.user.id,
        title: title.trim(),
        description: description.trim() || null,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        priority,
        business_id: businessId || null,
      });
      if (error) {
        const d = describeError(error, "Create task");
        setCreateErr(`${d.message} How to fix: ${d.fix}`);
        setBusy(false);
        return;
      }
      setTitle("");
      setDescription("");
      setDueAt("");
      setPriority("normal");
      setBusinessId("");
    } catch (err) {
      const d = describeError(err, "Create task");
      setCreateErr(`${d.message} How to fix: ${d.fix}`);
    }
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["dash-tasks"] });
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center">
        <div className="mr-auto">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Tasks</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Follow-ups &amp; reminders</h1>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowDone((v) => !v)}>
          {showDone ? "Show open" : "Show completed"}
        </Button>
      </header>

      {(tasks.isError || businesses.isError) && (
        <ErrorBanner
          error={(tasks.error ?? businesses.error) as Error}
          context="Tasks"
          onRetry={() => {
            if (tasks.isError) void tasks.refetch();
            if (businesses.isError) void businesses.refetch();
          }}
        />
      )}

      <form onSubmit={create} className="rounded-xl border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            placeholder="What needs doing? e.g. Follow up with Kigali Salon"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <Input
            type="datetime-local"
            title="Due date (optional)"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
          <Input
            placeholder="Detail (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <select
            className="rounded border bg-background px-2 py-1.5 text-sm"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p} priority
              </option>
            ))}
          </select>
          <select
            className="rounded border bg-background px-2 py-1.5 text-sm sm:col-span-2"
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
          >
            <option value="">No business (general task)</option>
            {(businesses.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3">
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Adding…" : "Add task"}
          </Button>
          {createErr && <p className="mt-2 text-sm text-destructive">{createErr}</p>}
        </div>
      </form>

      <div className="divide-y rounded-xl border bg-card">
        {tasks.isError ? (
          <div className="p-4">
            <ErrorBanner
              error={tasks.error}
              context="Task list"
              onRetry={() => void tasks.refetch()}
            />
          </div>
        ) : tasks.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : tasks.data?.length === 0 ? (
          <EmptyState
            title={showDone ? "No completed tasks" : "No open tasks"}
            why={
              showDone
                ? "Completed tasks will be listed here once you mark any as done."
                : "Tasks are created manually above, or automatically from revenue leaks on the Leaks page (Plan delivery)."
            }
          />
        ) : (
          tasks.data?.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm">{t.title}</p>
                <p className="text-xs text-muted-foreground">
                  {t.businesses?.name ?? "General"} · {t.source}
                  {t.due_at && ` · due ${new Date(t.due_at).toLocaleString()}`}
                </p>
                {t.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
                )}
              </div>
              {t.priority !== "normal" && (
                <span className="shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px]">
                  {t.priority}
                </span>
              )}
              {!showDone && isOverdue(t) && (
                <span className="shrink-0 rounded-full border border-destructive/40 px-2 py-0.5 text-[10px] font-medium text-destructive">
                  overdue
                </span>
              )}
              {t.proposal_id && (
                <Link
                  to="/proposals/$id"
                  params={{ id: t.proposal_id }}
                  className="shrink-0 text-xs text-primary underline"
                >
                  Proposal
                </Link>
              )}
              <Button
                size="sm"
                variant={showDone ? "outline" : "default"}
                onClick={() => complete(t.id, showDone ? "open" : "done")}
              >
                {showDone ? "Reopen" : "Done"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => remove(t.id)}
              >
                Delete
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
