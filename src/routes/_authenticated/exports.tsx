import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ErrorBanner";
import { downloadCsvFile, downloadXlsx, rowsToSafeCsv, type ExportColumn } from "@/lib/export-safe";

export const Route = createFileRoute("/_authenticated/exports")({
  head: () => ({
    meta: [
      { title: "Exports - GARE" },
      {
        name: "description",
        content: "Formula-safe CSV and XLSX exports for businesses, professionals and suppression.",
      },
    ],
  }),
  component: ExportsPage,
});

const LIMIT = 5000;

type Dataset = {
  id: string;
  title: string;
  description: string;
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
  applied: boolean;
  error?: string;
};

function ExportsPage() {
  const businesses = useQuery({
    queryKey: ["export-businesses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("businesses")
        .select(
          "id,name,category,district,province,address,phone,emails,website,contact_suppressed,suppression_reason,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(LIMIT);
      if (error) throw error;
      return data ?? [];
    },
  });

  const professionals = useQuery({
    queryKey: ["export-professionals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select(
          "id,full_name,headline,professional_type,country,city,languages,expertise,skills,website,public_email,public_phone,profile_url,source_name,source_url,evidence,confidence,verification_status,availability_status,relationship_stage,do_not_contact,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(LIMIT);
      if (error) {
        if (/does not exist|schema cache|could not find/i.test(error.message)) return null;
        throw error;
      }
      return data ?? [];
    },
  });

  const suppression = useQuery({
    queryKey: ["export-suppression"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppression_entries")
        .select("id,scope,value,channel,reason,source,country,expires_at,created_at")
        .order("created_at", { ascending: false })
        .limit(LIMIT);
      if (error) {
        if (/does not exist|schema cache|could not find/i.test(error.message)) return null;
        throw error;
      }
      return data ?? [];
    },
  });

  const datasets: Dataset[] = [
    {
      id: "businesses",
      title: "Businesses",
      description: "Core business records including contact fields and the do-not-contact flag.",
      applied: true,
      rows: (businesses.data ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        category: b.category ?? "",
        district: b.district ?? "",
        province: b.province ?? "",
        address: b.address ?? "",
        phone: b.phone ?? "",
        emails: (b.emails ?? []).join("; "),
        website: b.website ?? "",
        do_not_contact: b.contact_suppressed ? "yes" : "no",
        suppression_reason: b.suppression_reason ?? "",
        created_at: b.created_at ?? "",
      })),
      columns: [
        { key: "id", label: "id" },
        { key: "name", label: "name" },
        { key: "category", label: "category" },
        { key: "district", label: "district" },
        { key: "province", label: "province" },
        { key: "address", label: "address" },
        { key: "phone", label: "phone" },
        { key: "emails", label: "emails" },
        { key: "website", label: "website" },
        { key: "do_not_contact", label: "do_not_contact" },
        { key: "suppression_reason", label: "suppression_reason" },
        { key: "created_at", label: "created_at" },
      ],
    },
    {
      id: "professionals",
      title: "Professionals",
      description: "People and public evidence. Empty until the professional tables are applied.",
      applied: professionals.data !== null && professionals.data !== undefined,
      rows: (professionals.data ?? []).map((p) => ({
        id: p.id,
        full_name: p.full_name,
        headline: p.headline ?? "",
        professional_type: p.professional_type ?? "",
        country: p.country ?? "",
        city: p.city ?? "",
        languages: (p.languages ?? []).join("; "),
        expertise: (p.expertise ?? []).join("; "),
        skills: (p.skills ?? []).join("; "),
        website: p.website ?? "",
        public_email: p.public_email ?? "",
        public_phone: p.public_phone ?? "",
        profile_url: p.profile_url ?? "",
        source_name: p.source_name ?? "",
        source_url: p.source_url ?? "",
        evidence_items: Array.isArray(p.evidence) ? p.evidence.length : 0,
        confidence: p.confidence ?? "",
        verification_status: p.verification_status ?? "",
        availability_status: p.availability_status ?? "",
        relationship_stage: p.relationship_stage ?? "",
        do_not_contact: p.do_not_contact ? "yes" : "no",
        created_at: p.created_at ?? "",
      })),
      columns: [
        { key: "id", label: "id" },
        { key: "full_name", label: "full_name" },
        { key: "headline", label: "headline" },
        { key: "professional_type", label: "professional_type" },
        { key: "country", label: "country" },
        { key: "city", label: "city" },
        { key: "languages", label: "languages" },
        { key: "expertise", label: "expertise" },
        { key: "skills", label: "skills" },
        { key: "website", label: "website" },
        { key: "public_email", label: "public_email" },
        { key: "public_phone", label: "public_phone" },
        { key: "profile_url", label: "profile_url" },
        { key: "source_name", label: "source_name" },
        { key: "source_url", label: "source_url" },
        { key: "evidence_items", label: "evidence_items" },
        { key: "confidence", label: "confidence" },
        { key: "verification_status", label: "verification_status" },
        { key: "availability_status", label: "availability_status" },
        { key: "relationship_stage", label: "relationship_stage" },
        { key: "do_not_contact", label: "do_not_contact" },
        { key: "created_at", label: "created_at" },
      ],
    },
    {
      id: "suppression",
      title: "Suppression ledger",
      description: "People and businesses that asked not to be contacted. Keep this export secure.",
      applied: suppression.data !== null && suppression.data !== undefined,
      rows: (suppression.data ?? []).map((s) => ({
        id: s.id,
        scope: s.scope,
        value: s.value,
        channel: s.channel,
        reason: s.reason,
        source: s.source ?? "",
        country: s.country ?? "",
        expires_at: s.expires_at ?? "",
        created_at: s.created_at ?? "",
      })),
      columns: [
        { key: "id", label: "id" },
        { key: "scope", label: "scope" },
        { key: "value", label: "value" },
        { key: "channel", label: "channel" },
        { key: "reason", label: "reason" },
        { key: "source", label: "source" },
        { key: "country", label: "country" },
        { key: "expires_at", label: "expires_at" },
        { key: "created_at", label: "created_at" },
      ],
    },
  ];

  const loading = businesses.isLoading || professionals.isLoading || suppression.isLoading;
  const anyError = businesses.error ?? professionals.error ?? suppression.error;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Download className="h-5 w-5" /> Safe exports
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          CSV and XLSX exports are generated in the browser from records the signed-in owner can
          already read. Cells beginning with formula characters are neutralised to prevent
          spreadsheet injection. Exports are capped at {LIMIT.toLocaleString()} rows per dataset.
        </p>
      </header>

      {anyError && (
        <ErrorBanner
          error={anyError as Error}
          context="Exports"
          onRetry={() => {
            if (businesses.isError) void businesses.refetch();
            if (professionals.isError) void professionals.refetch();
            if (suppression.isError) void suppression.refetch();
          }}
        />
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Counting records...</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {datasets.map((d) => (
            <article key={d.id} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
              <div className="flex items-start gap-2">
                <FileSpreadsheet className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                  <h2 className="font-semibold">{d.title}</h2>
                  <p className="text-xs text-muted-foreground">{d.description}</p>
                </div>
                <Badge variant="secondary" className="ml-auto">
                  {d.rows.length}
                </Badge>
              </div>
              {!d.applied ? (
                <p className="rounded border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
                  Table not applied yet. Apply the global intelligence migration to enable this
                  export.
                </p>
              ) : (
                <div className="mt-auto flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={d.rows.length === 0}
                    onClick={() =>
                      downloadCsvFile(
                        rowsToSafeCsv(d.rows, d.columns),
                        `${d.id}-${new Date().toISOString().slice(0, 10)}`,
                      )
                    }
                  >
                    Download CSV
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={d.rows.length === 0}
                    onClick={() =>
                      downloadXlsx(
                        d.rows,
                        d.columns,
                        `${d.id}-${new Date().toISOString().slice(0, 10)}`,
                        d.title,
                      )
                    }
                  >
                    Download XLSX
                  </Button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <section className="rounded-lg border bg-card p-4 text-sm">
        <h2 className="flex items-center gap-2 font-semibold">
          <ShieldAlert className="h-4 w-4" /> Handling exported personal data
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Store exports only where the owner controls access.</li>
          <li>Do not upload personal exports to public tools or unapproved AI services.</li>
          <li>
            Delete exports when the purpose is complete and keep the suppression ledger current.
          </li>
          <li>Formula sanitisation reduces spreadsheet risk but does not make data anonymous.</li>
        </ul>
      </section>
    </div>
  );
}
