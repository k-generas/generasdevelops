import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SocialProfilesPanel } from "@/components/SocialProfilesPanel";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/socialpresence")({
  head: () => ({
    meta: [
      { title: "Social Presence - GARE" },
      {
        name: "description",
        content: "Add, verify and monitor public social profiles for discovered businesses.",
      },
    ],
  }),
  component: SocialPresencePage,
});

function SocialPresencePage() {
  const [query, setQuery] = useState("");
  const [businessId, setBusinessId] = useState<string | null>(null);

  const businesses = useQuery({
    queryKey: ["social-presence-businesses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("businesses")
        .select("id, name, address")
        .order("name")
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    const rows = businesses.data ?? [];
    const filtered = term
      ? rows.filter(
          (business) =>
            business.name.toLowerCase().includes(term) ||
            (business.address ?? "").toLowerCase().includes(term),
        )
      : rows;
    return filtered.slice(0, 50);
  }, [businesses.data, query]);

  const selected =
    businesses.data?.find((business) => business.id === businessId) ?? matches[0] ?? null;

  return (
    <div className="space-y-4">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Social presence</p>
        <h1 className="mt-1 text-2xl font-semibold">Social profiles</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Choose a business, then add or check its public Instagram, Facebook, TikTok, LinkedIn, X,
          YouTube or WhatsApp profile. Login and security walls are recorded as blocked, not as
          missing profiles.
        </p>
      </header>

      {businesses.isError ? (
        <ErrorBanner
          error={businesses.error}
          context="Businesses"
          onRetry={() => void businesses.refetch()}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <section className="rounded-lg border bg-card p-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search businesses"
              className="pl-8"
              aria-label="Search businesses"
            />
          </label>

          {businesses.isLoading ? (
            <p className="p-3 text-xs text-muted-foreground">Loading businesses...</p>
          ) : matches.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">No matching businesses.</p>
          ) : (
            <ul className="mt-2 max-h-[60vh] space-y-1 overflow-y-auto">
              {matches.map((business) => (
                <li key={business.id}>
                  <button
                    type="button"
                    onClick={() => setBusinessId(business.id)}
                    className={`w-full rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted ${
                      selected?.id === business.id ? "bg-primary/10 font-medium text-primary" : ""
                    }`}
                  >
                    <span className="block truncate">{business.name}</span>
                    {business.address ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {business.address}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="min-w-0">
          {selected ? (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold">{selected.name}</h2>
                  {selected.address ? (
                    <p className="truncate text-xs text-muted-foreground">{selected.address}</p>
                  ) : null}
                </div>
                <Link
                  to="/businesses/$id"
                  params={{ id: selected.id }}
                  className="text-xs font-medium text-primary underline"
                >
                  Open business
                </Link>
              </div>
              <SocialProfilesPanel businessId={selected.id} />
            </>
          ) : (
            <section className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
              Select a business to manage its social profiles.
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
