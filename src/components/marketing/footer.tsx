import { Link } from "@tanstack/react-router";
import { FOCUS_RING, Wordmark } from "./shared";
import { NAV_LINKS } from "./navbar";

const FOOTER_LINKS = [
  ...NAV_LINKS,
  { label: "Who it is for", href: "#use-cases" },
  { label: "Transparency", href: "#trust" },
  { label: "FAQ", href: "#faq" },
] as const;

export function Footer() {
  return (
    <footer className="border-t bg-card/40">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-10 md:grid-cols-[1.2fr_1fr_1fr]">
          <div>
            <Link to="/" aria-label="GARE home" className={`inline-block rounded-md ${FOCUS_RING}`}>
              <Wordmark />
            </Link>
            <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
              Generas Autonomous Revenue Engine. Find real opportunities, investigate them with
              evidence, and manage the path from prospect to paid work — with you in control of
              every decision.
            </p>
            <p className="mt-4 inline-flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
              Early access · no payments connected
            </p>
          </div>

          <nav aria-label="Footer">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Product
            </h2>
            <ul className="mt-4 space-y-2.5">
              {FOOTER_LINKS.slice(0, 4).map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    className={`text-[13px] text-muted-foreground transition-colors hover:text-foreground ${FOCUS_RING} rounded-md`}
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Company">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              More
            </h2>
            <ul className="mt-4 space-y-2.5">
              {FOOTER_LINKS.slice(4).map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    className={`text-[13px] text-muted-foreground transition-colors hover:text-foreground ${FOCUS_RING} rounded-md`}
                  >
                    {l.label}
                  </a>
                </li>
              ))}
              <li>
                <Link
                  to="/auth"
                  className={`text-[13px] text-muted-foreground transition-colors hover:text-foreground ${FOCUS_RING} rounded-md`}
                >
                  Sign in
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t pt-6 text-[12px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Generas. All rights reserved.</p>
          <p className="max-w-lg sm:text-right">
            Figures shown on this page are product limits and process steps, not customer results.
            No earnings, lead or conversion outcomes are promised.
          </p>
        </div>
      </div>
    </footer>
  );
}
