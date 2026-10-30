// Enhanced business identity management
// Distinguish legal name, trading name, brand name, etc.
// Prevent incorrect merges

export type BusinessIdentityProfile = {
  business_id?: string | null;
  legal_name: string | null;
  trading_names: string[];
  brand_names: string[];
  alternative_names: string[];
  parent_company: string | null;
  subsidiaries: string[];
  website_domain: string | null;
  social_identities: Record<string, string[]>; // platform -> handles/urls
  contact_info: {
    phones: string[];
    emails: string[];
    websites: string[];
  };
  locations: BusinessLocation[];
  identity_evidence: string[]; // evidence IDs supporting identity
  confidence: number;
};

export type BusinessLocation = {
  type: "headquarters" | "branch" | "registered" | "other";
  address: string | null;
  city: string | null;
  country: string | null;
  verified: boolean;
};

export type IdentityMatchResult = {
  isMatch: boolean;
  confidence: number;
  reasons: string[];
  requiresConfirmation: boolean;
};

// Conservative matching - requires strong evidence
export function shouldMergeIdentities(
  a: BusinessIdentityProfile,
  b: BusinessIdentityProfile
): IdentityMatchResult {
  const reasons: string[] = [];
  let score = 0;
  
  // Strong signals
  if (a.website_domain && b.website_domain && a.website_domain === b.website_domain) {
    score += 0.4;
    reasons.push("same domain");
  }
  
  // Check if any legal/trading name matches exactly
  const allA = [a.legal_name, ...a.trading_names, ...a.brand_names].filter(Boolean).map(n => n!.toLowerCase());
  const allB = [b.legal_name, ...b.trading_names, ...b.brand_names].filter(Boolean).map(n => n!.toLowerCase());
  
  const exactNameMatch = allA.some(na => allB.some(nb => na === nb && na.length > 3));
  if (exactNameMatch) {
    score += 0.3;
    reasons.push("exact name match");
  }
  
  // Parent/subsidiary relationship - don't merge automatically
  if (a.parent_company && (b.legal_name === a.parent_company || b.trading_names.includes(a.parent_company))) {
    return { isMatch: false, confidence: 0, reasons: ["parent-subsidiary relationship - not merged"], requiresConfirmation: true };
  }
  if (b.parent_company && (a.legal_name === b.parent_company || a.trading_names.includes(b.parent_company))) {
    return { isMatch: false, confidence: 0, reasons: ["parent-subsidiary relationship - not merged"], requiresConfirmation: true };
  }
  
  // Require sufficient evidence - don't merge on weak signals alone
  if (score < 0.5) {
    return { isMatch: false, confidence: score, reasons: ["insufficient identity evidence"], requiresConfirmation: false };
  }
  
  return { isMatch: score >= 0.7, confidence: score, reasons, requiresConfirmation: score < 0.7 };
}
