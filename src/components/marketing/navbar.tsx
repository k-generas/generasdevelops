import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeMenu } from "@/components/ThemeMenu";
import { FOCUS_RING, Wordmark } from "./shared";

export const NAV_LINKS = [
  { label: "Product", href: "#product" },
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Early Access", href: "#early-access" },
] as const;

const JOIN_SEARCH = { mode: "signup" } as const;

export function Navbar() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 md:px-4 md:pt-4">
      <div className="mx-auto w-full max-w-6xl overflow-hidden rounded-2xl border bg-background/90 shadow-lg shadow-black/5 backdrop-blur-xl supports-[backdrop-filter]:bg-background/75">
        <div className="flex h-14 items-center gap-2 px-3 md:gap-3 md:px-4">
          <Link to="/" aria-label="GARE home" className={`shrink-0 rounded-md ${FOCUS_RING}`}>
            <Wordmark />
          </Link>

          <nav aria-label="Primary" className="hidden items-center gap-0.5 lg:flex">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground ${FOCUS_RING}`}
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-2">
            <ThemeMenu />
            <span aria-hidden="true" className="hidden h-6 w-px bg-border sm:block" />
            <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button asChild size="sm" className="min-w-0 truncate">
              <Link to="/auth" search={JOIN_SEARCH}>
                Join Early Access
              </Link>
            </Button>
            <button
              type="button"
              aria-expanded={open}
              aria-controls="marketing-nav"
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((v) => !v)}
              className={`grid h-8 w-8 place-items-center rounded-lg border text-foreground transition-colors hover:bg-secondary lg:hidden ${FOCUS_RING}`}
            >
              {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {open && (
          <div id="marketing-nav" className="border-t lg:hidden">
            <nav aria-label="Primary mobile" className="px-3 py-2">
              <ul className="divide-y">
                {NAV_LINKS.map((l) => (
                  <li key={l.href}>
                    <a
                      href={l.href}
                      onClick={() => setOpen(false)}
                      className={`block rounded-md py-3 text-sm text-muted-foreground transition-colors hover:text-foreground ${FOCUS_RING}`}
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
                <li>
                  <Link
                    to="/auth"
                    onClick={() => setOpen(false)}
                    className={`block rounded-md py-3 text-sm text-muted-foreground transition-colors hover:text-foreground ${FOCUS_RING}`}
                  >
                    Sign in
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
