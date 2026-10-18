import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg(error.message);
      else navigate({ to: "/dashboard" });
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/dashboard` },
      });
      if (error) setMsg(error.message);
      else if (!data.session) setMsg("Check your email to confirm your account, then sign in.");
      else navigate({ to: "/dashboard" });
    }
    setBusy(false);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
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
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
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
