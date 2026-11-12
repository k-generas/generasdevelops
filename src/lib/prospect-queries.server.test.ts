import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import type { ProspectFilters } from "./prospect-lists";
import { businessTargetQuery, professionalTargetQuery } from "./prospect-queries.server";

type QueryCall = { method: string; args: unknown[] };

function fakeClient() {
  const calls: QueryCall[] = [];
  const query: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ["select", "eq", "or", "ilike"]) {
    query[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return query;
    };
  }
  const client = {
    from: (table: string) => {
      calls.push({ method: "from", args: [table] });
      return query;
    },
  };
  return {
    client: client as unknown as SupabaseClient<Database>,
    calls,
    callsFor: (method: string) => calls.filter((call) => call.method === method),
  };
}

function filters(overrides: Partial<ProspectFilters> = {}): ProspectFilters {
  return {
    query: "",
    location: "",
    district: "",
    sector: "",
    stage: "",
    country: "",
    professionalType: "",
    availability: "",
    ...overrides,
  };
}

describe("prospect target queries", () => {
  it("scopes business targets to the owner and applies keyword and location filters", () => {
    const { client, calls, callsFor } = fakeClient();

    businessTargetQuery(
      client,
      "owner-1",
      filters({
        query: "dental",
        location: "Kigali,Rwanda",
        district: "Gasabo",
        sector: "healthcare",
        stage: "messaged",
      }),
    );

    expect(calls[0]).toEqual({ method: "from", args: ["businesses"] });
    expect(calls[1]?.method).toBe("select");
    expect(calls[2]).toEqual({ method: "eq", args: ["owner_id", "owner-1"] });
    expect(callsFor("or").map((call) => call.args[0])).toEqual([
      "name.ilike.%dental%,sector.ilike.%dental%,industry.ilike.%dental%,district.ilike.%dental%",
      "district.ilike.%Kigali Rwanda%,province.ilike.%Kigali Rwanda%,address.ilike.%Kigali Rwanda%",
    ]);
    expect(callsFor("ilike")).toEqual([{ method: "ilike", args: ["district", "%Gasabo%"] }]);
    expect(callsFor("eq").slice(1)).toEqual([
      { method: "eq", args: ["sector", "healthcare"] },
      { method: "eq", args: ["outreach_stage", "messaged"] },
    ]);
  });

  it("scopes professional targets to the owner and applies place and taxonomy filters", () => {
    const { client, calls, callsFor } = fakeClient();

    professionalTargetQuery(
      client,
      "owner-2",
      filters({
        query: "web",
        location: "Kenya",
        country: "Kenya",
        professionalType: "consultant",
        availability: "open",
      }),
    );

    expect(calls[0]).toEqual({ method: "from", args: ["professionals"] });
    expect(calls[2]).toEqual({ method: "eq", args: ["owner_id", "owner-2"] });
    expect(callsFor("or").map((call) => call.args[0])).toEqual([
      "full_name.ilike.%web%,headline.ilike.%web%,country.ilike.%web%,city.ilike.%web%",
      "country.ilike.%Kenya%,region.ilike.%Kenya%,city.ilike.%Kenya%",
    ]);
    expect(callsFor("ilike")).toEqual([{ method: "ilike", args: ["country", "%Kenya%"] }]);
    expect(callsFor("eq").slice(1)).toEqual([
      { method: "eq", args: ["professional_type", "consultant"] },
      { method: "eq", args: ["availability_status", "open"] },
    ]);
  });

  it("keeps owner scoping when no filters are set", () => {
    const business = fakeClient();
    const professional = fakeClient();

    businessTargetQuery(business.client, "owner-3", filters());
    professionalTargetQuery(professional.client, "owner-3", filters());

    expect(business.calls).toEqual([
      { method: "from", args: ["businesses"] },
      { method: "select", args: [expect.any(String)] },
      { method: "eq", args: ["owner_id", "owner-3"] },
    ]);
    expect(professional.calls).toEqual([
      { method: "from", args: ["professionals"] },
      { method: "select", args: [expect.any(String)] },
      { method: "eq", args: ["owner_id", "owner-3"] },
    ]);
  });

  it("strips PostgREST syntax characters from free-text filters", () => {
    const { client, callsFor } = fakeClient();

    businessTargetQuery(
      client,
      "owner-4",
      filters({ query: "dental,(clinics)", location: "Kigali,(Rwanda)" }),
    );

    expect(callsFor("or").map((call) => call.args[0])).toEqual([
      "name.ilike.%dental clinics%,sector.ilike.%dental clinics%,industry.ilike.%dental clinics%,district.ilike.%dental clinics%",
      "district.ilike.%Kigali Rwanda%,province.ilike.%Kigali Rwanda%,address.ilike.%Kigali Rwanda%",
    ]);
  });
});
