// Proposal outcome maths. Pure so it can be unit tested and reused by the
// dashboard and any reports.

export type OutcomeRow = { status: string; price?: number | null };

export type OutcomeSummary = {
  won: number;
  lost: number;
  decided: number;
  /** 0-100, or null when nothing has been decided yet. */
  winRate: number | null;
  /** Proposals sent or under discussion but not yet decided. */
  pipeline: number;
  /** Total won value (sum of accepted prices); ignores rows without a price. */
  wonValue: number;
};

const PIPELINE = new Set(["SENT", "REPLIED", "NEGOTIATING"]);

export function summarizeOutcomes(rows: OutcomeRow[]): OutcomeSummary {
  let won = 0;
  let lost = 0;
  let pipeline = 0;
  let wonValue = 0;
  for (const r of rows) {
    if (r.status === "ACCEPTED") {
      won++;
      wonValue += Number(r.price) || 0;
    } else if (r.status === "REJECTED") {
      lost++;
    } else if (PIPELINE.has(r.status)) {
      pipeline++;
    }
  }
  const decided = won + lost;
  return {
    won,
    lost,
    decided,
    winRate: decided > 0 ? Math.round((won / decided) * 100) : null,
    pipeline,
    wonValue,
  };
}
