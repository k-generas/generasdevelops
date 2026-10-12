<<<<<<< Updated upstream
export const ORDER_STATUSES = ["DRAFT", "IN_PROGRESS", "DELIVERED", "FULFILLED", "CANCELLED"] as const;

export type ChecklistItem = { label: string; done: boolean };

export function toChecklist(v: unknown): ChecklistItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is { label: unknown; done?: unknown } => !!x && typeof x === "object" && "label" in x)
    .map((x) => ({ label: String(x.label), done: x.done === true }));
}

export function checklistProgress(c: ChecklistItem[]) {
  return { done: c.filter((i) => i.done).length, total: c.length };
}

export function nextOrderNumber(existing: (string | null | undefined)[], year: number): string {
  const prefix = `ORD-${year}-`;
  let max = 0;
  for (const n of existing) {
    if (n && n.startsWith(prefix)) {
      const v = Number(n.slice(prefix.length));
      if (Number.isFinite(v) && v > max) max = v;
    }
=======
// Orders + delivery checklist. Owner-scoped, no payment provider.

export const ORDER_STATUSES = [
  "DRAFT",
  "PENDING",
  "IN_PROGRESS",
  "READY",
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

export function nextOrderNumber(existing: string[], year: number): string {
  const prefix = `ORD-${year}-`;
  let max = 0;
  for (const num of existing) {
    if (!num.startsWith(prefix)) continue;
    const n = Number(num.slice(prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
>>>>>>> Stashed changes
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

<<<<<<< Updated upstream
export function orderIsLate(
  o: { due_at: string | null; status: string },
  now: Date = new Date(),
): boolean {
  if (!o.due_at || o.status === "FULFILLED" || o.status === "CANCELLED") return false;
=======
export function toChecklist(x: unknown): ChecklistItem[] {
  if (!Array.isArray(x)) return [];
  const out: ChecklistItem[] = [];
  for (const it of x) {
    if (typeof it === "object" && it !== null) {
      const o = it as Record<string, unknown>;
      const label = typeof o["label"] === "string" ? o["label"] : "Item";
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
>>>>>>> Stashed changes
  return new Date(o.due_at).getTime() < now.getTime();
}
