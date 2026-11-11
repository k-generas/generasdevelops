// Provider capability registry. Static definitions are intentionally separate
// from runtime credentials: a provider is never shown as working unless the
// current server environment proves it is configured.

export type ProviderCategory =
  "places" | "website" | "ai" | "professional" | "registry" | "social" | "verification" | "news";

export type ProviderCostModel = "free" | "paid" | "free_with_limits" | "unknown";

export type ProviderDefinition = {
  id: string;
  name: string;
  category: ProviderCategory;
  capabilities: string[];
  coverage: string;
  costModel: ProviderCostModel;
  requiresCredentials: boolean;
  automatedCollection: boolean;
  complianceNotes: string;
  documentation: string | null;
  credentialKeys: string[];
};

export const PROVIDER_CATALOG: ProviderDefinition[] = [
  {
    id: "google_places",
    name: "Google Places API",
    category: "places",
    capabilities: ["business discovery", "location", "phone", "website", "reviews", "status"],
    coverage: "Global, limited by Google's coverage and API quota.",
    costModel: "paid",
    requiresCredentials: true,
    automatedCollection: true,
    complianceNotes: "Use the official Places API within Google's terms and billing limits.",
    documentation: "https://developers.google.com/maps/documentation/places",
    credentialKeys: ["LOVABLE_API_KEY", "GOOGLE_MAPS_API_KEY"],
  },
  {
    id: "geoapify",
    name: "Geoapify / OpenStreetMap",
    category: "places",
    capabilities: ["business discovery", "geocoding", "website", "phone"],
    coverage: "Global OpenStreetMap-derived data with variable local coverage.",
    costModel: "free_with_limits",
    requiresCredentials: true,
    automatedCollection: true,
    complianceNotes: "Respect Geoapify quotas and OpenStreetMap attribution requirements.",
    documentation: "https://www.geoapify.com/",
    credentialKeys: ["GEOAPIFY_API_KEY"],
  },
  {
    id: "nominatim",
    name: "OpenStreetMap Nominatim",
    category: "places",
    capabilities: ["geocoding", "place lookup"],
    coverage: "Global, but the public endpoint has a strict usage policy.",
    costModel: "free_with_limits",
    requiresCredentials: false,
    automatedCollection: true,
    complianceNotes:
      "Not wired. The public service requires a valid user agent, low request rates and no bulk geocoding.",
    documentation: "https://operations.osmfoundation.org/policies/nominatim/",
    credentialKeys: [],
  },
  {
    id: "website_fetch",
    name: "Direct public website check",
    category: "website",
    capabilities: ["reachability", "HTTPS", "mobile viewport", "contact signals", "copyright year"],
    coverage: "Any public http(s) website, bounded by timeout and response-size limits.",
    costModel: "free",
    requiresCredentials: false,
    automatedCollection: true,
    complianceNotes:
      "Fetch public pages only, respect robots/terms, do not bypass logins or CAPTCHAs, and keep timeouts bounded.",
    documentation: null,
    credentialKeys: [],
  },
  {
    id: "openai",
    name: "OpenAI Responses",
    category: "ai",
    capabilities: ["evidence interpretation", "structured JSON", "message drafting"],
    coverage: "Global API availability subject to account and billing status.",
    costModel: "paid",
    requiresCredentials: true,
    automatedCollection: false,
    complianceNotes:
      "Send only the minimum evidence needed and never send secrets or unnecessary personal data.",
    documentation: "https://platform.openai.com/docs/",
    credentialKeys: ["OPENAI_API_KEY"],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    category: "ai",
    capabilities: ["evidence interpretation", "structured JSON", "message drafting"],
    coverage: "Global API availability subject to account and quota status.",
    costModel: "paid",
    requiresCredentials: true,
    automatedCollection: false,
    complianceNotes: "Send only the minimum evidence needed and keep prompts free of secrets.",
    documentation: "https://ai.google.dev/",
    credentialKeys: ["GEMINI_API_KEY", "GOOGLE_AI_API_KEY"],
  },
  {
    id: "lovable_ai",
    name: "Lovable AI gateway",
    category: "ai",
    capabilities: ["evidence interpretation", "structured JSON", "message drafting"],
    coverage: "Available through the Lovable integration when credits remain.",
    costModel: "paid",
    requiresCredentials: true,
    automatedCollection: false,
    complianceNotes:
      "Credits and quota can be exhausted; the app must fall back or report the failure.",
    documentation: null,
    credentialKeys: ["LOVABLE_API_KEY"],
  },
  {
    id: "company_registries",
    name: "Official company registries",
    category: "registry",
    capabilities: ["legal identity", "registration status", "officers", "address"],
    coverage:
      "Country-specific. No registry is enabled until its API and reuse terms are confirmed.",
    costModel: "unknown",
    requiresCredentials: true,
    automatedCollection: true,
    complianceNotes:
      "Public registry data may still have reuse limits. Confirm terms per country before enabling.",
    documentation: null,
    credentialKeys: [],
  },
  {
    id: "professional_public_web",
    name: "Public professional pages (manual review)",
    category: "professional",
    capabilities: ["public role", "public profile evidence", "business relationship"],
    coverage: "Public pages the owner can lawfully view and record manually.",
    costModel: "free",
    requiresCredentials: false,
    automatedCollection: false,
    complianceNotes:
      "Do not scrape login-walled or terms-restricted platforms. Store the public source URL and keep confidence conservative.",
    documentation: null,
    credentialKeys: [],
  },
  {
    id: "meta_graph",
    name: "Meta Graph API",
    category: "social",
    capabilities: ["public business pages", "page metadata"],
    coverage: "Only pages and permissions approved by Meta.",
    costModel: "free_with_limits",
    requiresCredentials: true,
    automatedCollection: true,
    complianceNotes:
      "Requires app review, page permissions and an approved use case. Not enabled without credentials.",
    documentation: "https://developers.facebook.com/docs/graph-api/",
    credentialKeys: ["META_ACCESS_TOKEN"],
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    category: "professional",
    capabilities: ["manual professional research"],
    coverage: "Manual use only. Automated scraping is prohibited.",
    costModel: "unknown",
    requiresCredentials: false,
    automatedCollection: false,
    complianceNotes:
      "Blocked for automation. Do not scrape profiles, bypass login, or automate connection requests/messages.",
    documentation: null,
    credentialKeys: [],
  },
  {
    id: "email_verification",
    name: "Email verification provider",
    category: "verification",
    capabilities: ["email syntax", "domain/MX", "deliverability"],
    coverage: "Not configured. Local syntax checks are available without a provider.",
    costModel: "unknown",
    requiresCredentials: true,
    automatedCollection: false,
    complianceNotes:
      "Verification providers must be reviewed for lawful basis, retention and cost.",
    documentation: null,
    credentialKeys: [],
  },
  {
    id: "news_rss",
    name: "Public news / announcement feeds",
    category: "news",
    capabilities: ["funding announcements", "launches", "hiring news"],
    coverage: "Source-specific. No feed is enabled until its terms and rate limits are confirmed.",
    costModel: "free_with_limits",
    requiresCredentials: false,
    automatedCollection: true,
    complianceNotes:
      "Prefer official feeds and APIs. Do not scrape paywalled or restricted content.",
    documentation: null,
    credentialKeys: [],
  },
];

export type RuntimeProviderConfig = {
  ai: { openai: boolean; gemini: boolean; lovable: boolean };
  maps: boolean;
  mapsMode: "connector" | "direct" | null;
  mapsBrowser: boolean;
  geoapify: boolean;
  placesProvider: "google" | "geoapify" | null;
};

export type ProviderRuntimeStatus =
  "available" | "configured_unverified" | "unavailable" | "blocked" | "review_required";

export type ProviderStatus = {
  provider: ProviderDefinition;
  status: ProviderRuntimeStatus;
  reason: string;
  configured: boolean;
};

export function providerConfigured(
  provider: ProviderDefinition,
  config: RuntimeProviderConfig,
): boolean {
  if (provider.id === "google_places") return config.placesProvider === "google";
  if (provider.id === "geoapify") return config.placesProvider === "geoapify" || config.geoapify;
  if (provider.id === "openai") return config.ai.openai;
  if (provider.id === "gemini") return config.ai.gemini;
  if (provider.id === "lovable_ai") return config.ai.lovable;
  if (provider.id === "website_fetch") return true;
  if (provider.id === "professional_public_web") return true;
  return false;
}

export function resolveProviderStatus(
  provider: ProviderDefinition,
  config: RuntimeProviderConfig,
): ProviderStatus {
  if (provider.id === "linkedin") {
    return {
      provider,
      status: "blocked",
      configured: false,
      reason: "Automated collection is prohibited. Use the platform manually.",
    };
  }
  if (provider.id === "nominatim") {
    return {
      provider,
      status: "review_required",
      configured: false,
      reason: "Not wired. Public Nominatim has strict rate and user-agent requirements.",
    };
  }
  if (provider.id === "company_registries") {
    return {
      provider,
      status: "review_required",
      configured: false,
      reason: "No registry API and reuse terms are enabled for this workspace.",
    };
  }
  if (provider.id === "meta_graph") {
    return {
      provider,
      status: "unavailable",
      configured: false,
      reason: "Meta app review, page permissions and credentials are not configured.",
    };
  }
  if (provider.id === "email_verification") {
    return {
      provider,
      status: "unavailable",
      configured: false,
      reason: "No email verification provider is configured. Local syntax checks still run.",
    };
  }
  if (provider.id === "news_rss") {
    return {
      provider,
      status: "review_required",
      configured: false,
      reason: "No feed has been reviewed and enabled.",
    };
  }

  const configured = providerConfigured(provider, config);
  if (!configured) {
    return {
      provider,
      status: "unavailable",
      configured: false,
      reason: provider.requiresCredentials
        ? `Missing credentials: ${provider.credentialKeys.join(", ")}.`
        : "Not configured in this runtime.",
    };
  }
  if (provider.category === "ai") {
    return {
      provider,
      status: "configured_unverified",
      configured: true,
      reason: "Credentials are configured. Account quota/billing is not verified by this page.",
    };
  }
  return {
    provider,
    status: "available",
    configured: true,
    reason: "Configured and enabled for bounded server-side use.",
  };
}

export function providerStatuses(config: RuntimeProviderConfig): ProviderStatus[] {
  return PROVIDER_CATALOG.map((provider) => resolveProviderStatus(provider, config));
}

export type ProviderSummary = {
  total: number;
  available: number;
  configuredUnverified: number;
  unavailable: number;
  blocked: number;
  reviewRequired: number;
};

export function providerSummary(statuses: ProviderStatus[]): ProviderSummary {
  const summary: ProviderSummary = {
    total: statuses.length,
    available: 0,
    configuredUnverified: 0,
    unavailable: 0,
    blocked: 0,
    reviewRequired: 0,
  };
  for (const s of statuses) {
    if (s.status === "available") summary.available++;
    else if (s.status === "configured_unverified") summary.configuredUnverified++;
    else if (s.status === "blocked") summary.blocked++;
    else if (s.status === "review_required") summary.reviewRequired++;
    else summary.unavailable++;
  }
  return summary;
}

export function providerCategoryLabel(category: ProviderCategory): string {
  const labels: Record<ProviderCategory, string> = {
    places: "Places & geography",
    website: "Website intelligence",
    ai: "AI",
    professional: "Professional people",
    registry: "Registries",
    social: "Social platforms",
    verification: "Verification",
    news: "News & signals",
  };
  return labels[category];
}
