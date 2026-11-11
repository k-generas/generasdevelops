import { describe, expect, it } from "vitest";
import {
  PROVIDER_CATALOG,
  providerStatuses,
  providerSummary,
  resolveProviderStatus,
  type RuntimeProviderConfig,
} from "./provider-registry";

const google: RuntimeProviderConfig = {
  ai: { openai: true, gemini: true, lovable: false },
  maps: true,
  mapsMode: "connector",
  mapsBrowser: true,
  geoapify: false,
  placesProvider: "google",
};

const geoapify: RuntimeProviderConfig = {
  ai: { openai: false, gemini: false, lovable: false },
  maps: false,
  mapsMode: null,
  mapsBrowser: false,
  geoapify: true,
  placesProvider: "geoapify",
};

describe("provider registry", () => {
  it("reports Google as available only when it is the places provider", () => {
    const status = resolveProviderStatus(
      PROVIDER_CATALOG.find((p) => p.id === "google_places")!,
      google,
    );
    expect(status.status).toBe("available");
    expect(status.configured).toBe(true);
  });

  it("reports Geoapify as the fallback places provider", () => {
    const statuses = providerStatuses(geoapify);
    expect(statuses.find((s) => s.provider.id === "geoapify")?.status).toBe("available");
    expect(statuses.find((s) => s.provider.id === "google_places")?.status).toBe("unavailable");
  });

  it("marks AI credentials as configured but not billing-verified", () => {
    const statuses = providerStatuses(google);
    expect(statuses.find((s) => s.provider.id === "openai")?.status).toBe(
      "configured_unverified",
    );
    expect(statuses.find((s) => s.provider.id === "gemini")?.status).toBe("configured_unverified");
  });

  it("blocks LinkedIn automation and keeps Meta unavailable without credentials", () => {
    const statuses = providerStatuses(google);
    expect(statuses.find((s) => s.provider.id === "linkedin")?.status).toBe("blocked");
    expect(statuses.find((s) => s.provider.id === "meta_graph")?.status).toBe("unavailable");
  });

  it("summarises status counts", () => {
    const summary = providerSummary(providerStatuses(google));
    expect(summary.total).toBe(PROVIDER_CATALOG.length);
    expect(summary.available).toBeGreaterThanOrEqual(2);
    expect(summary.blocked).toBe(1);
    expect(summary.reviewRequired).toBeGreaterThan(0);
  });
});
