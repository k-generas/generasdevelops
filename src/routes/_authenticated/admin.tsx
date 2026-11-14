import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  Copy,
  Gauge,
  Loader2,
  MailCheck,
  Save,
  ShieldCheck,
  ShieldX,
  UserCheck,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorBanner, EmptyState } from "@/components/ErrorBanner";
import { useAccessInfo } from "@/lib/access";
import { describeError } from "@/lib/errors";
import {
  confirmUserEmail,
  getAdminOverview,
  issueAccessCode,
  listAccessCodes,
  listApiRequestLogs,
  listAuditLogs,
  listLoginHistory,
  listUsers,
  revokeAccessCode,
  setUserAccessStatus,
  setUserDiscoveryQuota,
  type AccessCodeRow,
  type AdminOverview,
  type AdminUserRow,
  type ApiRequestRow,
  type AuditRow,
  type LoginEventRow,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin — GARE" },
      { name: "description", content: "Early-access approvals and platform monitoring." },
    ],
  }),
  component: AdminPage,
});

type AccessStatus = "pending" | "approved" | "rejected" | "suspended";

const STATUS_STYLES: Record<AccessStatus, string> = {
  pending: "border-amber-500/40 text-amber-700 dark:text-amber-400",
  approved: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
  rejected: "border-destructive/40 text-destructive",
  suspended: "border-destructive/40 text-destructive",
};

function StatusPill({ status, admin }: { status: AccessStatus; admin?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[status]}`}
      >
        {status}
      </span>
      {admin && (
        <span className="rounded-full border border-primary/40 px-2 py-0.5 text-xs font-medium text-primary">
          admin
        </span>
      )}
    </span>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function when(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function Overview() {
  const load = useServerFn(getAdminOverview);
  const q = useQuery<AdminOverview>({ queryKey: ["admin-overview"], queryFn: () => load() });

  if (q.isLoading) return <p className="py-6 text-sm text-muted-foreground">Loading…</p>;
  if (q.isError)
    return <ErrorBanner error={q.error} context="Overview" onRetry={() => void q.refetch()} />;
  const d = q.data;
  if (!d) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total accounts" value={d.total} />
        <StatCard label="Pending approval" value={d.pending} />
        <StatCard label="Approved" value={d.approved} />
        <StatCard label="Suspended" value={d.suspended} />
        <StatCard label="Rejected" value={d.rejected} />
        <StatCard label="Administrators" value={d.admins} />
        <StatCard label="Successful logins (24h)" value={d.logins24h} />
        <StatCard label="Active access codes" value={d.activeCodes} />
        <StatCard label="Discovery runs (24h)" value={d.discoveryRuns24h} />
        <StatCard label="API requests (24h)" value={d.apiRequests24h} />
        <StatCard label="Google requests (24h)" value={d.googleRequests24h} />
      </div>
    </div>
  );
}

function UsersTab() {
  const qc = useQueryClient();
  const load = useServerFn(listUsers);
  const setStatus = useServerFn(setUserAccessStatus);
  const confirmEmail = useServerFn(confirmUserEmail);
  const q = useQuery<AdminUserRow[]>({ queryKey: ["admin-users"], queryFn: () => load() });
  const [busyId, setBusyId] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (vars: { userId: string; status: AccessStatus }) =>
      setStatus({ data: { userId: vars.userId, status: vars.status } }),
    onSuccess: (res, vars) => {
      if (!res.ok) {
        toast.error("Could not update access", { description: res.error });
      } else {
        toast.success(`User ${vars.status}`);
        void qc.invalidateQueries({ queryKey: ["admin-users"] });
        void qc.invalidateQueries({ queryKey: ["admin-overview"] });
        void qc.invalidateQueries({ queryKey: ["admin-audit"] });
      }
      setBusyId(null);
    },
    onError: (err) => {
      const d = describeError(err, "Update access");
      toast.error(d.title, { description: `${d.message} ${d.fix}` });
      setBusyId(null);
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (userId: string) => confirmEmail({ data: { userId } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error("Could not confirm email", { description: res.error });
      } else {
        toast.success("Email confirmed");
      }
      setBusyId(null);
    },
    onError: (err) => {
      const d = describeError(err, "Confirm email");
      toast.error(d.title, { description: `${d.message} ${d.fix}` });
      setBusyId(null);
    },
  });

  function act(userId: string, status: AccessStatus) {
    setBusyId(userId);
    mutation.mutate({ userId, status });
  }

  function verifyEmail(userId: string) {
    setBusyId(userId);
    confirmMutation.mutate(userId);
  }

  if (q.isLoading) return <p className="py-6 text-sm text-muted-foreground">Loading…</p>;
  if (q.isError)
    return <ErrorBanner error={q.error} context="Users" onRetry={() => void q.refetch()} />;

  const users = q.data ?? [];
  if (users.length === 0) {
    return <EmptyState title="No accounts yet" why="New signups will appear here for review." />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Registered</TableHead>
            <TableHead>Last login</TableHead>
            <TableHead className="text-right">Logins</TableHead>
            <TableHead className="text-right">Runs today</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{u.email}</TableCell>
              <TableCell>
                <StatusPill status={u.access_status} admin={u.is_admin} />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{when(u.created_at)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {when(u.last_login_at)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{u.login_count}</TableCell>
              <TableCell className="text-right tabular-nums">
                {u.discovery_runs_today}/{u.discovery_daily_limit}
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  {busyId === u.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <>
                      {u.access_status !== "approved" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => act(u.id, "approved")}
                          title="Approve"
                        >
                          <UserCheck className="h-4 w-4" />
                        </Button>
                      )}
                      {u.access_status === "approved" && !u.is_admin && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => verifyEmail(u.id)}
                          title="Confirm email"
                        >
                          <MailCheck className="h-4 w-4" />
                        </Button>
                      )}
                      {u.access_status !== "suspended" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => act(u.id, "suspended")}
                          title="Suspend"
                        >
                          <ShieldX className="h-4 w-4" />
                        </Button>
                      )}
                      {u.access_status !== "rejected" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => act(u.id, "rejected")}
                          title="Reject"
                        >
                          <UserX className="h-4 w-4" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AccessCodesTab() {
  const qc = useQueryClient();
  const load = useServerFn(listAccessCodes);
  const issue = useServerFn(issueAccessCode);
  const revoke = useServerFn(revokeAccessCode);
  const q = useQuery<AccessCodeRow[]>({ queryKey: ["admin-codes"], queryFn: () => load() });
  const [targetEmail, setTargetEmail] = useState("");
  const [maxUses, setMaxUses] = useState("1");
  const [hours, setHours] = useState("168");
  const [issued, setIssued] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const issueMutation = useMutation({
    mutationFn: () =>
      issue({
        data: {
          targetEmail: targetEmail.trim() ? targetEmail.trim() : null,
          maxUses: Number(maxUses) || 1,
          expiresInHours: Number(hours) || 168,
        },
      }),
    onSuccess: (res) => {
      if (res.ok && res.code) {
        setIssued(res.code);
        setError(null);
        setTargetEmail("");
        void qc.invalidateQueries({ queryKey: ["admin-codes"] });
        void qc.invalidateQueries({ queryKey: ["admin-overview"] });
      } else {
        setError(res.error ?? "Could not issue a code");
      }
    },
    onError: (err) => setError(describeError(err, "Issue code").message),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revoke({ data: { id } }),
    onSuccess: (res) => {
      if (!res.ok) toast.error("Could not revoke", { description: res.error });
      else toast.success("Code revoked");
      void qc.invalidateQueries({ queryKey: ["admin-codes"] });
      void qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (err) => toast.error(describeError(err, "Revoke code").title),
  });

  async function copyCode() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued);
      toast.success("Access code copied");
    } catch {
      toast.error("Could not copy — select the code and copy manually");
    }
  }

  return (
    <div className="space-y-4">
      <form
        className="rounded-xl border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          issueMutation.mutate();
        }}
      >
        <p className="text-sm font-medium">Issue an access code</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Codes are stored hashed. Leave the email blank for a general code, or bind it to one
          recipient.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="code-email">Recipient email (optional)</Label>
            <Input
              id="code-email"
              type="email"
              placeholder="person@example.com"
              value={targetEmail}
              onChange={(e) => setTargetEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="code-uses">Max uses</Label>
            <Input
              id="code-uses"
              type="number"
              min={1}
              max={100}
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="code-hours">Expires in (hours)</Label>
            <Input
              id="code-hours"
              type="number"
              min={1}
              max={8760}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button type="submit" size="sm" disabled={issueMutation.isPending}>
            {issueMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Generate code"
            )}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        {issued && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/5 p-3">
            <code className="min-w-0 break-all font-mono text-sm">{issued}</code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={copyCode}
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
          </div>
        )}
      </form>

      {q.isError && (
        <ErrorBanner error={q.error} context="Access codes" onRetry={() => void q.refetch()} />
      )}
      {q.data && q.data.length === 0 ? (
        <EmptyState
          title="No access codes yet"
          why="Generate a code above and share it with someone you want to admit."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Uses</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(q.data ?? []).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.code_prefix}…</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.target_email ?? "Any"}
                  </TableCell>
                  <TableCell className="text-xs capitalize">{c.status}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.used_count}/{c.max_uses}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {when(c.expires_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    {c.status === "active" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={revokeMutation.isPending}
                        onClick={() => revokeMutation.mutate(c.id)}
                      >
                        Revoke
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function LoginActivityTab() {
  const load = useServerFn(listLoginHistory);
  const q = useQuery<LoginEventRow[]>({ queryKey: ["admin-logins"], queryFn: () => load() });

  if (q.isLoading) return <p className="py-6 text-sm text-muted-foreground">Loading…</p>;
  if (q.isError)
    return (
      <ErrorBanner error={q.error} context="Login activity" onRetry={() => void q.refetch()} />
    );
  const rows = q.data ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No login activity yet"
        why="Sign-in events are recorded here as users sign in to the platform."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Event</TableHead>
            <TableHead>Result</TableHead>
            <TableHead>Reason</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="text-xs text-muted-foreground">{when(r.created_at)}</TableCell>
              <TableCell className="text-sm">{r.email ?? "—"}</TableCell>
              <TableCell className="text-xs">{r.event_type}</TableCell>
              <TableCell>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                    r.success
                      ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                      : "border-destructive/40 text-destructive"
                  }`}
                >
                  {r.success ? "success" : "failed"}
                </span>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {r.failure_reason ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AuditTab() {
  const load = useServerFn(listAuditLogs);
  const q = useQuery<AuditRow[]>({ queryKey: ["admin-audit"], queryFn: () => load() });

  if (q.isLoading) return <p className="py-6 text-sm text-muted-foreground">Loading…</p>;
  if (q.isError)
    return <ErrorBanner error={q.error} context="Audit history" onRetry={() => void q.refetch()} />;
  const rows = q.data ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No audit events yet"
        why="Approvals, suspensions, and access-code actions are recorded here."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="text-xs text-muted-foreground">{when(r.created_at)}</TableCell>
              <TableCell className="text-xs font-medium">{r.action}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {r.actor_email ?? r.actor_id ?? "—"}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {r.target_user_email ?? r.target_user_id ?? "—"}
              </TableCell>
              <TableCell className="max-w-xs text-xs text-muted-foreground">
                {r.details ? JSON.stringify(r.details) : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

type QuotaDraft = {
  dailyLimit: string;
  cooldownSeconds: string;
  maxResults: string;
};

function defaultQuotaDraft(user: AdminUserRow): QuotaDraft {
  return {
    dailyLimit: String(user.discovery_daily_limit),
    cooldownSeconds: String(user.discovery_cooldown_seconds),
    maxResults: String(user.discovery_max_results),
  };
}

function QuotasTab() {
  const qc = useQueryClient();
  const load = useServerFn(listUsers);
  const save = useServerFn(setUserDiscoveryQuota);
  const q = useQuery<AdminUserRow[]>({ queryKey: ["admin-users"], queryFn: () => load() });
  const [drafts, setDrafts] = useState<Record<string, QuotaDraft>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (vars: {
      userId: string;
      dailyLimit: number;
      cooldownSeconds: number;
      maxResults: number;
    }) => save({ data: vars }),
    onSuccess: (res, vars) => {
      if (!res.ok) {
        toast.error("Could not save discovery quota", { description: res.error });
      } else {
        toast.success("Discovery quota saved");
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[vars.userId];
          return next;
        });
        void qc.invalidateQueries({ queryKey: ["admin-users"] });
        void qc.invalidateQueries({ queryKey: ["admin-overview"] });
      }
      setBusyId(null);
    },
    onError: (err) => {
      const d = describeError(err, "Save discovery quota");
      toast.error(d.title, { description: `${d.message} ${d.fix}` });
      setBusyId(null);
    },
  });

  function updateDraft(user: AdminUserRow, key: keyof QuotaDraft, value: string) {
    setDrafts((prev) => ({
      ...prev,
      [user.id]: { ...(prev[user.id] ?? defaultQuotaDraft(user)), [key]: value },
    }));
  }

  function submit(user: AdminUserRow) {
    const draft = drafts[user.id] ?? defaultQuotaDraft(user);
    setBusyId(user.id);
    mutation.mutate({
      userId: user.id,
      dailyLimit: Math.max(0, Math.trunc(Number(draft.dailyLimit) || 0)),
      cooldownSeconds: Math.max(0, Math.trunc(Number(draft.cooldownSeconds) || 0)),
      maxResults: Math.max(1, Math.trunc(Number(draft.maxResults) || 1)),
    });
  }

  if (q.isLoading) return <p className="py-6 text-sm text-muted-foreground">Loading...</p>;
  if (q.isError)
    return (
      <ErrorBanner error={q.error} context="Discovery quotas" onRetry={() => void q.refetch()} />
    );
  const users = q.data ?? [];
  if (users.length === 0) {
    return (
      <EmptyState title="No accounts yet" why="Quota controls appear after the first signup." />
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <Gauge className="h-4 w-4 text-primary" />
          Google Places protection
        </p>
        <p className="mt-1 text-xs">
          Daily limit is enforced before any paid Google request. Set it to 0 to block discovery.
          Minimum gap blocks rapid repeat runs; leave it at 0 to allow batches.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead className="text-right">Runs today</TableHead>
              <TableHead>Daily limit</TableHead>
              <TableHead>Minimum gap (sec)</TableHead>
              <TableHead>Max results</TableHead>
              <TableHead>Last run</TableHead>
              <TableHead className="text-right">Save</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => {
              const draft = drafts[u.id] ?? defaultQuotaDraft(u);
              return (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.email}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {u.discovery_runs_today}/{u.discovery_daily_limit}
                  </TableCell>
                  <TableCell>
                    <Input
                      className="w-24"
                      type="number"
                      min={0}
                      max={1000}
                      value={draft.dailyLimit}
                      onChange={(e) => updateDraft(u, "dailyLimit", e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      className="w-28"
                      type="number"
                      min={0}
                      max={86400}
                      value={draft.cooldownSeconds}
                      onChange={(e) => updateDraft(u, "cooldownSeconds", e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      className="w-24"
                      type="number"
                      min={1}
                      max={20}
                      value={draft.maxResults}
                      onChange={(e) => updateDraft(u, "maxResults", e.target.value)}
                    />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {when(u.last_discovery_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === u.id}
                      onClick={() => submit(u)}
                    >
                      {busyId === u.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Save className="h-4 w-4" /> Save
                        </>
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ApiUsageTab() {
  const load = useServerFn(listApiRequestLogs);
  const q = useQuery<ApiRequestRow[]>({ queryKey: ["admin-api-usage"], queryFn: () => load() });

  if (q.isLoading) return <p className="py-6 text-sm text-muted-foreground">Loading...</p>;
  if (q.isError)
    return <ErrorBanner error={q.error} context="API usage" onRetry={() => void q.refetch()} />;
  const rows = q.data ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No API requests logged yet"
        why="Every Google or Geoapify Places request is recorded here after the quota migration is applied."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">HTTP</TableHead>
            <TableHead className="text-right">ms</TableHead>
            <TableHead>Run</TableHead>
            <TableHead>Error</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="text-xs text-muted-foreground">{when(r.created_at)}</TableCell>
              <TableCell className="text-xs">{r.owner_email ?? r.owner_id}</TableCell>
              <TableCell className="text-xs capitalize">{r.provider}</TableCell>
              <TableCell>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                    r.status === "success"
                      ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                      : r.status === "blocked"
                        ? "border-amber-500/40 text-amber-700 dark:text-amber-400"
                        : "border-destructive/40 text-destructive"
                  }`}
                >
                  {r.status}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">{r.http_status ?? "-"}</TableCell>
              <TableCell className="text-right tabular-nums">{r.duration_ms ?? "-"}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {r.discovery_run_id ? r.discovery_run_id.slice(0, 8) : "-"}
              </TableCell>
              <TableCell
                className="max-w-xs truncate text-xs text-muted-foreground"
                title={r.error_message ?? r.error_code ?? undefined}
              >
                {r.error_code ?? r.error_message ?? "-"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AdminPage() {
  const access = useAccessInfo();

  if (access.isLoading) {
    return <p className="py-10 text-sm text-muted-foreground">Checking permissions…</p>;
  }
  if (!access.data?.isAdmin) {
    return (
      <div className="grid place-items-center py-20 text-center">
        <ShieldCheck className="h-8 w-8 text-muted-foreground" />
        <h1 className="mt-3 text-lg font-semibold">Administrators only</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your account does not have administrator access to this console.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Admin</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Platform control
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Approve early-access accounts, issue codes, and monitor activity.
        </p>
      </header>

      <Tabs defaultValue="overview">
        <TabsList className="h-auto flex-wrap justify-start gap-1 sm:h-9 sm:justify-center">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="quotas">Discovery quotas</TabsTrigger>
          <TabsTrigger value="api">API usage</TabsTrigger>
          <TabsTrigger value="codes">Access codes</TabsTrigger>
          <TabsTrigger value="logins">Logins</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Overview />
        </TabsContent>
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
        <TabsContent value="quotas">
          <QuotasTab />
        </TabsContent>
        <TabsContent value="api">
          <ApiUsageTab />
        </TabsContent>
        <TabsContent value="codes">
          <AccessCodesTab />
        </TabsContent>
        <TabsContent value="logins">
          <LoginActivityTab />
        </TabsContent>
        <TabsContent value="audit">
          <AuditTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
