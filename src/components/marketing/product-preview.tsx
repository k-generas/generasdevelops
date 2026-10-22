import { ArrowRight, Radar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * Hero product preview.
 *
 * There are no product screenshots in the repo, so this is a clearly labelled
 * interface preview rebuilt from GARE's own components. The limits shown in the
 * stat strip are the app's real, enforced bounds; the rows below them are
 * illustrative categories, not customer records.
 */

const REAL_LIMITS: { value: string; label: string }[] = [
  { value: "20", label: "max results per discovery run" },
  { value: "10", label: "max paid queries per radar scan" },
  { value: "$0.032", label: "estimated cost per query" },
];

const SAMPLE_ROWS = [
  {
    name: "Salon & beauty studio",
    area: "Gasabo",
    signal: "No website",
    status: "New",
    action: "Investigate",
  },
  {
    name: "Accounting practice",
    area: "Kicukiro",
    signal: "Site is slow on mobile",
    status: "Investigated",
    action: "Draft proposal",
  },
  {
    name: "Hardware & supplies shop",
    area: "Nyarugenge",
    signal: "No booking or contact path",
    status: "Investigated",
    action: "Draft proposal",
  },
];

export function ProductPreview({ tone = "default" }: { tone?: "default" | "forest" }) {
  return (
    <figure className="m-0">
      <div className="overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-2xl shadow-black/25 ring-1 ring-white/10">
        {/* Window chrome */}
        <div className="flex items-center gap-3 border-b bg-muted/40 px-4 py-2.5">
          <span aria-hidden="true" className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
          </span>
          <span className="truncate font-mono text-xs text-muted-foreground">Discover — GARE</span>
          <Badge
            variant="outline"
            className="ml-auto hidden shrink-0 font-mono text-xs sm:inline-flex"
          >
            Interface preview
          </Badge>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 px-4 pt-4 sm:px-5">
          <div className="flex items-center gap-2">
            <Radar className="h-4 w-4 text-primary" aria-hidden="true" />
            <p className="text-sm font-semibold">Local opportunity radar</p>
          </div>
          <Button size="sm" className="ml-auto" disabled aria-disabled="true">
            Run discovery
            <ArrowRight />
          </Button>
        </div>

        {/* Real, enforced limits */}
        <dl className="grid gap-px border-y bg-border px-0 py-0 sm:grid-cols-3 m-0">
          {REAL_LIMITS.map((l) => (
            <div key={l.label} className="bg-card px-4 py-3 sm:px-5">
              <dt className="font-mono text-lg font-semibold leading-none text-primary">
                {l.value}
              </dt>
              <dd className="mt-1.5 text-xs leading-snug text-muted-foreground">{l.label}</dd>
            </div>
          ))}
        </dl>

        {/* Table (sm+); stacked cards below sm so nothing is clipped on phones */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[520px] border-collapse text-left">
            <thead>
              <tr className="border-b bg-muted/30">
                <th
                  scope="col"
                  className="px-4 py-2 font-mono text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground sm:px-5"
                >
                  Business
                </th>
                <th
                  scope="col"
                  className="hidden px-3 py-2 font-mono text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground sm:table-cell"
                >
                  Area
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 font-mono text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
                >
                  Evidence
                </th>
                <th
                  scope="col"
                  className="hidden px-3 py-2 font-mono text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground md:table-cell"
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 font-mono text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground sm:px-5"
                >
                  <span className="sr-only">Next step</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {SAMPLE_ROWS.map((r) => (
                <tr key={r.name} className="border-b last:border-0">
                  <td className="px-4 py-3 text-sm font-medium sm:px-5">{r.name}</td>
                  <td className="hidden px-3 py-3 text-sm text-muted-foreground sm:table-cell">
                    {r.area}
                  </td>
                  <td className="px-3 py-3 text-sm text-muted-foreground">{r.signal}</td>
                  <td className="hidden px-3 py-3 md:table-cell">
                    <Badge variant="secondary" className="font-mono text-xs">
                      {r.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 text-right sm:px-5">
                    <span className="whitespace-nowrap font-mono text-xs text-primary">
                      {r.action} →
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="divide-y sm:hidden">
          {SAMPLE_ROWS.map((r) => (
            <li key={r.name} className="px-4 py-3">
              <p className="truncate text-sm font-medium">{r.name}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{r.signal}</p>
              <span className="mt-1.5 inline-block font-mono text-xs text-primary">
                {r.action} →
              </span>
            </li>
          ))}
        </ul>
      </div>

      <figcaption
        className={
          tone === "forest"
            ? "mt-3 text-xs leading-relaxed text-white/55"
            : "mt-3 text-xs leading-relaxed text-muted-foreground"
        }
      >
        Interface preview built from GARE's components. Stat limits are enforced values; table rows
        are illustrative categories, not customer records.
      </figcaption>
    </figure>
  );
}
