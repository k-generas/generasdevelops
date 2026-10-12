// Registry of permitted sources for Rwanda business intelligence.
//
// Honesty rules this file enforces:
//   - A source is only `available` when it is already wired (the Maps connector).
//   - Anything needing a login, payment, or unconfirmed terms is marked
//     `requires_authorization` or `blocked`, with a reason, and is not enabled.
//   - We never present an unverified source as a working integration.
//
// The engine must prefer official open datasets / authorized APIs over scraping.
export type SourceAccess = "available" | "requires_authorization" | "blocked" | "unverified";

export type RegistrySource = {
  id: string;
  name: string;
  kind: "map" | "official_dataset" | "directory" | "tenders" | "jobs" | "rss" | "custom";
  url: string | null;
  access: SourceAccess;
  enabled: boolean;
  // Plain-language reason a source is not active yet.
  reason: string | null;
  legal_basis: string;
  cost: "free" | "paid" | "unknown";
  scan_interval_hours: number;
  coverage: string;
};

export const SOURCE_REGISTRY: RegistrySource[] = [
  {
    id: "google-maps",
    name: "Google Maps (Places API)",
    kind: "map",
    url: "https://developers.google.com/maps/documentation/places",
    access: "available",
    enabled: true,
    reason: null,
    legal_basis: "Permitted Google Places API use via the connected Maps connector.",
    cost: "paid",
    scan_interval_hours: 168,
    coverage: "Businesses with a Google Maps presence across Rwanda. Bounded to 20 results/run.",
  },
  {
    id: "rdb-registry",
    name: "RDB — company / investor registry",
    kind: "official_dataset",
    url: "https://www.rdb.rw/",
    access: "requires_authorization",
    enabled: false,
    reason:
      "Company registration lookups are not a free public API; access terms must be confirmed before enabling.",
    legal_basis: "Public registry, but reuse terms require confirmation.",
    cost: "unknown",
    scan_interval_hours: 720,
    coverage: "Registered companies. Registration identifiers only where lawfully available.",
  },
  {
    id: "nisr-stats",
    name: "NISR — national statistics establishment data",
    kind: "official_dataset",
    url: "https://www.statistics.gov.rw/",
    access: "unverified",
    enabled: false,
    reason:
      "Establishment statistics are aggregated; a per-company dataset and its reuse licence are unconfirmed.",
    legal_basis: "Official statistics; licence to be confirmed.",
    cost: "free",
    scan_interval_hours: 8760,
    coverage: "Sector and district-level statistics (aggregate, not per-company).",
  },
  {
    id: "rura-operators",
    name: "RURA — licensed operators",
    kind: "official_dataset",
    url: "https://www.rura.rw/",
    access: "unverified",
    enabled: false,
    reason: "Published lists are PDFs; automated reuse has not been confirmed.",
    legal_basis: "Public regulator publications.",
    cost: "free",
    scan_interval_hours: 8760,
    coverage: "Licensed telecom / energy / utility operators.",
  },
  {
    id: "umucyo-tenders",
    name: "UMUCYO — public e-procurement notices",
    kind: "tenders",
    url: "https://umucyo.gov.rw/",
    access: "unverified",
    enabled: false,
    reason: "Public tender notices exist, but automated collection terms are unconfirmed.",
    legal_basis: "Public procurement transparency portal.",
    cost: "free",
    scan_interval_hours: 168,
    coverage: "Public tenders and supplier requests (buying signal).",
  },
  {
    id: "rw-job-boards",
    name: "Rwanda job boards / company career pages",
    kind: "jobs",
    url: null,
    access: "unverified",
    enabled: false,
    reason: "Per-site terms and rate limits must be checked per source before enabling.",
    legal_basis: "Public job listings; per-site terms apply.",
    cost: "free",
    scan_interval_hours: 168,
    coverage: "Public vacancies and hiring changes (hiring signal).",
  },
  {
    id: "scraping-bypass",
    name: "Login / CAPTCHA / paywall bypassing",
    kind: "custom",
    url: null,
    access: "blocked",
    enabled: false,
    reason: "Explicitly prohibited: never bypass access controls, CAPTCHAs, logins or paywalls.",
    legal_basis: "Prohibited.",
    cost: "unknown",
    scan_interval_hours: 0,
    coverage: "None.",
  },
];

export function getSource(id: string): RegistrySource | null {
  return SOURCE_REGISTRY.find((s) => s.id === id) ?? null;
}

export function enabledSources(): RegistrySource[] {
  return SOURCE_REGISTRY.filter((s) => s.enabled && s.access === "available");
}

export function blockedSources(): RegistrySource[] {
  return SOURCE_REGISTRY.filter((s) => s.access === "blocked");
}

// Sources that are not blocked but not yet active, so the UI can show what is
// pending and why instead of implying coverage we do not have.
export function pendingSources(): RegistrySource[] {
  return SOURCE_REGISTRY.filter((s) => !s.enabled && s.access !== "blocked");
}

export type CoverageReport = {
  active: string[];
  pending: { name: string; reason: string | null }[];
  blocked: { name: string; reason: string | null }[];
  note: string;
};

export function coverageReport(): CoverageReport {
  return {
    active: enabledSources().map((s) => s.name),
    pending: pendingSources().map((s) => ({ name: s.name, reason: s.reason })),
    blocked: blockedSources().map((s) => ({ name: s.name, reason: s.reason })),
    note: "Coverage is partial by design. This is not every business in Rwanda.",
  };
}
