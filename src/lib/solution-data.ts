import type {
  PromptQuality,
  SolutionEvidence,
  SolutionRequirementGroup,
} from "@/lib/solution-builder";

export function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function evidenceFrom(value: unknown): SolutionEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (
      typeof row["label"] !== "string" ||
      typeof row["detail"] !== "string" ||
      (row["kind"] !== "verified_fact" &&
        row["kind"] !== "evidence_backed_finding" &&
        row["kind"] !== "hypothesis")
    )
      return [];
    return [
      {
        kind: row["kind"],
        label: row["label"],
        detail: row["detail"],
        source: typeof row["source"] === "string" ? row["source"] : "unknown",
        observed_at: typeof row["observed_at"] === "string" ? row["observed_at"] : null,
        ref: typeof row["ref"] === "string" ? row["ref"] : null,
      },
    ];
  });
}

export function requirementsFrom(value: unknown): SolutionRequirementGroup[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const group = item as Record<string, unknown>;
    if (typeof group["key"] !== "string" || typeof group["label"] !== "string") return [];
    const requirements = Array.isArray(group["items"])
      ? group["items"].flatMap((raw) => {
          if (!raw || typeof raw !== "object") return [];
          const row = raw as Record<string, unknown>;
          if (
            typeof row["requirement"] !== "string" ||
            typeof row["rationale"] !== "string" ||
            (row["priority"] !== "must" &&
              row["priority"] !== "should" &&
              row["priority"] !== "could")
          )
            return [];
          const priority: "must" | "should" | "could" =
            row["priority"] === "must" || row["priority"] === "could" ? row["priority"] : "should";
          return [
            {
              requirement: row["requirement"],
              rationale: row["rationale"],
              priority,
              acceptance_criteria: Array.isArray(row["acceptance_criteria"])
                ? row["acceptance_criteria"].filter(
                    (value): value is string => typeof value === "string",
                  )
                : [],
            },
          ];
        })
      : [];
    return [{ key: group["key"], label: group["label"], items: requirements }];
  });
}

export function qualityFrom(value: unknown): PromptQuality | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row["score"] !== "number" || typeof row["pass"] !== "boolean") return null;
  if (!Array.isArray(row["checks"])) return null;
  return {
    score: row["score"],
    pass: row["pass"],
    checks: row["checks"].flatMap((check) => {
      if (!check || typeof check !== "object") return [];
      const item = check as Record<string, unknown>;
      if (
        typeof item["key"] !== "string" ||
        typeof item["label"] !== "string" ||
        typeof item["detail"] !== "string" ||
        (item["status"] !== "pass" && item["status"] !== "warn" && item["status"] !== "fail")
      )
        return [];
      return [
        {
          key: item["key"],
          label: item["label"],
          status: item["status"],
          detail: item["detail"],
        },
      ];
    }),
  };
}
