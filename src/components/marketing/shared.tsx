import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Focus treatment for plain anchors (Buttons ship their own ring). */
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** Same ring, but visible against a full-bleed forest band. */
export const FOCUS_RING_ON_FOREST =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-2 focus-visible:ring-offset-forest";

export function Wordmark({
  className,
  size = "md",
  tone = "default",
}: {
  className?: string;
  size?: "sm" | "md";
  tone?: "default" | "forest";
}) {
  const dark = tone === "forest";
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "grid place-items-center rounded-[7px] border font-mono font-bold",
          dark
            ? "border-mint/40 bg-mint/15 text-mint"
            : "border-primary/40 bg-primary/10 text-primary",
          size === "sm" ? "h-6 w-6 text-[13px]" : "h-7 w-7 text-[15px]",
        )}
      >
        G
      </span>
      <span
        className={cn(
          "font-mono font-semibold tracking-[0.22em]",
          dark && "text-forest-foreground",
          size === "sm" ? "text-[13px]" : "text-sm",
        )}
      >
        GARE
      </span>
    </span>
  );
}

export function Eyebrow({
  children,
  className,
  tone = "default",
}: {
  children: ReactNode;
  className?: string;
  tone?: "default" | "forest";
}) {
  return (
    <p
      className={cn(
        "font-mono text-[11px] uppercase tracking-[0.28em]",
        tone === "forest" ? "text-mint" : "text-primary",
        className,
      )}
    >
      {children}
    </p>
  );
}

/**
 * A 1px lattice that fades out towards the bottom. Used behind full-bleed
 * forest bands; inherits the current text colour, so pass an opacity colour.
 */
export function GridTexture({ className }: { className?: string }) {
  const mask = "radial-gradient(ellipse 85% 75% at 50% 0%, #000 25%, transparent 100%)";
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none grid-texture", className)}
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    />
  );
}

/**
 * Fades content in as it enters the viewport.
 *
 * Safe by construction: the hidden state is only applied after mount *and* only
 * for elements that start below the fold, so server-rendered HTML, no-JS
 * readers and anyone with reduced motion on always see the content.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  const [shown, setShown] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof IntersectionObserver !== "function") return;
    // Already on screen at mount: leave it visible, no animation.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;

    setArmed(true);
    setShown(false);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={armed ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn(
        "transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none",
        armed && !shown && "translate-y-4 opacity-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  lead,
  className,
  tone = "default",
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  className?: string;
  tone?: "default" | "forest";
}) {
  const dark = tone === "forest";
  return (
    <div className={cn("max-w-2xl", className)}>
      <Eyebrow tone={tone}>{eyebrow}</Eyebrow>
      <h2
        className={cn(
          "mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl",
          dark && "text-forest-foreground",
        )}
      >
        {title}
      </h2>
      {lead && (
        <p
          className={cn(
            "mt-4 text-base leading-relaxed",
            dark ? "text-forest-foreground/70" : "text-muted-foreground",
          )}
        >
          {lead}
        </p>
      )}
    </div>
  );
}

/** Uniform section rhythm + anchor offset for the fixed navbar. */
export function SectionShell({
  id,
  children,
  className,
  tone = "default",
}: {
  id?: string;
  children: ReactNode;
  className?: string;
  tone?: "default" | "muted" | "edge" | "forest";
}) {
  return (
    <section
      id={id}
      className={cn(
        "relative scroll-mt-28",
        tone === "muted" && "border-y bg-muted/50",
        tone === "edge" && "border-y",
        tone === "forest" && "bg-forest text-forest-foreground",
        className,
      )}
    >
      {tone === "forest" && (
        <GridTexture className="absolute inset-x-0 top-0 h-full text-white/[0.07]" />
      )}
      <div className="relative mx-auto max-w-6xl px-6 py-16 sm:py-24">{children}</div>
    </section>
  );
}
