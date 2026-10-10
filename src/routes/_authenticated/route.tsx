import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GlobalSearch } from "@/components/GlobalSearch";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: Shell,
});

// Records visits: a gap of 30+ minutes starts a new visit, so the dashboard
// can report real activity "since your last visit".
async function trackVisit() {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  const { data: pref } = await supabase.from("user_preferences").select("*").eq("owner_id", u.user.id).maybeSingle();
  const now = new Date();
  if (!pref) {
    await supabase.from("user_preferences").insert({ owner_id: u.user.id, last_visit_at: now.toISOString(), previous_visit_at: null });
    return;
  }
  const last = pref.last_visit_at ? new Date(pref.last_visit_at) : null;
  const newVisit = !last || now.getTime() - last.getTime() > 30 * 60 * 1000;
  await supabase
    .from("user_preferences")
    .update({ last_visit_at: now.toISOString(), ...(newVisit ? { previous_visit_at: pref.last_visit_at } : {}), updated_at: now.toISOString() })
    .eq("owner_id", u.user.id);
}

const NAV = [
  { to: "/discover", label: "Dashboard" },
  { to: "/history", label: "Search History" },
  { to: "/proposals", label: "Proposals" },
  { to: "/tasks", label: "Tasks" },
] as const;

function Shell() {
  const navigate = useNavigate();
  useEffect(() => { void trackVisit(); }, []);
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <Link to="/discover" className="font-mono text-sm font-semibold tracking-[0.25em] text-primary">GARE</Link>
          <nav className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} activeProps={{ className: "text-foreground" }}>{n.label}</Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <GlobalSearch />
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
