import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Briefcase,
  Building2,
  Check,
  ClipboardList,
  Compass,
  FileText,
  Lightbulb,
  LineChart,
  Lock,
  Megaphone,
  Radar,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Store,
  Target,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import {
  Eyebrow,
  FOCUS_RING,
  FOCUS_RING_ON_FOREST,
  GridTexture,
  Reveal,
  SectionHeading,
  SectionShell,
} from "./shared";
import { ProductPreview } from "./product-preview";

const JOIN_SEARCH = { mode: "signup" } as const;

/* ------------------------------------------------------------------ Hero */

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-forest text-forest-foreground">
      <GridTexture className="absolute inset-0 text-white/[0.08]" />
      <div className="relative mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-32 lg:grid-cols-[1.03fr_1fr] lg:items-center lg:gap-14 lg:pb-28 lg:pt-40">
        <div>
          <Reveal>
            <Eyebrow tone="forest">Generas · Autonomous Revenue Engine</Eyebrow>
          </Reveal>
          <Reveal delay={70}>
            <h1 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Find the opportunity. Win the business.{" "}
              <span className="text-mint">Grow your revenue.</span>
            </h1>
          </Reveal>
          <Reveal delay={140}>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-forest-foreground/75 sm:text-lg">
              GARE helps freelancers, agencies and business builders discover promising
              opportunities, investigate companies, identify potential customer needs and manage the
              path from prospect to paid work.
            </p>
          </Reveal>
          <Reveal delay={210}>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link to="/auth" search={JOIN_SEARCH}>
                  Join Early Access
                  <ArrowRight />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className={`border-white/25 bg-white/5 text-forest-foreground press-forest hover:bg-white/10 hover:text-forest-foreground ${FOCUS_RING_ON_FOREST}`}
              >
                <a href="#product">
                  Explore the Platform
                  <Search />
                </a>
              </Button>
            </div>
          </Reveal>
          <Reveal delay={280}>
            <p className="mt-8 flex max-w-xl items-start gap-2.5 text-[13px] leading-relaxed text-forest-foreground/70">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-mint" aria-hidden="true" />
              <span>
                Every record keeps its source and freshness. Confidence levels separate verified
                facts from estimates, and AI findings stay hypotheses until you approve them — GARE
                never invents facts it did not collect.
              </span>
            </p>
          </Reveal>
        </div>

        <Reveal delay={160}>
          <ProductPreview tone="forest" />
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- Product */

type Capability = {
  id: string;
  icon: ReactNode;
  title: string;
  status: "live" | "records";
  summary: string;
  body: string;
  points: string[];
  note?: string;
};

const RADAR_CAPABILITY: Capability = {
  id: "radar",
  icon: <Radar className="h-4 w-4" aria-hidden="true" />,
  title: "Local Opportunity Radar",
  status: "live",
  summary: "Search a business type in an area and find the gaps worth working on.",
  body: "Search a business type in an area, see what already exists there, and find the gaps worth working on.",
  points: [
    "Up to 20 results per run, deduplicated by place",
    "Coverage gaps are shown instead of quietly hidden",
    "Every record remembers which source it came from",
  ],
};

const CAPABILITIES: readonly Capability[] = [
  RADAR_CAPABILITY,
  {
    id: "intel",
    icon: <Search className="h-4 w-4" aria-hidden="true" />,
    title: "Business Intelligence",
    status: "live",
    summary: "Check a company's own website for real, observable problems.",
    body: "Check a business's own public website for real, observable problems before you ever contact them.",
    points: [
      "Observed problems from direct checks, not guesses",
      "Service suggestions explained against the evidence",
      "Evidence items carry confidence and a date",
    ],
  },
  {
    id: "qualify",
    icon: <Target className="h-4 w-4" aria-hidden="true" />,
    title: "Opportunity Qualification",
    status: "live",
    summary: "Score and shortlist so you work the prospects most likely to pay.",
    body: "Score and shortlist so you spend your time on the prospects most likely to pay, not on the longest list.",
    points: [
      "Fit, effort and budget bands you set yourself",
      "Buyer intent ranked hot / warm / cool / cold",
      "Shortlists move straight into proposals",
    ],
  },
  {
    id: "workflow",
    icon: <Send className="h-4 w-4" aria-hidden="true" />,
    title: "Sales Workflow",
    status: "live",
    summary: "Proposal, follow-up cadence and tracked next action in one pipeline.",
    body: "Turn a qualified prospect into a proposal, a follow-up cadence and a tracked next action.",
    points: [
      "Proposals, tasks and reminders in one pipeline",
      "Email, WhatsApp and SMS drafts written for your review",
      "You send the message — GARE never sends it for you",
    ],
    note: "Drafts only. There is no inbox sync and nothing is dispatched automatically.",
  },
  {
    id: "money",
    icon: <LineChart className="h-4 w-4" aria-hidden="true" />,
    title: "Revenue & Profit Intelligence",
    status: "records",
    summary: "Track revenue, costs and forecast against actual per engagement.",
    body: "Track revenue, costs and forecast against actual for every engagement, with raw revenue records and profitability previews.",
    points: [
      "Figures are entered and maintained by you",
      "Actual profit computed from your own records",
      "Scenario planning for best / base / worst cases",
    ],
    note: "Records only. There is no payment integration — GARE does not process money.",
  },
  {
    id: "recurring",
    icon: <RefreshCw className="h-4 w-4" aria-hidden="true" />,
    title: "Recurring Revenue & Deal Recovery",
    status: "live",
    summary: "Catch lapsed subscriptions, missed invoices and quiet deals.",
    body: "Keep an eye on subscriptions that may lapse, invoices that look missed, and deals that have gone quiet.",
    points: [
      "Leak flags and lapse dates derived from your records",
      "Recovery messages drafted for you to review and send",
      "Nothing is dispatched automatically",
    ],
    note: "Flags are suggestions. Renewal and recovery messages are drafts you send yourself.",
  },
];

function StatusBadge({
  status,
  tone,
}: {
  status: "live" | "records";
  tone?: "default" | "forest";
}) {
  const live = status === "live";
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 font-mono text-[10px]",
        live
          ? tone === "forest"
            ? "border-mint/40 bg-mint/15 text-mint"
            : "border-primary/40 bg-primary/10 text-primary"
          : tone === "forest"
            ? "border-white/20 text-forest-foreground/70"
            : "text-muted-foreground",
      )}
    >
      {live ? "Available today" : "Records only"}
    </Badge>
  );
}

export function ProductShowcase() {
  const [current, setCurrent] = useState<Capability>(RADAR_CAPABILITY);

  return (
    <SectionShell id="product">
      <Reveal>
        <SectionHeading
          eyebrow="Product"
          title={
            <>
              Six ways GARE turns a market into a <span className="text-primary">pipeline</span>.
            </>
          }
          lead="Each capability below is part of the working product today. What it does — and what it deliberately does not do — is stated plainly."
        />
      </Reveal>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1fr] lg:gap-8">
        {/* Detail panel */}
        <Reveal>
          <div className="relative h-full overflow-hidden rounded-2xl bg-forest p-6 text-forest-foreground sm:p-8">
            <GridTexture className="absolute inset-x-0 top-0 h-2/3 text-white/[0.08]" />
            <div className="relative">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl border border-mint/30 bg-mint/10 text-mint">
                  {current.icon}
                </span>
                <StatusBadge status={current.status} tone="forest" />
              </div>
              <h3 className="mt-5 text-xl font-semibold tracking-tight">{current.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-forest-foreground/75">
                {current.body}
              </p>
              <ul className="mt-5 space-y-2.5 border-t border-white/10 pt-5">
                {current.points.map((p) => (
                  <li key={p} className="flex items-start gap-2.5 text-[13px] leading-relaxed">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mint" aria-hidden="true" />
                    <span className="text-forest-foreground/85">{p}</span>
                  </li>
                ))}
              </ul>
              {current.note && (
                <p className="mt-5 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-[12px] leading-relaxed text-forest-foreground/70">
                  {current.note}
                </p>
              )}
            </div>
          </div>
        </Reveal>

        {/* Selector */}
        <Reveal delay={80}>
          <ul className="flex flex-col gap-1.5">
            {CAPABILITIES.map((c) => {
              const isActive = c.id === current.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setCurrent(c)}
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "w-full rounded-xl border px-4 py-3 text-left transition-colors",
                      FOCUS_RING,
                      isActive
                        ? "border-primary/45 bg-card shadow-sm"
                        : "border-transparent hover:bg-muted/70",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={cn(
                          "grid h-9 w-9 shrink-0 place-items-center rounded-lg border transition-colors",
                          isActive
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border text-muted-foreground",
                        )}
                      >
                        {c.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold tracking-tight">{c.title}</span>
                          <StatusBadge status={c.status} />
                        </span>
                        <span className="mt-1 block text-[12px] leading-snug text-muted-foreground">
                          {c.summary}
                        </span>
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="mt-3 block h-0.5 w-full overflow-hidden rounded-full bg-border"
                    >
                      <span
                        className={cn(
                          "block h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none",
                          isActive ? "w-full" : "w-0",
                        )}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Reveal>
      </div>
    </SectionShell>
  );
}

/* ---------------------------------------------------------- How it works */

type StepTag = "automated" | "ai" | "approved" | "manual";

const TAG_LABELS: Record<StepTag, string> = {
  automated: "Automated",
  ai: "AI recommendation",
  approved: "Owner approved",
  manual: "Manual",
};

const TAG_NOTES: Record<StepTag, string> = {
  automated: "Runs on its own when you start it — data collection and arithmetic.",
  ai: "A suggestion produced from collected evidence. You can accept, edit or ignore it.",
  approved: "Nothing becomes real until you confirm it.",
  manual: "You do it yourself, typically outside the app or in a logged step.",
};

const TAG_CLASSES_FOREST: Record<StepTag, string> = {
  automated: "border-white/15 bg-white/10 text-forest-foreground",
  ai: "border-mint/40 bg-mint/15 text-mint",
  approved: "border-white/20 bg-transparent text-forest-foreground",
  manual: "border-white/15 bg-transparent text-forest-foreground/60",
};

const STEPS: { n: string; title: string; tag: StepTag; body: string }[] = [
  {
    n: "01",
    title: "Discover",
    tag: "automated",
    body: "Query a permitted places source for a business type in an area. Results are bounded per run and deduplicated by place.",
  },
  {
    n: "02",
    title: "Investigate",
    tag: "automated",
    body: "Fetch the business's own public website and page titles to see what it actually offers today.",
  },
  {
    n: "03",
    title: "Verify",
    tag: "approved",
    body: "Confirm or reject what the research surfaced. Nothing is treated as a fact until it has been checked.",
  },
  {
    n: "04",
    title: "Prioritize",
    tag: "ai",
    body: "Score fit, intent and urgency against your service, effort and budget bands. Scores are suggestions you can override.",
  },
  {
    n: "05",
    title: "Propose",
    tag: "approved",
    body: "GARE drafts the proposal from the evidence you approved. You edit it, price it and send it.",
  },
  {
    n: "06",
    title: "Follow Up",
    tag: "manual",
    body: "Send the drafted message yourself and log it. Reminders live in the app — nothing dispatches on its own.",
  },
  {
    n: "07",
    title: "Deliver",
    tag: "manual",
    body: "Record scope, hours and costs against the engagement while the work is happening.",
  },
  {
    n: "08",
    title: "Measure",
    tag: "automated",
    body: "Compare actual revenue and cost against your forecast, and watch for missed renewals and unpaid invoices.",
  },
];

export function HowItWorks() {
  const [active, setActive] = useState<StepTag | null>(null);

  return (
    <SectionShell id="how-it-works" tone="forest">
      <Reveal>
        <SectionHeading
          tone="forest"
          eyebrow="How it works"
          title="Eight steps, one owner."
          lead="Some steps run automatically, some are AI analysis that you approve, and some stay manual. Every step is labelled so you always know which is which."
        />
      </Reveal>

      <Reveal delay={80}>
        <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3">
          {(Object.keys(TAG_LABELS) as StepTag[]).map((t) => (
            <li key={t}>
              <button
                type="button"
                onClick={() => setActive((cur) => (cur === t ? null : t))}
                aria-pressed={active === t}
                className={cn(
                  "flex items-center gap-2 rounded-md text-left transition-opacity",
                  FOCUS_RING_ON_FOREST,
                  active && active !== t ? "opacity-40" : "opacity-100",
                )}
              >
                <Badge
                  variant="outline"
                  className={cn("font-mono text-[10px]", TAG_CLASSES_FOREST[t])}
                >
                  {TAG_LABELS[t]}
                </Badge>
                <span className="max-w-[15rem] text-[11px] leading-snug text-forest-foreground/65">
                  {TAG_NOTES[t]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Reveal>

      <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => {
          const dimmed = active !== null && active !== s.tag;
          return (
            <li key={s.n} className="flex">
              <Reveal delay={i * 45} className="flex w-full">
                <div
                  className={cn(
                    "flex w-full flex-1 flex-col rounded-xl border border-white/10 bg-white/[0.04] p-5 transition-opacity duration-300",
                    dimmed ? "opacity-30" : "opacity-100",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-mint">{s.n}</span>
                    <Badge
                      variant="outline"
                      className={cn("font-mono text-[10px]", TAG_CLASSES_FOREST[s.tag])}
                    >
                      {TAG_LABELS[s.tag]}
                    </Badge>
                  </div>
                  <h3 className="mt-3 text-base font-semibold tracking-tight">{s.title}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-forest-foreground/70">
                    {s.body}
                  </p>
                </div>
              </Reveal>
            </li>
          );
        })}
      </ol>
    </SectionShell>
  );
}

/* ------------------------------------------------------------ Use cases */

const AUDIENCES = [
  {
    icon: <Briefcase className="h-5 w-5" aria-hidden="true" />,
    title: "Freelancers looking for paid projects",
    body: "Find local businesses with a real, visible gap — no site, a slow site, no way to book — and start from a drafted proposal instead of a blank page.",
  },
  {
    icon: <Megaphone className="h-5 w-5" aria-hidden="true" />,
    title: "Digital agencies seeking qualified prospects",
    body: "Scan an area once, qualify leads against your own service fit and effort, and hand overflow work to partners you already trust.",
  },
  {
    icon: <Lightbulb className="h-5 w-5" aria-hidden="true" />,
    title: "Consultants discovering business needs",
    body: "Investigate a target account's public footprint first, so the first conversation starts from what you verified rather than from a guess.",
  },
  {
    icon: <Building2 className="h-5 w-5" aria-hidden="true" />,
    title: "Business development professionals researching target companies",
    body: "Keep evidence, source freshness and confidence with every record, then move shortlisted accounts into proposals, follow-ups and pipeline.",
  },
];

export function UseCases() {
  return (
    <SectionShell id="use-cases">
      <Reveal>
        <SectionHeading
          eyebrow="Who it is for"
          title="Built for people who source their own clients."
          lead="GARE is a workspace you operate. It shortens the research and the writing — the relationship, the judgement and the final call stay yours."
        />
      </Reveal>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {AUDIENCES.map((a, i) => (
          <Reveal key={a.title} delay={i * 60}>
            <article className="h-full rounded-2xl border bg-card p-5 transition-colors hover:border-primary/40">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-forest text-mint">
                {a.icon}
              </span>
              <h3 className="mt-4 text-[15px] font-semibold leading-snug tracking-tight">
                {a.title}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{a.body}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </SectionShell>
  );
}

/* -------------------------------------------------------------- Features */

const SECONDARY: { icon: ReactNode; title: string; body: string; note: string }[] = [
  {
    icon: <LineChart className="h-5 w-5" aria-hidden="true" />,
    title: "Revenue & Profit Intelligence",
    body: "Raw revenue records, costs and forecasts per engagement, with profitability previews computed from what you enter.",
    note: "Records only. No payment integration — GARE does not process money.",
  },
  {
    icon: <RefreshCw className="h-5 w-5" aria-hidden="true" />,
    title: "Recurring Revenue & Deal Recovery",
    body: "Lapse dates, missed invoices and quiet deals surfaced from your records, with recovery messages drafted for review.",
    note: "Suggestions and drafts only. Nothing is dispatched automatically.",
  },
];

const ALSO_INCLUDED = [
  "CSV export",
  "Global search across your records",
  "12 accent themes, light and dark",
  "Offer Studio — scope, terms and pricing floors",
  "Tasks, reminders and follow-up history",
  "Bulk import with server-side validation",
  "Evidence library with freshness checks",
  "Row-level security: only your rows, ever",
];

export function Features() {
  return (
    <SectionShell id="features" tone="muted">
      <Reveal>
        <SectionHeading
          eyebrow="Features"
          title="Everything else, in the open."
          lead="The rest of the platform, including the parts that are deliberately conservative about what they claim."
        />
      </Reveal>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {SECONDARY.map((s, i) => (
          <Reveal key={s.title} delay={i * 70}>
            <article className="flex h-full flex-col rounded-2xl border bg-card p-6">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-forest text-mint">
                {s.icon}
              </span>
              <h3 className="mt-4 text-lg font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              <p className="mt-4 rounded-lg border border-dashed px-3 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
                {s.note}
              </p>
            </article>
          </Reveal>
        ))}
      </div>

      <Reveal delay={140}>
        <div className="mt-4 rounded-2xl border bg-card p-6">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" aria-hidden="true" />
            <h3 className="text-sm font-semibold">Also included</h3>
          </div>
          <ul className="mt-4 flex flex-wrap gap-2">
            {ALSO_INCLUDED.map((f) => (
              <li key={f}>
                <Badge variant="secondary" className="font-normal text-[12px]">
                  {f}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </SectionShell>
  );
}

/* ---------------------------------------------------------------- Trust */

const TRUST_ITEMS = [
  {
    icon: <Compass className="h-4 w-4" aria-hidden="true" />,
    title: "Sources you can audit",
    body: "Every record stores where it came from and when it was collected. Places data arrives through a managed Google Maps connector, with a free OpenStreetMap-based fallback for local development.",
  },
  {
    icon: <ClipboardList className="h-4 w-4" aria-hidden="true" />,
    title: "Evidence, not assertions",
    body: "Each claim carries its own evidence items and the date they were observed. Freshness is computed, and stale findings are marked as stale rather than left looking current.",
  },
  {
    icon: <Store className="h-4 w-4" aria-hidden="true" />,
    title: "Verified vs estimated",
    body: "Facts, estimates and AI hypotheses are labelled differently throughout the product, so you never have to guess which one you are reading.",
  },
  {
    icon: <Sparkles className="h-4 w-4" aria-hidden="true" />,
    title: "Confidence is visible",
    body: "A confidence score accompanies findings so you can weigh them instead of trusting them blindly. Uncertainty stays on screen instead of being smoothed away.",
  },
  {
    icon: <Lock className="h-4 w-4" aria-hidden="true" />,
    title: "You are the approver",
    body: "Nothing is sent, published or committed to a customer until you approve it. The AI may only interpret evidence that was actually collected.",
  },
  {
    icon: <Users className="h-4 w-4" aria-hidden="true" />,
    title: "Your data stays yours",
    body: "The workspace is private to your account and scoped by database row-level security. Sign in somewhere else and you see a different, empty workspace.",
  },
];

export function Trust() {
  return (
    <SectionShell id="trust" tone="forest">
      <Reveal>
        <SectionHeading
          tone="forest"
          eyebrow="Transparency"
          title="What GARE promises — and where it stops."
          lead="An AI-assisted product is only useful if you can tell where the machine ends. These are the boundaries the code actually enforces."
        />
      </Reveal>
      <div className="mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
        {TRUST_ITEMS.map((t, i) => (
          <Reveal key={t.title} delay={i * 50}>
            <div className="flex gap-3">
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-mint/30 bg-mint/10 text-mint">
                {t.icon}
              </span>
              <div>
                <h3 className="text-sm font-semibold tracking-tight">{t.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-forest-foreground/65">
                  {t.body}
                </p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </SectionShell>
  );
}

/* --------------------------------------------------------- Early access */

const EARLY_ACCESS_POINTS = [
  "The full product — radar, investigation, qualification, workflow and records",
  "Your own private workspace with row-level security",
  "No card details, no subscription, no charge",
  "Direct input into what gets built next",
  "Pricing shared with you before anything is activated",
  "Delete your workspace at any time",
];

export function EarlyAccess() {
  return (
    <SectionShell id="early-access">
      <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:gap-14">
        <div>
          <Reveal>
            <SectionHeading
              eyebrow="Early access"
              title={
                <>
                  Join early access. <span className="text-primary">No card required.</span>
                </>
              }
              lead="GARE is in early access. Create an account and use the product today. There is no payment step and no subscription — pricing will be shared with you before anything is charged."
            />
          </Reveal>
          <Reveal delay={90}>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link to="/auth" search={JOIN_SEARCH}>
                  Join Early Access
                  <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/auth">Sign in</Link>
              </Button>
            </div>
            <p className="mt-5 max-w-xl text-[12px] leading-relaxed text-muted-foreground">
              Creating an account means we may email you about your account and about early access.
              Nothing else, no mailing list, and your address is never shared. You can delete your
              workspace — and its data — whenever you like.
            </p>
          </Reveal>
        </div>

        <Reveal delay={150}>
          <div className="relative h-full overflow-hidden rounded-2xl bg-forest p-6 text-forest-foreground sm:p-8">
            <GridTexture className="absolute inset-x-0 top-0 h-2/3 text-white/[0.08]" />
            <div className="relative">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-mint" aria-hidden="true" />
                  <h3 className="text-sm font-semibold">What you get</h3>
                </div>
                <Badge className="border-transparent bg-mint font-mono text-[10px] uppercase tracking-wide text-mint-foreground">
                  No card
                </Badge>
              </div>
              <ul className="mt-4 space-y-3">
                {EARLY_ACCESS_POINTS.map((p) => (
                  <li key={p} className="flex items-start gap-2.5 text-[13px] leading-relaxed">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-mint" aria-hidden="true" />
                    <span className="text-forest-foreground/85">{p}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 rounded-lg border border-white/12 bg-white/5 p-4">
                <p className="text-[13px] leading-relaxed text-forest-foreground/75">
                  <span className="font-semibold text-forest-foreground">Pricing:</span> not
                  published yet. Early access accounts are told the plan and price before any
                  subscription is activated, and can decline it.
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </SectionShell>
  );
}

/* ------------------------------------------------------------------ FAQ */

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "What is GARE?",
    a: "GARE — Generas Autonomous Revenue Engine — is a private workspace that helps you find real businesses, investigate them with evidence, decide which ones are worth pursuing, and manage the path from prospect to paid work. It is a tool you operate, not an agency that does the work for you.",
  },
  {
    q: "Who is it designed for?",
    a: "Freelancers, small digital agencies, consultants and business development professionals who source their own clients. It is not aimed at teams looking for an inbound lead feed.",
  },
  {
    q: "How does it discover opportunities?",
    a: "It searches permitted places data — Google Places through a managed connector in production, or a free OpenStreetMap-based provider for local development — for a business type in an area, then investigates the businesses' own public websites. Every stored record keeps its source.",
  },
  {
    q: "Can it scan every business or website?",
    a: "No, and it is not trying to. Discovery is deliberately bounded — up to 20 results per run and at most 10 paid queries per radar scan — and covers only what the selected source returns for that area. Where coverage is thin, GARE shows you the gap instead of pretending the market is empty.",
  },
  {
    q: "How accurate is the information?",
    a: "Facts come from the sources and from a direct check of the business's own website. Estimates and AI-generated hypotheses are labelled as such, each finding carries a confidence level with its evidence and observation date, and a message is only ever a draft until you send it.",
  },
  {
    q: "What does real-time monitoring mean?",
    a: "It does not exist in GARE. There is a manual daily scan you run yourself and an in-app updates feed showing what each scan found. Scheduling that scan to run automatically needs a job configured outside the app — until then, nothing runs on its own.",
  },
  {
    q: "Does GARE send messages automatically?",
    a: "No. It drafts email, WhatsApp and SMS messages and formal proposals for you to review, edit and send yourself. Outreach is only logged when you record that you sent it.",
  },
  {
    q: "How does it handle business data?",
    a: "Everything lives in your own private workspace, scoped to your account with database row-level security. GARE stores what it collected from permitted sources plus the notes, tasks, proposals and records you create — and nothing from anyone else's workspace.",
  },
  {
    q: "Is the product available yet?",
    a: "It is in early access and the core workflows work today. Payments, automated message sending, CRM and inbox integrations, scheduled monitoring and multi-user access are not built, and we do not claim them.",
  },
  {
    q: "How can someone join early access?",
    a: "Use the Join Early Access button on this page to create an account. No payment details are requested, no subscription is activated, and pricing is shared with you before any charge.",
  },
];

export function Faq() {
  return (
    <SectionShell id="faq">
      <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
        <Reveal>
          <SectionHeading
            eyebrow="FAQ"
            title="Questions worth asking."
            lead="Ten answers written against what the product actually does — including what it does not do yet."
          />
        </Reveal>
        <Reveal delay={90}>
          <Accordion type="single" collapsible className="w-full">
            {FAQ_ITEMS.map((item, i) => (
              <AccordionItem
                key={item.q}
                value={`faq-${i}`}
                className="mb-2 rounded-xl border bg-card px-4 last:border-b"
              >
                <AccordionTrigger className="text-left text-[15px] hover:no-underline">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-[13px] leading-relaxed text-muted-foreground">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </SectionShell>
  );
}
