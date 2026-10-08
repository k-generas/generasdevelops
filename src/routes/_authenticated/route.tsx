import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: Shell,
});

function Shell() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen">
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
          <Link to="/discover" className="font-mono text-sm font-semibold tracking-[0.25em] text-primary">
            GARE
          </Link>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link to="/discover" activeProps={{ className: "text-foreground" }}>Discover</Link>
          </nav>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            phase 1 · discovery + investigation
          </span>
          <button
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
