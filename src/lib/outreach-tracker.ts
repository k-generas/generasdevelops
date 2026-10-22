// Business-level outreach tracking. Pure helpers so the stages, counters and
// contact targets stay easy to unit test. The stage lives on the business row
// itself, so remembering who was messaged/replied/negotiated never needs a
// fresh scan.

export const OUTREACH_STAGES = [
  "not_contacted",
  "messaged",
  "replied",
  "negotiating",
  "won",
  "lost",
] as const;

export type OutreachStage = (typeof OUTREACH_STAGES)[number];

const STAGE_LABELS: Record<OutreachStage, string> = {
  not_contacted: "Not contacted",
  messaged: "Messaged",
  replied: "Replied",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
};

export function normalizeStage(stage: string | null | undefined): OutreachStage {
  return OUTREACH_STAGES.includes(stage as OutreachStage)
    ? (stage as OutreachStage)
    : "not_contacted";
}

export function stageLabel(stage: string | null | undefined): string {
  return STAGE_LABELS[normalizeStage(stage)];
}

export function isContacted(stage: string | null | undefined): boolean {
  return normalizeStage(stage) !== "not_contacted";
}

export type ContactChannels = {
  phone: string | null;
  email: string | null;
  extraEmails: string[];
};

// Best available phone (primary number, then the mobile/cell field) plus the
// first email, with any remaining emails kept for a "+N more" hint.
export function contactChannels(biz: {
  phone?: string | null;
  cell?: string | null;
  emails?: string[] | null;
}): ContactChannels {
  const phone = (biz.phone ?? "").trim() || (biz.cell ?? "").trim() || null;
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const raw of biz.emails ?? []) {
    const e = raw.trim().toLowerCase();
    if (e === "" || seen.has(e)) continue;
    seen.add(e);
    emails.push(e);
  }
  return { phone, email: emails[0] ?? null, extraEmails: emails.slice(1) };
}

export type StageCounts = { total: number } & Record<OutreachStage, number>;

export function stageCounts(rows: { outreach_stage?: string | null }[]): StageCounts {
  const counts: StageCounts = {
    total: rows.length,
    not_contacted: 0,
    messaged: 0,
    replied: 0,
    negotiating: 0,
    won: 0,
    lost: 0,
  };
  for (const r of rows) counts[normalizeStage(r.outreach_stage)] += 1;
  return counts;
}

// Timestamp patch for a stage change. Moving back to "not contacted" clears the
// last-contact time; every other stage marks "contacted now".
export function stagePatch(stage: OutreachStage, now: Date = new Date()) {
  const patch: Record<string, unknown> = { outreach_stage: stage };
  if (stage === "not_contacted") patch["last_contacted_at"] = null;
  else patch["last_contacted_at"] = now.toISOString();
  return patch;
}
