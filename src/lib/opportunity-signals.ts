// Opportunity Signals - business events suggesting commercial opportunities
// Extends existing activity/radar/intent capabilities

import { isHiringKind } from "@/lib/activity";

export type OpportunitySignalCategory =
  | "business_expansion"
  | "new_branch_location"
  | "new_product_service"
  | "hiring_activity"
  | "new_contracts_projects"
  | "new_partnerships"
  | "market_expansion"
  | "digital_transformation"
  | "technology_adoption"
  | "changes_business_operations"
  | "customer_experience_concerns"
  | "digital_presence_improvements"
  | "new_supplier_distributor";

export type OpportunitySignalStatus =
  | "NEW"
  | "UNDER_REVIEW"
  | "CONFIRMED"
  | "NEEDS_VALIDATION"
  | "EXPIRED"
  | "DISMISSED"
  | "CONVERTED_TO_OPPORTUNITY";

export type OpportunitySignal = {
  id: string;
  business_id: string;
  business_name?: string;
  category: OpportunitySignalCategory;
  description: string;
  evidence_source: string;
  source_url: string | null;
  published_at: string | null;
  detected_at: string;
  last_verification_date: string | null;
  confidence_level: number; // 0-1
  possible_business_need: string;
  relevant_generas_service: string[];
  suggested_investigation: string;
  suggested_validation_question: string;
  priority: "low" | "medium" | "high" | "critical";
  status: OpportunitySignalStatus;
  industry?: string | null;
  location?: string | null;
  metadata: Record<string, unknown>;
};

export const SIGNAL_CATEGORY_LABELS: Record<OpportunitySignalCategory, string> = {
  business_expansion: "Business Expansion",
  new_branch_location: "New Branch/Location",
  new_product_service: "New Product/Service",
  hiring_activity: "Hiring Activity",
  new_contracts_projects: "New Contracts/Projects",
  new_partnerships: "New Partnerships",
  market_expansion: "Market Expansion",
  digital_transformation: "Digital Transformation",
  technology_adoption: "Technology Adoption",
  changes_business_operations: "Changes in Business Operations",
  customer_experience_concerns: "Customer Experience Concerns",
  digital_presence_improvements: "Digital Presence Improvements",
  new_supplier_distributor: "New Supplier/Distributor",
};

export function mapActivityToSignal(category: string): OpportunitySignalCategory | null {
  const mapping: Record<string, OpportunitySignalCategory> = {
    expansion: "business_expansion",
    new_branch: "new_branch_location",
    new_product: "new_product_service",
    vacancy: "hiring_activity",
    repeated_recruitment: "hiring_activity",
    new_contract: "new_contracts_projects",
    tender: "new_contracts_projects",
    investment: "market_expansion",
    change: "changes_business_operations",
  };
  return mapping[category] || null;
}

export function suggestServicesForSignal(signal: OpportunitySignal): string[] {
  const suggestions: Record<OpportunitySignalCategory, string[]> = {
    business_expansion: ["Business Management System", "Dashboards and Business Reporting"],
    new_branch_location: ["Multi-branch Management System", "Centralized Reporting"],
    new_product_service: ["Digital Catalogue", "Enquiry System", "Website Development"],
    hiring_activity: ["CRM", "Sales Performance Dashboard", "Customer Management System"],
    new_contracts_projects: ["Project Management System", "Order Management System"],
    new_partnerships: ["Partner Portal", "API Integrations"],
    market_expansion: ["Website Development", "Digital Catalogue", "Enquiry System"],
    digital_transformation: ["Business Management System", "Workflow Automation"],
    technology_adoption: ["API Integrations", "Business Management System"],
    changes_business_operations: ["Workflow Automation", "Business Management System"],
    customer_experience_concerns: ["Customer Management System", "Website Redesign"],
    digital_presence_improvements: ["Website Development", "Website Redesign"],
    new_supplier_distributor: ["Order Management System", "Distributor Portal", "Digital Catalogue"],
  };
  return suggestions[signal.category] || [];
}

export function generateValidationQuestion(signal: OpportunitySignal): string {
  const questions: Record<OpportunitySignalCategory, string> = {
    business_expansion: "Are you planning to expand your operations and need better systems to manage growth?",
    new_branch_location: "How are you managing operations across multiple locations currently?",
    new_product_service: "Do you have a way for customers to inquire about or order your new offerings online?",
    hiring_activity: "Are you looking to improve sales tracking or customer management as you grow your team?",
    new_contracts_projects: "Do you need help managing orders/projects efficiently?",
    new_partnerships: "Are you looking to streamline collaboration with your partners?",
    market_expansion: "Do you need a stronger online presence to reach new markets?",
    digital_transformation: "What manual processes would you like to automate?",
    technology_adoption: "How are you currently managing data and workflows?",
    changes_business_operations: "Are your current tools keeping up with these changes?",
    customer_experience_concerns: "How do customers currently reach you or place orders?",
    digital_presence_improvements: "Is your current online presence helping you generate leads?",
    new_supplier_distributor: "How do you currently manage orders from suppliers/distributors?",
  };
  return questions[signal.category] || "Would improving your digital systems help with this growth?";
}

export function computeSignalPriority(signal: OpportunitySignal): "low" | "medium" | "high" | "critical" {
  if (signal.confidence_level >= 0.8 && ["business_expansion", "new_contracts_projects", "market_expansion"].includes(signal.category)) {
    return "critical";
  }
  if (signal.confidence_level >= 0.7 && ["hiring_activity", "new_branch_location", "digital_transformation"].includes(signal.category)) {
    return "high";
  }
  if (signal.confidence_level >= 0.5) return "medium";
  return "low";
}

export function isSignalExpired(signal: OpportunitySignal): boolean {
  if (!signal.published_at && !signal.detected_at) return false;
  const refDate = signal.published_at || signal.detected_at;
  const daysSince = (Date.now() - new Date(refDate).getTime()) / (1000 * 60 * 60 * 24);
  return daysSince > 90; // expire after 90 days
}
