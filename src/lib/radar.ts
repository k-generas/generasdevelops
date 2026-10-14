// Local Opportunity Radar (GARE Opportunity Intelligence, location mode).
//
// The radar finds businesses in a chosen area whose *unmet needs* are visible in
// evidence we already hold, scores them, and hands the good ones into the
// existing sales pipeline. It deliberately reuses the engine rather than
// duplicating it: business-intel/service-match for problems + offers, ranking for
// prioritisation, provenance for verification labels, rwanda for geography.
//
// Honesty rules encoded here:
//   - A lead is only surfaced with an observable gap (never "nearby = good").
//   - Weak/listing-only evidence stays a hypothesis and is flagged for
//     verification; high priority never implies high confidence.
//   - Periodic checks are never labelled "real-time".
//   - Missing coordinates are never guessed; radius needs a real centre.
import {
  ALL_DISTRICTS,
  classifyIndustry,
  industryLabel,
  normalizeDistrict,
  parseLocation,
  provinceOfDistrict,
  type IndustryKey,
  type Province,
} from "@/lib/rwanda";
import {
  PROBLEM_KEYS,
  buildServiceCatalog,
  matchServices,
  type CompanySize,
  type MatchExplanation,
  type ObservedProblem,
  type Severity,
} from "@/lib/service-match";
import {
  businessIndustry,
  companySize,
  deriveObservedProblems,
  type IntelFindings,
  type WebsiteCheck,
} from "@/lib/business-intel";
import { rankOpportunity } from "@/lib/ranking";
import { daysSince, type VerificationStatus } from "@/lib/provenance";

// ---------------------------------------------------------------------------
// Settings (the proposed controls). Stored client-side; nothing here scans.
// ---------------------------------------------------------------------------

export const RADAR_RADIUS_KM = [1, 5, 25, 50] as const;
export const RADAR_DEFAULT_RADIUS_KM = 5;

export const RADAR_CATEGORIES = [
  { key: "all", label: "All businesses", industries: null },
  { key: "hospitality", label: "Restaurants & hospitality", industries: ["hospitality"] },
  { key: "retail", label: "Retail shops", industries: ["wholesale_retail", "trade"] },
  {
    key: "factories_offices",
    label: "Factories & offices",
    industries: ["manufacturing", "professional", "technology", "finance"],
  },
] as const;
export type RadarCategoryKey = (typeof RADAR_CATEGORIES)[number]["key"];

export const RADAR_SERVICES = [
  { key: "all", label: "All suitable services", problems: [] as string[] },
  {
    key: "web_presence",
    label: "Websites & online presence",
    problems: [
      PROBLEM_KEYS.noWebsite,
      PROBLEM_KEYS.slowSite,
      PROBLEM_KEYS.notMobile,
      PROBLEM_KEYS.outdatedContent,
      PROBLEM_KEYS.noContactChannel,
    ],
  },
  {
    key: "automation",
    label: "Business automation",
    problems: [
      PROBLEM_KEYS.manualProcess,
      PROBLEM_KEYS.leadFollowup,
      PROBLEM_KEYS.noBooking,
      PROBLEM_KEYS.noReporting,
    ],
  },
  {
    key: "custom_software",
    label: "Custom software & dashboards",
    problems: [PROBLEM_KEYS.noReporting, PROBLEM_KEYS.leadFollowup, PROBLEM_KEYS.manualProcess],
  },
] as const;
export type RadarServiceKey = (typeof RADAR_SERVICES)[number]["key"];

export const RADAR_MONITORING = [
  { key: "frequent", label: "Frequent checks when sources permit" },
  { key: "daily", label: "Daily scan" },
  { key: "manual", label: "Only when I start a scan" },
] as const;
export type RadarMonitoringKey = (typeof RADAR_MONITORING)[number]["key"];

export type RadarSettings = {
  district: string | null;
  radiusKm: number;
  category: RadarCategoryKey;
  service: RadarServiceKey;
  monitoring: RadarMonitoringKey;
  centerLat: number | null;
  centerLng: number | null;
};

export function defaultRadarSettings(): RadarSettings {
  return {
    district: null,
    radiusKm: RADAR_DEFAULT_RADIUS_KM,
    category: "all",
    service: "all",
    monitoring: "manual",
    centerLat: null,
    centerLng: null,
  };
}

function oneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === "string" && (options as readonly string[]).includes(value);
}

export function readRadarSettings(raw: unknown): RadarSettings {
  const d = defaultRadarSettings();
  if (!raw || typeof raw !== "object") return d;
  const o = raw as Record<string, unknown>;
  const districtInput = o["district"];
  const district =
    typeof districtInput === "string"
      ? (normalizeDistrict(districtInput) ?? ALL_DISTRICTS.find((x) => x === districtInput) ?? null)
      : null;
  const radius = o["radiusKm"];
  const centerLat = o["centerLat"];
  const centerLng = o["centerLng"];
  return {
    district,
    radiusKm:
      typeof radius === "number" && (RADAR_RADIUS_KM as readonly number[]).includes(radius)
        ? radius
        : d.radiusKm,
    category: oneOf(
      o["category"],
      RADAR_CATEGORIES.map((c) => c.key),
    )
      ? (o["category"] as RadarCategoryKey)
      : d.category,
    service: oneOf(
      o["service"],
      RADAR_SERVICES.map((s) => s.key),
    )
      ? (o["service"] as RadarServiceKey)
      : d.service,
    monitoring: oneOf(
      o["monitoring"],
      RADAR_MONITORING.map((m) => m.key),
    )
      ? (o["monitoring"] as RadarMonitoringKey)
      : d.monitoring,
    centerLat: typeof centerLat === "number" && Number.isFinite(centerLat) ? centerLat : null,
    centerLng: typeof centerLng === "number" && Number.isFinite(centerLng) ? centerLng : null,
  };
}

export function categoryIndustries(key: RadarCategoryKey): IndustryKey[] | null {
  const found = RADAR_CATEGORIES.find((c) => c.key === key);
  return found ? (found.industries as unknown as IndustryKey[] | null) : null;
}

export function categoryLabel(key: RadarCategoryKey): string {
  return RADAR_CATEGORIES.find((c) => c.key === key)?.label ?? "All businesses";
}

export function serviceProblems(key: RadarServiceKey): string[] {
  const found = RADAR_SERVICES.find((s) => s.key === key);
  return found ? [...found.problems] : [];
}

export function serviceLabel(key: RadarServiceKey): string {
  return RADAR_SERVICES.find((s) => s.key === key)?.label ?? "All suitable services";
}

// ---------------------------------------------------------------------------
// Geography. Plain lat/lng (no PostGIS); radius uses the haversine formula.
// ---------------------------------------------------------------------------

export type Center = { lat: number; lng: number };
export type GeoPoint = { latitude: number | null; longitude: number | null };

const EARTH_RADIUS_KM = 6371;

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(Math.max(0, h))));
}

export function businessDistrict(biz: {
  district?: string | null;
  address?: string | null;
}): string | null {
  return normalizeDistrict(biz.district) ?? parseLocation(biz.address).district;
}

export function matchesDistrict(
  biz: { district?: string | null; address?: string | null },
  district: string | null,
): boolean {
  if (!district) return true;
  return businessDistrict(biz) === normalizeDistrict(district);
}

export function distanceKm(biz: GeoPoint, center: Center): number | null {
  if (biz.latitude == null || biz.longitude == null) return null;
  return haversineKm(biz.latitude, biz.longitude, center.lat, center.lng);
}

// The centre is either an explicit coordinate pair (e.g. an owner-picked
// business) or the average of stored coordinates among the area's leads. It is
// never fabricated: no real coordinates means no centre and no radius filtering.
export function centerFor(
  businesses: GeoPoint[],
  settings: Pick<RadarSettings, "district" | "centerLat" | "centerLng">,
  districtOf: (b: GeoPoint) => string | null = () => null,
): Center | null {
  if (settings.centerLat != null && settings.centerLng != null) {
    return { lat: settings.centerLat, lng: settings.centerLng };
  }
  const pts = businesses.filter(
    (b) =>
      b.latitude != null &&
      b.longitude != null &&
      (!settings.district || districtOf(b) === normalizeDistrict(settings.district)),
  ) as { latitude: number; longitude: number }[];
  if (pts.length === 0) return null;
  const lat = pts.reduce((s, b) => s + b.latitude, 0) / pts.length;
  const lng = pts.reduce((s, b) => s + b.longitude, 0) / pts.length;
  return { lat, lng };
}

// ---------------------------------------------------------------------------
// Gap detection — strictly from observed evidence we already stored.
// ---------------------------------------------------------------------------

export type GapSeverity = "low" | "medium" | "high";

export type GapSignal = {
  key: string;
  label: string;
  evidence: string;
  severity: GapSeverity;
  confidence: number;
  status: VerificationStatus;
  observedAt: string;
  source: string;
  matchable: boolean; // participates in offer/service matching
};

export type RadarBusiness = {
  id: string;
  place_id?: string | null;
  name?: string | null;
  category?: string | null;
  website?: string | null;
  industry?: string | null;
  employees_min?: number | null;
  employees_max?: number | null;
  province?: string | null;
  district?: string | null;
  address?: string | null;
  latitude: number | null;
  longitude: number | null;
  phone?: string | null;
  emails?: string[] | null;
  socials?: unknown;
  website_check?: WebsiteCheck;
  website_checked_at?: string | null;
  intel_updated_at?: string | null;
  business_status?: string | null;
  reviews_last_90d?: number | null;
  last_activity_at?: string | null;
  created_at?: string | null;
};

function socialCount(socials: unknown): number {
  if (!socials || typeof socials !== "object") return 0;
  return Object.keys(socials as Record<string, unknown>).length;
}

export function observableGaps(
  biz: RadarBusiness,
  findings: IntelFindings | null | undefined,
  observedAt: string,
  now: Date = new Date(),
): GapSignal[] {
  const gaps: GapSignal[] = [];
  const push = (g: GapSignal) => {
    const existing = gaps.find((x) => x.key === g.key);
    if (!existing) gaps.push(g);
    else if (g.confidence > existing.confidence) Object.assign(existing, g);
  };

  const doubleChecked = biz.website_check?.confidence === "none_found";
  if (!biz.website) {
    push({
      key: PROBLEM_KEYS.noWebsite,
      label: "No website found",
      evidence: doubleChecked
        ? "No website found for this business (double-checked)."
        : "The Google listing shows no website — not yet double-checked.",
      severity: "high",
      confidence: doubleChecked ? 0.8 : 0.6,
      status: doubleChecked ? "single_source" : "unverified",
      observedAt,
      source: "google",
      matchable: true,
    });
  }

  if (findings) {
    const problems = deriveObservedProblems({
      business: {
        name: biz.name ?? null,
        category: biz.category ?? null,
        website: biz.website ?? null,
        industry: biz.industry ?? null,
        employees_min: biz.employees_min ?? null,
        employees_max: biz.employees_max ?? null,
      },
      findings,
      websiteCheck: biz.website_check,
      observedAt,
    });
    for (const p of problems) {
      push({
        key: p.key,
        label: p.label,
        evidence: p.evidence,
        severity: p.severity,
        confidence: p.confidence,
        status: p.status,
        observedAt: p.observed_at,
        source: p.source,
        matchable: true,
      });
    }
  }

  const hasEmail = (biz.emails ?? []).length > 0;
  if (!biz.phone && !hasEmail) {
    push({
      key: "no_contact_details",
      label: "No public contact details",
      evidence: "No phone number or email was found in the listing or on the site.",
      severity: "medium",
      confidence: 0.6,
      status: "unverified",
      observedAt,
      source: "google",
      matchable: false,
    });
  }

  if (!biz.website && socialCount(biz.socials) === 0) {
    push({
      key: "no_digital_profile",
      label: "No website or social profile",
      evidence: "Neither a website nor any social profile was found.",
      severity: "medium",
      confidence: 0.55,
      status: "unverified",
      observedAt,
      source: "google",
      matchable: false,
    });
  }

  if (biz.business_status === "CLOSED_PERMANENTLY") {
    push({
      key: "closed_permanently",
      label: "Appears permanently closed",
      evidence: "Google reports this business as permanently closed.",
      severity: "high",
      confidence: 0.9,
      status: "single_source",
      observedAt,
      source: "google",
      matchable: false,
    });
  } else if (
    biz.reviews_last_90d === 0 &&
    biz.last_activity_at &&
    daysSince(biz.last_activity_at, now) > 180
  ) {
    push({
      key: "dormant",
      label: "Possibly dormant",
      evidence: `No Google reviews in the last 90 days; last recorded activity ${biz.last_activity_at.slice(0, 10)}.`,
      severity: "low",
      confidence: 0.5,
      status: "unverified",
      observedAt,
      source: "google",
      matchable: false,
    });
  }

  return gaps;
}

// ---------------------------------------------------------------------------
// Opportunity assembly + scoring.
// ---------------------------------------------------------------------------

export type RadarOffer = { name: string; default_price: number | null };

export type OpportunityInput = {
  business: RadarBusiness;
  findings: IntelFindings | null | undefined;
  investigationAt: string | null;
  settings: RadarSettings;
  offers: RadarOffer[];
  center: Center | null;
  inPipeline?: boolean;
  now?: Date;
};

export type RadarOpportunity = {
  id: string;
  name: string;
  district: string | null;
  province: Province | null;
  industry: IndustryKey | null;
  industryLabel: string;
  website: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceKm: number | null;
  gaps: GapSignal[];
  matches: MatchExplanation[];
  priority: number;
  confidence: number;
  needsVerification: boolean;
  reasons: string[];
  observedAt: string;
  lastCheckedAt: string | null;
  inPipeline: boolean;
};

const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

export function primaryGap(gaps: GapSignal[]): GapSignal | null {
  if (gaps.length === 0) return null;
  return (
    [...gaps].sort(
      (a, b) =>
        SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.confidence - a.confidence,
    )[0] ?? null
  );
}

function observedAtFor(biz: RadarBusiness, investigationAt: string | null): string {
  return (
    investigationAt ??
    biz.website_checked_at ??
    biz.intel_updated_at ??
    biz.created_at ??
    new Date().toISOString()
  );
}

function signalStrength(biz: RadarBusiness, now: Date): number {
  if (!biz.last_activity_at) return 0.5;
  const d = daysSince(biz.last_activity_at, now);
  if (d <= 30) return 0.85;
  if (d <= 90) return 0.7;
  if (d <= 180) return 0.45;
  return 0.2;
}

function inCategory(biz: RadarBusiness, key: RadarCategoryKey): boolean {
  const industries = categoryIndustries(key);
  if (!industries) return true;
  const ind = businessIndustry(biz) ?? classifyIndustry(`${biz.category ?? ""} ${biz.name ?? ""}`);
  return ind != null && industries.includes(ind);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function opportunityFor(input: OpportunityInput): RadarOpportunity | null {
  const now = input.now ?? new Date();
  const biz = input.business;
  const s = input.settings;

  if (!matchesDistrict(biz, s.district)) return null;
  if (!inCategory(biz, s.category)) return null;

  const distance = input.center ? distanceKm(biz, input.center) : null;
  if (input.center && s.radiusKm > 0) {
    if (distance == null || distance > s.radiusKm) return null;
  }

  const observedAt = observedAtFor(biz, input.investigationAt);
  const gaps = observableGaps(biz, input.findings, observedAt, now);
  if (gaps.length === 0) return null;

  const problems: ObservedProblem[] = gaps
    .filter((g) => g.matchable)
    .map((g) => ({
      key: g.key,
      label: g.label,
      evidence: g.evidence,
      source: g.source,
      observed_at: g.observedAt,
      confidence: g.confidence,
      severity: g.severity,
      status: g.status,
    }));

  const serviceKeys = serviceProblems(s.service);
  const filteredProblems = serviceKeys.length
    ? problems.filter((p) => serviceKeys.includes(p.key))
    : problems;

  const offerNames = input.offers.map((o) => o.name);
  const catalog = buildServiceCatalog(offerNames);
  const industry = businessIndustry(biz);
  const size: CompanySize = companySize(biz);
  const matches = matchServices(filteredProblems, catalog, offerNames, { industry, size, now });

  const bestMatch = matches[0];
  const bestPrice = bestMatch
    ? (input.offers.find((o) => o.name === bestMatch.offer)?.default_price ?? null)
    : null;
  const effort = bestMatch?.effort;
  const deliveryFeas = effort === "low" ? 0.9 : effort === "high" ? 0.35 : 0.6;
  const timeHours = effort === "low" ? 2 : effort === "high" ? 6 : 4;

  const avgConf = gaps.reduce((sum, g) => sum + g.confidence, 0) / gaps.length;
  const hasFindings = !!input.findings;
  let confidence = avgConf * (hasFindings ? 1 : 0.85);
  if (!hasFindings) confidence = Math.min(confidence, 0.55);

  const hasEmail = (biz.emails ?? []).length > 0;
  const fit = bestMatch ? 0.9 : filteredProblems.length ? 0.6 : 0.4;
  const contactability = clamp01(
    (biz.phone ? 0.35 : 0) + (hasEmail ? 0.4 : 0) + (biz.website ? 0.1 : 0),
  );
  const accessibility =
    input.center && distance != null ? clamp01(1 - distance / Math.max(1, s.radiusKm)) : 0.6;

  const ranked = rankOpportunity({
    id: biz.id,
    evidence_count: gaps.length,
    evidence_freshness_days: Number.isFinite(daysSince(observedAt, now))
      ? daysSince(observedAt, now)
      : null,
    fit,
    cost_to_validate: 0,
    time_to_validate_hours: timeHours,
    delivery_feas: deliveryFeas,
    net_profit_est: bestPrice,
    confidence: clamp01(confidence),
    signal_strength: signalStrength(biz, now),
    affordability: 0.5,
    contactability,
    recurring: bestMatch?.recurring ? 1 : 0,
    competition: 0.5,
    accessibility,
    risk: biz.business_status === "CLOSED_TEMPORARILY" ? 0.7 : 0.3,
  });

  const district = businessDistrict(biz);
  return {
    id: biz.id,
    name: biz.name ?? "Unnamed",
    district,
    province: district ? provinceOfDistrict(district) : null,
    industry,
    industryLabel: industry ? industryLabel(industry) : (biz.category ?? "Unclassified"),
    website: biz.website ?? null,
    phone: biz.phone ?? null,
    latitude: biz.latitude,
    longitude: biz.longitude,
    distanceKm: distance,
    gaps,
    matches,
    priority: ranked.priority,
    confidence: ranked.confidence,
    needsVerification: ranked.needsVerification,
    reasons: ranked.reasons,
    observedAt,
    lastCheckedAt: biz.website_checked_at ?? biz.intel_updated_at ?? null,
    inPipeline: !!input.inPipeline,
  };
}

// ---------------------------------------------------------------------------
// Neighbourhood Opportunity Density — one repeatable offer per cluster.
// ---------------------------------------------------------------------------

export type DensityCluster = {
  key: string;
  district: string | null;
  industry: IndustryKey | null;
  industryLabel: string;
  gapKey: string;
  gapLabel: string;
  count: number;
  businessIds: string[];
  avgPriority: number;
};

export function buildDensityClusters(
  opportunities: RadarOpportunity[],
  minCount = 2,
): DensityCluster[] {
  const map = new Map<string, DensityCluster & { prioritySum: number }>();
  for (const o of opportunities) {
    const primary = primaryGap(o.gaps);
    const key = `${o.district ?? "Unknown"}|${o.industry ?? "unknown"}|${primary?.key ?? "none"}`;
    let c = map.get(key);
    if (!c) {
      c = {
        key,
        district: o.district,
        industry: o.industry,
        industryLabel: o.industryLabel,
        gapKey: primary?.key ?? "none",
        gapLabel: primary?.label ?? "No single dominant issue",
        count: 0,
        businessIds: [],
        avgPriority: 0,
        prioritySum: 0,
      };
      map.set(key, c);
    }
    c.count += 1;
    c.businessIds.push(o.id);
    c.prioritySum += o.priority;
  }
  return [...map.values()]
    .map((c) => ({ ...c, avgPriority: c.count ? c.prioritySum / c.count : 0 }))
    .filter((c) => c.count >= minCount)
    .sort((a, b) => b.count - a.count || b.avgPriority - a.avgPriority);
}

// ---------------------------------------------------------------------------
// Freshness + monitoring honesty.
// ---------------------------------------------------------------------------

export type RadarFreshness = { ageDays: number; state: "fresh" | "aging" | "stale"; label: string };

export function radarFreshness(observedAt: string, now: Date = new Date()): RadarFreshness {
  const age = daysSince(observedAt, now);
  if (!Number.isFinite(age)) return { ageDays: Infinity, state: "stale", label: "Never checked" };
  const state = age <= 7 ? "fresh" : age <= 30 ? "aging" : "stale";
  const label =
    age === 0
      ? "Checked today"
      : state === "stale"
        ? `Stale — checked ${age}d ago`
        : `Checked ${age}d ago`;
  return { ageDays: age, state, label };
}

export type MonitoringPolicy = {
  label: string;
  cadenceHours: number | null;
  claimsRealtime: boolean;
  note: string;
};

export function monitoringPolicy(m: RadarMonitoringKey): MonitoringPolicy {
  switch (m) {
    case "frequent":
      return {
        label: "Frequent checks when sources permit",
        cadenceHours: 6,
        claimsRealtime: false,
        note: "Google Maps is the only live source today. True event-based updates need a source that offers change notifications, and none is connected yet.",
      };
    case "daily":
      return {
        label: "Daily scan",
        cadenceHours: 24,
        claimsRealtime: false,
        note: "A daily check is periodic, not real-time. Once the daily background job is scheduled, this saved target is scanned automatically and results land in Updates — or run it now with “Run daily scan now”.",
      };
    default:
      return {
        label: "Only when I start a scan",
        cadenceHours: null,
        claimsRealtime: false,
        note: "Nothing runs automatically. Every result shows when it was last checked.",
      };
  }
}

export function splitNewAndKnown(opportunities: RadarOpportunity[]): {
  fresh: RadarOpportunity[];
  known: RadarOpportunity[];
} {
  const fresh: RadarOpportunity[] = [];
  const known: RadarOpportunity[] = [];
  for (const o of opportunities) (o.inPipeline ? known : fresh).push(o);
  return { fresh, known };
}
