import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, Mail, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { recordLoginEvent, ADMIN_EMAIL, ADMIN_WHATSAPP } from "@/lib/access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { mode?: "signup" | "signin" } => {
    if (search["mode"] === "signup") return { mode: "signup" };
    if (search["mode"] === "signin") return { mode: "signin" };
    return {};
  },
  head: () => ({
    meta: [
      { title: "Sign in or join — GARE" },
      {
        name: "description",
        content: "Sign in to GARE, or create an account to join early access.",
      },
      { property: "og:title", content: "Sign in or join — GARE" },
      {
        property: "og:description",
        content: "Sign in to GARE, or create an account to join early access.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const searchMode = Route.useSearch().mode;
  const [mode, setMode] = useState<"in" | "up">(searchMode === "signup" ? "up" : "in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);

  const activationMessage = createdEmail
    ? `Hello! I just created my GARE account and would like to activate it. My email is ${createdEmail}.`
    : `Hello! I just created my GARE account and would like to activate it.`;
  const activationWhatsAppLink = `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(activationMessage)}`;
  const activationEmailLink = `mailto:${ADMIN_EMAIL}?subject=${encodeURIComponent("Activate my GARE account")}&body=${encodeURIComponent(activationMessage)}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg(error.message);
      else {
        void recordLoginEvent("sign_in");
        navigate({ to: "/dashboard" });
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/dashboard` },
      });
      if (error) setMsg(error.message);
      else if (!data.session) setCreatedEmail(email);
      else navigate({ to: "/dashboard" });
    }
    setBusy(false);
  }

  if (createdEmail) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4">
        <Link
          to="/"
          className="rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          ← Back to overview
        </Link>
        <div className="w-full max-w-sm space-y-5 rounded-lg border bg-card p-8">
          <div>
            <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <p className="mt-4 font-mono text-xs uppercase tracking-[0.3em] text-primary">
              GARE // account created
            </p>
            <h1 className="mt-2 text-2xl font-bold">You&apos;re in — one last step</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your account is saved. GARE is in private early access, so a quick hello from you is
              all we need to switch it on. No confirmation email — just message us:
            </p>
          </div>

          <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Your email</span>
              <span className="truncate font-medium">{createdEmail}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Status</span>
              <span className="font-medium text-primary">Awaiting activation</span>
            </div>
          </div>

          <div className="space-y-2">
            <Button asChild className="w-full">
              <a
                href={activationWhatsAppLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2"
              >
                <MessageCircle className="h-4 w-4" />
                Activate on WhatsApp — 0794144738
              </a>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <a
                href={activationEmailLink}
                className="inline-flex items-center justify-center gap-2"
              >
                <Mail className="h-4 w-4" />
                Send activation email instead
              </a>
            </Button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Both messages are pre-filled with your email — just hit send. Activation is usually done
            the same day.
          </p>

          <div className="border-t pt-4">
            <button
              type="button"
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                setCreatedEmail(null);
                setMode("in");
              }}
            >
              Already activated? Sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4">
      <Link
        to="/"
        className="rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        ← Back to overview
      </Link>
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-lg border bg-card p-8">
        <div>
          <img src="/logo.png" alt="GARE" className="mb-4 h-12 w-12 rounded-xl object-cover" />
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">
            GARE // early access
          </p>
          <h1 className="mt-2 text-2xl font-bold">
            {mode === "in" ? "Sign in to GARE" : "Create your GARE account"}
          </h1>
          <p className="mt-2 text-xs text-muted-foreground">
            {mode === "in"
              ? "Your workspace is private to this account."
              : "No card, no subscription. Pricing is shared before anything is charged."}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pw">Password</Label>
          <Input
            id="pw"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {msg && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {msg}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "…" : mode === "in" ? "Sign in" : "Create account"}
        </Button>
        <button
          type="button"
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setMode(mode === "in" ? "up" : "in")}
        >
          {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
