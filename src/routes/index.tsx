import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GARE — Generas Autonomous Revenue Engine" },
      { name: "description", content: "A private engine that finds real businesses, investigates their online presence, and drafts evidence-based proposals." },
      { property: "og:title", content: "GARE — Generas Autonomous Revenue Engine" },
      { property: "og:description", content: "Discover, investigate and pitch real businesses — every step saved, nothing invented." },
    ],
  }),
  component: Landing,
});

const LOOP = [
  ["Discover", "Search Google Maps for real businesses by type and place. Duplicates are merged automatically."],
  ["Investigate", "Check each website: speed, security, mobile, contact paths, public emails and linked social profiles."],
  ["Score", "A visibility score and an AI opportunity score, both explained line by line from the evidence."],
  ["Match", "Recommend the right offer: website, redesign, automation, custom software or DukaLinka."],
  ["Propose", "Draft personalised messages and formal proposals that cite only verified findings."],
  ["Remember", "Every search, report, proposal, note and task is saved, searchable and resumable."],
];

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center px-6 py-6">
        <span className="font-mono text-sm font-semibold tracking-[0.25em] text-primary">GARE</span>
        <Button asChild size="sm" variant="outline" className="ml-auto"><Link to="/auth">Owner sign in</Link></Button>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-20 pt-16">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Private revenue engine · single owner</p>
        <h1 className="mt-4 max-w-3xl text-5xl font-bold leading-[1.05] sm:text-6xl">
          Find businesses that need help. Prove it. Pitch it.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          GARE discovers real businesses, investigates their online presence, and turns real evidence into
          proposals you can send — while remembering everything you've done.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild size="lg"><Link to="/discover">Open control room</Link></Button>
        </div>
      </section>

      <section className="border-y bg-card/60">
        <div className="mx-auto grid max-w-6xl gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
          {LOOP.map(([t, d], i) => (
            <div key={t} className="bg-background p-8">
              <p className="font-mono text-xs text-primary">{String(i + 1).padStart(2, "0")}</p>
              <h3 className="mt-2 text-xl font-semibold">{t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent">Ground rules</p>
            <h2 className="mt-3 text-3xl font-bold">No fake data. Ever.</h2>
          </div>
          <ul className="space-y-3 text-muted-foreground">
            <li>Only real businesses from real sources are stored.</li>
            <li>AI interprets collected evidence — it never invents problems, contacts or numbers.</li>
            <li>Revenue is shown only from real payment records.</li>
            <li>A message is marked sent only when you record that you sent it.</li>
          </ul>
        </div>
      </section>

      <footer className="border-t py-8 text-center font-mono text-[11px] text-muted-foreground">GARE · private system</footer>
    </div>
  );
}
