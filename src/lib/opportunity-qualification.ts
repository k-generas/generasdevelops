// Opportunity qualification - distinguish theoretical from real commercial opportunities

export type QualificationStage =
  | "DISCOVERED"
  | "RESEARCHING"
  | "NEEDS_VALIDATION"
  | "VALIDATION_IN_PROGRESS"
  | "QUALIFIED"
  | "READY_TO_PROPOSE"
  | "PROPOSAL_SENT"
  | "WON"
  | "LOST"
  | "DISQUALIFIED";

export type ValidationStatus = "UNKNOWN" | "CONFIRMED" | "DENIED" | "PARTIAL";

export type Urgency = "low" | "medium" | "high" | "critical";

export type QualificationAssessment = {
  business_real_active: "yes" | "no" | "unknown";
  problem_supported_by_evidence: "yes" | "no" | "unknown";
  business_confirmed_problem: "yes" | "no" | "unknown";
  relevant_solution_offered: "yes" | "no" | "unknown";
  technically_feasible: "yes" | "no" | "unknown";
  decision_maker_known: "yes" | "no" | "unknown";
  plausible_budget_willingness: "yes" | "no" | "unknown";
  realistic_next_step: "yes" | "no" | "unknown";
  notes: string[];
};

export type PriorityFactors = {
  problem_relevance: number;
  evidence_quality: number;
  business_impact: number;
  urgency: number;
  customer_confirmation: number;
  service_fit: number;
  purchasing_readiness: number;
  ability_to_deliver: number;
  overall_score: number;
  explanation: string[];
};

export function generateValidationQuestions(context: {
  service?: string | null;
  problem?: string | null;
  category?: string;
}): string[] {
  const questions: string[] = [];
  
  // General process questions
  questions.push("How do you currently manage incoming customer enquiries?");
  questions.push("How do you track orders from customers to delivery?");
  questions.push("How do your salespeople follow up with potential customers?");
  questions.push("How do you monitor sales performance across locations?");
  questions.push("Which parts of your current workflow require repetitive manual work?");
  questions.push("Do you currently use software to manage this process?");
  
  // Service-specific questions
  if (context.service?.toLowerCase().includes("crm")) {
    questions.push("How do you keep track of leads and follow-ups currently?");
    questions.push("How do you know which leads are most likely to convert?");
  }
  if (context.service?.toLowerCase().includes("order") || context.service?.toLowerCase().includes("catalog")) {
    questions.push("How do customers place orders currently?");
    questions.push("How long does it take to process an order?");
  }
  if (context.service?.toLowerCase().includes("website")) {
    questions.push("How do customers find you currently?");
    questions.push("Are you getting enough enquiries from your current online presence?");
  }
  if (context.service?.toLowerCase().includes("management") || context.service?.toLowerCase().includes("system")) {
    questions.push("Who needs access to business data and how do they get it now?");
    questions.push("What reports do you need regularly and how are they created?");
  }
  
  return questions.slice(0, 8);
}

export function assessQualification(assessment: QualificationAssessment): {
  canQualify: boolean;
  canPropose: boolean;
  blockers: string[];
  readyForProposal: boolean;
} {
  const blockers: string[] = [];
  
  if (assessment.business_real_active === "no") blockers.push("Business not confirmed active/real");
  if (assessment.problem_supported_by_evidence === "no") blockers.push("Problem not supported by evidence");
  if (assessment.relevant_solution_offered === "no") blockers.push("No relevant solution offered");
  if (assessment.technically_feasible === "no") blockers.push("Not technically feasible");
  
  // Need confirmation of problem from business for qualification
  if (assessment.business_confirmed_problem === "no") blockers.push("Business has not confirmed the problem");
  
  const canQualify = assessment.business_real_active === "yes" && 
                     assessment.problem_supported_by_evidence === "yes" && 
                     assessment.relevant_solution_offered === "yes" &&
                     assessment.business_confirmed_problem === "yes";
  
  const canPropose = canQualify && 
                     assessment.technically_feasible !== "no" &&
                     assessment.realistic_next_step === "yes";
  
  return {
    canQualify,
    canPropose,
    blockers,
    readyForProposal: canPropose && assessment.purchasing_readiness === "yes",
  };
}

export function calculatePriorityFactors(params: {
  problemRelevance: number;
  evidenceQuality: number;
  businessImpact: number;
  urgency: number;
  customerConfirmation: number;
  serviceFit: number;
  purchasingReadiness: number;
  abilityToDeliver: number;
}): PriorityFactors {
  const {
    problemRelevance,
    evidenceQuality,
    businessImpact,
    urgency,
    customerConfirmation,
    serviceFit,
    purchasingReadiness,
    abilityToDeliver,
  } = params;
  
  const overall = 
    problemRelevance * 0.2 +
    evidenceQuality * 0.15 +
    businessImpact * 0.15 +
    urgency * 0.1 +
    customerConfirmation * 0.2 +
    serviceFit * 0.1 +
    purchasingReadiness * 0.05 +
    abilityToDeliver * 0.05;
  
  const explanation: string[] = [];
  if (customerConfirmation >= 0.7) explanation.push("Business has confirmed the problem");
  if (evidenceQuality >= 0.7) explanation.push("Strong evidence supporting need");
  if (purchasingReadiness >= 0.6) explanation.push("Signs of purchasing readiness");
  if (urgency >= 0.7) explanation.push("Time-sensitive opportunity");
  
  return {
    problem_relevance: problemRelevance,
    evidence_quality: evidenceQuality,
    business_impact: businessImpact,
    urgency: urgency,
    customer_confirmation: customerConfirmation,
    service_fit: serviceFit,
    purchasing_readiness: purchasingReadiness,
    ability_to_deliver: abilityToDeliver,
    overall_score: Math.max(0, Math.min(1, overall)),
    explanation,
  };
}
