export type IssuedAccessCode = {
  ok: boolean;
  error?: string;
  code?: string;
  id?: string;
  expires_at?: string;
};

export type RedeemAccessCodeResult = { ok: boolean; error?: string };

export function isMissingDatabaseFunctionError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("gen_random_bytes") ||
    normalized.includes("digest") ||
    normalized.includes("schema cache") ||
    normalized.includes("does not exist")
  );
}

export function generateAccessCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return `GARE-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
}

export async function hashAccessCode(code: string): Promise<string> {
  const encoded = new TextEncoder().encode(code);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
