// Orders + delivery checklist. Owner-scoped, no payment provider.

export const ORDER_STATUSES = [
  "DRAFT",
  "PENDING",
  "IN_PROGRESS",
  "READY",
  "DELIVERED",
  "FULFILLED",
  "CANCELLED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type ChecklistItem = {
  label: string;
  done: boolean;
};

export type Order = {
  id: string | null;
  number: string;
  business_id: string | null;
  proposal_id: string | null;
  invoice_id: string | null;
  currency: string;
  amount: number;
  status: string;
  due_at: string | null;
  fulfilled_at: string | null;
  checklist: unknown;
  notes: string | null;
};

export function nextOrderNumber(existing: (string | null | undefined)[], year: number): string {
  const prefix = `ORD-${year}-`;
  let max = 0;
  for (const num of existing) {
    if (!num || !num.startsWith(prefix)) continue;
    const n = Number(num.slice(prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export function toChecklist(x: unknown): ChecklistItem[] {
  if (!Array.isArray(x)) return [];
  const out: ChecklistItem[] = [];
  for (const it of x) {
    if (typeof it === "object" && it !== null) {
      const o = it as Record<string, unknown>;
      const label = typeof o["label"] === "string" ? o["label"] : "";
      const done = !!o["done"];
      out.push({ label, done });
    } else if (typeof it === "string") {
      out.push({ label: it, done: false });
    }
  }
  return out;
}

export function checklistProgress(c: ChecklistItem[]): { done: number; total: number } {
  const total = c.length;
  const done = c.filter((x) => x.done).length;
  return { done, total };
}

export function orderIsLate(o: Pick<Order, "status" | "due_at">, now: Date = new Date()): boolean {
  if (o.status === "FULFILLED" || o.status === "CANCELLED") return false;
  if (!o.due_at) return false;
  return new Date(o.due_at).getTime() < now.getTime();
}
