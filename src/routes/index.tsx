import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GARE — Control Room" },
      { name: "description", content: "Private revenue engine control room." },
      { property: "og:title", content: "GARE — Control Room" },
      { property: "og:description", content: "Private revenue engine control room." },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/discover" });
  },
});
