import { useEffect, useState } from "react";
import { CalendarClock, Check, HelpCircle, Target, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { canValidate, defaultPlan, readPlan, type ValidationPlan } from "@/lib/validation";

const lbl = "mb-1 block text-[11px] uppercase tracking-widest text-muted-foreground";

export function ValidationPlanner({
  businessId,
  businessName,
  storedPlan,
  onSaved,
}: {
  businessId: string;
  businessName: string;
  storedPlan: unknown;
  onSaved?: () => void;
}) {
  const [plan, setPlan] = useState<ValidationPlan>(() =>
    readPlan(storedPlan, `${businessName} would pay for a solution to their main problem`),
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Re-sync when the underlying record changes (e.g. after re-investigation).
  useEffect(() => {
    setPlan(readPlan(storedPlan, `${businessName} would pay for a solution to their main problem`));
  }, [storedPlan, businessName]);

  function set<K extends keyof ValidationPlan>(k: K, v: ValidationPlan[K]) {
    setPlan((p) => ({ ...p, [k]: v }));
  }

  async function save(outcome?: ValidationPlan["outcome"]) {
    const next: ValidationPlan = outcome ? { ...plan, outcome } : plan;
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase
        .from("businesses")
        .update({ validation_plan: next })
        .eq("id", businessId);
      if (error) throw error;
      if (outcome && outcome !== "pending") {
        await supabase.from("business_activity_events").insert({
          business_id: businessId,
          event_type: "validation_outcome",
          summary: `Validation ${outcome}: ${next.hypothesis.slice(0, 80)}`,
          details: { outcome, method: next.cheapest_method, cost_usd: next.cost_usd },
        });
      }
      setPlan(next);
      setMsg(outcome ? `Recorded: ${outcome}` : "Saved.");
      onSaved?.();
    } catch (e) {
      setMsg(
        (e instanceof Error ? e.message : "Could not save.") +
          " — if this keeps failing, apply migration 0007_business_validation_plan.sql.",
      );
    }
    setBusy(false);
  }

  const cheap = canValidate(plan);

  return (
    <section className="space-y-4 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Target className="h-4 w-4 text-primary" />
        <p className="mr-auto font-mono text-xs uppercase tracking-[0.3em] text-primary">
          Validation plan
        </p>
        <Badge
          variant="outline"
          className={
            cheap ? "border-emerald-500/50 text-emerald-400" : "border-amber-500/50 text-amber-400"
          }
        >
          {cheap ? "low-cost" : "above low-cost limit"}
        </Badge>
        {plan.outcome !== "pending" && (
          <Badge variant={plan.outcome === "pass" ? "default" : "secondary"}>
            outcome: {plan.outcome}
          </Badge>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Cheapest way to test this opportunity before spending real time or money. Steps 1–9 from the
        method: hypothesis → evidence → cheapest test → success/fail → next review.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className={lbl}>1 · Hypothesis to test</span>
          <Textarea
            rows={2}
            value={plan.hypothesis}
            onChange={(e) => set("hypothesis", e.target.value)}
          />
        </label>
        <label>
          <span className={lbl}>2 · Target customer</span>
          <Input value={plan.target} onChange={(e) => set("target", e.target.value)} />
        </label>
        <label>
          <span className={lbl}>5 · Cheapest useful method</span>
          <Input
            value={plan.cheapest_method}
            onChange={(e) => set("cheapest_method", e.target.value)}
          />
        </label>
        <label>
          <span className={lbl}>3 · Evidence so far (one per line)</span>
          <Textarea
            rows={2}
            value={plan.evidence.join("\n")}
            onChange={(e) =>
              set(
                "evidence",
                e.target.value
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
          />
        </label>
        <label>
          <span className={lbl}>4 · Missing information (one per line)</span>
          <Textarea
            rows={2}
            value={plan.missing.join("\n")}
            onChange={(e) =>
              set(
                "missing",
                e.target.value
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className={lbl}>6 · Cost (USD)</span>
            <Input
              inputMode="decimal"
              value={String(plan.cost_usd)}
              onChange={(e) => set("cost_usd", Number(e.target.value) || 0)}
            />
          </label>
          <label>
            <span className={lbl}>6 · Time (hours)</span>
            <Input
              inputMode="decimal"
              value={String(plan.time_hours)}
              onChange={(e) => set("time_hours", Number(e.target.value) || 0)}
            />
          </label>
        </div>
        <label>
          <span className={lbl}>7 · Success looks like</span>
          <Input value={plan.success} onChange={(e) => set("success", e.target.value)} />
        </label>
        <label>
          <span className={lbl}>8 · Fail looks like</span>
          <Input value={plan.fail} onChange={(e) => set("fail", e.target.value)} />
        </label>
        <label>
          <span className={lbl}>9 · Review date</span>
          <Input
            type="date"
            value={plan.next_date}
            onChange={(e) => set("next_date", e.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => save()} disabled={busy}>
          {busy ? "Saving…" : "Save plan"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => save("pass")} disabled={busy}>
          <Check className="mr-1 h-4 w-4" /> Mark validated
        </Button>
        <Button size="sm" variant="outline" onClick={() => save("fail")} disabled={busy}>
          <X className="mr-1 h-4 w-4" /> Mark failed
        </Button>
        <Button size="sm" variant="ghost" onClick={() => save("skip")} disabled={busy}>
          <HelpCircle className="mr-1 h-4 w-4" /> Skip
        </Button>
        {plan.next_date && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" /> review {plan.next_date}
          </span>
        )}
      </div>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </section>
  );
}
