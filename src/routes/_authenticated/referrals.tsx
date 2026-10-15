import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteReferral,
  getPartnershipCandidates,
  getReferrals,
  saveReferral,
} from "@/lib/referrals.functions";
import {
  PARTNERSHIP_DISCLAIMER,
  REFERRAL_DISCLAIMER,
  REFERRAL_REWARD_TYPES,
  REFERRAL_STATUSES,
  referralSummary,
  type Referral,
  type ReferralRewardType,
  type ReferralStatus,
} from "@/lib/referrals";

export const Route = createFileRoute("/_authenticated/referrals")({
  head: () => ({
    meta: [
      { title: "Referrals — GARE" },
      {
        name: "description",
        content: "Track referrals you have recorded and partnership clusters worth a look.",
      },
    ],
  }),
  component: ReferralsPage,
});

type Draft = {
  id?: string | undefined;
  referrer_name: string;
  referrer_business_id: string;
  referred_business_id: string;
  referred_name: string;
  status: ReferralStatus;
  reward_type: ReferralRewardType;
  reward_value: string;
  currency: string;
  notes: string;
  source: string;
};

function emptyDraft(): Draft {
  return {
    referrer_name: "",
    referrer_business_id: "",
    referred_business_id: "",
    referred_name: "",
    status: "invited",
    reward_type: "none",
    reward_value: "0",
    currency: "USD",
    notes: "",
    source: "",
  };
}

function draftFrom(r: Referral): Draft {
  return {
    id: r.id ?? undefined,
    referrer_name: r.referrerName,
    referrer_business_id: r.referrerBusinessId ?? "",
    referred_business_id: r.referredBusinessId ?? "",
    referred_name: r.referredName ?? "",
    status: r.status,
    reward_type: r.rewardType,
    reward_value: String(r.rewardValue),
    currency: r.currency,
    notes: r.notes ?? "",
    source: r.source ?? "",
  };
}

function ReferralsPage() {
  const qc = useQueryClient();
  const loadRefs = useServerFn(getReferrals);
  const loadCandidates = useServerFn(getPartnershipCandidates);
  const upsert = useServerFn(saveReferral);
  const remove = useServerFn(deleteReferral);

  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const refs = useQuery({ queryKey: ["referrals"], queryFn: () => loadRefs() });
  const candidates = useQuery({
    queryKey: ["partnership-candidates"],
    queryFn: () => loadCandidates(),
  });

  const rows = useMemo(() => refs.data ?? [], [refs.data]);
  const summary = useMemo(() => referralSummary(rows), [rows]);

  const saveMutation = useMutation({
    mutationFn: (d: Draft) =>
      upsert({
        data: {
          ...(d.id ? { id: d.id } : {}),
          referrer_name: d.referrer_name,
          referrer_business_id: d.referrer_business_id || null,
          referred_business_id: d.referred_business_id || null,
          referred_name: d.referred_name || null,
          status: d.status,
          reward_type: d.reward_type,
          reward_value: Number(d.reward_value) || 0,
          currency: d.currency || "USD",
          notes: d.notes || null,
          source: d.source || null,
        },
      }),
    onSuccess: () => {
      setDraft(null);
      setMessage("Referral saved.");
      void qc.invalidateQueries({ queryKey: ["referrals"] });
    },
    onError: (e) => setMessage(e instanceof Error ? e.message : "Could not save referral."),
  });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Users className="h-5 w-5" /> Referrals &amp; partnerships
        </h1>
        <p className="text-sm text-muted-foreground">{REFERRAL_DISCLAIMER}</p>
      </header>

      {message && (
        <p className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
          {message}
        </p>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Referrals recorded" value={String(summary.total)} />
        <Stat label="Accepted" value={String(summary.byStatus.accepted)} />
        <Stat label="Won" value={String(summary.byStatus.won)} />
        <Stat
          label="Rewards owed (won)"
          value={`${summary.rewardsOwed.toFixed(0)} ${summary.currency}`}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Partnership candidates</h2>
          <span className="text-xs text-muted-foreground">
            {candidates.data?.length ?? 0} cluster{(candidates.data?.length ?? 0) === 1 ? "" : "s"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{PARTNERSHIP_DISCLAIMER}</p>
        {candidates.isLoading ? (
          <p className="text-sm text-muted-foreground">Looking for clusters…</p>
        ) : (candidates.data?.length ?? 0) === 0 ? (
          <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
            No clusters yet. Clusters appear when you have recorded clients (active subscriptions or
            won proposals) grouped in the same industry.
          </p>
        ) : (
          <div className="space-y-2">
            {(candidates.data ?? []).map((c) => (
              <article
                key={c.industry ?? "unknown"}
                className="space-y-1 rounded-lg border bg-card p-4 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.industryLabel}</span>
                  {c.hasPartner ? (
                    <Badge variant="secondary">covered by a partner</Badge>
                  ) : (
                    <Badge variant="outline">hypothesis</Badge>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {c.clientCount} client{c.clientCount === 1 ? "" : "s"} · {c.recurringClients}{" "}
                    recurring
                  </span>
                </div>
                <p className="text-muted-foreground">{c.evidence}</p>
                <p className="text-xs text-muted-foreground">{c.nextStep}</p>
                {c.clientNames.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Clients: {c.clientNames.join(", ")}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Referral ledger</h2>
          <span className="text-xs text-muted-foreground">{rows.length} recorded</span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => setDraft(emptyDraft())}
          >
            Add referral
          </Button>
        </div>

        {draft && (
          <ReferralForm
            draft={draft}
            setDraft={setDraft}
            onSave={() => saveMutation.mutate(draft)}
            onCancel={() => setDraft(null)}
            busy={saveMutation.isPending}
          />
        )}

        {refs.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading referrals…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
            No referrals recorded yet. Add an introduction you gave or received to track what came
            of it.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <article
                key={r.id ?? `${r.referrerName}-${r.referredName}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-sm"
              >
                <span className="font-medium">{r.referrerName}</span>
                <span className="text-muted-foreground">→ {r.referredName ?? "unknown"}</span>
                <Badge variant="outline">{r.status}</Badge>
                {r.rewardType !== "none" && (
                  <span className="text-xs text-muted-foreground">
                    reward {r.rewardValue.toFixed(0)} {r.currency} ({r.rewardType})
                  </span>
                )}
                <span className="ml-auto flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setDraft(draftFrom(r))}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => {
                      if (!r.id) return;
                      remove({ data: { id: r.id } })
                        .then(() => {
                          setMessage("Referral removed.");
                          void qc.invalidateQueries({ queryKey: ["referrals"] });
                        })
                        .catch((e) =>
                          setMessage(e instanceof Error ? e.message : "Could not remove."),
                        );
                    }}
                  >
                    Delete
                  </Button>
                </span>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}

function ReferralForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  busy,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  function set<K extends keyof Draft>(key: K, v: Draft[K]) {
    setDraft({ ...draft, [key]: v });
  }
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold">{draft.id ? "Edit referral" : "Add referral"}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Referrer</Label>
          <Input
            value={draft.referrer_name}
            onChange={(e) => set("referrer_name", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Referred name</Label>
          <Input
            value={draft.referred_name}
            onChange={(e) => set("referred_name", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <select
            value={draft.status}
            onChange={(e) => set("status", e.target.value as ReferralStatus)}
            className="w-full rounded-md border bg-background px-2 py-2 text-sm"
          >
            {REFERRAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Referrer business id (optional)</Label>
          <Input
            value={draft.referrer_business_id}
            onChange={(e) => set("referrer_business_id", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Referred business id (optional)</Label>
          <Input
            value={draft.referred_business_id}
            onChange={(e) => set("referred_business_id", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Reward type</Label>
          <select
            value={draft.reward_type}
            onChange={(e) => set("reward_type", e.target.value as ReferralRewardType)}
            className="w-full rounded-md border bg-background px-2 py-2 text-sm"
          >
            {REFERRAL_REWARD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Reward value</Label>
          <Input
            type="number"
            value={draft.reward_value}
            onChange={(e) => set("reward_value", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Currency</Label>
          <Input value={draft.currency} onChange={(e) => set("currency", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Source</Label>
          <Input value={draft.source} onChange={(e) => set("source", e.target.value)} />
        </div>
        <div className="space-y-1 sm:col-span-2 lg:col-span-3">
          <Label className="text-xs">Notes</Label>
          <Textarea value={draft.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || !draft.referrer_name.trim()} onClick={onSave}>
          Save referral
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
