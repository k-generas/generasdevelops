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

const joinSearch = { mode: "signup" } as const;

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
    <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-6">
        <Link to="/" aria-label="GARE home" className={`shrink-0 rounded-md ${FOCUS_RING}`}>
          <Wordmark />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={`rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground ${FOCUS_RING}`}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeMenu />
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link to="/auth">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/auth" search={joinSearch}>
              Join Early Access
            </Link>
          </Button>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="marketing-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
            className={`grid h-9 w-9 place-items-center rounded-md border text-foreground transition-colors hover:bg-accent hover:text-accent-foreground lg:hidden ${FOCUS_RING}`}
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open && (
        <div id="marketing-nav" className="border-t bg-background lg:hidden">
          <nav aria-label="Primary mobile" className="mx-auto max-w-6xl px-6 py-3">
            <ul className="divide-y">
              {NAV_LINKS.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className={`block py-3 text-sm text-muted-foreground transition-colors hover:text-foreground ${FOCUS_RING}`}
                  >
                    {l.label}
                  </a>
                </li>
              ))}
              <li>
                <Link
                  to="/auth"
                  onClick={() => setOpen(false)}
                  className={`block py-3 text-sm text-muted-foreground transition-colors hover:text-foreground ${FOCUS_RING}`}
                >
                  Sign in
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      )}
    </header>
  );
}
