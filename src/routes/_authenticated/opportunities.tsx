import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Mail,
  RefreshCw,
  Sparkles,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, ErrorBanner } from "@/components/ErrorBanner";
import {
  createOpportunityProposal,
  generateSocialOpportunities,
  getOpportunities,
  recordOpportunityOutreach,
  refreshOpportunityEvidence,
  updateOpportunity,
  type OpportunityView,
} from "@/lib/opportunity.functions";
import { allowedStageTransitions } from "@/lib/opportunity-engine";
import type { QualificationStage } from "@/lib/opportunity-qualification";
import { VERIFICATION_LABELS } from "@/lib/provenance";

export const Route = createFileRoute("/_authenticated/opportunities")({
  head: () => ({
    meta: [
      { title: "Opportunities — GARE" },
      {
        name: "description",
        content:
          "Evidence-backed opportunities generated from social matches, with validation, scoring and proposal workflow.",
      },
    ],
  }),
  component: OpportunitiesPage,
});

const STAGE_LABELS: Record<string, string> = {
  DISCOVERED: "Discovered",
  RESEARCHING: "Researching",
  NEEDS_VALIDATION: "Needs validation",
  VALIDATION_IN_PROGRESS: "Validation in progress",
  QUALIFIED: "Qualified",
  READY_TO_PROPOSE: "Ready to propose",
  PROPOSAL_SENT: "Proposal sent",
  WON: "Won",
  LOST: "Lost",
  DISQUALIFIED: "Disqualified",
};

const PRIORITY_VARIANT: Record<string, "destructive" | "default" | "secondary" | "outline"> = {
  critical: "destructive",
  high: "default",
  medium: "secondary",
  low: "outline",
};

const PROPOSAL_MODES = [
  "DukaLinka introduction",
  "Website development proposal",
  "Website redesign proposal",
  "Business automation proposal",
  "Custom software proposal",
  "Formal quotation or project proposal",
];

function confidence(value: number | string | null): string {
  const n = Number(value ?? 0);
  return `${Math.round(n * 100)}%`;
}

function shortDate(value: string | null): string {
  if (!value) return "Not checked";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function OpportunityCard({
  row,
  onOpen,
  onRefresh,
  refreshing,
}: {
  row: OpportunityView;
  onOpen: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <article className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={PRIORITY_VARIANT[row.priority] ?? "outline"}>{row.priority}</Badge>
            <Badge variant="outline">
              {STAGE_LABELS[row.qualification_stage] ?? row.qualification_stage}
            </Badge>
            <span className="text-xs text-muted-foreground">Score {row.score}/100</span>
            <span className="text-xs text-muted-foreground">
              Confidence {confidence(row.confidence)}
            </span>
          </div>
          <button type="button" onClick={onOpen} className="mt-2 block text-left">
            <h2 className="text-base font-semibold hover:underline">{row.title}</h2>
          </button>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {row.identified_problem}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <Link to="/businesses/$id" params={{ id: row.business_id }} className="hover:underline">
              {row.business_name}
            </Link>
            <span>·</span>
            <span>{row.relevant_service ?? "No service selected"}</span>
            {row.social_lead && (
              <>
                <span>·</span>
                <a
                  href={row.social_lead.profile_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  @{row.social_lead.handle} <ExternalLink className="h-3 w-3" />
                </a>
              </>
            )}
            <span>·</span>
            <span>Verified {shortDate(row.last_verified_at)}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="outline" onClick={onOpen} className="gap-1">
            Review <ArrowUpRight className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRefresh}
            disabled={refreshing}
            className="gap-1"
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Evidence
          </Button>
        </div>
      </div>
    </article>
  );
}

function OpportunitiesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const load = useServerFn(getOpportunities);
  const generate = useServerFn(generateSocialOpportunities);
  const refresh = useServerFn(refreshOpportunityEvidence);
  const update = useServerFn(updateOpportunity);
  const logOutreach = useServerFn(recordOpportunityOutreach);
  const makeProposal = useServerFn(createOpportunityProposal);

  const [stage, setStage] = useState<"all" | QualificationStage>("all");
  const [priority, setPriority] = useState<"all" | "critical" | "high" | "medium" | "low">("all");
  const [source, setSource] = useState<
    "all" | "social_match" | "business_audit" | "manual" | "signal"
  >("all");
  const [needsValidation, setNeedsValidation] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [outreachOpen, setOutreachOpen] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [outreachChannel, setOutreachChannel] = useState<"Email" | "WhatsApp" | "SMS">("Email");
  const [outreachResponse, setOutreachResponse] = useState(false);
  const [outreachNote, setOutreachNote] = useState("");
  const [proposalMode, setProposalMode] = useState(PROPOSAL_MODES[0]!);
  const [proposalChannel, setProposalChannel] = useState<"Email" | "WhatsApp" | "SMS">("Email");

  const opportunities = useQuery({ queryKey: ["opportunities"], queryFn: () => load() });
  const rows = useMemo(() => opportunities.data?.rows ?? [], [opportunities.data?.rows]);
  const selected = rows.find((row) => row.id === selectedId) ?? null;

  const visible = useMemo(
    () =>
      rows.filter((row) => {
        if (stage !== "all" && row.qualification_stage !== stage) return false;
        if (priority !== "all" && row.priority !== priority) return false;
        if (source !== "all" && row.source !== source) return false;
        if (needsValidation && row.validation_status === "CONFIRMED") return false;
        return true;
      }),
    [rows, stage, priority, source, needsValidation],
  );

  const refreshMutation = useMutation({
    mutationFn: (id: string) => refresh({ data: { id, runAudit: true } }),
    onSuccess: (result) => {
      setMessage(result.message);
      void qc.invalidateQueries({ queryKey: ["opportunities"] });
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : "Evidence refresh failed."),
  });

  const generateMutation = useMutation({
    mutationFn: () => generate(),
    onSuccess: (result) => {
      const parts = [
        `${result.created} created`,
        `${result.updated} refreshed`,
        `${result.skipped} skipped`,
      ];
      setMessage(
        result.errors.length
          ? `${parts.join(", ")}. ${result.errors.slice(0, 2).join(" ")}`
          : `Opportunities generated: ${parts.join(", ")}.`,
      );
      void qc.invalidateQueries({ queryKey: ["opportunities"] });
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : "Could not generate opportunities."),
  });

  const updateMutation = useMutation({
    mutationFn: (vars: {
      id: string;
      stage?: QualificationStage;
      validationStatus?: "UNKNOWN" | "CONFIRMED" | "DENIED" | "PARTIAL";
      note?: string | null;
      ownerNotes?: string | null;
    }) => update({ data: vars }),
    onSuccess: () => {
      setMessage("Opportunity updated.");
      void qc.invalidateQueries({ queryKey: ["opportunities"] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Update failed."),
  });

  const outreachMutation = useMutation({
    mutationFn: (vars: {
      id: string;
      channel: "Email" | "WhatsApp" | "SMS";
      response: boolean;
      note?: string;
    }) => logOutreach({ data: vars }),
    onSuccess: () => {
      setMessage("Outreach recorded.");
      setOutreachOpen(false);
      setOutreachNote("");
      void qc.invalidateQueries({ queryKey: ["opportunities"] });
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : "Could not record outreach."),
  });

  const proposalMutation = useMutation({
    mutationFn: (vars: { id: string; mode: string; channel: "Email" | "WhatsApp" | "SMS" }) =>
      makeProposal({ data: { ...vars, provider: "auto" } }),
    onSuccess: (result) => {
      setProposalOpen(false);
      setMessage("Proposal drafted. Review it before sending.");
      void qc.invalidateQueries({ queryKey: ["opportunities"] });
      void qc.invalidateQueries({ queryKey: ["proposals"] });
      void navigate({ to: "/proposals/$id", params: { id: result.proposalId } });
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : "Could not draft proposal."),
  });

  function confirmProblem(row: OpportunityView) {
    const from = row.qualification_stage as QualificationStage;
    const target: QualificationStage =
      from === "DISCOVERED" || from === "RESEARCHING" || from === "NEEDS_VALIDATION"
        ? "VALIDATION_IN_PROGRESS"
        : from;
    updateMutation.mutate({
      id: row.id,
      stage: target,
      validationStatus: "CONFIRMED",
      ownerNotes: note || row.owner_notes,
    });
  }

  function qualify(row: OpportunityView) {
    updateMutation.mutate({
      id: row.id,
      stage: "QUALIFIED",
      validationStatus: "CONFIRMED",
      ownerNotes: note || row.owner_notes,
    });
  }

  const summary = opportunities.data?.summary;
  const tableMissing = opportunities.data && !opportunities.data.tableReady;

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Target className="h-5 w-5" /> Opportunities
        </h1>
        <p className="text-sm text-muted-foreground">
          Evidence-backed opportunities from social matches and audits. Scores estimate priority;
          they are not proof that the business will buy. Qualify only after the owner confirms the
          problem.
        </p>
      </header>

      {opportunities.isError && (
        <ErrorBanner
          error={opportunities.error}
          context="Opportunities"
          onRetry={() => void opportunities.refetch()}
        />
      )}
      {tableMissing && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
          The opportunities engine migration has not been applied yet. Apply the Phase 2-6 migration
          before generating opportunities.
        </p>
      )}
      {message && (
        <p className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
          {message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{summary?.total ?? 0} total</span>
        <span>· {summary?.needs_validation ?? 0} need validation</span>
        <span>· {summary?.qualified ?? 0} qualified</span>
        <span>· {summary?.ready_to_propose ?? 0} ready to propose</span>
        <span>· {summary?.high_priority ?? 0} high priority</span>
        <span className="ml-auto">
          <Button
            size="sm"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="gap-1"
          >
            {generateMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Generate from matches
          </Button>
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
        <div className="space-y-1">
          <Label htmlFor="stage-filter" className="text-xs">
            Stage
          </Label>
          <select
            id="stage-filter"
            value={stage}
            onChange={(event) => setStage(event.target.value as typeof stage)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="all">All stages</option>
            {Object.entries(STAGE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="priority-filter" className="text-xs">
            Priority
          </Label>
          <select
            id="priority-filter"
            value={priority}
            onChange={(event) => setPriority(event.target.value as typeof priority)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="all">All priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="source-filter" className="text-xs">
            Source
          </Label>
          <select
            id="source-filter"
            value={source}
            onChange={(event) => setSource(event.target.value as typeof source)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="all">All sources</option>
            <option value="social_match">Social match</option>
            <option value="business_audit">Business audit</option>
            <option value="manual">Manual</option>
            <option value="signal">Signal</option>
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={needsValidation}
            onChange={(event) => setNeedsValidation(event.target.checked)}
          />
          Needs validation
        </label>
      </div>

      {opportunities.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading opportunities…</p>
      ) : visible.length === 0 ? (
        <EmptyState
          title="No opportunities yet"
          why="Run social matching first, then generate opportunities from confirmed or high-confidence matches."
        />
      ) : (
        <div className="space-y-3">
          {visible.map((row) => (
            <OpportunityCard
              key={row.id}
              row={row}
              onOpen={() => {
                setSelectedId(row.id);
                setNote(row.owner_notes ?? "");
              }}
              onRefresh={() => refreshMutation.mutate(row.id)}
              refreshing={refreshMutation.isPending && refreshMutation.variables === row.id}
            />
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.title}</DialogTitle>
                <DialogDescription>
                  {selected.business_name}
                  {selected.social_lead ? ` · @${selected.social_lead.handle}` : ""}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Score</p>
                    <p className="font-semibold">{selected.score}/100</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Priority</p>
                    <p className="font-semibold capitalize">{selected.priority}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Confidence</p>
                    <p className="font-semibold">{confidence(selected.confidence)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Validation</p>
                    <p className="font-semibold">{selected.validation_status}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Recorded problem
                  </p>
                  <p>{selected.identified_problem}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Recommended solution
                  </p>
                  <p>{selected.potential_solution}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selected.relevant_service ?? "No service"} ·{" "}
                    {selected.estimated_effort ?? "unknown"} effort ·{" "}
                    {selected.recurring ? "recurring potential" : "one-off potential"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Evidence
                  </p>
                  <ul className="mt-1 space-y-2">
                    {(selected.gaps as unknown as Array<Record<string, unknown>>).map(
                      (gap, index) => (
                        <li
                          key={`${String(gap["key"])}-${index}`}
                          className="rounded-md border p-2"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{String(gap["label"])}</span>
                            <Badge variant="outline">
                              {VERIFICATION_LABELS[
                                gap["verification_status"] as keyof typeof VERIFICATION_LABELS
                              ] ?? String(gap["verification_status"])}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {confidence((gap["confidence"] as number) ?? 0)} ·{" "}
                              {shortDate(String(gap["last_checked_at"] ?? ""))}
                            </span>
                          </div>
                          <p className="text-muted-foreground">{String(gap["evidence"])}</p>
                        </li>
                      ),
                    )}
                  </ul>
                </div>

                {selected.score_reasons && Array.isArray(selected.score_reasons) && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Why this score
                    </p>
                    <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                      {(selected.score_reasons as unknown as string[]).map((reason, index) => (
                        <li key={index}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="space-y-1">
                  <Label htmlFor="opportunity-note" className="text-xs">
                    Owner note
                  </Label>
                  <Textarea
                    id="opportunity-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Record what the owner confirmed, or why this is dismissed."
                    rows={3}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value=""
                    onChange={(event) => {
                      const next = event.target.value as QualificationStage;
                      if (!next) return;
                      updateMutation.mutate({
                        id: selected.id,
                        stage: next,
                        ...(next === "DISQUALIFIED" && note ? { note } : {}),
                        ...(note ? { ownerNotes: note } : {}),
                      });
                    }}
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="">Move stage…</option>
                    {allowedStageTransitions(
                      selected.qualification_stage as QualificationStage,
                    ).map((next) => (
                      <option key={next} value={next}>
                        {STAGE_LABELS[next] ?? next}
                      </option>
                    ))}
                  </select>
                  {selected.validation_status !== "CONFIRMED" && (
                    <Button
                      size="sm"
                      onClick={() => confirmProblem(selected)}
                      disabled={updateMutation.isPending}
                      className="gap-1"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Confirm problem
                    </Button>
                  )}
                  {selected.validation_status === "CONFIRMED" &&
                    selected.qualification_stage === "VALIDATION_IN_PROGRESS" && (
                      <Button
                        size="sm"
                        onClick={() => qualify(selected)}
                        disabled={updateMutation.isPending}
                      >
                        Qualify
                      </Button>
                    )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => refreshMutation.mutate(selected.id)}
                    disabled={refreshMutation.isPending}
                    className="gap-1"
                  >
                    {refreshMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Refresh evidence
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2 border-t pt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setOutreachOpen(true)}
                    className="gap-1"
                  >
                    <Mail className="h-3.5 w-3.5" /> Log outreach
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setProposalOpen(true)}
                    disabled={
                      selected.validation_status !== "CONFIRMED" ||
                      !["QUALIFIED", "READY_TO_PROPOSE", "PROPOSAL_SENT"].includes(
                        selected.qualification_stage,
                      )
                    }
                    className="gap-1"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Draft proposal
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <Link to="/businesses/$id" params={{ id: selected.business_id }}>
                      Open business <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  {selected.social_lead && (
                    <Button size="sm" variant="ghost" asChild>
                      <a href={selected.social_lead.profile_url} target="_blank" rel="noreferrer">
                        Open profile <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Last outreach {shortDate(selected.last_outreach_at)} · {selected.outreach_count}{" "}
                  logged · Last response {shortDate(selected.last_response_at)}
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={outreachOpen} onOpenChange={setOutreachOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log outreach</DialogTitle>
            <DialogDescription>
              Record what you sent and whether the business replied. This does not send a message.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="outreach-channel">Channel</Label>
              <select
                id="outreach-channel"
                value={outreachChannel}
                onChange={(event) =>
                  setOutreachChannel(event.target.value as "Email" | "WhatsApp" | "SMS")
                }
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="Email">Email</option>
                <option value="WhatsApp">WhatsApp</option>
                <option value="SMS">SMS</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={outreachResponse}
                onChange={(event) => setOutreachResponse(event.target.checked)}
              />
              The business replied
            </label>
            <div className="space-y-1">
              <Label htmlFor="outreach-note">Note</Label>
              <Textarea
                id="outreach-note"
                value={outreachNote}
                onChange={(event) => setOutreachNote(event.target.value)}
                rows={2}
                placeholder="Optional context"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOutreachOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                selected &&
                outreachMutation.mutate({
                  id: selected.id,
                  channel: outreachChannel,
                  response: outreachResponse,
                  ...(outreachNote ? { note: outreachNote } : {}),
                })
              }
              disabled={outreachMutation.isPending}
            >
              {outreachMutation.isPending ? "Saving…" : "Save outreach"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={proposalOpen} onOpenChange={setProposalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Draft an opportunity proposal</DialogTitle>
            <DialogDescription>
              This uses the owner's proposal engine and only the recorded evidence. Review and edit
              before sending.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="proposal-mode">Mode</Label>
              <select
                id="proposal-mode"
                value={proposalMode}
                onChange={(event) => setProposalMode(event.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                {PROPOSAL_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="proposal-channel">Channel</Label>
              <select
                id="proposal-channel"
                value={proposalChannel}
                onChange={(event) =>
                  setProposalChannel(event.target.value as "Email" | "WhatsApp" | "SMS")
                }
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="Email">Email</option>
                <option value="WhatsApp">WhatsApp</option>
                <option value="SMS">SMS</option>
              </select>
            </div>
            <p className="rounded-md border bg-muted px-3 py-2 text-xs text-muted-foreground">
              No price is invented. The draft will use a price placeholder until you set one in the
              proposal editor.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProposalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                selected &&
                proposalMutation.mutate({
                  id: selected.id,
                  mode: proposalMode,
                  channel: proposalChannel,
                })
              }
              disabled={proposalMutation.isPending}
            >
              {proposalMutation.isPending ? "Drafting…" : "Draft proposal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
