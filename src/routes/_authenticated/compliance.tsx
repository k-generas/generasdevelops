import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Ban, CheckCircle2, Scale, ShieldAlert, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ErrorBanner } from "@/components/ErrorBanner";
import { describeError } from "@/lib/errors";
import {
  COMPLIANCE_POLICIES,
  CONTACT_CHANNELS,
  SUPPRESSION_CHANNELS,
  SUPPRESSION_SCOPES,
  contactChannelLabel,
  type ContactChannel,
  type OutreachEligibility,
  type SuppressionChannel,
  type SuppressionEntry,
  type SuppressionScope,
} from "@/lib/compliance";
import {
  checkOutreachEligibility,
  deleteSuppressionEntry,
  getComplianceSummary,
  getSuppressionEntries,
  saveSuppressionEntry,
  setBusinessDoNotContact,
  type OutreachCheckResult,
} from "@/lib/compliance.functions";

export const Route = createFileRoute("/_authenticated/compliance")({
  head: () => ({
    meta: [
      { title: "Compliance - GARE" },
      {
        name: "description",
        content:
          "Suppression ledger, outreach eligibility checks and country policy checklists for GARE.",
      },
    ],
  }),
  component: CompliancePage,
});

const PAGE_SIZE = 25;

type SuppressionDraft = {
  id?: string;
  scope: SuppressionScope;
  value: string;
  channel: SuppressionChannel;
  reason: string;
  source: string;
  country: string;
  expiresAt: string;
};

function emptySuppression(): SuppressionDraft {
  return {
    scope: "email",
    value: "",
    channel: "all",
    reason: "",
    source: "",
    country: "",
    expiresAt: "",
  };
}

function CompliancePage() {
  const qc = useQueryClient();
  const listFn = useServerFn(getSuppressionEntries);
  const summaryFn = useServerFn(getComplianceSummary);
  const saveFn = useServerFn(saveSuppressionEntry);
  const deleteFn = useServerFn(deleteSuppressionEntry);
  const checkFn = useServerFn(checkOutreachEligibility);
  const businessFlagFn = useServerFn(setBusinessDoNotContact);

  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [includeExpired, setIncludeExpired] = useState(true);
  const [draft, setDraft] = useState<SuppressionDraft | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [channel, setChannel] = useState<ContactChannel>("email");
  const [country, setCountry] = useState("Rwanda");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [domain, setDomain] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [ownerConfirmed, setOwnerConfirmed] = useState(false);
  const [check, setCheck] = useState<OutreachCheckResult | null>(null);

  const [flagBusinessId, setFlagBusinessId] = useState("");
  const [flagReason, setFlagReason] = useState("");

  const entries = useQuery({
    queryKey: ["suppression", page, query, scopeFilter, channelFilter, includeExpired],
    queryFn: () =>
      listFn({
        data: {
          page,
          pageSize: PAGE_SIZE,
          query,
          scope: scopeFilter,
          channel: channelFilter,
          includeExpired,
        },
      }),
  });

  const summary = useQuery({
    queryKey: ["suppression-summary"],
    queryFn: () => summaryFn(),
  });

  const businesses = useQuery({
    queryKey: ["compliance-businesses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("businesses")
        .select("id,name,contact_suppressed,suppression_reason")
        .order("name")
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const professionals = useQuery({
    queryKey: ["compliance-professionals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("id,full_name")
        .order("full_name")
        .limit(500);
      if (error) {
        if (/does not exist|schema cache|could not find/i.test(error.message)) return [];
        throw error;
      }
      return data ?? [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: (d: SuppressionDraft) =>
      saveFn({
        data: {
          ...(d.id ? { id: d.id } : {}),
          scope: d.scope,
          value: d.value,
          channel: d.channel,
          reason: d.reason,
          source: d.source || null,
          country: d.country || null,
          expiresAt: d.expiresAt || null,
        },
      }),
    onSuccess: () => {
      setMessage({ ok: true, text: "Suppression entry saved." });
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ["suppression"] });
      void qc.invalidateQueries({ queryKey: ["suppression-summary"] });
    },
    onError: (e) => {
      const d = describeError(e, "Save suppression");
      setMessage({ ok: false, text: `${d.title}: ${d.message} ${d.fix}` });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      setMessage({ ok: true, text: "Suppression entry removed." });
      void qc.invalidateQueries({ queryKey: ["suppression"] });
      void qc.invalidateQueries({ queryKey: ["suppression-summary"] });
    },
    onError: (e) => {
      const d = describeError(e, "Delete suppression");
      setMessage({ ok: false, text: `${d.title}: ${d.message} ${d.fix}` });
    },
  });

  const checkMutation = useMutation({
    mutationFn: () =>
      checkFn({
        data: {
          channel,
          country: country || null,
          email: email || null,
          phone: phone || null,
          domain: domain || null,
          businessId: businessId || null,
          professionalId: professionalId || null,
          ownerConfirmedLawfulBasis: ownerConfirmed,
        },
      }),
    onSuccess: (result) => setCheck(result),
    onError: (e) => {
      const d = describeError(e, "Check outreach eligibility");
      setMessage({ ok: false, text: `${d.title}: ${d.message} ${d.fix}` });
    },
  });

  const flagMutation = useMutation({
    mutationFn: () =>
      businessFlagFn({
        data: {
          businessId: flagBusinessId,
          doNotContact: true,
          reason: flagReason || "Owner marked do-not-contact",
        },
      }),
    onSuccess: () => {
      setMessage({ ok: true, text: "Business marked do-not-contact." });
      setFlagReason("");
      void qc.invalidateQueries({ queryKey: ["compliance-businesses"] });
    },
    onError: (e) => {
      const d = describeError(e, "Mark do-not-contact");
      setMessage({ ok: false, text: `${d.title}: ${d.message} ${d.fix}` });
    },
  });

  const rows = entries.data?.rows ?? [];
  const total = entries.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const applied = entries.data?.applied !== false;
  const policy = useMemo(() => COMPLIANCE_POLICIES.find((p) => p.countryCode === "GLOBAL")!, []);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Scale className="h-5 w-5" /> Compliance &amp; suppression
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {policy.notes} This page prevents outreach to suppressed contacts and shows the checks
          that still need an owner decision. It does not provide legal advice or send messages.
        </p>
      </header>

      {message && (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            message.ok ? "bg-muted text-muted-foreground" : "border-destructive/40 text-destructive"
          }`}
        >
          {message.text}
        </p>
      )}

      {!applied && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm">
          The suppression table is not available yet. Apply
          <code className="mx-1">20261109000000_global_intelligence_foundation.sql</code>
          to enable the ledger. Eligibility checks still honour the business do-not-contact flag.
        </p>
      )}

      {(entries.isError || summary.isError) && (
        <ErrorBanner
          error={(entries.error ?? summary.error) as Error}
          context="Compliance"
          onRetry={() => {
            if (entries.isError) void entries.refetch();
            if (summary.isError) void summary.refetch();
          }}
        />
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Suppression entries" value={summary.data?.total ?? 0} />
        <Stat label="Active" value={summary.data?.active ?? 0} />
        <Stat label="Expired" value={summary.data?.expired ?? 0} />
        <Stat label="Ledger status" value={summary.data?.applied === false ? "Setup" : "Ready"} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <ShieldAlert className="h-4 w-4" /> Outreach eligibility check
            </h2>
            <Badge variant="outline">review required</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Suppression blocks outreach. A clean check still needs the owner to confirm the lawful
            basis and the channel's terms.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Channel">
              <select
                className="w-full rounded border bg-background px-2 py-2 text-sm"
                value={channel}
                onChange={(e) => setChannel(e.target.value as ContactChannel)}
              >
                {CONTACT_CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {contactChannelLabel(c)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Country">
              <Input value={country} onChange={(e) => setCountry(e.target.value)} />
            </Field>
            <Field label="Email (optional)">
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Phone (optional)">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Domain (optional)">
              <Input value={domain} onChange={(e) => setDomain(e.target.value)} />
            </Field>
            <Field label="Business (optional)">
              <select
                className="w-full rounded border bg-background px-2 py-2 text-sm"
                value={businessId}
                onChange={(e) => setBusinessId(e.target.value)}
              >
                <option value="">None</option>
                {(businesses.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Professional (optional)">
              <select
                className="w-full rounded border bg-background px-2 py-2 text-sm"
                value={professionalId}
                onChange={(e) => setProfessionalId(e.target.value)}
              >
                <option value="">None</option>
                {(professionals.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={ownerConfirmed}
              onChange={(e) => setOwnerConfirmed(e.target.checked)}
            />
            <span>
              I have reviewed the lawful basis, destination-country rules and channel terms for this
              specific contact.
            </span>
          </label>
          <Button onClick={() => checkMutation.mutate()} disabled={checkMutation.isPending}>
            {checkMutation.isPending ? "Checking..." : "Check eligibility"}
          </Button>

          {check && <EligibilityResult result={check} channel={channel} />}
        </div>

        <div className="space-y-3 rounded-lg border bg-card p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Ban className="h-4 w-4" /> Add suppression entry
          </h2>
          <p className="text-xs text-muted-foreground">
            Use a contact, email, phone, domain, business or professional scope. Expired entries
            stay visible but no longer block outreach.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Scope">
              <select
                className="w-full rounded border bg-background px-2 py-2 text-sm"
                value={draft?.scope ?? "email"}
                onChange={(e) =>
                  setDraft({
                    ...(draft ?? emptySuppression()),
                    scope: e.target.value as SuppressionScope,
                  })
                }
              >
                {SUPPRESSION_SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Channel">
              <select
                className="w-full rounded border bg-background px-2 py-2 text-sm"
                value={draft?.channel ?? "all"}
                onChange={(e) =>
                  setDraft({
                    ...(draft ?? emptySuppression()),
                    channel: e.target.value as SuppressionChannel,
                  })
                }
              >
                {SUPPRESSION_CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Value *">
              <Input
                value={draft?.value ?? ""}
                onChange={(e) =>
                  setDraft({ ...(draft ?? emptySuppression()), value: e.target.value })
                }
                placeholder="email, phone, domain, business id..."
              />
            </Field>
            <Field label="Reason *">
              <Input
                value={draft?.reason ?? ""}
                onChange={(e) =>
                  setDraft({ ...(draft ?? emptySuppression()), reason: e.target.value })
                }
                placeholder="unsubscribed, asked us to stop, bounced..."
              />
            </Field>
            <Field label="Country (optional)">
              <Input
                value={draft?.country ?? ""}
                onChange={(e) =>
                  setDraft({ ...(draft ?? emptySuppression()), country: e.target.value })
                }
              />
            </Field>
            <Field label="Expires (optional)">
              <Input
                type="date"
                value={draft?.expiresAt ?? ""}
                onChange={(e) =>
                  setDraft({ ...(draft ?? emptySuppression()), expiresAt: e.target.value })
                }
              />
            </Field>
            <Field label="Source (optional)">
              <Input
                value={draft?.source ?? ""}
                onChange={(e) =>
                  setDraft({ ...(draft ?? emptySuppression()), source: e.target.value })
                }
                placeholder="Where the request was recorded"
              />
            </Field>
          </div>
          <Button
            onClick={() => saveMutation.mutate(draft ?? emptySuppression())}
            disabled={
              saveMutation.isPending ||
              !(draft?.value ?? "").trim() ||
              !(draft?.reason ?? "").trim()
            }
          >
            {saveMutation.isPending ? "Saving..." : "Save suppression"}
          </Button>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <CheckCircle2 className="h-4 w-4" /> Suppression ledger
            </h2>
            <p className="text-xs text-muted-foreground">
              The ledger is checked by the outreach panel before it records a send.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              className="w-56"
              placeholder="Search value..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
            <select
              className="rounded border bg-background px-2 py-2 text-sm"
              value={scopeFilter}
              onChange={(e) => {
                setScopeFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All scopes</option>
              {SUPPRESSION_SCOPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              className="rounded border bg-background px-2 py-2 text-sm"
              value={channelFilter}
              onChange={(e) => {
                setChannelFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All channels</option>
              {SUPPRESSION_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={includeExpired}
                onChange={(e) => setIncludeExpired(e.target.checked)}
              />
              show expired
            </label>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {rows.length === 0 ? (
            <EmptyState
              title="No suppression entries"
              why="Add an email, phone, domain or business when someone asks not to be contacted. This is safer than relying on memory."
            />
          ) : (
            rows.map((e) => (
              <div
                key={e.id}
                className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm"
              >
                <Badge variant="outline">{e.scope}</Badge>
                <Badge variant="secondary">{e.channel}</Badge>
                <span className="font-mono text-xs">{e.value}</span>
                <span className="text-muted-foreground">{e.reason}</span>
                {e.country && <span className="text-xs text-muted-foreground">{e.country}</span>}
                {e.expiresAt && (
                  <span className="text-xs text-muted-foreground">
                    expires {new Date(e.expiresAt).toLocaleDateString()}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => e.id && deleteMutation.mutate(e.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>

        {total > PAGE_SIZE && (
          <div className="mt-3 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page} of {pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <h2 className="text-lg font-semibold">Business do-not-contact</h2>
          <p className="text-xs text-muted-foreground">
            This flag blocks every channel for the whole business. Individual suppression entries
            remain separate and can be removed independently.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Business">
              <select
                className="w-full rounded border bg-background px-2 py-2 text-sm"
                value={flagBusinessId}
                onChange={(e) => setFlagBusinessId(e.target.value)}
              >
                <option value="">Choose business...</option>
                {(businesses.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.contact_suppressed ? " (suppressed)" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Reason">
              <Input
                value={flagReason}
                onChange={(e) => setFlagReason(e.target.value)}
                placeholder="Asked us to stop"
              />
            </Field>
          </div>
          <Button
            variant="outline"
            onClick={() => flagMutation.mutate()}
            disabled={flagMutation.isPending || !flagBusinessId}
          >
            Mark do-not-contact
          </Button>
          {(businesses.data ?? []).some((b) => b.contact_suppressed) && (
            <div className="space-y-1 text-xs text-muted-foreground">
              {(businesses.data ?? [])
                .filter((b) => b.contact_suppressed)
                .slice(0, 8)
                .map((b) => (
                  <p key={b.id}>
                    {b.name}: {b.suppression_reason ?? "suppressed"}
                  </p>
                ))}
            </div>
          )}
        </div>

        <div className="space-y-2 rounded-lg border bg-card p-4">
          <h2 className="text-lg font-semibold">Country policy checklist</h2>
          <p className="text-xs text-muted-foreground">
            Templates only. Confirm the current law, platform terms and your lawful basis with a
            qualified adviser before outreach.
          </p>
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {COMPLIANCE_POLICIES.map((p) => (
              <div key={p.countryCode} className="rounded-md border p-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {p.countryName} ({p.countryCode})
                  </span>
                  <Badge variant="outline">owner review</Badge>
                  <span className="ml-auto text-muted-foreground">email: {p.emailBasis}</span>
                </div>
                <p className="mt-1 text-muted-foreground">{p.notes}</p>
                <p className="mt-1">
                  Unsubscribe: {p.requiresUnsubscribe ? "yes" : "review"} | Sender identity:{" "}
                  {p.requiresSenderIdentity ? "yes" : "review"} | Retention prototype:{" "}
                  {p.retentionMonths ?? "review"} months
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function EligibilityResult({
  result,
  channel,
}: {
  result: OutreachCheckResult;
  channel: ContactChannel;
}) {
  const tone =
    result.status === "allowed"
      ? "border-emerald-500/40 bg-emerald-500/5"
      : result.status === "blocked"
        ? "border-destructive/40 bg-destructive/5"
        : "border-amber-500/40 bg-amber-500/5";
  return (
    <div className={`space-y-2 rounded-md border p-3 text-sm ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={result.status === "blocked" ? "destructive" : "outline"}>
          {result.status.replace(/_/g, " ")}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {result.policy.countryName} - {contactChannelLabel(channel)}
        </span>
        {!result.ledgerApplied && <Badge variant="secondary">ledger not applied</Badge>}
      </div>
      {result.reasons.length > 0 && (
        <ul className="list-disc space-y-1 pl-5">
          {result.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      {result.requirements.length > 0 && (
        <div>
          <p className="font-medium">Before recording or sending:</p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {result.requirements.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {result.matchedEntries.length > 0 && (
        <p className="text-xs">
          Matched suppression:{" "}
          {result.matchedEntries.map((e) => `${e.scope}:${e.value}`).join(", ")}
        </p>
      )}
      {result.contact.email && <p className="text-xs">Contact: {result.contact.email}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
