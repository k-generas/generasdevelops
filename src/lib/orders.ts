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
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export function orderIsLate(
  o: { due_at: string | null; status: string },
  now: Date = new Date(),
): boolean {
  if (!o.due_at || o.status === "FULFILLED" || o.status === "CANCELLED") return false;
  return new Date(o.due_at).getTime() < now.getTime();
}
