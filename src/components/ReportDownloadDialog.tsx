import { useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { buildProspectVerification } from "@/lib/prospect-verification";
import { OUTREACH_PACK_MODE } from "@/lib/outreach-pack";
import type { MatchExplanation } from "@/lib/service-match";
import {
  REPORT_SECTIONS,
  REPORT_SECTION_KEYS,
  buildFullReportHtml,
  buildFullReportMarkdown,
  downloadReportFile,
  normalizeReportSolutions,
  reportFilename,
  type ReportBusiness,
  type ReportFindings,
  type ReportFormat,
  type ReportOutreachMessage,
  type ReportSectionKey,
} from "@/lib/full-report";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type InvestigationInput = {
  created_at: string;
  findings?: unknown;
  report?: unknown;
} | null;

type SolutionRow = Database["public"]["Tables"]["solution_recommendations"]["Row"];
type PromptRow = Database["public"]["Tables"]["solution_prompts"]["Row"];

export function ReportDownloadDialog({
  open,
  onOpenChange,
  business,
  investigation,
  findings,
  recommendations,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  business: ReportBusiness & { id?: string };
  investigation: InvestigationInput;
  findings: ReportFindings | null;
  recommendations: MatchExplanation[];
}) {
  const [selected, setSelected] = useState<Set<ReportSectionKey>>(
    () => new Set<ReportSectionKey>(REPORT_SECTION_KEYS),
  );
  const [busy, setBusy] = useState<ReportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allSelected = selected.size === REPORT_SECTIONS.length;
  const noneSelected = selected.size === 0;

  function toggleSection(key: ReportSectionKey, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function download(format: ReportFormat) {
    if (noneSelected) return;
    setBusy(format);
    setError(null);

    try {
      const sections = REPORT_SECTION_KEYS.filter((key) => selected.has(key));
      let solutionRows: SolutionRow[] = [];
      let promptRows: PromptRow[] = [];
      let outreachRows: ReportOutreachMessage[] = [];

      if (business.id && selected.has("solutions")) {
        const recommendationResult = await supabase
          .from("solution_recommendations")
          .select("*")
          .eq("business_id", business.id)
          .order("created_at", { ascending: false });
        if (recommendationResult.error) throw recommendationResult.error;
        solutionRows = recommendationResult.data ?? [];

        const recommendationIds = solutionRows.map((row) => row.id);
        if (recommendationIds.length > 0) {
          const promptResult = await supabase
            .from("solution_prompts")
            .select("*")
            .in("recommendation_id", recommendationIds)
            .eq("status", "ready")
            .order("version", { ascending: false });
          if (promptResult.error) throw promptResult.error;
          promptRows = promptResult.data ?? [];
        }
      }

      if (business.id && selected.has("outreach")) {
        const outreachResult = await supabase
          .from("proposals")
          .select("channel,title,body,status,created_at")
          .eq("business_id", business.id)
          .eq("mode", OUTREACH_PACK_MODE)
          .order("created_at", { ascending: false });
        if (outreachResult.error) throw outreachResult.error;
        outreachRows = (outreachResult.data ?? []).map((row) => ({
          channel: row.channel,
          title: row.title,
          body: row.body,
          status: row.status,
          created_at: row.created_at,
        }));
      }

      const verification = buildProspectVerification({
        business,
        findings: findings ?? null,
        observedAt: investigation?.created_at ?? null,
      });
      const generatedAt = new Date().toISOString();
      const input = {
        business,
        verification,
        investigation: investigation
          ? {
              created_at: investigation.created_at,
              findings: (investigation.findings ?? null) as ReportFindings | null,
              report: (investigation.report ?? null) as {
                overview?: string | null;
                problems?: { problem: string; evidence: string; severity: string }[] | null;
                recommended_offer?: string | null;
                offer_reasoning?: string | null;
                confidence?: string | null;
                estimated_deal_value_usd?: number | null;
                conversion_probability?: string | null;
                delivery_effort?: string | null;
                next_action?: string | null;
              } | null,
            }
          : null,
        recommendations,
        solutions: normalizeReportSolutions(solutionRows, promptRows),
        outreach: outreachRows,
        generatedAt,
        sections,
      };

      const content =
        format === "html" ? buildFullReportHtml(input) : buildFullReportMarkdown(input);
      downloadReportFile(content, reportFilename(business.name, format, generatedAt), format);
      toast.success(`${allSelected ? "Full" : "Selected"} report downloaded.`);
      onOpenChange(false);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error ? downloadError.message : "Could not build the report.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Download full report</DialogTitle>
          <DialogDescription>
            Choose the sections to include. The report uses recorded evidence and generated content
            only; it never adds facts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Sections</p>
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setSelected(new Set(REPORT_SECTION_KEYS))}
              >
                Select all
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {REPORT_SECTIONS.map((section) => (
              <div
                key={section.key}
                onClick={() => toggleSection(section.key, !selected.has(section.key))}
                className="flex cursor-pointer items-start gap-3 rounded border p-3 hover:bg-muted/40"
              >
                <Checkbox
                  aria-label={section.label}
                  checked={selected.has(section.key)}
                  onCheckedChange={(checked) => toggleSection(section.key, checked === true)}
                  onClick={(event) => event.stopPropagation()}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{section.label}</span>
                  <span className="block text-xs text-muted-foreground">{section.description}</span>
                </span>
              </div>
            ))}
          </div>

          {error && (
            <p className="rounded border border-destructive p-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="sticky bottom-0 z-10 -mx-4 gap-2 border-t bg-background px-4 py-3 sm:-mx-6 sm:px-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => void download("markdown")}
            disabled={noneSelected || busy !== null}
          >
            {busy === "markdown" ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-1 h-4 w-4" />
            )}
            Markdown
          </Button>
          <Button
            type="button"
            onClick={() => void download("html")}
            disabled={noneSelected || busy !== null}
          >
            {busy === "html" ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1 h-4 w-4" />
            )}
            {allSelected ? "Download all (HTML)" : "Download selected (HTML)"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
