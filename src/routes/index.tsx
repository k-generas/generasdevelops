import { createFileRoute } from "@tanstack/react-router";
import { Landing } from "@/components/marketing/landing";

const TITLE = "GARE — Generas Autonomous Revenue Engine";
const DESCRIPTION =
  "Find the opportunity. Win the business. Grow your revenue. GARE helps freelancers, agencies and business builders discover opportunities, investigate companies and manage the path from prospect to paid work.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      // The app shell marks every private route noindex; the public landing
      // opts back in so search engines can index this one page.
      { name: "robots", content: "index, follow" },
      { property: "og:type", content: "website" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
  }),
  component: LandingComponent,
});

function LandingComponent() {
  return <Landing />;
}
