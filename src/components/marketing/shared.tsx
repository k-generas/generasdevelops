import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Focus treatment for plain anchors (Buttons ship their own ring). */
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function Wordmark({ className, size = "md" }: { className?: string; size?: "sm" | "md" }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "grid place-items-center rounded-[7px] border border-primary/40 bg-primary/10 font-mono font-bold text-primary",
          size === "sm" ? "h-6 w-6 text-[13px]" : "h-7 w-7 text-[15px]",
        )}
      >
        G
      </span>
      <span
        className={cn(
          "font-mono font-semibold tracking-[0.22em]",
          size === "sm" ? "text-[13px]" : "text-sm",
        )}
      >
        GARE
      </span>
    </span>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("font-mono text-[11px] uppercase tracking-[0.28em] text-primary", className)}>
      {children}
    </p>
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
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {lead && <p className="mt-4 text-base leading-relaxed text-muted-foreground">{lead}</p>}
    </div>
  );
}

/** Uniform section rhythm + anchor offset for the sticky navbar. */
export function SectionShell({
  id,
  children,
  className,
  tone = "default",
}: {
  id?: string;
  children: ReactNode;
  className?: string;
  tone?: "default" | "muted" | "edge";
}) {
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-24",
        tone === "muted" && "border-y bg-card/50",
        tone === "edge" && "border-y",
        className,
      )}
    >
      <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">{children}</div>
    </section>
  );
}
