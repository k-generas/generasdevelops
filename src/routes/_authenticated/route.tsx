import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Compass,
  FileText,
  History,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Receipt,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GlobalSearch } from "@/components/GlobalSearch";
import { ThemeMenu } from "@/components/ThemeMenu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const { data: pref } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("owner_id", u.user.id)
    .maybeSingle();
  const now = new Date();
  if (!pref) {
    await supabase
      .from("user_preferences")
      .insert({ owner_id: u.user.id, last_visit_at: now.toISOString(), previous_visit_at: null });
    return;
  }
  const last = pref.last_visit_at ? new Date(pref.last_visit_at) : null;
  const newVisit = !last || now.getTime() - last.getTime() > 30 * 60 * 1000;
  await supabase
    .from("user_preferences")
    .update({
      last_visit_at: now.toISOString(),
      ...(newVisit ? { previous_visit_at: pref.last_visit_at } : {}),
      updated_at: now.toISOString(),
    })
    .eq("owner_id", u.user.id);
}

type NavItem = { to: string; label: string; icon: LucideIcon };

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/discover", label: "Discover", icon: Compass },
  { to: "/proposals", label: "Proposals", icon: FileText },
  { to: "/invoices", label: "Invoices", icon: Receipt },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
  { to: "/history", label: "History", icon: History },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

// Bottom tabs stay at five; Settings lives in the account menu on mobile.
const MOBILE_NAV = NAV.slice(0, 5);

function BrandMark() {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
      G
    </span>
  );
}

function Shell() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    void trackVisit();
  }, []);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  const initial = (email[0] ?? "G").toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-sidebar lg:flex">
        <Link to="/dashboard" className="flex h-16 items-center gap-3 px-5">
          <BrandMark />
          <span className="leading-tight">
            <span className="block text-sm font-semibold text-sidebar-foreground">GARE</span>
            <span className="block text-[11px] text-muted-foreground">Revenue Engine</span>
          </span>
        </Link>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:font-medium data-[status=active]:text-sidebar-accent-foreground"
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-secondary text-xs font-semibold text-secondary-foreground">
                {initial}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {email || "Signed in"}
            </span>
            <button
              onClick={signOut}
              title="Sign out"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Content column */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 lg:px-8">
            <Link to="/dashboard" className="lg:hidden">
              <BrandMark />
            </Link>
            <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-3">
              <div className="min-w-0 flex-1 sm:max-w-xs">
                <GlobalSearch />
              </div>
              <ThemeMenu />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-secondary text-xs font-semibold text-secondary-foreground">
                        {initial}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel>
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      Signed in as
                    </span>
                    <span className="block truncate text-sm">{email || "Owner"}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/settings" className="cursor-pointer">
                      <SettingsIcon className="mr-2 h-4 w-4" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={signOut}
                    className="cursor-pointer text-destructive focus:text-destructive"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 lg:px-8 lg:pb-12">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {MOBILE_NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium text-muted-foreground transition-colors data-[status=active]:text-primary"
            >
              <n.icon className="h-5 w-5" />
              {n.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
