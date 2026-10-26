import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Building2,
  Compass,
  Factory,
  FileText,
  Flame,
  Handshake,
  History,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Package,
  Phone,
  Radar,
  Receipt,
  ClipboardList,
  Repeat,
  Settings as SettingsIcon,
  ShieldCheck,
  Undo2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getNavCounts, type NavCounts } from "@/lib/nav-counts.functions";
import { AccessGate } from "@/components/AccessGate";
import { GlobalSearch } from "@/components/GlobalSearch";
import { ThemeMenu } from "@/components/ThemeMenu";
import { recordLoginEvent, useAccessInfo } from "@/lib/access";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

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
  { to: "/updates", label: "Updates", icon: Bell },
  { to: "/leaks", label: "Revenue Leaks", icon: AlertTriangle },
  { to: "/offers", label: "Offer studio", icon: Package },
  { to: "/partners", label: "Partners", icon: Handshake },
  { to: "/revenue", label: "Recurring", icon: Repeat },
  { to: "/recovery", label: "Recovery", icon: Undo2 },
  { to: "/intent", label: "Intent", icon: Flame },
  { to: "/referrals", label: "Referrals", icon: Users },
  { to: "/radar", label: "Radar", icon: Radar },
  { to: "/discover", label: "Discover", icon: Compass },
  { to: "/proposals", label: "Proposals", icon: FileText },
  { to: "/invoices", label: "Invoices", icon: Receipt },
  { to: "/orders", label: "Orders", icon: ClipboardList },
  { to: "/businesses", label: "Businesses", icon: Building2 },
  { to: "/numbers", label: "Numbers", icon: Phone },
  { to: "/rwanda", label: "Rwanda Intel", icon: Factory },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
  { to: "/history", label: "History", icon: History },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

// Bottom tabs stay at five; Settings lives in the account menu on mobile.
const MOBILE_NAV = NAV.filter(
  (n) =>
    n.to !== "/leaks" &&
    n.to !== "/offers" &&
    n.to !== "/partners" &&
    n.to !== "/revenue" &&
    n.to !== "/recovery" &&
    n.to !== "/intent" &&
    n.to !== "/referrals",
).slice(0, 5);

export type NavTone = "primary" | "danger" | "warning" | "neutral";

const TONE_CLASS: Record<NavTone, string> = {
  primary: "bg-primary text-primary-foreground",
  danger: "bg-destructive text-destructive-foreground",
  warning: "bg-accent text-accent-foreground",
  neutral: "border border-border bg-muted text-muted-foreground",
};

const EMPTY_COUNTS: NavCounts = {
  businesses: 0,
  updatesUnread: 0,
  discoverFailed: 0,
  leaksOpen: 0,
  tasksOpen: 0,
  tasksOverdue: 0,
  proposalsDraft: 0,
  invoicesOverdue: 0,
};

// Which badge (if any) to show next to a nav item, and how urgent it is.
function navBadgeFor(to: string, c: NavCounts): { count: number; tone: NavTone } | null {
  switch (to) {
    case "/updates":
      return c.updatesUnread > 0 ? { count: c.updatesUnread, tone: "primary" } : null;
    case "/discover":
      return c.discoverFailed > 0 ? { count: c.discoverFailed, tone: "danger" } : null;
    case "/leaks":
      return c.leaksOpen > 0 ? { count: c.leaksOpen, tone: "danger" } : null;
    case "/tasks":
      return c.tasksOpen > 0
        ? { count: c.tasksOpen, tone: c.tasksOverdue > 0 ? "danger" : "warning" }
        : null;
    case "/proposals":
      return c.proposalsDraft > 0 ? { count: c.proposalsDraft, tone: "primary" } : null;
    case "/invoices":
      return c.invoicesOverdue > 0 ? { count: c.invoicesOverdue, tone: "danger" } : null;
    case "/businesses":
      return c.businesses > 0 ? { count: c.businesses, tone: "neutral" } : null;
    default:
      return null;
  }
}

function NavBadge({
  count,
  tone = "primary",
  floating = false,
}: {
  count: number;
  tone?: NavTone;
  floating?: boolean;
}) {
  const label = count > 99 ? "99+" : count;
  if (floating) {
    return (
      <span
        className={`absolute -right-2 -top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-xs leading-none font-semibold ${TONE_CLASS[tone]}`}
      >
        {count > 9 ? "9+" : label}
      </span>
    );
  }
  return (
    <span
      className={`ml-auto grid h-5 min-w-5 place-items-center rounded-full px-1 text-xs font-semibold ${TONE_CLASS[tone]}`}
    >
      {label}
    </span>
  );
}

function BrandMark() {
  return <img src="/logo.png" alt="GARE" className="h-8 w-8 shrink-0 rounded-lg object-cover" />;
}

function Shell() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string>("");
  const [menuOpen, setMenuOpen] = useState(false);

  const access = useAccessInfo();
  const accessStatus = access.data?.status;
  const approved = accessStatus === "approved";

  const fetchNavCounts = useServerFn(getNavCounts);
  const countsQ = useQuery({
    queryKey: ["nav-counts"],
    enabled: approved,
    queryFn: () => fetchNavCounts({}),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const counts = countsQ.data ?? EMPTY_COUNTS;

  useEffect(() => {
    if (approved) void trackVisit();
  }, [approved]);
  useEffect(() => {
    if (approved && sessionStorage.getItem("gare:login-recorded") !== "1") {
      sessionStorage.setItem("gare:login-recorded", "1");
      void recordLoginEvent("sign_in");
    }
  }, [approved]);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  const initial = (email[0] ?? "G").toUpperCase();

  if (access.isPending) {
    return <div className="min-h-dvh bg-background" />;
  }

  if (access.data && accessStatus !== "approved") {
    return (
      <AccessGate info={access.data} onSignOut={signOut} onRedeemed={() => void access.refetch()} />
    );
  }

  const navItems: NavItem[] = access.data?.isAdmin
    ? [...NAV, { to: "/admin", label: "Admin", icon: ShieldCheck }]
    : NAV;

  return (
    <div className="min-h-dvh bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col overflow-hidden border-r bg-sidebar lg:flex">
        <Link to="/dashboard" className="flex h-16 shrink-0 items-center gap-3 px-5">
          <BrandMark />
          <span className="leading-tight">
            <span className="block text-sm font-semibold text-sidebar-foreground">GARE</span>
            <span className="block text-xs text-muted-foreground">Revenue Engine</span>
          </span>
        </Link>
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain scroll-smooth px-3 py-2">
          {navItems.map((n) => {
            const badge = navBadgeFor(n.to, counts);
            return (
              <Link
                key={n.to}
                to={n.to}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent data-[status=active]:font-semibold data-[status=active]:text-foreground"
              >
                <n.icon className="h-4 w-4" />
                {n.label}
                {badge && <NavBadge count={badge.count} tone={badge.tone} />}
              </Link>
            );
          })}
        </nav>
        <div className="shrink-0 border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-secondary text-xs font-semibold text-secondary-foreground">
                {initial}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 text-xs text-muted-foreground">
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
      <div className="min-h-dvh bg-background lg:pl-64">
        <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
          <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-4 lg:px-8">
            {/* Mobile/tablet menu — every page is reachable from here */}
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="Open menu"
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="flex w-72 flex-col gap-0 p-0 pr-6">
                <SheetTitle className="sr-only">Menu</SheetTitle>
                <div className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
                  <Link
                    to="/dashboard"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3"
                  >
                    <BrandMark />
                    <span className="leading-tight">
                      <span className="block text-sm font-semibold">GARE</span>
                      <span className="block text-xs text-muted-foreground">Revenue Engine</span>
                    </span>
                  </Link>
                </div>
                <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-3">
                  {navItems.map((n) => {
                    const badge = navBadgeFor(n.to, counts);
                    return (
                      <Link
                        key={n.to}
                        to={n.to}
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted data-[status=active]:bg-primary/10 data-[status=active]:font-semibold data-[status=active]:text-primary"
                      >
                        <n.icon className="h-4 w-4" />
                        <span className="flex-1">{n.label}</span>
                        {badge && <NavBadge count={badge.count} tone={badge.tone} />}
                      </Link>
                    );
                  })}
                </nav>
                <div className="shrink-0 border-t p-3">
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
                      onClick={() => {
                        setMenuOpen(false);
                        void signOut();
                      }}
                      title="Sign out"
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                    >
                      <LogOut className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
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
                    <span className="block text-xs font-normal text-muted-foreground">
                      Signed in as
                    </span>
                    <span className="block text-sm">{email || "Owner"}</span>
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

        <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {MOBILE_NAV.map((n) => {
            const badge = navBadgeFor(n.to, counts);
            return (
              <Link
                key={n.to}
                to={n.to}
                className="flex flex-col items-center gap-1 py-2.5 text-xs font-medium text-muted-foreground transition-colors data-[status=active]:text-primary"
              >
                <span className="relative">
                  <n.icon className="h-5 w-5" />
                  {badge && <NavBadge count={badge.count} tone={badge.tone} floating />}
                </span>
                <span className="w-full truncate">{n.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
