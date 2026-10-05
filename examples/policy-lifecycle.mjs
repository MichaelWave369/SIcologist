import {
  PortfolioGovernanceRegistry,
  DEFAULT_PORTFOLIO_POLICY,
  createPortfolioPolicyRevision,
  createProspectivePolicyTrialProtocol,
  createPolicyPromotionProposal,
  activatePolicyPromotion,
  monitorActivePolicy,
  fingerprint
} from "../src/index.js";

const governance=new PortfolioGovernanceRegistry();
const review=governance.governanceReview();

const revision=createPortfolioPolicyRevision({
  baselinePolicy:DEFAULT_PORTFOLIO_POLICY,
  proposedPolicy:{
    ...DEFAULT_PORTFOLIO_POLICY,
    weights:{
      informationOpportunity:.25,
      evidenceWeakness:.20,
      replicationNeed:.15,
      operatorImportance:.30,
      costEfficiency:.10
    }
  },
  governanceReview:review,
  revisionReason:"Prospectively reviewed candidate policy."
});

const trial=createProspectivePolicyTrialProtocol(revision,{
  assignmentMode:"ALTERNATING_AB",
  minRounds:2,
  operatorApproved:true,
  approvalReceipt:"operator:trial-example"
});

const summaryBody={
  version:"PROSPECTIVE_POLICY_TRIAL_SUMMARY_V0.1",
  trialProtocolFingerprint:trial.fingerprint,
  completedRoundCount:2,
  minRoundsRequired:2,
  minRoundsMet:true,
  baseline:{
    assignedRoundCount:1,
    completedOutcomeCount:1,
    decisiveOutcomeCount:1,
    decisiveRate:1,
    inconclusiveRate:0,
    contradictionRate:0,
    outcomeCounts:{SURVIVED_CHALLENGE:1,WEAKENED:0,CONTRADICTED:0,INCONCLUSIVE:0}
  },
  candidate:{
    assignedRoundCount:1,
    completedOutcomeCount:1,
    decisiveOutcomeCount:1,
    decisiveRate:1,
    inconclusiveRate:0,
    contradictionRate:0,
    outcomeCounts:{SURVIVED_CHALLENGE:1,WEAKENED:0,CONTRADICTED:0,INCONCLUSIVE:0}
  },
  deltas:{decisiveRate:0,inconclusiveRate:0,contradictionRate:0},
  primaryMetrics:["contradictionRate","decisiveRate","inconclusiveRate"],
  evaluationStatus:"HUMAN_POLICY_REVIEW_REQUIRED",
  candidatePromotionAuthorized:false,
  automaticPolicyActivation:false,
  causalStatus:"NOT_ESTABLISHED",
  boundaries:{
    assignmentRandomized:false,
    observedOutcomeDifferencesAreNotCausalProof:true,
    humanReviewRequiredForPolicyActivation:true
  }
};
const trialSummary={...summaryBody,fingerprint:fingerprint(summaryBody)};

const proposal=createPolicyPromotionProposal(
  revision,
  trial,
  trialSummary,
  {
    reviewerId:"example-reviewer",
    promotionReason:"Approve monitored operational use.",
    riskAcceptance:"Prospective differences are descriptive, not causal proof."
  }
);

const activated=activatePolicyPromotion(proposal,governance,{
  operatorApproved:true,
  approvalReceipt:"operator:activate-example"
});

console.log(JSON.stringify({
  proposal,
  activationReceipt:activated.activationReceipt,
  activeState:activated.state,
  initialMonitor:monitorActivePolicy(activated.state,governance)
},null,2));
