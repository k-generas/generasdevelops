import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { detectPlacesProvider } from "./places.server";

export type SystemStatus = {
  ai: { openai: boolean; gemini: boolean; lovable: boolean };
  maps: boolean;
  mapsMode: "connector" | "direct" | null;
  mapsBrowser: boolean;
  geoapify: boolean;
  placesProvider: "google" | "geoapify" | null;
};

// Reports only whether keys are configured — never the key values. Used by the
// Settings page to show real integration status.
export const getSystemStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<SystemStatus> => {
    const lovable = !!process.env["LOVABLE_API_KEY"];
    const geoapify = !!process.env["GEOAPIFY_API_KEY"];
    const detected = detectPlacesProvider();
    return {
      ai: {
        openai: !!process.env["OPENAI_API_KEY"],
        gemini: !!(process.env["GEMINI_API_KEY"] || process.env["GOOGLE_AI_API_KEY"]),
        lovable,
      },
      maps: detected.provider === "google",
      mapsMode: detected.google,
      mapsBrowser: !!process.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"],
      geoapify,
      placesProvider: detected.provider,
    };
  });
