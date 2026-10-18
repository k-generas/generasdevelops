import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, DatabaseZap, Loader2, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBanner } from "@/components/ErrorBanner";
import { errorLine } from "@/lib/errors";
import {
  getMigrationDiagnostics,
  runPendingMigrations,
  type MigrationDiagnostics,
  type MigrationRunResponse,
} from "@/lib/migrate.functions";

export const Route = createFileRoute("/_authenticated/setup")({
  head: () => ({
    meta: [
      { title: "Setup — GARE" },
      { name: "description", content: "Apply pending database migrations." },
    ],
  }),
  component: SetupPage,
});

function Row({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-2 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 text-sm">
        {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
        {ok ? (
          <Check className="h-4 w-4 text-emerald-600" />
        ) : (
          <X className="h-4 w-4 text-destructive" />
        )}
      </span>
    </div>
  );
}

function SetupPage() {
  const qc = useQueryClient();
  const load = useServerFn(getMigrationDiagnostics);
  const run = useServerFn(runPendingMigrations);
  const [connectionString, setConnectionString] = useState("");
  const [result, setResult] = useState<MigrationRunResponse | null>(null);

  const diag = useQuery<MigrationDiagnostics>({
    queryKey: ["migration-diagnostics"],
    queryFn: () => load(),
  });

  const mutation = useMutation({
    mutationFn: (vars: { connectionString?: string }) => run({ data: vars }),
    onSuccess: (res) => {
      setResult(res);
      if (res.ok) {
        toast.success("Migrations applied");
        void qc.invalidateQueries({ queryKey: ["migration-diagnostics"] });
        void qc.invalidateQueries({ queryKey: ["access-info"] });
      } else {
        toast.error("Migration run failed", { description: res.error });
      }
    },
    onError: (error) => toast.error("Migration run failed", { description: errorLine(error) }),
  });

  if (diag.isLoading) {
    return <p className="py-10 text-sm text-muted-foreground">Checking database…</p>;
  }
  if (diag.isError) {
    return (
      <ErrorBanner
        error={diag.error}
        context="Database setup"
        onRetry={() => void diag.refetch()}
      />
    );
  }
  const d = diag.data;
  if (!d) return null;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Setup</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <DatabaseZap className="h-6 w-6 text-primary" />
          Database migrations
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Applies the pending tables, policies, and admin grants in one step.
        </p>
      </header>

      <div className="rounded-lg border bg-card p-4">
        <Row label="Signed in as" ok={d.isOwner} detail={d.email ?? "unknown"} />
        <Row
          label="Database URL in server environment"
          ok={d.hasConnectionString}
          detail={d.dbEnvKeysPresent.length ? d.dbEnvKeysPresent.join(", ") : "none found"}
        />
        <Row label="user_profiles table" ok={d.profileTableExists} />
        <Row label="access_codes table" ok={d.accessCodesTableExists} />
      </div>

      {!d.isOwner && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 text-destructive" />
          <p>
            Only the project owner (<b>generaskagiraneza@gmail.com</b>) can apply migrations. Sign
            in with an owner account.
          </p>
        </div>
      )}

      <div className="space-y-3">
        <Button
          disabled={!d.isOwner || mutation.isPending}
          onClick={() => {
            const cs = connectionString.trim();
            mutation.mutate(cs ? { connectionString: cs } : {});
          }}
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Applying…
            </>
          ) : (
            <>
              <DatabaseZap className="mr-2 h-4 w-4" />
              Run pending migrations
            </>
          )}
        </Button>

        {!d.hasConnectionString && (
          <div className="space-y-2">
            <Label htmlFor="conn">Postgres connection string</Label>
            <Input
              id="conn"
              placeholder="postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres"
              value={connectionString}
              onChange={(e) => setConnectionString(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              The server environment has no database URL, so paste one to run the migrations. It is
              used once and never stored.
            </p>
          </div>
        )}

        {result && !result.ok && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <p className="font-medium text-destructive">Failed</p>
            {result.hint && <p className="mt-1 text-muted-foreground">{result.hint}</p>}
            {result.error && (
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
                {result.error}
              </pre>
            )}
          </div>
        )}
        {result?.ok && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-400">
            Migrations applied. Reload the app and open <b>/admin</b>.
          </div>
        )}
      </div>
    </div>
  );
}
