import { QueryCache, QueryClient, MutationCache } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { routeTree } from "./routeTree.gen";
import { describeError } from "./lib/errors";

export const getRouter = () => {
  // Global safety net: any query or mutation that fails shows a toast
  // explaining WHY it failed and WHAT the user should do about it.
  const queryCache = new QueryCache({
    onError: (error, query) => {
      const key = query.queryKey?.[0];
      const label = typeof key === "string" ? titleFor(key) : "Loading data";
      const d = describeError(error, label);
      toast.error(d.title, { description: `${d.message} ${d.fix}`, duration: 12000 });
    },
  });
  const mutationCache = new MutationCache({
    onError: (error, _v, _m, mutation) => {
      const key = mutation.options.mutationKey?.[0];
      const label = typeof key === "string" ? titleFor(key) : "Saving changes";
      const d = describeError(error, label);
      toast.error(d.title, { description: `${d.message} ${d.fix}`, duration: 12000 });
    },
  });

  const queryClient = new QueryClient({
    queryCache,
    mutationCache,
    defaultOptions: {
      queries: { retry: 1 },
      mutations: { retry: 0 },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};

function titleFor(key: string): string {
  const map: Record<string, string> = {
    businesses: "Loading businesses",
    "dash-businesses": "Dashboard: businesses",
    "dash-proposals": "Dashboard: proposals",
    "dash-tasks": "Dashboard: tasks",
    "dash-overdue": "Dashboard: overdue tasks",
    "dash-failed-runs": "Dashboard: failed runs",
    "dash-last-opened": "Dashboard: last opened",
    "dash-prefs": "Dashboard: visit history",
    "dash-outcomes": "Dashboard: outcomes",
    runs: "Discovery runs",
    "runs-all": "Search history",
    "revenue-leaks": "Revenue leaks",
    "feasibility-defaults": "Profit assumptions",
    "offer-kits": "Offer kits",
    recovery: "Recovery candidates",
    "intent-board": "Buyer intent",
    referrals: "Referrals",
    "partnership-candidates": "Partnership candidates",
    partners: "Partners",
    "overflow-candidates": "Overflow work",
    handoffs: "Handoffs",
    subscriptions: "Subscriptions",
    proposals: "Proposals",
    proposal: "Proposal",
    pversions: "Proposal versions",
    "proposal-outreach": "Proposal outreach",
    tasks: "Tasks",
    "tasks-businesses": "Task businesses",
    "daily-digests": "Updates",
    "updates-unread": "Unread updates",
    "radar-businesses": "Radar businesses",
    "radar-investigations": "Radar investigations",
    "radar-pipeline": "Radar pipeline",
    "rwanda-companies": "Rwanda companies",
    "rwanda-signals": "Rwanda signals",
    "business-investigation": "Investigation",
    investigation: "Investigation",
    business: "Business",
    "system-status": "System status",
    "settings-prefs": "Settings",
  };
  return map[key] ?? key;
}
