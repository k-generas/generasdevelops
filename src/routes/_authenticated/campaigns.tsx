import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  Ban,
  Building2,
  Check,
  CheckCircle2,
  Megaphone,
  Plus,
  Send,
  ShieldAlert,
  Trash2,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ErrorBanner } from "@/components/ErrorBanner";
import { describeError } from "@/lib/errors";
import {
  CAMPAIGN_AUDIENCE_KINDS,
  CAMPAIGN_STATUSES,
  QUEUE_STATUSES,
  audienceKindLabel,
  campaignStatusLabel,
  campaignSummary,
  canApproveQueueItem,
  canMarkQueueSent,
  queueStatusLabel,
  stepChannelLabel,
  stepDelayLabel,
  validateCampaign,
  type Campaign,
  type CampaignAudienceKind,
  type CampaignQueueItem,
  type CampaignStatus,
  type CampaignStep,
  type CampaignStepInput,
  type QueueStatus,
} from "@/lib/campaign";
import { CONTACT_CHANNELS, contactChannelLabel, type ContactChannel } from "@/lib/compliance";
import {
  buildCampaignQueue,
  deleteCampaign,
  deleteQueueItem,
  getCampaignDetail,
  getCampaignQueue,
  getCampaigns,
  saveCampaign,
  saveCampaignSteps,
  updateQueueItem,
  type CampaignQueueResult,
} from "@/lib/campaigns.functions";
import { getProspectLists } from "@/lib/prospect-lists.functions";
import { prospectFilterSummary } from "@/lib/prospect-lists";

export const Route = createFileRoute("/_authenticated/campaigns")({
  head: () => ({
    meta: [
      { title: "Campaigns - GARE" },
      {
        name: "description",
        content:
          "Build outreach sequences, review every draft and approve contacts manually. GARE never auto-sends.",
      },
    ],
  }),
  component: CampaignsPage,
});

const PAGE_SIZE = 25;

type CampaignDraft = {
  id?: string;
  name: string;
  objective: string;
  status: CampaignStatus;
  audienceKind: CampaignAudienceKind;
  dailyLimit: number;
  notes: string;
};

type StepDraft = {
  stepOrder: number;
  channel: ContactChannel;
  delayDays: number;
  subjectTemplate: string;
  bodyTemplate: string;
  requiresApproval: boolean;
  active: boolean;
};

type BuildDraft = {
  stepId: string;
  limit: number;
  listId: string;
  query: string;
  district: string;
  sector: string;
  stage: string;
  country: string;
  professionalType: string;
  availability: string;
};

function emptyCampaign(): CampaignDraft {
  return {
    name: "",
    objective: "",
    status: "draft",
    audienceKind: "business",
    dailyLimit: 20,
    notes: "",
  };
}

function emptyStep(order = 1): StepDraft {
  return {
    stepOrder: order,
    channel: "email",
    delayDays: 0,
    subjectTemplate: "",
    bodyTemplate:
      "Hi {{first_name}},\n\nI noticed {{business}} and wanted to ask a quick question.\n\n{{context}}",
    requiresApproval: true,
    active: true,
  };
}

function campaignDraft(campaign: Campaign): CampaignDraft {
  return {
    ...(campaign.id ? { id: campaign.id } : {}),
    name: campaign.name,
    objective: campaign.objective ?? "",
    status: campaign.status,
    audienceKind: campaign.audienceKind,
    dailyLimit: campaign.dailyLimit,
    notes: campaign.notes ?? "",
  };
}

function stepDraft(step: CampaignStep): StepDraft {
  return {
    stepOrder: step.stepOrder,
    channel: step.channel,
    delayDays: step.delayDays,
    subjectTemplate: step.subjectTemplate ?? "",
    bodyTemplate: step.bodyTemplate,
    requiresApproval: step.requiresApproval,
    active: step.active,
  };
}

function serverSteps(steps: StepDraft[]): CampaignStepInput[] {
  return steps.map((step) => ({
    stepOrder: step.stepOrder,
    channel: step.channel,
    delayDays: step.delayDays,
    subjectTemplate: step.subjectTemplate || null,
    bodyTemplate: step.bodyTemplate,
    requiresApproval: step.requiresApproval,
    active: step.active,
  }));
}

function statusVariant(
  status: CampaignStatus | QueueStatus,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "sent" || status === "running" || status === "completed") return "default";
  if (status === "blocked") return "destructive";
  if (status === "needs_review" || status === "approved" || status === "ready") return "outline";
  return "secondary";
}

function CampaignsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(getCampaigns);
  const detailFn = useServerFn(getCampaignDetail);
  const queueFn = useServerFn(getCampaignQueue);
  const saveFn = useServerFn(saveCampaign);
  const saveStepsFn = useServerFn(saveCampaignSteps);
  const deleteFn = useServerFn(deleteCampaign);
  const buildFn = useServerFn(buildCampaignQueue);
  const updateFn = useServerFn(updateQueueItem);
  const deleteQueueFn = useServerFn(deleteQueueItem);
  const prospectListsFn = useServerFn(getProspectLists);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState<CampaignDraft>(emptyCampaign);
  const [steps, setSteps] = useState<StepDraft[]>([emptyStep()]);
  const [build, setBuild] = useState<BuildDraft>({
    stepId: "",
    limit: 25,
    listId: "",
    query: "",
    district: "",
    sector: "",
    stage: "",
    country: "",
    professionalType: "",
    availability: "",
  });
  const [queuePage, setQueuePage] = useState(1);
  const [queueFilter, setQueueFilter] = useState("");
  const [confirmedBasis, setConfirmedBasis] = useState(false);
  const [confirmedManual, setConfirmedManual] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const campaigns = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => listFn(),
  });

  const prospectLists = useQuery({
    queryKey: ["prospect-lists"],
    queryFn: () => prospectListsFn(),
  });

  const matchingLists = useMemo(
    () => (prospectLists.data?.rows ?? []).filter((list) => list.entityKind === draft.audienceKind),
    [prospectLists.data, draft.audienceKind],
  );

  const activeList = matchingLists.find((list) => list.id === build.listId) ?? null;

  useEffect(() => {
    if (!build.listId) return;
    if (matchingLists.some((list) => list.id === build.listId)) return;
    setBuild((value) => ({ ...value, listId: "" }));
  }, [build.listId, matchingLists]);

  useEffect(() => {
    if (showNew || selectedId) return;
    const first = campaigns.data?.rows[0];
    if (first) setSelectedId(first.id);
  }, [campaigns.data, selectedId, showNew]);

  const detail = useQuery({
    queryKey: ["campaign-detail", selectedId],
    enabled: !!selectedId,
    queryFn: () => detailFn({ data: { id: selectedId! } }),
  });

  useEffect(() => {
    const data = detail.data;
    if (!data?.campaign) return;
    setDraft(campaignDraft(data.campaign));
    setSteps(data.steps.length > 0 ? data.steps.map(stepDraft) : [emptyStep()]);
  }, [detail.data]);

  useEffect(() => {
    setQueuePage(1);
    setConfirmedBasis(false);
    setConfirmedManual(false);
  }, [selectedId]);

  const queue = useQuery({
    queryKey: ["campaign-queue", selectedId, queuePage, queueFilter],
    enabled: !!selectedId && !!detail.data?.campaign,
    queryFn: () =>
      queueFn({
        data: {
          campaignId: selectedId!,
          status: queueFilter,
          page: queuePage,
          pageSize: PAGE_SIZE,
        },
      }),
  });

  const effectiveStepId = useMemo(() => {
    const rows = detail.data?.steps ?? [];
    if (build.stepId && rows.some((step) => step.id === build.stepId)) return build.stepId;
    return rows[0]?.id ?? "";
  }, [build.stepId, detail.data]);

  const localValidation = useMemo(
    () =>
      validateCampaign({
        name: draft.name,
        dailyLimit: draft.dailyLimit,
        steps: serverSteps(steps),
      }),
    [draft.name, draft.dailyLimit, steps],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const saved = await saveFn({
        data: {
          ...(draft.id ? { id: draft.id } : {}),
          name: draft.name,
          objective: draft.objective || null,
          status: draft.status,
          audienceKind: draft.audienceKind,
          dailyLimit: draft.dailyLimit,
          notes: draft.notes || null,
        },
      });
      const savedSteps = await saveStepsFn({
        data: { campaignId: saved.id, steps: serverSteps(steps) },
      });
      return { saved, savedSteps };
    },
    onSuccess: ({ saved }) => {
      setDraft(campaignDraft(saved));
      setSelectedId(saved.id);
      setShowNew(false);
      setMessage({ ok: true, text: "Campaign and sequence saved." });
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
      void qc.invalidateQueries({ queryKey: ["campaign-detail", saved.id] });
      void qc.invalidateQueries({ queryKey: ["campaign-queue", saved.id] });
    },
    onError: (error) => setMessage({ ok: false, text: describeError(error).title }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      setSelectedId(null);
      setShowNew(false);
      setDraft(emptyCampaign());
      setSteps([emptyStep()]);
      setMessage({ ok: true, text: "Campaign deleted." });
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (error) => setMessage({ ok: false, text: describeError(error).title }),
  });

  const buildMutation = useMutation({
    mutationFn: async () => {
      if (!draft.id) throw new Error("Save the campaign before building a review queue.");
      if (!effectiveStepId) throw new Error("Save at least one sequence step first.");
      return buildFn({
        data: {
          campaignId: draft.id,
          stepId: effectiveStepId,
          limit: build.limit,
          ...(build.listId ? { listId: build.listId } : {}),
          query: build.query,
          district: build.district,
          sector: build.sector,
          stage: build.stage,
          country: build.country,
          professionalType: build.professionalType,
          availability: build.availability,
        },
      });
    },
    onSuccess: (result) => {
      setMessage({
        ok: true,
        text: `Added ${result.queued} item(s) for review, skipped ${result.skipped} duplicate(s), ${result.blocked} blocked.`,
      });
      void qc.invalidateQueries({ queryKey: ["campaign-queue"] });
    },
    onError: (error) => setMessage({ ok: false, text: describeError(error).title }),
  });

  const updateMutation = useMutation({
    mutationFn: (args: { id: string; status: QueueStatus }) =>
      updateFn({
        data: {
          id: args.id,
          status: args.status,
          ownerConfirmedLawfulBasis: confirmedBasis,
          ownerConfirmedManualSend: confirmedManual,
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["campaign-queue"] });
      setMessage({ ok: true, text: "Queue item updated. Nothing was sent." });
    },
    onError: (error) => setMessage({ ok: false, text: describeError(error).title }),
  });

  const removeQueueMutation = useMutation({
    mutationFn: (id: string) => deleteQueueFn({ data: { id } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["campaign-queue"] });
      setMessage({ ok: true, text: "Queue item removed." });
    },
    onError: (error) => setMessage({ ok: false, text: describeError(error).title }),
  });

  const startNew = () => {
    setShowNew(true);
    setSelectedId(null);
    setDraft(emptyCampaign());
    setSteps([emptyStep()]);
    setMessage(null);
  };

  const selectCampaign = (id: string) => {
    setShowNew(false);
    setSelectedId(id);
    setMessage(null);
  };

  const handleSave = async () => {
    if (!localValidation.valid) {
      setMessage({ ok: false, text: localValidation.errors.join(" ") });
      return;
    }
    try {
      await saveMutation.mutateAsync();
    } catch {
      return;
    }
  };

  const handleDelete = async () => {
    if (!draft.id) return;
    if (!window.confirm("Delete this campaign and its review queue? This cannot be undone."))
      return;
    try {
      await deleteMutation.mutateAsync(draft.id);
    } catch {
      return;
    }
  };

  const queueData = queue.data;
  const summary = useMemo(() => {
    if (queueData && queueData.applied) return queueData.summary;
    return campaignSummary([]);
  }, [queueData]);

  const applied = campaigns.data?.applied ?? true;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Megaphone className="h-5 w-5" /> Campaigns
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Build sequences, generate review drafts and approve contacts one by one. GARE does not
            send messages automatically and does not bypass channel limits.
          </p>
        </div>
        <Button onClick={startNew}>
          <Plus /> New campaign
        </Button>
      </header>

      {message && (
        <p
          className={
            message.ok
              ? "rounded border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm"
              : "rounded border border-destructive bg-card p-3 text-sm text-destructive"
          }
        >
          {message.text}
        </p>
      )}

      {!applied && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <p className="font-medium">Campaign tables are not applied yet.</p>
          <p className="mt-1 text-muted-foreground">
            Apply <code>supabase/migrations/20261111000000_outreach_campaigns.sql</code>, then
            reload this page.
          </p>
        </div>
      )}

      {campaigns.isError && (
        <ErrorBanner
          error={campaigns.error as Error}
          context="Campaigns"
          onRetry={() => void campaigns.refetch()}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-2">
          {campaigns.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading campaigns...</p>
          ) : (campaigns.data?.rows ?? []).length === 0 ? (
            <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
              No campaigns yet. Create one to start a manual review queue.
            </p>
          ) : (
            (campaigns.data?.rows ?? []).map((campaign) => (
              <button
                key={campaign.id}
                type="button"
                onClick={() => selectCampaign(campaign.id)}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  selectedId === campaign.id && !showNew
                    ? "border-primary bg-primary/5"
                    : "bg-card hover:border-primary/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{campaign.name}</span>
                  <Badge variant={statusVariant(campaign.status)}>
                    {campaignStatusLabel(campaign.status)}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {audienceKindLabel(campaign.audienceKind)} - {campaign.dailyLimit}/day review
                </p>
              </button>
            ))
          )}
        </aside>

        <section className="space-y-6">
          <div className="space-y-4 rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {showNew || !draft.id ? "New campaign" : "Campaign settings"}
              </h2>
              {draft.id && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => void handleDelete()}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 /> Delete
                </Button>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="campaign-name">Name</Label>
                <Input
                  id="campaign-name"
                  value={draft.name}
                  maxLength={160}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Q1 owner outreach"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="campaign-objective">Objective</Label>
                <Input
                  id="campaign-objective"
                  value={draft.objective}
                  maxLength={1000}
                  onChange={(e) => setDraft({ ...draft, objective: e.target.value })}
                  placeholder="Book 10 discovery calls"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="campaign-audience">Audience</Label>
                <select
                  id="campaign-audience"
                  className="w-full rounded border bg-background px-2 py-2 text-sm"
                  value={draft.audienceKind}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      audienceKind: e.target.value as CampaignAudienceKind,
                    })
                  }
                >
                  {CAMPAIGN_AUDIENCE_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {audienceKindLabel(kind)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="campaign-status">Status</Label>
                <select
                  id="campaign-status"
                  className="w-full rounded border bg-background px-2 py-2 text-sm"
                  value={draft.status}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value as CampaignStatus })}
                >
                  {CAMPAIGN_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {campaignStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="campaign-limit">Daily review limit</Label>
                <Input
                  id="campaign-limit"
                  type="number"
                  min={1}
                  max={500}
                  value={draft.dailyLimit}
                  onChange={(e) => setDraft({ ...draft, dailyLimit: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="campaign-notes">Notes</Label>
                <Textarea
                  id="campaign-notes"
                  value={draft.notes}
                  maxLength={4000}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  placeholder="Audience rationale, offers to mention, exclusions..."
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Sequence
              </h2>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSteps([...steps, emptyStep(steps.length + 1)])}
                disabled={steps.length >= 20}
              >
                <Plus /> Add step
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Templates support <code>{"{{name}}"}</code>, <code>{"{{first_name}}"}</code>,{" "}
              <code>{"{{business}}"}</code>, <code>{"{{country}}"}</code>,{" "}
              <code>{"{{website}}"}</code>, <code>{"{{email}}"}</code>, <code>{"{{phone}}"}</code>{" "}
              and <code>{"{{context}}"}</code>. An opt-out line is added when missing.
            </p>

            <div className="space-y-3">
              {steps.map((step, index) => (
                <div key={index} className="space-y-3 rounded-lg border bg-background p-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="w-20 space-y-1">
                      <Label htmlFor={`step-order-${index}`}>Order</Label>
                      <Input
                        id={`step-order-${index}`}
                        type="number"
                        min={1}
                        value={step.stepOrder}
                        onChange={(e) => {
                          const next = [...steps];
                          next[index] = {
                            ...step,
                            stepOrder: Number(e.target.value) || 1,
                          };
                          setSteps(next);
                        }}
                      />
                    </div>
                    <div className="w-40 space-y-1">
                      <Label htmlFor={`step-channel-${index}`}>Channel</Label>
                      <select
                        id={`step-channel-${index}`}
                        className="w-full rounded border bg-background px-2 py-2 text-sm"
                        value={step.channel}
                        onChange={(e) => {
                          const next = [...steps];
                          next[index] = {
                            ...step,
                            channel: e.target.value as ContactChannel,
                          };
                          setSteps(next);
                        }}
                      >
                        {CONTACT_CHANNELS.map((channel) => (
                          <option key={channel} value={channel}>
                            {contactChannelLabel(channel)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-28 space-y-1">
                      <Label htmlFor={`step-delay-${index}`}>Delay days</Label>
                      <Input
                        id={`step-delay-${index}`}
                        type="number"
                        min={0}
                        max={90}
                        value={step.delayDays}
                        onChange={(e) => {
                          const next = [...steps];
                          next[index] = {
                            ...step,
                            delayDays: Number(e.target.value) || 0,
                          };
                          setSteps(next);
                        }}
                      />
                    </div>
                    <Badge variant="secondary">{stepDelayLabel(step.delayDays)}</Badge>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={step.requiresApproval}
                        onChange={(e) => {
                          const next = [...steps];
                          next[index] = {
                            ...step,
                            requiresApproval: e.target.checked,
                          };
                          setSteps(next);
                        }}
                      />
                      Requires approval
                    </label>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto"
                      onClick={() => setSteps(steps.filter((_, i) => i !== index))}
                      disabled={steps.length <= 1}
                    >
                      <Trash2 /> Remove
                    </Button>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`step-subject-${index}`}>Subject</Label>
                    <Input
                      id={`step-subject-${index}`}
                      value={step.subjectTemplate}
                      maxLength={300}
                      onChange={(e) => {
                        const next = [...steps];
                        next[index] = {
                          ...step,
                          subjectTemplate: e.target.value,
                        };
                        setSteps(next);
                      }}
                      placeholder={
                        step.channel === "email" || step.channel === "contact_form"
                          ? "Required for email and contact forms"
                          : "Optional"
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`step-body-${index}`}>Message</Label>
                    <Textarea
                      id={`step-body-${index}`}
                      value={step.bodyTemplate}
                      maxLength={8000}
                      rows={5}
                      onChange={(e) => {
                        const next = [...steps];
                        next[index] = {
                          ...step,
                          bodyTemplate: e.target.value,
                        };
                        setSteps(next);
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => void handleSave()}
                disabled={saveMutation.isPending || !localValidation.valid}
              >
                <Check /> {saveMutation.isPending ? "Saving..." : "Save campaign"}
              </Button>
              {!localValidation.valid && (
                <span className="text-xs text-destructive">{localValidation.errors[0]}</span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {steps.length} step(s), max 20
              </span>
            </div>
          </div>

          {draft.id && (
            <div className="space-y-4 rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Manual review queue
                </h2>
                <select
                  className="rounded border bg-background px-2 py-2 text-sm"
                  value={queueFilter}
                  onChange={(e) => {
                    setQueueFilter(e.target.value);
                    setQueuePage(1);
                  }}
                >
                  <option value="">All statuses</option>
                  {QUEUE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {queueStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <MiniStat label="Total" value={summary.total} />
                <MiniStat label="Review" value={summary.needsReview} />
                <MiniStat label="Blocked" value={summary.blocked} danger />
                <MiniStat label="Approved" value={summary.approved} />
                <MiniStat label="Sent" value={summary.sent} />
                <MiniStat label="Skipped" value={summary.skipped} />
              </div>

              <div className="grid gap-2 rounded-lg border bg-background p-3 md:grid-cols-4">
                <div className="space-y-1 md:col-span-4">
                  <Label htmlFor="build-list">Saved prospect list (optional)</Label>
                  <select
                    id="build-list"
                    className="w-full rounded border bg-background px-2 py-2 text-sm"
                    value={build.listId}
                    onChange={(e) => setBuild({ ...build, listId: e.target.value })}
                    disabled={!prospectLists.data?.applied || matchingLists.length === 0}
                  >
                    <option value="">Use the ad-hoc filters below</option>
                    {matchingLists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name}
                      </option>
                    ))}
                  </select>
                  {activeList && (
                    <p className="text-xs text-muted-foreground">
                      Saved list filters are used and the ad-hoc filters below are ignored:{" "}
                      {prospectFilterSummary(activeList.entityKind, activeList.filters)}
                    </p>
                  )}
                  {prospectLists.data && !prospectLists.data.applied && (
                    <p className="text-xs text-amber-600">
                      Saved lists are unavailable until the prospect lists migration is applied.
                      Ad-hoc filters still work.
                    </p>
                  )}
                  {!activeList && matchingLists.length === 0 && prospectLists.data?.applied && (
                    <p className="text-xs text-muted-foreground">
                      No saved {draft.audienceKind} list yet. Create one under Prospect lists.
                    </p>
                  )}
                </div>
                <Input
                  placeholder={
                    draft.audienceKind === "business"
                      ? "Name, sector, industry, district..."
                      : "Name, headline, country..."
                  }
                  value={build.query}
                  onChange={(e) => setBuild({ ...build, query: e.target.value })}
                  className="md:col-span-2"
                  disabled={!!build.listId}
                />
                {draft.audienceKind === "business" ? (
                  <>
                    <Input
                      placeholder="District"
                      value={build.district}
                      onChange={(e) => setBuild({ ...build, district: e.target.value })}
                      disabled={!!build.listId}
                    />
                    <Input
                      placeholder="Sector (exact)"
                      value={build.sector}
                      onChange={(e) => setBuild({ ...build, sector: e.target.value })}
                      disabled={!!build.listId}
                    />
                    <Input
                      placeholder="Outreach stage (exact)"
                      value={build.stage}
                      onChange={(e) => setBuild({ ...build, stage: e.target.value })}
                      disabled={!!build.listId}
                    />
                  </>
                ) : (
                  <>
                    <Input
                      placeholder="Country"
                      value={build.country}
                      onChange={(e) => setBuild({ ...build, country: e.target.value })}
                      disabled={!!build.listId}
                    />
                    <Input
                      placeholder="Type (exact)"
                      value={build.professionalType}
                      onChange={(e) => setBuild({ ...build, professionalType: e.target.value })}
                      disabled={!!build.listId}
                    />
                    <Input
                      placeholder="Availability (exact)"
                      value={build.availability}
                      onChange={(e) => setBuild({ ...build, availability: e.target.value })}
                      disabled={!!build.listId}
                    />
                  </>
                )}
                <select
                  className="rounded border bg-background px-2 py-2 text-sm"
                  value={effectiveStepId}
                  onChange={(e) => setBuild({ ...build, stepId: e.target.value })}
                >
                  {(detail.data?.steps ?? []).map((step) => (
                    <option key={step.id} value={step.id}>
                      Step {step.stepOrder}: {stepChannelLabel(step.channel)}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={build.limit}
                  onChange={(e) => setBuild({ ...build, limit: Number(e.target.value) || 1 })}
                />
                <Button
                  onClick={() => void buildMutation.mutateAsync().catch(() => undefined)}
                  disabled={buildMutation.isPending || !effectiveStepId || !detail.data?.campaign}
                >
                  <Plus /> Build queue
                </Button>
              </div>

              <div className="rounded border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-muted-foreground">
                <p className="flex items-center gap-2 font-medium text-foreground">
                  <ShieldAlert className="h-4 w-4" /> Approval is manual
                </p>
                <p className="mt-1">
                  Every item starts as review or blocked. Approving records your review only. Mark
                  sent after you send the message yourself in the channel you use. No provider is
                  contacted from this page.
                </p>
                <label className="mt-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={confirmedBasis}
                    onChange={(e) => setConfirmedBasis(e.target.checked)}
                  />
                  I have reviewed the lawful basis, suppression result and channel terms.
                </label>
                <label className="mt-1 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={confirmedManual}
                    onChange={(e) => setConfirmedManual(e.target.checked)}
                  />
                  For "mark sent", I confirm the message was sent manually outside GARE.
                </label>
              </div>

              {queue.isError && (
                <ErrorBanner
                  error={queue.error as Error}
                  context="Campaign queue"
                  onRetry={() => void queue.refetch()}
                />
              )}

              {queue.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading review queue...</p>
              ) : (queue.data?.rows ?? []).length === 0 ? (
                <p className="rounded border bg-background p-4 text-sm text-muted-foreground">
                  No queue items match. Build a queue from the filters above.
                </p>
              ) : (
                <div className="space-y-3">
                  {(queue.data?.rows ?? []).map((item) => (
                    <QueueCard
                      key={item.id}
                      item={item}
                      confirmedBasis={confirmedBasis}
                      confirmedManual={confirmedManual}
                      busy={updateMutation.isPending}
                      onApprove={() =>
                        void updateMutation
                          .mutateAsync({ id: item.id, status: "approved" })
                          .catch(() => undefined)
                      }
                      onSkip={() =>
                        void updateMutation
                          .mutateAsync({ id: item.id, status: "skipped" })
                          .catch(() => undefined)
                      }
                      onSent={() =>
                        void updateMutation
                          .mutateAsync({ id: item.id, status: "sent" })
                          .catch(() => undefined)
                      }
                      onRemove={() => {
                        if (window.confirm("Remove this queue item?")) {
                          void removeQueueMutation.mutateAsync(item.id).catch(() => undefined);
                        }
                      }}
                    />
                  ))}
                </div>
              )}

              {queue.data && queue.data.total > PAGE_SIZE && (
                <div className="flex items-center justify-between gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={queuePage <= 1}
                    onClick={() => setQueuePage((page) => Math.max(1, page - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {queuePage} of {Math.ceil(queue.data.total / PAGE_SIZE)}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={queuePage >= Math.ceil(queue.data.total / PAGE_SIZE)}
                    onClick={() => setQueuePage((page) => page + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="rounded-lg border bg-card p-4 text-sm">
            <h2 className="flex items-center gap-2 font-semibold">
              <ShieldAlert className="h-4 w-4" /> Before you approve
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Check the suppression ledger and business/professional do-not-contact flag.</li>
              <li>Confirm the lawful basis and the destination country rules for this channel.</li>
              <li>Do not automate LinkedIn or bypass platform limits.</li>
              <li>
                Review the{" "}
                <Link to="/compliance" className="text-primary underline">
                  compliance checklist
                </Link>{" "}
                when unsure.
              </li>
            </ul>
          </div>
        </section>
      </div>

      <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
        <h2 className="flex items-center gap-2 font-semibold">
          <ShieldAlert className="h-4 w-4" /> Sending is intentionally absent
        </h2>
        <p className="mt-1 text-muted-foreground">
          This page prepares drafts and records manual decisions. It has no send button, no SMTP
          credentials and no WhatsApp/LinkedIn integration.
        </p>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div className="rounded border bg-background p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          danger && value > 0 ? "text-lg font-semibold text-destructive" : "text-lg font-semibold"
        }
      >
        {value}
      </p>
    </div>
  );
}

function QueueCard({
  item,
  confirmedBasis,
  confirmedManual,
  busy,
  onApprove,
  onSkip,
  onSent,
  onRemove,
}: {
  item: CampaignQueueItem;
  confirmedBasis: boolean;
  confirmedManual: boolean;
  busy: boolean;
  onApprove: () => void;
  onSkip: () => void;
  onSent: () => void;
  onRemove: () => void;
}) {
  const approveGate = canApproveQueueItem(item, confirmedBasis);
  const sentGate = canMarkQueueSent(item, confirmedManual);
  const reasons = item.eligibility?.reasons ?? [];

  return (
    <article className="space-y-2 rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        {item.businessId ? (
          <Building2 className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Users className="h-4 w-4 text-muted-foreground" />
        )}
        <h3 className="font-medium">{item.recipientName}</h3>
        <Badge variant={statusVariant(item.status)}>{queueStatusLabel(item.status)}</Badge>
        <Badge variant="secondary">{contactChannelLabel(item.channel)}</Badge>
        {item.country && <span className="text-xs text-muted-foreground">{item.country}</span>}
        <span className="ml-auto text-xs text-muted-foreground">
          {new Date(item.createdAt).toLocaleString()}
        </span>
      </div>

      <dl className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
        <div>
          <dt className="font-medium text-foreground">Email</dt>
          <dd>{item.recipientEmail ?? "None"}</dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">Phone</dt>
          <dd>{item.recipientPhone ?? "None"}</dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">Domain</dt>
          <dd>{item.recipientDomain ?? "None"}</dd>
        </div>
      </dl>

      {reasons.length > 0 && (
        <div className="rounded border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
          <p className="font-medium">Review notes</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
            {reasons.slice(0, 5).map((reason, index) => (
              <li key={index}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {item.draftSubject && (
        <p className="text-sm">
          <span className="text-muted-foreground">Subject:</span> {item.draftSubject}
        </p>
      )}
      <div className="max-h-48 overflow-auto whitespace-pre-wrap rounded border bg-card p-2 text-sm">
        {item.draftBody || "No draft."}
      </div>

      <div className="flex flex-wrap gap-2">
        {item.status === "needs_review" && (
          <Button
            size="sm"
            onClick={onApprove}
            disabled={busy || !approveGate.allowed}
            title={approveGate.reason ?? undefined}
          >
            <CheckCircle2 /> Approve
          </Button>
        )}
        {item.status === "approved" && (
          <Button
            size="sm"
            onClick={onSent}
            disabled={busy || !sentGate.allowed}
            title={sentGate.reason ?? undefined}
          >
            <Send /> Mark sent
          </Button>
        )}
        {item.status !== "sent" && item.status !== "skipped" && (
          <Button size="sm" variant="outline" onClick={onSkip} disabled={busy}>
            <Ban /> Skip
          </Button>
        )}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onRemove} disabled={busy}>
          <Trash2 /> Remove
        </Button>
      </div>
      {!approveGate.allowed && item.status === "needs_review" && approveGate.reason && (
        <p className="text-xs text-muted-foreground">{approveGate.reason}</p>
      )}
      {!sentGate.allowed && item.status === "approved" && sentGate.reason && (
        <p className="text-xs text-muted-foreground">{sentGate.reason}</p>
      )}
    </article>
  );
}
