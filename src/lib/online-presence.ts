// Track online presence separately from website
// Distinguish different types of presence

export type OnlinePresence = {
  website: {
    status: "confirmed" | "not_found_after_checks" | "inaccessible" | "uncertain" | "not_checked";
    url: string | null;
    checked_at: string | null;
    checks_performed: string[];
    redirect_chain: string[];
  };
  social_media: Array<{
    platform: string;
    url: string;
    status: "confirmed" | "suspected" | "not_found";
    verified: boolean;
  }>;
  directories: Array<{
    name: string;
    url: string;
    status: "listed" | "not_found";
  }>;
  marketplaces: Array<{
    platform: string;
    url: string;
    status: "listed" | "not_found";
  }>;
  parent_company_presence: Array<{
    source: string;
    url: string;
    notes: string;
  }>;
};

export function hasAnyOnlinePresence(presence: OnlinePresence): boolean {
  if (presence.website.status === "confirmed") return true;
  if (presence.social_media.some(s => s.status === "confirmed")) return true;
  if (presence.directories.some(d => d.status === "listed")) return true;
  if (presence.marketplaces.some(m => m.status === "listed")) return true;
  return false;
}

export function getPresenceSummary(presence: OnlinePresence): string {
  const parts: string[] = [];
  if (presence.website.status === "confirmed") parts.push("website");
  if (presence.social_media.filter(s => s.status === "confirmed").length > 0) parts.push("social");
  if (presence.directories.filter(d => d.status === "listed").length > 0) parts.push("directories");
  if (presence.marketplaces.filter(m => m.status === "listed").length > 0) parts.push("marketplaces");
  return parts.length > 0 ? parts.join(", ") : "none confirmed";
}
