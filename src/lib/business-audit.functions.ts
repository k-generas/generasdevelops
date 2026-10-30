import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runBusinessAudit } from "@/lib/business-audit";
import { probeWebsite } from "@/lib/investigate.server";
import { verifyWebsite } from "@/lib/website-finder.server";
import type { Json } from "@/integrations/supabase/types";

export const runBusinessAuditFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ businessId: z.string().uuid() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: biz, error } = await supabase
      .from("businesses")
      .select("*")
      .eq("id", data.businessId)
      .single();
    if (error || !biz) throw new Error("Business not found");

    // Double-check website like investigation does
    const check = await verifyWebsite({
      ...biz,
      aliases: [biz.legal_name, ...(biz.trading_names ?? [])],
    });
    if (check.website && check.website !== biz.website) {
      biz.website = check.website;
    }
    const site = await probeWebsite(biz.website);

    // Map probe findings to IntelFindings shape
    const findings = {
      url: site.url,
      reachable: site.reachable,
      status: site.status,
      https: site.https,
      load_ms: site.load_ms,
      has_viewport_meta: site.has_viewport_meta,
      has_contact_form: site.has_contact_form,
      has_email_link: site.has_email_link,
      has_whatsapp_link: site.has_whatsapp_link,
      has_online_booking_or_shop: site.has_online_booking_or_shop,
      copyright_year: site.copyright_year,
    };

    const result = runBusinessAudit({
      businessId: data.businessId,
      business: biz as any,
      findings: findings as any,
      websiteCheck: check,
      observedAt: new Date().toISOString(),
    });

    const { data: audit, error: insErr } = await supabase
      .from("business_audits")
      .insert({
        owner_id: userId,
        business_id: data.businessId,
        status: result.evidence_log.some(e=>e.severity==="CRITICAL") ? "partial" : "completed",
        findings_json: result as unknown as Json,
        evidence_log_json: result.evidence_log as unknown as Json,
        summary_json: result.summary as unknown as Json,
        score_0_100: result.summary.overall_score,
        completed_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    await supabase.from("business_activity_events").insert({
      owner_id: userId,
      business_id: data.businessId,
      event_type: "audited",
      summary: `Business audit completed (score ${result.summary.overall_score}, ${result.summary.critical_count} critical, ${result.summary.high_count} high)`,
      ref_table: "business_audits",
      ref_id: audit.id,
    });

    return { auditId: audit.id, dedupe_key: result.dedupe_key, run_at: result.run_at, business_id: result.business_id, evidence_log: result.evidence_log, summary: result.summary, findings: result.findings, recommendations: result.recommendations };
  });
