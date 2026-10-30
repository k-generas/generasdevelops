// Business Digital Audit - pure engine (evidence-based, no fabrication).
// Reuses existing verification/service-match patterns. Statuses: OBSERVED, INFERRED,
// NEEDS_CONFIRMATION, NOT_TESTED, INACCESSIBLE. Severities: CRITICAL, HIGH, MEDIUM, LOW, OPPORTUNITY, UNKNOWN.
import { deriveObservedProblems, type IntelBusiness, type IntelFindings } from "@/lib/business-intel";

export type AuditEvidenceStatus = "OBSERVED" | "INFERRED" | "NEEDS_CONFIRMATION" | "NOT_TESTED" | "INACCESSIBLE";
export type AuditSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "OPPORTUNITY" | "UNKNOWN";

export type AuditEvidence = {
  id: string;
  category: string;
  check: string;
  status: AuditEvidenceStatus;
  severity: AuditSeverity;
  evidence: string;
  source: string;
  observed_at: string;
  confidence: number;
  notes?: string | null;
};

export type AuditSummary = {
  overall_score: number;
  critical_count: number;
  high_count: number;
  quick_wins: string[];
  top_recommendations: string[];
  blockers: string[];
};

export type BusinessAuditResult = {
  dedupe_key: string;
  run_at: string;
  business_id: string;
  evidence_log: AuditEvidence[];
  summary: AuditSummary;
  findings: {
    website: Record<string, any> | null;
    presence: Record<string, any>;
    technical: Record<string, any>;
    content: Record<string, any>;
    conversion: Record<string, any>;
    trust: Record<string, any>;
  };
  recommendations: Array<{ title: string; priority: AuditSeverity; rationale: string; action: string; effort: "low"|"medium"|"high" }>;
};

function scoreFor(sev: AuditSeverity): number {
  switch (sev) {
    case "CRITICAL": return 0;
    case "HIGH": return 25;
    case "MEDIUM": return 50;
    case "LOW": return 75;
    case "OPPORTUNITY": return 90;
    case "UNKNOWN": return 60;
  }
}

export function computeAuditScore(evidence: AuditEvidence[]): number {
  if (evidence.length === 0) return 70;
  const weights = evidence.map(e => {
    const base = scoreFor(e.severity);
    return base * Math.max(0.3, Math.min(1, e.confidence));
  });
  const avg = weights.reduce((a,b)=>a+b,0) / weights.length;
  return Math.max(0, Math.min(100, Math.round(avg)));
}

function add(e: Omit<AuditEvidence, "id">): AuditEvidence {
  return { ...e, id: `${e.category}:${e.check}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2,6)}` };
}

type FindingsExt = IntelFindings & { https?: boolean | null };

export function runBusinessAudit(input: {
  businessId: string;
  business: IntelBusiness;
  findings: FindingsExt | null;
  websiteCheck?: unknown;
  observedAt?: string;
}): BusinessAuditResult {
  const now = input.observedAt ?? new Date().toISOString();
  const log: AuditEvidence[] = [];
  const biz = input.business;
  const findings = input.findings;

  // Presence
  if (!biz.website) {
    log.push(add({ category: "presence", check: "website_existence", status: "NEEDS_CONFIRMATION", severity: "HIGH", evidence: "No website URL recorded on business profile.", source: "business", observed_at: now, confidence: 0.8, notes: "Confirm via website verification." }));
  } else {
    log.push(add({ category: "presence", check: "website_existence", status: "OBSERVED", severity: "LOW", evidence: `Website recorded: ${biz.website}`, source: "business", observed_at: now, confidence: 0.9 }));
  }

  // Technical from findings
  if (findings) {
    if (findings.reachable === true) {
      log.push(add({ category: "technical", check: "reachability", status: "OBSERVED", severity: "LOW", evidence: `Site reachable (status ${findings.status ?? "unknown"})`, source: "probe", observed_at: now, confidence: 0.9 }));
      if (findings.https === false) {
        log.push(add({ category: "technical", check: "https", status: "OBSERVED", severity: "HIGH", evidence: "Site not served over HTTPS", source: "probe", observed_at: now, confidence: 0.9 }));
      } else if (findings.https === true) {
        log.push(add({ category: "technical", check: "https", status: "OBSERVED", severity: "LOW", evidence: "Site served over HTTPS", source: "probe", observed_at: now, confidence: 0.9 }));
      }
      if (findings.has_viewport_meta === false) {
        log.push(add({ category: "technical", check: "mobile_viewport", status: "OBSERVED", severity: "HIGH", evidence: "No viewport meta tag detected", source: "probe", observed_at: now, confidence: 0.85 }));
      } else if (findings.has_viewport_meta === true) {
        log.push(add({ category: "technical", check: "mobile_viewport", status: "OBSERVED", severity: "LOW", evidence: "Viewport meta tag present", source: "probe", observed_at: now, confidence: 0.85 }));
      }
      if (findings.load_ms != null && findings.load_ms > 3000) {
        log.push(add({ category: "technical", check: "load_time", status: "OBSERVED", severity: findings.load_ms > 6000 ? "CRITICAL" : "HIGH", evidence: `Load time ${findings.load_ms}ms`, source: "probe", observed_at: now, confidence: 0.8 }));
      }
      if (findings.copyright_year != null) {
        const age = new Date(now).getFullYear() - findings.copyright_year;
        if (age >= 3) {
          log.push(add({ category: "content", check: "copyright_freshness", status: "OBSERVED", severity: "MEDIUM", evidence: `Copyright year ${findings.copyright_year} (${age} years old)`, source: "probe", observed_at: now, confidence: 0.7 }));
        }
      }
      if (findings.has_contact_form === false && findings.has_email_link === false && findings.has_whatsapp_link === false) {
        log.push(add({ category: "conversion", check: "contact_channels", status: "OBSERVED", severity: "MEDIUM", evidence: "No contact form/email/WhatsApp links detected", source: "probe", observed_at: now, confidence: 0.7 }));
      }
      if (findings.has_online_booking_or_shop === false) {
        log.push(add({ category: "conversion", check: "booking_ordering", status: "INFERRED", severity: "LOW", evidence: "No booking/shop signals detected", source: "probe", observed_at: now, confidence: 0.6 }));
      }
    } else if (findings.reachable === false) {
      log.push(add({ category: "technical", check: "reachability", status: "OBSERVED", severity: "CRITICAL", evidence: `Site unreachable (status ${findings.status ?? "unknown"})`, source: "probe", observed_at: now, confidence: 0.9 }));
    }
  } else {
    log.push(add({ category: "technical", check: "probe", status: "NOT_TESTED", severity: "UNKNOWN", evidence: "No website probe findings available.", source: "none", observed_at: now, confidence: 0.3 }));
  }

  // Cross-check with business-intel observed problems
  const probs = deriveObservedProblems({ business: biz, findings, websiteCheck: input.websiteCheck, observedAt: now } as any);
  for (const p of probs) {
    if (!log.find(l => l.evidence.includes(p.label) || l.check.includes(p.key))) {
      log.push(add({ category: "insights", check: p.key, status: "OBSERVED", severity: p.severity === "high" ? "HIGH" : p.severity === "medium" ? "MEDIUM" : "LOW", evidence: p.evidence, source: p.source, observed_at: p.observed_at, confidence: p.confidence }));
    }
  }

  const score = computeAuditScore(log);
  const critical = log.filter(l=>l.severity==="CRITICAL").length;
  const high = log.filter(l=>l.severity==="HIGH").length;
  const quick_wins = log.filter(l=>l.severity==="LOW"||l.severity==="OPPORTUNITY").slice(0,3).map(l=>l.evidence);
  const top_recs = log.filter(l=>l.severity==="CRITICAL"||l.severity==="HIGH").slice(0,3).map(l=>`Fix: ${l.check.replace(/_/g," ")} - ${l.evidence}`);

  const recommendations = log.filter(l=>l.severity==="CRITICAL"||l.severity==="HIGH").map(l=>({
    title: l.check.replace(/_/g," "),
    priority: l.severity,
    rationale: l.evidence,
    action: l.severity==="CRITICAL" ? "Address immediately" : "Plan fix soon",
    effort: l.severity==="CRITICAL" ? "medium" as const : "low" as const
  }));

  return {
    dedupe_key: `audit:${input.businessId}:${now.slice(0,10)}`,
    run_at: now,
    business_id: input.businessId,
    evidence_log: log,
    summary: { overall_score: score, critical_count: critical, high_count: high, quick_wins, top_recommendations: top_recs, blockers: log.filter(l=>l.severity==="CRITICAL").map(l=>l.evidence) },
    findings: { website: biz.website ? { url: biz.website } : null, presence: { has_website: !!biz.website }, technical: {}, content: {}, conversion: {}, trust: {} },
    recommendations
  };
}
