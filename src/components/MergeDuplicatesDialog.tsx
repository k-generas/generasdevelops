import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Merge } from "lucide-react";
import { findDuplicateGroups, type DuplicateBusiness, type DuplicateGroup } from "@/lib/duplicates";
import { mergeBusinesses } from "@/lib/merge.functions";
import { describeError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function MergeDuplicatesDialog({
  open,
  onOpenChange,
  businesses,
  onMerged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businesses: DuplicateBusiness[];
  onMerged: () => void;
}) {
  const merge = useServerFn(mergeBusinesses);
  const groups = useMemo(() => findDuplicateGroups(businesses), [businesses]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const keepFor = (group: DuplicateGroup) => selected[group.key] ?? group.suggestedKeepId;

  async function runMerge(group: DuplicateGroup) {
    const keepId = keepFor(group);
    const mergeIds = group.businesses.filter((b) => b.id !== keepId).map((b) => b.id);
    if (mergeIds.length === 0) return;
    setBusyKey(group.key);
    setMessage(null);
    try {
      const result = await merge({
        data: { keepId, mergeIds },
      });
      const moved = Object.values(result.moved).reduce((sum, n) => sum + n, 0);
      setMessage({
        ok: true,
        text: `Merged ${result.merged} record${result.merged === 1 ? "" : "s"} and moved ${moved} linked row${moved === 1 ? "" : "s"}.`,
      });
      setSelected((prev) => {
        const next = { ...prev };
        delete next[group.key];
        return next;
      });
      onMerged();
    } catch (e) {
      const d = describeError(e, "Merge duplicates");
      setMessage({ ok: false, text: `${d.title}: ${d.message} How to fix: ${d.fix}` });
    }
    setBusyKey(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5 text-primary" />
            Duplicate businesses
          </DialogTitle>
          <DialogDescription>
            Matches share a usable phone number, a business website, or the same name in the same
            district. Pick the record to keep; linked proposals, tasks, orders, notes and history
            are moved before the duplicates are deleted.
          </DialogDescription>
        </DialogHeader>

        {message && (
          <p
            className={`rounded border p-3 text-sm ${
              message.ok
                ? "border-emerald-500/50 text-emerald-700 dark:text-emerald-400"
                : "border-destructive text-destructive"
            }`}
          >
            {message.text}
          </p>
        )}

        {groups.length === 0 ? (
          <p className="rounded border p-4 text-sm text-muted-foreground">
            No duplicates found in the saved leads. The check does not merge businesses that only
            share a generic name across different districts.
          </p>
        ) : (
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            {groups.map((group) => {
              const keepId = keepFor(group);
              const duplicates = group.businesses.filter((b) => b.id !== keepId).length;
              return (
                <section key={group.key} className="rounded-lg border">
                  <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
                    <div>
                      <p className="text-sm font-semibold">{group.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {group.businesses.length} records · keep one, merge {duplicates}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      disabled={busyKey === group.key}
                      onClick={() => void runMerge(group)}
                    >
                      {busyKey === group.key ? "Merging…" : `Merge ${duplicates} into selected`}
                    </Button>
                  </header>
                  <div className="divide-y">
                    {group.businesses.map((b) => {
                      const keep = b.id === keepId;
                      return (
                        <label
                          key={b.id}
                          className={`flex cursor-pointer items-start gap-3 px-3 py-2 text-sm ${
                            keep ? "bg-primary/5" : ""
                          }`}
                        >
                          <input
                            type="radio"
                            name={group.key}
                            className="mt-1 accent-primary"
                            checked={keep}
                            onChange={() => setSelected((prev) => ({ ...prev, [group.key]: b.id }))}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{b.name}</span>
                              {keep && (
                                <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                                  Keep
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {[
                                b.phone,
                                b.website,
                                b.district,
                                b.emails?.length ? `${b.emails.length} email(s)` : null,
                                b.score != null ? `score ${b.score}` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ") || "No contact details"}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
