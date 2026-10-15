// Repeatable Offer Factory (Feature E).
//
// A productised offer kit is the reusable packaging around an offer the owner
// already sells: what is included, what is explicitly excluded, the delivery
// checklist, a typical timeline, revisions and a deposit. Kits are starting
// points the owner edits — the app never invents a scope, a promise or a price
// it cannot stand behind.
import { buildServiceCatalog } from "@/lib/service-match";

export type OfferKit = {
  id?: string | null;
  offer: string;
  scopeIncludes: string[];
  scopeExcludes: string[];
  deliverables: string[];
  timelineDays: number | null;
  revisions: number | null;
  depositPercent: number | null;
  recurring: boolean;
  notes: string | null;
  active: boolean;
};

export const OFFER_KIT_DISCLAIMER =
  "A kit is a starting point you edit, not a promise. Keep scope, timeline and price honest for the work you can actually deliver.";

export const OFFER_KIT_COLUMNS =
  "id,offer,scope_includes,scope_excludes,deliverables,timeline_days,revisions,deposit_percent,recurring,notes,active" as const;

type KitTemplate = {
  match: RegExp;
  scopeIncludes: string[];
  scopeExcludes: string[];
  deliverables: string[];
  timelineDays: number;
  revisions: number;
  depositPercent: number;
  recurring: boolean;
};

// Templates mirror the offer keyword rules in service-match so the factory and
// the matcher agree on what an offer is. Ordered most-specific first.
const KIT_TEMPLATES: KitTemplate[] = [
  {
    match: /performance|speed|core web|loading/i,
    scopeIncludes: [
      "Baseline speed measurement",
      "Image and asset optimisation",
      "Caching and compression",
      "Before/after report",
    ],
    scopeExcludes: ["Full redesign", "New content writing", "Hosting migration"],
    deliverables: [
      "Run a baseline speed audit",
      "Optimise images and assets",
      "Enable caching and compression",
      "Re-measure and send a before/after report",
    ],
    timelineDays: 10,
    revisions: 0,
    depositPercent: 50,
    recurring: false,
  },
  {
    match: /website|dukalinka|digital product|digital service|landing|web/i,
    scopeIncludes: [
      "Discovery and sitemap",
      "Design mockups",
      "Responsive build",
      "Launch and handover",
    ],
    scopeExcludes: ["Copywriting", "Ongoing hosting costs", "Paid advertising"],
    deliverables: [
      "Discovery call and sitemap",
      "Design mockups for approval",
      "Build responsive pages",
      "Mobile and cross-browser check",
      "Launch and handover walkthrough",
    ],
    timelineDays: 21,
    revisions: 2,
    depositPercent: 50,
    recurring: false,
  },
  {
    match: /automation|software|dashboard|system|workflow|booking|payment|crm/i,
    scopeIncludes: [
      "Process mapping",
      "Automation build",
      "Testing with real data",
      "Team training and handover",
    ],
    scopeExcludes: ["Hardware procurement", "Third-party licence fees", "Data entry"],
    deliverables: [
      "Map the current process",
      "Build the automation or system",
      "Test with real data",
      "Train the team",
      "Hand over documentation",
    ],
    timelineDays: 30,
    revisions: 1,
    depositPercent: 40,
    recurring: true,
  },
];

function genericTemplate(): KitTemplate {
  return {
    match: /.^/,
    scopeIncludes: [],
    scopeExcludes: [],
    deliverables: [],
    timelineDays: 14,
    revisions: 1,
    depositPercent: 50,
    recurring: false,
  };
}

function templateFor(offer: string): KitTemplate {
  for (const t of KIT_TEMPLATES) if (t.match.test(offer)) return t;
  return genericTemplate();
}

// A starter kit derived from the offer's category. Not persisted, not applied
// until the owner saves it.
export function suggestKit(offer: string): OfferKit {
  const t = templateFor(offer);
  return {
    id: null,
    offer: offer.trim(),
    scopeIncludes: [...t.scopeIncludes],
    scopeExcludes: [...t.scopeExcludes],
    deliverables: [...t.deliverables],
    timelineDays: t.timelineDays,
    revisions: t.revisions,
    depositPercent: t.depositPercent,
    recurring: t.recurring,
    notes: null,
    active: true,
  };
}

// Observable problems an offer is meant to address, via the shared service
// catalog. Empty when the offer does not clearly map to any problem.
export function problemKeysForOffer(offer: string): string[] {
  const def = buildServiceCatalog([offer])[0];
  return def ? [...def.addresses] : [];
}

// Multi-line scope text for a proposal or invoice note. Excludes are shown
// honestly rather than hidden.
export function kitScopeSummary(kit: OfferKit): string {
  const lines: string[] = [];
  if (kit.scopeIncludes.length > 0) {
    lines.push("Included:");
    kit.scopeIncludes.forEach((s) => lines.push(`- ${s}`));
  }
  if (kit.scopeExcludes.length > 0) {
    lines.push("Not included:");
    kit.scopeExcludes.forEach((s) => lines.push(`- ${s}`));
  }
  if (kit.timelineDays != null) lines.push(`Timeline: about ${kit.timelineDays} days`);
  if (kit.revisions != null) lines.push(`Revisions: ${kit.revisions}`);
  if (kit.depositPercent != null) lines.push(`Deposit: ${kit.depositPercent}%`);
  return lines.join("\n");
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function deliverableTaskTitle(offer: string, deliverable: string): string {
  return `${offer}: ${deliverable}`;
}

// Stable per-business dedupe key so re-materialising a kit never duplicates tasks.
export function kitTaskKey(
  offer: string,
  deliverable: string,
  index: number,
  businessId?: string | null,
): string {
  return `kit:${businessId ?? "none"}:${slug(offer)}:${index}:${slug(deliverable)}`;
}

// Defensive reader for a stored kit row; tolerates bad/partial data.
export function normalizeKit(input: Partial<OfferKit> & { offer: string }): OfferKit {
  const cleanList = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean) : [];
  const num = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  return {
    id: input.id ?? null,
    offer: input.offer.trim(),
    scopeIncludes: cleanList(input.scopeIncludes),
    scopeExcludes: cleanList(input.scopeExcludes),
    deliverables: cleanList(input.deliverables),
    timelineDays: num(input.timelineDays),
    revisions: num(input.revisions),
    depositPercent: num(input.depositPercent),
    recurring: Boolean(input.recurring),
    notes: input.notes ?? null,
    active: input.active ?? true,
  };
}

// Pick the stored kit for an offer, else the suggested starter.
export function resolveKit(offer: string, stored: OfferKit[]): OfferKit {
  const found = stored.find((k) => k.offer.trim().toLowerCase() === offer.trim().toLowerCase());
  return found ?? suggestKit(offer);
}
