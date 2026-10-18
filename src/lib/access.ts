import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AccessStatus = "pending" | "approved" | "rejected" | "suspended";

export type AccessInfo = {
  status: AccessStatus;
  email: string;
  name: string | null;
};

export const ADMIN_EMAIL = "generaskagiraneza@gmail.com";
export const ADMIN_WHATSAPP = "250794144738";
export const ACCESS_EMAIL_SUBJECT = "GARE Access Request";

function readName(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  for (const key of ["full_name", "name", "display_name"]) {
    const value = m[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

// Returns null when access can't be determined yet (table not migrated, or no
// session); callers treat null as "no restriction" so the app keeps working.
export async function fetchAccessInfo(): Promise<AccessInfo | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data, error } = await supabase
    .from("user_profiles")
    .select("access_status")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (error) return null;
  return {
    status: data?.access_status ?? "pending",
    email: userData.user.email ?? "",
    name: readName(userData.user.user_metadata),
  };
}

export function useAccessInfo() {
  return useQuery({
    queryKey: ["access-info"],
    queryFn: fetchAccessInfo,
    refetchInterval: (query) => (query.state.data?.status === "pending" ? 15000 : false),
  });
}

export function accessRequestBody(info: AccessInfo): string {
  const lines = [
    "Hello, I have created a GARE account and would like to request access approval.",
    "",
  ];
  if (info.name) lines.push(`Name: ${info.name}`);
  lines.push(`Registered email: ${info.email || "(no email on file)"}`);
  lines.push("", "Please review my request. Thank you.");
  return lines.join("\n");
}

export function accessEmailText(info: AccessInfo): string {
  return `Subject: ${ACCESS_EMAIL_SUBJECT}\n\n${accessRequestBody(info)}`;
}

export function whatsappAccessLink(info: AccessInfo): string {
  return `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(accessRequestBody(info))}`;
}
